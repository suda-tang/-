import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function openFromTaskCenter(');
const end=source.indexOf("document.addEventListener('task-open-score'",start);
const fn=source.slice(start,end);

test('task score opening starts before panel or card animation settles',async()=>{
 let navClicks=0,pending=0,clicked=0;const timers=[];
 const card={scrollIntoView(){},classList:{add(){},remove(){}},click(){clicked++}};
 const context={
  document:{body:{dataset:{workspace:'tasks'}},querySelector(selector){return selector==='[data-panel="library"]'?{click(){navClicks++}}:selector.startsWith('[data-score-id=')?card:null;}},
  requestAnimationFrame(fn){fn();return 1},setTimeout(fn,delay){timers.push(delay);return 1},
  matchMedia(){return {matches:false}},openGeneratedArrangement:async()=>{},openPendingScore:async()=>{pending++}
 };
 vm.createContext(context);vm.runInContext(fn+';globalThis.openTaskScore=openFromTaskCenter;',context);
 await context.openTaskScore({digest:'a'.repeat(64),kind:'omr',status:'running'});
 assert.equal(navClicks,1);assert.equal(pending,1);assert.equal(clicked,0);
 assert.ok(!timers.includes(560));assert.ok(!timers.includes(620));
});
