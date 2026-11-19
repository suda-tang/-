import test from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
const fresh=()=>import('../dist/catalog-request.js?audit='+ ++serial);
function setup(t,early){const saved={window:globalThis.window,fetch:globalThis.fetch,setTimeout:globalThis.setTimeout};globalThis.window={cloudLibraryRequest:early};globalThis.setTimeout=(fn,ms,...args)=>saved.setTimeout(fn,ms===1500?10:ms,...args);t.after(()=>Object.assign(globalThis,saved));}
test('stalled startup prefetch cannot hold the catalog forever',async t=>{setup(t,new Promise(()=>{}));let calls=0;globalThis.fetch=async()=>{calls++;return{ok:true,json:async()=>({scores:[{id:'a'}]})};};const {fetchCatalog}=await fresh();const a=fetchCatalog(),b=fetchCatalog();assert.equal(a,b);assert.equal((await a).scores[0].id,'a');assert.equal(calls,1);await fetchCatalog();assert.equal(calls,1);});
test('malformed early response falls back to a fresh request',async t=>{setup(t,Promise.resolve({error:'old failure'}));globalThis.fetch=async()=>({ok:true,json:async()=>({scores:[]})});assert.deepEqual(await (await fresh()).fetchCatalog(),{scores:[]});});
test('failed request can be retried instead of retaining a rejected promise',async t=>{setup(t,null);let failed=true;globalThis.fetch=async()=>({ok:!failed,status:503,json:async()=>({scores:[]})});const {fetchCatalog}=await fresh();await assert.rejects(fetchCatalog(),/503/);failed=false;assert.deepEqual(await fetchCatalog(),{scores:[]});});
