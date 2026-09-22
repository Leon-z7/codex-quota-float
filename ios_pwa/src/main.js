import { createClient } from '@supabase/supabase-js';
import './styles.css';

const $ = (selector) => document.querySelector(selector);
const configKey = 'codex-quota-cloud-config-v1';
let client = null;
let timer = null;

function readConfig() {
  try { return JSON.parse(localStorage.getItem(configKey)); }
  catch { return null; }
}

function saveConfig(config) {
  localStorage.setItem(configKey, JSON.stringify(config));
}

function validateConfig(url, publishableKey) {
  const normalized = url.trim().replace(/\/$/, '');
  const key = publishableKey.trim();
  if (!/^https:\/\/.+\.supabase\.co$/i.test(normalized)) throw new Error('Supabase URL 格式不正确');
  if (key.includes('secret') || key.includes('service_role')) throw new Error('不能在客户端使用 secret/service_role key');
  if (!key.startsWith('sb_publishable_') && key.split('.').length !== 3) throw new Error('Publishable key 格式不正确');
  return { url: normalized, publishableKey: key };
}

async function initializeCloud(config) {
  client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  client.auth.onAuthStateChange(() => queueMicrotask(refreshSessionUi));
  await refreshSessionUi();
}

async function refreshSessionUi() {
  if (!client) {
    $('#config-panel').hidden = false;
    $('#auth-panel').hidden = true;
    $('#account-panel').hidden = true;
    return;
  }
  const { data } = await client.auth.getSession();
  const session = data.session;
  $('#config-panel').hidden = true;
  $('#auth-panel').hidden = Boolean(session);
  $('#account-panel').hidden = !session;
  $('#account-email').textContent = session?.user?.email || '';
  $('#sync-chip').textContent = session ? '同步已连接' : '等待登录';
  $('#sync-chip').className = `chip ${session ? 'ok' : ''}`;
  clearInterval(timer);
  if (session) {
    await refreshQuota();
    timer = setInterval(refreshQuota, 30000);
  }
}

async function refreshQuota() {
  if (!client) return;
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return;
  const { data, error } = await client
    .from('quota_snapshots')
    .select('payload, source_updated_at')
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (error) {
    showMessage(error.message);
    return;
  }
  if (!data) {
    showMessage('云端还没有额度数据，请先运行 Windows 端。');
    return;
  }
  renderSnapshot(data.payload);
  $('#updated').textContent = `最近同步：${new Date(data.source_updated_at).toLocaleString('zh-CN')}`;
  $('#message').textContent = '';
}

function renderSnapshot(snapshot) {
  const windows = (snapshot?.buckets || [])
    .flatMap((bucket) => [bucket.primary, bucket.secondary])
    .filter(Boolean)
    .slice(0, 2);
  $('#meters').replaceChildren(...windows.map(createMeter));
  if (!windows.length) $('#meters').textContent = '暂无额度数据';
}

function createMeter(window) {
  const remaining = Math.max(0, Math.min(100, 100 - Number(window.usedPercent || 0)));
  const color = remaining > 35 ? '#55d6a8' : remaining > 15 ? '#ffb454' : '#ff6b7a';
  const root = document.createElement('div');
  root.className = 'meter';
  const label = document.createElement('span');
  label.className = 'meter-label';
  label.textContent = `${durationLabel(window.windowDurationMins)} ${remaining.toFixed(0)}%`;
  const track = document.createElement('span');
  track.className = 'track';
  const fill = document.createElement('span');
  fill.className = 'fill';
  fill.style.width = `${remaining}%`;
  fill.style.backgroundColor = color;
  track.append(fill);
  root.append(label, track);
  return root;
}

function durationLabel(minutes) {
  if (minutes >= 10080) return '周';
  if (minutes >= 1440) return `${Math.round(minutes / 1440)}天`;
  if (minutes >= 60) return `${Math.round(minutes / 60)}时`;
  return `${minutes}分`;
}

function showMessage(text) { $('#message').textContent = text || ''; }

$('#config-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const config = validateConfig($('#url').value, $('#key').value);
    saveConfig(config);
    await initializeCloud(config);
    showMessage('配置已保存，请登录同步账户。');
  } catch (error) { showMessage(error.message); }
});

$('#auth-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { error } = await client.auth.signInWithPassword({
    email: $('#email').value.trim(),
    password: $('#password').value,
  });
  showMessage(error?.message || '登录成功');
});

$('#signout').addEventListener('click', async () => {
  await client.auth.signOut();
  showMessage('已退出同步账户。');
});
$('#refresh').addEventListener('click', refreshQuota);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshQuota();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
const saved = readConfig();
if (saved) initializeCloud(saved).catch((error) => showMessage(error.message));
else refreshSessionUi();

