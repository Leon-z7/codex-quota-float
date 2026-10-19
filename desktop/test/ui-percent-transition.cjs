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
  const pending = new Map(), errors = [], events = [];
  child.stdio[4].on('data', chunk => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf('\0')) !== -1;) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
      if (message.method === 'Runtime.bindingCalled') events.push(message.params);
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
  return { send, child, errors, events };
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
    resize: size => { sizes.push(size); const id=++window.resizeSerial;return new Promise(resolve=>{window.resizePending[id]=resolve;window.nativeResize(JSON.stringify({id,size}));}); }, refresh: async () => { refreshCount++; return snapshot; },
    hide: async () => {}, quit: async () => {}, onSnapshot: cb => { callbacks.snapshot = cb; },
    onPointer: cb => { callbacks.pointer = cb; }, onSettings: cb => { callbacks.settings = cb; }, onStatus: cb => { callbacks.status = cb; },
  };
  window.previewTest = callbacks; window.resizeSerial=0; window.resizePending={}; window.nativeBounds={x:1800,y:40,width:104,height:60};window.frames=[];
  function trace(){ const bar=document.querySelector('#mini-bar'),shell=document.querySelector('#shell');if(bar?.getClientRects().length){const b=bar.getBoundingClientRect();frames.push({time:performance.now(),x:nativeBounds.x+b.x,y:nativeBounds.y+b.y,phase:document.body.dataset.transition,open:document.body.dataset.details,opacity:shell?Number(getComputedStyle(shell).opacity):0,w:innerWidth});}requestAnimationFrame(trace);}requestAnimationFrame(trace);
}

const {percentBounds}=require('../src/window-layout.cjs');
(async()=>{
 const cdp=connect(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',fs.mkdtempSync(path.join(os.tmpdir(),'quota-transition-')));
 let timer;
 try {
  const {targetId}=await cdp.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(m,p)=>cdp.send(m,p,sessionId);
  const run=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  let bounds={x:1800,y:40,width:104,height:60},previous=null,revision=0,cursor={x:-999,y:-999},processing=false;
  const area={x:0,y:0,width:1920,height:1040};const history=[];
  const metrics=()=>send('Emulation.setDeviceMetricsOverride',{width:bounds.width,height:bounds.height,deviceScaleFactor:1,mobile:false,screenWidth:1920,screenHeight:1080});
  await send('Page.enable');await send('Runtime.enable');await send('Runtime.addBinding',{name:'nativeResize'});
  await metrics();await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+fixture.toString()+')()'});
  await send('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'../src/renderer/index.html')).href});
  let pumpError;
  timer=setInterval(async()=>{
   if(processing)return;processing=true;
   try {
    while(cdp.events.length){
     const event=cdp.events.shift();if(event.name!=='nativeResize')continue;
     const {id,size}=JSON.parse(event.payload);
     await delay(80); // expose the old show-before-resize defect
     const layout=percentBounds(bounds,area,size,previous);layout.revision=++revision;
     bounds=layout.bounds;previous=layout;history.push({time:Date.now(),size,layout});
     await metrics();
     await run(`nativeBounds=${JSON.stringify(bounds)};resizePending[${id}](${JSON.stringify(layout)});delete resizePending[${id}];`);
    }
    await run(`window.previewTest?.pointer?.({x:${cursor.x-bounds.x},y:${cursor.y-bounds.y},revision:${revision}})`);
   }catch(e){pumpError=e;}finally{processing=false;}
  },30);
  const waitFor=async expression=>{for(let i=0;i<150;i++){if(pumpError)throw pumpError;if(await run(expression))return;await delay(20);}throw Error('Timed out: '+expression);};
  await waitFor('window.sizes?.length>0&&document.body.dataset.transition==="closed"');await delay(200);
  const report=[];
  for(const position of [{x:1800,y:40},{x:0,y:40},{x:1800,y:980},{x:900,y:500}]) {
   cursor={x:-999,y:-999};await delay(600);
   bounds={...bounds,...position};previous=null;await run(`nativeBounds=${JSON.stringify(bounds)};frames=[];`);
   const start=await run(`(()=>{const b=document.querySelector('#mini-bar').getBoundingClientRect();return{x:nativeBounds.x+b.x,y:nativeBounds.y+b.y,width:b.width};})()`);
   cursor={x:start.x+start.width/2,y:start.y+18};
   await waitFor('document.body.dataset.transition==="preparing"');
   assert.equal(await run("getComputedStyle(document.querySelector('#shell')).visibility"),'hidden','hidden while native resize pending');
   await waitFor('document.body.dataset.transition==="open"');await delay(500);
   assert.equal(await run('document.body.dataset.transition'),'open','stationary cursor remains open');
   let trace=await run('frames');
   for(const f of trace) {assert.ok(Math.abs(f.x-start.x)<1&&Math.abs(f.y-start.y)<1,'capsule stays fixed: '+JSON.stringify({start,f}));}
   assert.ok(trace.some(f=>f.opacity>0&&f.opacity<1),'real intermediate animation frames');
   const placement=previous.placement;
   if(position.y===980)assert.equal(placement,'above');
   const shell=await run(`(()=>{const b=document.querySelector('#shell').getBoundingClientRect();return{x:nativeBounds.x+b.x,y:nativeBounds.y+b.y,w:b.width,h:b.height};})()`);
   assert.ok(shell.x>=area.x&&shell.y>=area.y&&shell.x+shell.w<=1920&&shell.y+shell.h<=1040,'panel within workarea');
   cursor={x:shell.x+20,y:shell.y+20};await delay(400);assert.equal(await run('document.body.dataset.transition'),'open');
   cursor={x:-999,y:-999};await waitFor('document.body.dataset.transition==="closing"');
   const expandedWidth=bounds.width;await delay(40);assert.equal(bounds.width,expandedWidth,'host remains expanded during fade out');
   const beforeReverse=history.length;
   cursor={x:start.x+start.width/2,y:start.y+18};await waitFor('document.body.dataset.transition==="open"');await delay(200);
   assert.equal(history.length,beforeReverse,'reversal resumes fade without a second native resize');
   assert.equal(bounds.width,324,'reentry cancels pending collapse');
   cursor={x:-999,y:-999};await waitFor('document.body.dataset.transition==="closed"');await delay(200);
   assert.ok(bounds.width<120,'native host shrinks only after fade');
   report.push({position,placement,frames:trace.length});
  }
  assert.deepEqual(cdp.errors,[]);if(pumpError)throw pumpError;
  const out=path.resolve(__dirname,'../../artifacts/percent-transition');fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,report,history},null,2));
  console.log('TRANSITION_PASS: delayed native resize, intermediate frames, fixed capsule, hover stability, reversal, four screen-edge positions');
 }finally{clearInterval(timer);await cdp.send('Browser.close').catch(()=>cdp.child.kill());}
})().catch(e=>{console.error(e);process.exitCode=1});
