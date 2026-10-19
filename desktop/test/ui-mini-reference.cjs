'use strict';
// Runs the real renderer in a local Chromium browser, with deterministic quota data.
// CHROME_PATH may select another Chromium executable. No npm dependency is required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

function connect(executable, profile) {
  const child = spawn(executable, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--remote-debugging-pipe', '--user-data-dir=' + profile], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let serial = 0, buffer = '';
  const pending = new Map(), errors = [];
  child.stdio[4].on('data', chunk => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf('\0')) !== -1;) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id); clearTimeout(request.timer);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
  child.on('error', error => { for (const r of pending.values()) { clearTimeout(r.timer); r.reject(error); } pending.clear(); });
  return { send, child, errors };
}

function fixture() {
  const reset = new Date(); reset.setDate(reset.getDate() + 1); reset.setHours(14, 4, 0, 0);
  let settings = { style: 'mini', theme: 'light', alwaysOnTop: true, refreshSeconds: 60 };
  const callbacks = {};
  const snapshot = { planType: 'plus', updatedAt: new Date().toISOString(), buckets: [{ limitId: 'codex',
    primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: reset.getTime() / 1000 },
    secondary: { usedPercent: 58, windowDurationMins: 10080, resetsAt: Date.now() / 1000 + 200000 } }] };
  window.fixture = snapshot; window.sizes = []; window.refreshCount = 0;
  window.quotaApp = {
    bootstrap: async () => ({ snapshot, settings, status: { level: 'ok', message: 'Connected' } }),
    updateSettings: async patch => (settings = { ...settings, ...patch }),
    resize: async size => { sizes.push(size); }, refresh: async () => { refreshCount++; return snapshot; },
    hide: async () => {}, quit: async () => {}, onSnapshot: cb => { callbacks.snapshot = cb; },
    onSettings: cb => { callbacks.settings = cb; }, onStatus: cb => { callbacks.status = cb; },
  };
  window.previewTest = callbacks;
}

(async () => {
  const executable = process.env.CHROME_PATH || (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-renderer-'));
  const out = path.resolve(__dirname, '../../artifacts/mini-reference'); fs.mkdirSync(out, { recursive: true });
  const cdp = connect(executable, profile);
  try {
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);
    const run = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const settle = () => run('document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))');
    let scale = 2;
    const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    const fit = async () => {
      for (let i = 0; i < 2; i++) {
        await settle(); const size = await run('sizes.at(-1)');
        const style = await run('document.body.dataset.style');
        await viewport(typeof size === 'number' ? { apple: 376, pill: 540, fluent: 404 }[style] : size.width,
          typeof size === 'number' ? size : size.height);
      }
      await settle();
    };
    const save = async name => {
      const image = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(image.data, 'base64'));
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await viewport(376, 800);
    await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + fixture.toString() + ')()' });
    await send('Page.navigate', { url: pathToFileURL(path.resolve(__dirname, '../src/renderer/index.html')).href });
    for (let i = 0; i < 100 && !(await run('window.sizes?.length > 0')); i++) await new Promise(r => setTimeout(r, 30));
    assert.ok(await run('window.sizes?.length > 0'), 'renderer bootstrapped');
    const geometry = async () => run(`(()=>{
      const ink=e=>{const p=document.createElement('span');p.className='mini-baseline';e.append(p);
        const b=p.getBoundingClientRect().top;p.remove();const s=getComputedStyle(e),c=document.createElement('canvas').getContext('2d');
        c.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;const m=c.measureText(e.textContent);
        return b+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2;};
      const bar=document.querySelector('#mini-bar').getBoundingClientRect(),icon=document.querySelector('#mini-more svg').getBoundingClientRect();
      return {percent:ink(document.querySelector('#mini-percent')),time:ink(document.querySelector('#mini-time')),
        dots:icon.y+icon.height/2,center:bar.y+bar.height/2,width:bar.width,height:bar.height,
        overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,
        text:document.querySelector('#mini-percent').textContent,size:sizes.at(-1)};
    })()`);
    const checks = [];
    for (scale of [1, 1.25, 1.5, 2]) {
      for (const theme of ['light', 'dark']) {
        await run(`previewTest.settings({style:'mini',theme:'${theme}',alwaysOnTop:true,refreshSeconds:60})`);
        for (const used of [25, 0, 99.6, null]) {
          await run(`previewTest.snapshot({...fixture,buckets:${used === null ? '[]' : '[{...fixture.buckets[0],primary:{...fixture.buckets[0].primary,usedPercent:' + used + '}}]'}})`);
          await fit(); const g = await geometry();
          assert.ok(!g.overflow, 'no clipping: ' + JSON.stringify(g));
          for (const key of ['percent', 'time', 'dots']) assert.ok(Math.abs(g[key] - g.center) < .1, key + ' centered: ' + JSON.stringify(g));
          assert.equal(g.height, 36); assert.ok(g.size.width < 190 && g.size.height === 60);
          checks.push({ scale, theme, ...g });
          if (scale === 2 && used === 25) await save('mini-' + theme);
        }
      }
    }
    await run('previewTest.snapshot(fixture)'); await fit();
    await run("document.querySelector('#mini-more').click()"); await fit();
    assert.equal(await run("document.querySelector('#shell').getClientRects().length>0"), true);
    assert.equal(await run("document.querySelectorAll('.meter-value')[1].textContent"), '42%');
    assert.match(await run("document.querySelectorAll('.reset-at')[1].textContent"), /\d{4}.\d{1,2}.\d{1,2}./);
    await save('mini-details-dark');
    await run("document.querySelector('#refresh').click()"); assert.equal(await run('refreshCount'), 1);
    await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await fit();
    assert.equal(await run("document.querySelector('#mini-more').getAttribute('aria-expanded')"), 'false');
    await run("document.querySelector('#mini-more').focus()");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await fit(); assert.equal(await run("document.body.dataset.details"), 'true');
    await run("document.querySelector('#theme').value='light';document.querySelector('#theme').dispatchEvent(new Event('change'))"); await fit();
    await save('mini-details-light');
    await run("window.dispatchEvent(new Event('blur'))"); await fit();
    assert.equal(await run("document.body.dataset.details"), 'false');
    for (const style of ['apple', 'pill', 'fluent', 'mini']) {
      await run(`previewTest.settings({style:'${style}',theme:'light',alwaysOnTop:true,refreshSeconds:60})`); await fit();
      assert.equal(await run('document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight'), false, style + ' fits');
    }
    assert.deepEqual(cdp.errors, []);
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ passed: true, checks,
      interactionChecks: ['weekly quota and full date', 'refresh', 'Escape', 'Enter', 'blur', 'light/dark', 'all four styles'], errors: cdp.errors }, null, 2));
    console.log('MINI_REFERENCE_PASS: 32 alignment cases and all interaction checks');
  } finally {
    await cdp.send('Browser.close').catch(() => cdp.child.kill());
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
