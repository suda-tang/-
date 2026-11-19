import test from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
const fresh=()=>import('../dist/sample-assets.js?test='+ ++serial);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('shared sample requests return independent decode buffers',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;await delay(5);return{ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};};
 try{const {fetchSampleAsset}=await fresh();const [a,b]=await Promise.all([fetchSampleAsset(['/a']),fetchSampleAsset(['/a'])]);assert.equal(calls,1);assert.deepEqual(new Uint8Array(a),new Uint8Array(b));structuredClone(a,{transfer:[a]});assert.equal(b.byteLength,3);const c=await fetchSampleAsset(['/a']);assert.equal(c.byteLength,3);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('global network and decode concurrency stay bounded',async()=>{
 const original=globalThis.fetch;let active=0,peak=0;
 globalThis.fetch=async()=>{peak=Math.max(peak,++active);await delay(8);active--;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};};
 try{const {fetchSampleAsset,decodeSample}=await fresh();await Promise.all(Array.from({length:16},(_,i)=>fetchSampleAsset(['/sample-'+i])));assert.equal(peak,4);active=peak=0;await Promise.all(Array.from({length:8},()=>decodeSample(async()=>{peak=Math.max(peak,++active);await delay(5);active--;})));assert.equal(peak,2);}finally{globalThis.fetch=original;}
});

test('failed primary uses mirror and a failed request can be retried',async()=>{
 const original=globalThis.fetch;const visited=[];let fail=true;
 globalThis.fetch=async url=>{visited.push(url);return{ok:url==='/mirror'||!fail,status:503,arrayBuffer:async()=>new Uint8Array([9]).buffer};};
 try{const {fetchSampleAsset}=await fresh();await fetchSampleAsset(['/primary','/mirror']);assert.deepEqual(visited,['/primary','/mirror']);await assert.rejects(fetchSampleAsset(['/retry']));fail=false;assert.equal((await fetchSampleAsset(['/retry'])).byteLength,1);}finally{globalThis.fetch=original;}
});
