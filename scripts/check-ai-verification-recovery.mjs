import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../dist/workspace-ai.js',import.meta.url),'utf8');
const start=source.indexOf(' async function runActions('),end=source.indexOf(' return false;}',start)+' return false;}'.length;
const fn=source.slice(start,end);
async function scenario(alwaysFail){
 let attempts=0,repairs=0;const marks=[];
 const context={awaitingUser:false,inActionPhase:false,taskPercent:0,tourOwned:false,executedActions:[],tourActions:[],labels:{},document:{body:{classList:{add(){},remove(){}}}},trigger:{classList:{add(){}},setAttribute(){},removeAttribute(){}},close:async()=>{},taskProgress:(p,t)=>marks.push([p,t]),snapshot:()=>({}),action:async()=>{attempts++},verifyAction:async()=>!alwaysFail&&attempts>1,repairActions:async()=>{repairs++;return [{type:'panel',value:'play'}]},readableNetworkError:e=>e.message,wait:async()=>{},reduced:()=>true,line:()=>{},settle:()=>{},showResults:async()=>{}};
 vm.createContext(context);vm.runInContext(fn+'; globalThis.run=runActions;',context);
 let failed=false;try{await context.run([{type:'panel',value:'library'}])}catch{failed=true}
 return {attempts,repairs,failed,marks,completed:context.executedActions.length};
}
const recovered=await scenario(false);assert.equal(recovered.repairs,1);assert.equal(recovered.completed,1);assert.equal(recovered.failed,false);
const blocked=await scenario(true);assert.equal(blocked.failed,true);assert.equal(blocked.completed,0);assert.equal(blocked.marks.some(([p,t])=>p===100&&t==='已完成'),false);assert.ok(blocked.attempts<=3);
console.log('PASS failed verification repairs once; repeated failure stays failed, never completed');
