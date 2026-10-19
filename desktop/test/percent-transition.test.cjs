'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {percentBounds}=require('../src/window-layout.cjs');
const {popupBounds}=require('../src/window-layout.cjs');
const area={x:0,y:0,width:1920,height:1040};
const request={width:324,height:760,barWidth:97,expanded:true};
const anchor=(b,l)=>({x:b.x+(l?.barLeft??12),y:b.y+(l?.barTop??12)});

test('dropdown preserves capsule position through open/close at every screen edge',()=>{
 for(const x of [0,40,900,1823]) for(const y of [0,40,500,980]) {
  let bounds={x,y,width:97,height:60},previous=null;
  const expected=anchor(bounds,previous);
  for(let i=0;i<20;i++) {
   const layout=percentBounds(bounds,area,{...request,expanded:i%2===0},previous);
   assert.deepEqual(anchor(layout.bounds,layout),expected);
   assert.ok(layout.bounds.x>=0&&layout.bounds.y>=0);
   assert.ok(layout.bounds.x+layout.bounds.width<=area.width);
   assert.ok(layout.bounds.y+layout.bounds.height<=area.height);
   bounds=layout.bounds;previous=layout;
  }
 }
});
test('bottom placement opens above, middle panel scrolls, negative monitor coordinates work',()=>{
 const bottom=percentBounds({x:1800,y:980,width:97,height:60},area,request);
 assert.equal(bottom.placement,'above');assert.equal(bottom.panelTop,12);
 const middle=percentBounds({x:1000,y:500,width:97,height:60},area,request);
 assert.ok(middle.panelMaxHeight<request.height-68);
 const left={x:-1920,y:100,width:1920,height:1040};
 const bounds={x:-1900,y:1060,width:97,height:60};
 const layout=percentBounds(bounds,left,request);
 assert.deepEqual(anchor(layout.bounds,layout),anchor(bounds,null));
});

test('independent popup stays on monitor and never mutates its owner', () => {
 for (const area of [{x:0,y:0,width:1920,height:1040}, {x:-1920,y:100,width:1920,height:1040}]) {
  for (const x of [area.x, area.x+900, area.x+area.width-98]) for (const y of [area.y,area.y+500,area.y+area.height-60]) {
   const owner=Object.freeze({x,y,width:98,height:60});
   const result=popupBounds(owner,area,740),b=result.bounds;
   assert.ok(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height);
   const panelTop=b.y+12,panelBottom=b.y+b.height-12,barTop=y+12,barBottom=y+48;
   assert.ok(panelBottom<=barTop-8||panelTop>=barBottom+8,'8px gap; no capsule overlap');
   if(y===area.y+area.height-60)assert.equal(result.placement,'above');
  }
 }
});
