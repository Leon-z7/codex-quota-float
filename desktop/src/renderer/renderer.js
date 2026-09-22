'use strict';

const $ = (selector) => document.querySelector(selector);
let expanded = false;
let snapshot = null;

function durationLabel(minutes) {
  if (minutes >= 10080) return '周额度';
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} 天`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} 小时`;
  return `${minutes} 分钟`;
}

function resetLabel(seconds) {
  const date = new Date(seconds * 1000);
  const now = new Date();
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === now.toDateString()
    ? `今天 ${time}`
    : `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

function meterHtml(window) {
  const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
  const color = remaining > 35 ? '#55d6a8' : remaining > 15 ? '#ffb454' : '#ff6b7a';
  return `<div class="meter">
    <div class="meter-head"><span>${durationLabel(window.windowDurationMins)}</span><span class="remaining" style="color:${color}">剩余 ${remaining.toFixed(0)}%</span></div>
    <div class="track"><div class="fill" style="width:${remaining}%;background:${color}"></div></div>
    <div class="meter-foot"><span>重置 ${resetLabel(window.resetsAt)}</span></div>
  </div>`;
}

function renderSnapshot(value) {
  snapshot = value;
  const windows = value.buckets.flatMap((bucket) => [bucket.primary, bucket.secondary]).filter(Boolean).slice(0, 2);
  $('#meters').innerHTML = windows.length ? windows.map(meterHtml).join('') : '<span class="loading">暂无额度数据</span>';
}

async function refreshCloudStatus() {
  const status = await window.quotaApp.cloudStatus();
  $('#cloud-config').hidden = status.configured;
  $('#auth-form').hidden = !status.configured || status.signedIn;
  $('#account').hidden = !status.signedIn;
  $('#account-email').textContent = status.email || '';
  $('#cloud-status').textContent = status.signedIn ? '跨设备已启用' : status.configured ? '等待登录' : '未配置同步';
  $('#cloud-status').className = `chip ${status.signedIn ? '' : 'muted'}`;
}

$('#refresh').addEventListener('click', async () => {
  try { renderSnapshot(await window.quotaApp.refresh()); }
  catch (error) { $('#message').textContent = error.message; }
});
$('#toggle').addEventListener('click', async () => {
  expanded = !expanded;
  $('#details').hidden = !expanded;
  $('#toggle').textContent = expanded ? '⌃' : '⌄';
  await window.quotaApp.setExpanded(expanded);
  if (expanded) await refreshCloudStatus();
});
$('#close').addEventListener('click', () => window.quotaApp.close());

$('#cloud-config').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await window.quotaApp.configureCloud({
      url: $('#supabase-url').value,
      publishableKey: $('#supabase-key').value,
    });
    $('#message').textContent = '云端配置已保存，请登录同步账户。';
    await refreshCloudStatus();
  } catch (error) { $('#message').textContent = error.message; }
});

async function authenticate(create) {
  const credentials = { email: $('#email').value, password: $('#password').value };
  try {
    const status = create
      ? await window.quotaApp.signUp(credentials)
      : await window.quotaApp.signIn(credentials);
    $('#message').textContent = status.message || '登录成功。下一次额度刷新后会自动同步。';
    await refreshCloudStatus();
    if (snapshot) await window.quotaApp.refresh();
  } catch (error) { $('#message').textContent = error.message; }
}
$('#auth-form').addEventListener('submit', (event) => { event.preventDefault(); authenticate(false); });
$('#signup').addEventListener('click', () => authenticate(true));
$('#signout').addEventListener('click', async () => { await window.quotaApp.signOut(); await refreshCloudStatus(); });

window.quotaApp.onSnapshot(renderSnapshot);
window.quotaApp.onStatus((status) => {
  $('#local-status').textContent = status.message;
  $('#local-status').className = `chip ${status.level === 'ok' ? '' : 'bad'}`;
});
window.quotaApp.onCloudUpload((result) => {
  if (result.uploaded) {
    $('#cloud-status').textContent = '刚刚已同步';
    $('#cloud-status').className = 'chip';
  }
});

window.quotaApp.lastSnapshot().then((value) => { if (value) renderSnapshot(value); });

