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
  let settings = { style: 'percent', theme: 'light', alwaysOnTop: true, refreshSeconds: 60 };
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
    onPointer: cb => { callbacks.pointer = cb; }, onSettings: cb => { callbacks.settings = cb; }, onStatus: cb => { callbacks.status = cb; },
  };
  window.previewTest = callbacks;
}

(async () => {
  const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'quota-percent-'));
  const out = path.resolve(__dirname, '../../artifacts/percent'); fs.mkdirSync(out, { recursive: true });
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
      for (let i = 0; i < 3; i++) {
        await settle(); const size = await run('sizes.at(-1)');
        const style = await run('document.body.dataset.style');
        await viewport(typeof size === 'number' ? { apple: 376, pill: 540, fluent: 404 }[style] : Math.max(72,size.width), typeof size === 'number' ? size : size.height);
      }
      await settle();
    };
    const save = async name => {
      await send('Emulation.setDefaultBackgroundColorOverride', {color:{r:0,g:0,b:0,a:0}});
      const img = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name+'.png'), Buffer.from(img.data,'base64'));
    };
    const delay = ms => new Promise(r=>setTimeout(r,ms));
    const outside = () => run('previewTest.pointer({x:-100,y:-100})');
    await send('Page.enable'); await send('Runtime.enable'); await viewport(376,800);
    await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await send('Page.addScriptToEvaluateOnNewDocument', {source:'('+fixture.toString()+')()'});
    await send('Page.navigate', {url:pathToFileURL(path.resolve(__dirname,'../src/renderer/index.html')).href});
    for (let i=0;i<100 && !(await run('window.sizes?.length>0'));i++) await delay(30);
    const cases=[];
    for (scale of [1,1.25,1.5,2]) for (const theme of ['light','dark']) {
      await run(`previewTest.settings({style:'percent',theme:'${theme}',alwaysOnTop:true,refreshSeconds:60})`);
      for (const used of [25,0,100,99.6,null]) {
        await run(`previewTest.snapshot({...fixture,buckets:${used===null?'[]':'[{...fixture.buckets[0],primary:{...fixture.buckets[0].primary,usedPercent:'+used+'}}]'}})`);
        await fit();
        const g=await run(`(()=>{
          const e=document.querySelector('#mini-percent'),p=document.createElement('span');p.className='mini-baseline';e.append(p);
          const baseline=p.getBoundingClientRect().top;p.remove();const s=getComputedStyle(e),ctx=document.createElement('canvas').getContext('2d');
          ctx.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;const m=ctx.measureText(e.textContent),b=document.querySelector('#mini-bar').getBoundingClientRect();
          return {ink:baseline+(m.actualBoundingBoxDescent-m.actualBoundingBoxAscent)/2,center:b.y+b.height/2,width:b.width,height:b.height,text:e.textContent,font:s.fontSize,
          hiddenTime:!document.querySelector('#mini-time').getClientRects().length,hiddenMore:!document.querySelector('#mini-more').getClientRects().length,
          hiddenPanel:!document.querySelector('#shell').getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
        })()`);
        assert.ok(Math.abs(g.ink-g.center)<.1, 'centered ink');assert.equal(g.height,36);assert.equal(g.font,'20px');
        assert.ok(g.width<85);assert.ok(g.hiddenTime&&g.hiddenMore&&g.hiddenPanel&&!g.overflow,JSON.stringify(g));
        cases.push({scale,theme,...g});
        if(scale===2&&used===25) await save('percent-'+theme);
      }
    }
    await run('previewTest.snapshot({...fixture,buckets:[{...fixture.buckets[0],primary:null}]})'); await fit();
    assert.equal(await run("document.querySelector('#mini-percent').textContent"),'—%','weekly never substituted');
    await run('previewTest.snapshot({...fixture,buckets:[{...fixture.buckets[0],primary:{...fixture.buckets[0].primary,windowDurationMins:60}}]})'); await fit();
    assert.equal(await run("document.querySelector('#mini-percent').textContent"),'—%','only five hour window');
    await run('previewTest.snapshot(fixture)'); await fit();
    const hoverBar=()=>run(`(()=>{const b=document.querySelector('#mini-bar').getBoundingClientRect();previewTest.pointer({x:b.x+b.width/2,y:b.y+b.height/2});})()`);
    await hoverBar(); await fit();
    assert.equal(await run('document.body.dataset.details'),'true');
    assert.equal(await run("document.querySelector('#style').value"),'percent','new style is selectable');
    assert.equal(await run("document.querySelectorAll('.meter-value')[1].textContent"),'42%');
    assert.match(await run("document.querySelectorAll('.reset-at')[1].textContent"),/\d{4}.\d{1,2}.\d{1,2}./);
    await outside(); await delay(100);
    await run(`(()=>{const b=document.querySelector('#shell').getBoundingClientRect();previewTest.pointer({x:b.x+20,y:b.y+20});})()`);
    await delay(320);assert.equal(await run('document.body.dataset.details'),'true','crossing gap keeps open');
    await save('percent-details-dark');
    await run("document.querySelector('#theme').value='light';document.querySelector('#theme').dispatchEvent(new Event('change'))");await fit();await save('percent-details-light');
    await run("document.querySelector('#refresh').click()");assert.equal(await run('refreshCount'),1);
    await outside();await delay(350);await fit();assert.equal(await run('document.body.dataset.details'),'false','leave closes');
    await hoverBar();await fit();
    await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await fit();
    await hoverBar();assert.equal(await run('document.body.dataset.details'),'false','Escape stays closed until leave');
    await outside();await hoverBar();await fit();assert.equal(await run('document.body.dataset.details'),'true');
    await run("window.dispatchEvent(new Event('blur'))");await fit();assert.equal(await run('document.body.dataset.details'),'false');
    await run("document.querySelector('#mini-bar').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await fit();
    await outside();await delay(350);assert.equal(await run('document.body.dataset.details'),'true','keyboard focus retained');
    await run("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await fit();
    for(const style of ['apple','pill','fluent','mini','percent']) {
      await run(`previewTest.settings({style:'${style}',theme:'light',alwaysOnTop:true,refreshSeconds:60})`);await fit();
      assert.equal(await run('document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight'),false,style+' fits');
    }
    assert.deepEqual(cdp.errors,[]);
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,cases,interactions:['hover open','gap transition','panel hover','leave close','Escape suppression','blur','keyboard focus','refresh','weekly-only','wrong duration','five styles'],errors:cdp.errors},null,2));
    console.log('PERCENT_PASS: 40 alignment cases, strict five-hour data, hover, keyboard and style checks');
  } finally { await cdp.send('Browser.close').catch(()=>cdp.child.kill()); }
})().catch(error=>{console.error(error);process.exitCode=1;});
