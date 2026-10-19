'use strict';
const $ = selector => document.querySelector(selector);
const api = window.quotaApp;
const panelSurface = new URLSearchParams(location.search).get('surface') === 'percent-panel';
const detachedDropdown = typeof api.dropdown === 'function';
document.body.dataset.surface = panelSurface ? 'percent-panel' : detachedDropdown ? 'capsule' : 'inline-preview';
let resolvePanelReady;
window.percentPanelReady = new Promise(resolve => { resolvePanelReady = resolve; });
let popupVersion = 0, popupTimer;
api.onDropdownLayout?.(layout => {
  document.body.dataset.placement = layout.placement;
  document.body.style.setProperty('--panel-max-height', layout.panelMaxHeight + 'px');
});
api.onDropdown?.(state => {
  if (!panelSurface) return;
  popupVersion = state.version;
  clearTimeout(popupTimer);
  document.body.dataset.details = 'true';
  if (state.immediate) { document.body.dataset.transition = 'closed'; return; }
  if (state.open) {
    const reveal = () => {
      if (popupVersion !== state.version) return;
      document.body.dataset.transition = 'open';
      if (state.focus) $('#refresh').focus();
    };
    if (document.body.dataset.transition === 'closing') reveal();
    else requestAnimationFrame(() => requestAnimationFrame(reveal));
  } else {
    document.body.dataset.transition = 'closing';
    popupTimer = setTimeout(() => {
      if (popupVersion !== state.version) return;
      document.body.dataset.transition = 'closed';
      api.dropdownClosed(state.version);
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160);
  }
});
api.onDropdownDismiss?.(() => {
  if (panelSurface) return;
  suppressHover = true;
  setMiniOpen(false, true);
});
let snapshot = null;
let settings = { style: 'apple', theme: 'system', alwaysOnTop: true, refreshSeconds: 60 };
let status = { level: 'connecting', message: '正在连接本机 Codex…' };
let bucketId = null, busy = false, expanded = false, miniOpen = false;
const compactStyle = () => settings.style === 'mini' || settings.style === 'percent';
let hoverCloseTimer;
let nativeSelectOpen = false;
let suppressHover = false;
let keyboardInteraction = false;
let percentPhase = 'closed', percentVersion = 0, percentCloseTimer, appliedLayoutRevision = 0;
let focusPercentPanel = false;
let percentViewportReady = false;
let percentResizeChain = Promise.resolve();
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function durationLabel(minutes) {
  if (minutes === 10080) return '周额度';
  if (minutes >= 1440) return (minutes / 1440).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' 天';
  if (minutes >= 60) return (minutes / 60).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' 小时';
  return minutes > 0 ? minutes + ' 分钟' : '额度窗口';
}
function resetLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '时间暂不可用';
  const date = new Date(seconds * 1000), now = new Date();
  if (date <= now) return '等待服务端更新';
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (compactStyle()) return date.getFullYear() + '年' + (date.getMonth()+1) + '月' + date.getDate() + '日 ' + time;
  return date.toDateString() === now.toDateString() ? '今天 ' + time : (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + time;
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function meter(value) {
  const remaining = Math.max(0, Math.min(100, 100 - value.usedPercent));
  const box = element('article', 'meter' + (remaining <= 15 ? ' critical' : remaining <= 35 ? ' low' : ''));
  const label = durationLabel(value.windowDurationMins);
  box.append(element('span', 'meter-label', label));
  const percent = element('div', 'meter-value', remaining.toLocaleString('zh-CN', { maximumFractionDigits: 1 }));
  percent.append(element('small', '', '%'));
  percent.setAttribute('aria-label', label + '剩余 ' + remaining.toFixed(1) + '%');
  box.append(percent);
  const track = element('div', 'track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label + '剩余');
  track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100'); track.setAttribute('aria-valuenow', String(remaining));
  const fill = element('div', 'fill'); fill.style.width = remaining + '%'; track.append(fill); box.append(track);
  const foot = element('div', 'meter-foot', '下次重置');
  foot.append(element('span', 'reset-at', resetLabel(value.resetsAt))); box.append(foot);
  return box;
}
function renderMini(windows) {
  // A secondary-only weekly response must never masquerade as the short window.
  const short = windows.filter(w => settings.style === 'percent' ? w.windowDurationMins === 300 : w.windowDurationMins > 0 && w.windowDurationMins < 10080)
    .sort((a,b) => a.windowDurationMins - b.windowDurationMins)[0];
  $('#mini-percent').textContent = short ? Math.max(0, Math.min(100, 100 - short.usedPercent)).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '%' : '—%';
  const validTime = short && Number.isFinite(short.resetsAt) && short.resetsAt * 1000 > Date.now();
  $('#mini-time').textContent = validTime ? new Date(short.resetsAt * 1000).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', hour12:false }) : '--:--';
  $('#mini-time').title = short ? '重置：' + resetLabel(short.resetsAt) : '暂无短期额度';
  $('#mini-percent').setAttribute('aria-label', short ? durationLabel(short.windowDurationMins) + '剩余 ' + $('#mini-percent').textContent : '短期额度暂不可用');
  requestMeasure();
}
function setMiniOpen(open, restoreFocus = false, immediate = false) {
  clearTimeout(hoverCloseTimer);
  clearTimeout(percentCloseTimer);
  if (!open) focusPercentPanel = false;
  const version = ++percentVersion;
  $('#mini-bar').setAttribute('aria-expanded', String(open));
  $('#mini-more').setAttribute('aria-expanded', String(open));
  $('#mini-more').setAttribute('aria-label', open ? '收起额度详情和设置' : '展开额度详情和设置');
  if (settings.style === 'percent' && detachedDropdown && !panelSurface) {
    miniOpen = open;
    document.body.dataset.details = 'false';
    percentPhase = document.body.dataset.transition = open ? 'preparing' : 'closed';
    if (restoreFocus) $('#mini-bar').focus();
    const focus = focusPercentPanel;
    focusPercentPanel = false;
    api.dropdown({ open, focus }).then(() => {
      if (version === percentVersion && miniOpen) percentPhase = document.body.dataset.transition = 'open';
    }).catch(error => { miniOpen = false; percentPhase = 'closed'; showError(error.message); });
    return;
  }
  if (restoreFocus) (settings.style === 'percent' ? $('#mini-bar') : $('#mini-more')).focus();
  if (settings.style === 'percent' && open && miniOpen && percentPhase === 'closing' && percentViewportReady) {
    // Reverse an in-flight fade instead of hiding the panel and starting over.
    percentPhase = document.body.dataset.transition = 'open';
    if (focusPercentPanel) { focusPercentPanel = false; $('#refresh').focus(); }
    return;
  }
  if (settings.style === 'percent' && !open && miniOpen && !immediate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    percentPhase = document.body.dataset.transition = 'closing';
    percentCloseTimer = setTimeout(() => {
      if (version !== percentVersion) return;
      miniOpen = false;
      document.body.dataset.details = 'false';
      percentPhase = document.body.dataset.transition = 'closed';
      lastSize = '';
      requestMeasure();
    }, 160);
    return;
  }
  miniOpen = open;
  document.body.dataset.details = String(open);
  percentPhase = document.body.dataset.transition = open && settings.style === 'percent' ? 'preparing' : 'closed';
  lastSize = '';
  requestMeasure();
}
function hoverDetails(inside) {
  if (settings.style !== 'percent' || panelSurface) return;
  if (inside) {
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = null;
    if (!suppressHover && (!miniOpen || percentPhase === 'closing')) setMiniOpen(true);
  } else {
    suppressHover = false;
    if (miniOpen && percentPhase !== 'closing' && !nativeSelectOpen && !hoverCloseTimer) {
      hoverCloseTimer = setTimeout(() => {
        hoverCloseTimer = null;
        // Keyboard users can continue interacting with the dropdown.
        if (!keyboardInteraction || (!focusPercentPanel && !$('#shell').contains(document.activeElement))) setMiniOpen(false);
      }, 280);
    }
  }
}
function renderMeters() {
  const buckets = snapshot?.buckets || [];
  if (!buckets.some(b => b.limitId === bucketId)) bucketId = buckets.find(b => b.limitId === 'codex')?.limitId || buckets[0]?.limitId || null;
  const picker = $('#bucket');
  picker.replaceChildren(...buckets.map(b => { const opt = element('option', '', b.limitName || b.limitId); opt.value = b.limitId; return opt; }));
  picker.value = bucketId || '';
  $('#bucket-row').hidden = buckets.length < 2;
  const selected = buckets.find(b => b.limitId === bucketId);
  const windows = [selected?.primary, selected?.secondary].filter(Boolean);
  renderMini(windows);
  const plan = snapshot?.planType;
  $('#plan').textContent = plan ? String(plan).replace(/^./, c => c.toUpperCase()) : '';
  if (windows.length) $('#meters').replaceChildren(...windows.map(meter));
  else {
    const empty = element('div', 'empty');
    empty.append(element('div', 'empty-mark', status.level === 'error' ? '!' : '…'), element('strong', '', status.level === 'error' ? '暂时无法读取额度' : '正在读取额度'), element('p', '', status.level === 'error' ? '检查 Codex CLI 登录状态后重试' : '连接这台电脑上的 Codex'));
    $('#meters').replaceChildren(empty);
  }
}
function renderStatus() {
  const age = snapshot ? Math.max(0, (Date.now() - Date.parse(snapshot.updatedAt)) / 1000) : null;
  const stale = age !== null && age > Math.max(120, settings.refreshSeconds * 2);
  $('#dot').className = 'dot ' + (status.level === 'error' ? 'error' : stale ? 'stale' : status.level);
  $('#status').textContent = status.level === 'error' ? (snapshot ? '连接中断 · 保留上次数据' : '连接失败') : stale ? '数据已过期' : status.level === 'ok' ? '本机已连接' : status.message;
  $('#updated').textContent = age === null ? '' : age < 60 ? '刚刚更新' : Math.floor(age / 60) + ' 分钟前';
  document.body.dataset.stale = String(stale || status.level === 'error');
  $('#mini-bar').title = $('#status').textContent + ' · ' + $('#updated').textContent;
  $('#error').hidden = status.level !== 'error';
  $('#error').textContent = status.level === 'error' ? status.message + '。请确认已安装官方 Codex CLI，并使用 ChatGPT 账户登录；应用将自动重试。' : '';
}
function renderSettings(value) {
  if (settings.style !== value.style) {
    setMiniOpen(false, false, true); expanded = false; suppressHover = false;
    percentViewportReady = false;
    for (const name of ['--bar-left','--bar-top','--panel-top','--panel-max-height']) document.body.style.removeProperty(name);
    delete document.body.dataset.placement;
  }
  settings = value;
  if (panelSurface) {
    miniOpen = true;
    document.body.dataset.details = 'true';
  }
  $('#settings').hidden = compactStyle() ? false : !expanded;
  $('#mini-bar').tabIndex = value.style === 'percent' ? 0 : -1;
  if (value.style === 'percent') {
    $('#mini-bar').setAttribute('role', 'button');
    $('#mini-bar').setAttribute('aria-label', '五小时剩余额度，悬停或按回车展开完整信息');
    $('#mini-bar').setAttribute('aria-controls', 'shell');
  } else {
    $('#mini-bar').removeAttribute('role');
    $('#mini-bar').removeAttribute('aria-controls');
  }
  document.body.dataset.style = value.style;
  document.body.dataset.theme = value.theme;
  $('#style').value = value.style; $('#theme').value = value.theme;
  $('#interval').value = String(value.refreshSeconds); $('#top').checked = value.alwaysOnTop;
  $('#pin').setAttribute('aria-pressed', String(value.alwaysOnTop));
  $('#pin').title = value.alwaysOnTop ? '取消置顶' : '始终置顶';
  renderMeters();
  renderStatus();
  requestMeasure();
}
async function patchSettings(patch) {
  try { renderSettings(await api.updateSettings(patch)); }
  catch (error) { renderSettings(settings); showError('设置保存失败：' + error.message); }
}
function showError(message) { status = { level: 'error', message }; renderStatus(); }
$('#refresh').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('#refresh').disabled = true;
  try { const value = await api.refresh(); if (value) { snapshot = value; renderMeters(); } }
  catch (error) { showError(error.message); }
  finally { busy = false; $('#refresh').disabled = false; }
});
$('#toggle').addEventListener('click', () => {
  expanded = !expanded; $('#settings').hidden = !expanded;
  $('#toggle').setAttribute('aria-expanded', String(expanded));
  $('#toggle').setAttribute('aria-label', expanded ? '收起设置' : '展开设置');
});
$('#mini-more').addEventListener('click', () => setMiniOpen(!miniOpen));
for (const node of [$('#mini-bar'), $('#shell')]) {
  // Native cursor polling owns detached hover state across both windows.
  node.addEventListener('mouseenter', () => { if (!detachedDropdown) hoverDetails(true); });
  node.addEventListener('mouseleave', () => { if (!detachedDropdown) hoverDetails(false); });
}
// This also works while the capsule is a native Windows drag region.
api.onPointer?.(point => {
  if (detachedDropdown) { hoverDetails(point.inside === true); return; }
  if (Number.isFinite(point.revision) && point.revision !== appliedLayoutRevision) return;
  const inside = [$('#mini-bar'), $('#shell')].some(node => {
    if (!node.getClientRects().length) return false;
    const rect = node.getBoundingClientRect();
    return point.x >= rect.left && point.x < rect.right && point.y >= rect.top && point.y < rect.bottom;
  });
  hoverDetails(inside);
});
$('#mini-bar').addEventListener('keydown', event => {
  if (settings.style === 'percent' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    keyboardInteraction = true;
    suppressHover = false;
    focusPercentPanel = true;
    setMiniOpen(true);
  }
});
$('#shell').addEventListener('focusout', () => {
  setTimeout(() => { if (!$('#shell').contains(document.activeElement) && !$('#shell').matches(':hover') && !$('#mini-bar').matches(':hover')) hoverDetails(false); }, 0);
});
for (const select of document.querySelectorAll('select')) {
  select.addEventListener('pointerdown', () => { nativeSelectOpen = true; clearTimeout(hoverCloseTimer); hoverCloseTimer = null; if (panelSurface) api.holdDropdown(true); });
  for (const type of ['change', 'blur']) select.addEventListener(type, () => { nativeSelectOpen = false; if (panelSurface) api.holdDropdown(false); });
  select.addEventListener('keyup', event => { if (event.key === 'Escape') { nativeSelectOpen = false; if (panelSurface) api.holdDropdown(false); } });
}
document.addEventListener('keydown', event => {
  if (panelSurface && event.key === 'Escape') { api.holdDropdown(false); api.dismissDropdown(); return; }
  if (event.key === 'Tab') keyboardInteraction = true;
  if (event.key === 'Escape' && compactStyle() && miniOpen) { suppressHover = true; nativeSelectOpen = false; setMiniOpen(false, true); }
});
document.addEventListener('pointerdown', event => {
  keyboardInteraction = false;
  if (!event.target.closest('select')) nativeSelectOpen = false;
  if (panelSurface && !event.target.closest('select')) api.holdDropdown(false);
});
window.addEventListener('blur', () => { if (settings.style === 'percent' && detachedDropdown) return; if (compactStyle() && miniOpen && !nativeSelectOpen) { suppressHover = true; setMiniOpen(false); } });
$('#hide').addEventListener('click', () => api.hide());
$('#quit').addEventListener('click', () => api.quit());
$('#pin').addEventListener('click', () => patchSettings({ alwaysOnTop: !settings.alwaysOnTop }));
$('#style').addEventListener('change', event => patchSettings({ style: event.target.value }));
$('#theme').addEventListener('change', event => patchSettings({ theme: event.target.value }));
$('#interval').addEventListener('change', event => patchSettings({ refreshSeconds: Number(event.target.value) }));
$('#top').addEventListener('change', event => patchSettings({ alwaysOnTop: event.target.checked }));
$('#bucket').addEventListener('change', event => { bucketId = event.target.value; api.selectBucket?.(bucketId); renderMeters(); });
api.onBucket?.(value => { bucketId = value; renderMeters(); });
api.onSnapshot(value => { snapshot = value; renderMeters(); renderStatus(); });
api.onStatus(value => { status = value; renderStatus(); if (!snapshot) renderMeters(); });
api.onSettings(renderSettings);
api.bootstrap().then(value => {
  snapshot = value.snapshot; status = value.status;
  bucketId = value.bucketId || null;
  renderSettings(value.settings); renderMeters(); renderStatus();
}).catch(error => showError(error.message));
let lastSize = '', measureFrame = 0;
let miniTextContext;
const miniTextOffsets = new WeakMap();
function alignMiniReading() {
  const bar = $('#mini-bar');
  if (!bar.getClientRects().length) return;
  miniTextContext ||= document.createElement('canvas').getContext('2d');
  if (!miniTextContext) return;
  const bounds = bar.getBoundingClientRect(), center = bounds.y + bounds.height / 2;
  for (const node of [$('#mini-percent'), $('#mini-time')]) {
    if (!node.getClientRects().length) continue;
    const style = getComputedStyle(node);
    const font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
    const key = font + '|' + node.textContent + '|' + bounds.height;
    if (miniTextOffsets.get(node) === key) continue;
    node.style.transform = 'none';
    const probe = element('span', 'mini-baseline');
    probe.setAttribute('aria-hidden', 'true');
    node.append(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();
    miniTextContext.font = font;
    const metrics = miniTextContext.measureText(node.textContent);
    const inkCenter = baseline + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
    if (Number.isFinite(inkCenter)) {
      node.style.transform = 'translateY(' + (center - inkCenter) + 'px)';
      miniTextOffsets.set(node, key);
    }
  }
}
function requestMeasure() {
  cancelAnimationFrame(measureFrame);
  measureFrame = requestAnimationFrame(() => {
    const mini = compactStyle();
    if (mini) alignMiniReading();
    const bar = $('#mini-bar').getBoundingClientRect();
    const shell = $('#shell').getBoundingClientRect();
    if (panelSurface) {
      const height = Math.ceil($('#shell').scrollHeight + 2);
      const key = 'panel:' + height;
      if (key !== lastSize) {
        lastSize = key;
        api.resize({ panelHeight: height }).then(() => resolvePanelReady()).catch(error => { lastSize = ''; showError(error.message); });
      }
      return;
    }
    if (settings.style === 'percent' && detachedDropdown) {
      const size = { width: Math.ceil(bar.width + 24), height: 60, expanded: false };
      const key = JSON.stringify(size);
      if (key !== lastSize) { lastSize = key; api.resize(size).catch(error => showError(error.message)); }
      return;
    }
    if (settings.style === 'percent') {
      const size = {width: miniOpen ? 324 : Math.ceil(bar.width + 24),
        height: miniOpen ? Math.ceil($('#shell').scrollHeight + 2 + 68) : 60,
        barWidth: Math.ceil(bar.width + 24), expanded: miniOpen};
      const key = JSON.stringify(size), version = percentVersion;
      if (key === lastSize) return;
      lastSize = key;
      // Serialize native changes. Reveal only after the matching viewport exists.
      percentResizeChain = percentResizeChain.catch(() => {}).then(async () => {
        if (settings.style !== 'percent' || version !== percentVersion) return;
        const layout = await api.resize(size);
        if (settings.style !== 'percent') return;
        percentViewportReady = size.expanded;
        if (layout) {
          appliedLayoutRevision = layout.revision;
          const style = document.body.style;
          style.setProperty('--bar-left', layout.barLeft + 'px');
          style.setProperty('--bar-top', layout.barTop + 'px');
          style.setProperty('--panel-top', layout.panelTop + 'px');
          style.setProperty('--panel-max-height', layout.panelMaxHeight + 'px');
          document.body.dataset.placement = layout.placement;
        }
        await nextPaint();
        if (version === percentVersion && miniOpen && percentPhase === 'preparing') {
          percentPhase = document.body.dataset.transition = 'open';
          if (focusPercentPanel) { focusPercentPanel = false; $('#refresh').focus(); }
        }
      }).catch(error => { lastSize = ''; showError(error.message); });
      return;
    }
    const size = mini ? { width: Math.ceil((miniOpen ? shell.width : bar.width) + 24), height: Math.ceil(bar.height + (miniOpen ? shell.height + 8 : 0) + 24) }
      : { height: Math.ceil(shell.height + 24) };
    const key = JSON.stringify(size);
    if (key !== lastSize) { lastSize = key; api.resize(mini ? size : size.height).catch(() => {}); }
  });
}
const observer = new ResizeObserver(requestMeasure);
observer.observe($('#shell')); observer.observe($('#mini-bar'));
document.fonts.ready.then(() => {
  miniTextOffsets.delete($('#mini-percent'));
  miniTextOffsets.delete($('#mini-time'));
  requestMeasure();
});
setInterval(() => { renderStatus(); if (snapshot) renderMeters(); }, 15000);
