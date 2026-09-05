// Headless simulation of the actual game loop; run: node --test web/game.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function game() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent:'', style:{}, classList:{add(){},remove(){}}, addEventListener(){}, setAttribute(){}, focus(){}, getBoundingClientRect(){return {width:1200,height:600};}, getContext(){return {setTransform(){}};} });
    return elements.get(id);
  };
  const sandbox = { document:{getElementById:element,querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame(){} };
  const source = fs.readFileSync(path.join(__dirname,'game.js'),'utf8').replace(/\}\)\(\);\s*$/, `globalThis.game = {start,update,action,pause,held,get:()=>({mode,lane,playerX,jumpY,distance,coins,energy,objects}),set:(code)=>eval(code)};})();`);
  vm.runInNewContext(source,sandbox);
  return sandbox.game;
}
test('starter coins collect and distance progresses',()=>{
  const g=game();g.start();for(let i=0;i<120;i++)g.update(1/60);
  assert.ok(g.get().distance>40);assert.ok(g.get().coins>=4);
});
test('jump clears a rock; landing returns to ground',()=>{
  const g=game();g.start();g.action('jump');for(let i=0;i<20;i++)g.update(1/60);
  assert.ok(g.get().jumpY>1.5);g.set("objects=[{type:'rock',x:0,z:8.1,y:0}]");g.update(1/60);
  assert.equal(g.get().mode,'running');for(let i=0;i<80;i++)g.update(1/60);assert.equal(g.get().jumpY,0);
});
test('collision spends coins, then a zero-coin collision ends run',()=>{
  const g=game();g.start();g.set("coins=5;objects=[{type:'rock',x:0,z:8.1,y:0}]");g.update(1/60);
  assert.equal(g.get().coins,0);assert.equal(g.get().mode,'running');
  g.set("invincible=0;objects=[{type:'rock',x:0,z:8.1,y:0}]");g.update(1/60);assert.equal(g.get().mode,'over');
  g.start();assert.equal(g.get().mode,'running');assert.equal(g.get().distance,0);assert.equal(g.get().coins,0);
});
test('dash breaks an obstacle and consumes energy',()=>{
  const g=game();g.start();g.held.add('ShiftLeft');g.set("objects=[{type:'rock',x:0,z:8.1,y:0}]");g.update(1/60);
  assert.equal(g.get().mode,'running');assert.ok(g.get().energy<100);assert.equal(g.get().objects.length,0);
});
test('pause freezes simulation; lane changes stay within bounds',()=>{
  const g=game();g.start();g.action('left');g.action('left');assert.equal(g.get().lane,-1);
  g.pause();g.update(1);assert.equal(g.get().distance,0);g.pause();g.update(1/60);assert.ok(g.get().distance>0);
});
