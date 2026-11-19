import test from 'node:test';
import assert from 'node:assert/strict';
import {speechQueue} from '../dist/classroom-speech-queue.js';
test('clearing settles preparation even when the network never responds',async t=>{
 const original=globalThis.setTimeout;t.after(()=>globalThis.setTimeout=original);globalThis.setTimeout=()=>0;
 const queue=speechQueue(()=>new Promise(()=>{}));const pending=queue.prepare('/stalled');
 queue.clear();await assert.rejects(pending,{name:'AbortError'});
});
test('evicted preparation cannot preload stale audio when its response arrives',async t=>{
 const original=globalThis.setTimeout;t.after(()=>globalThis.setTimeout=original);globalThis.setTimeout=()=>0;
 const responses=new Map();const queue=speechQueue(url=>new Promise(resolve=>responses.set(url,resolve)));
 const first=queue.prepare('/0');for(let i=1;i<5;i++)queue.prepare('/'+i).catch(()=>{});
 responses.get('/0')({status:'complete',url:'/stale.mp3'});
 await assert.rejects(first,{name:'AbortError'});queue.clear();
 for(let i=1;i<5;i++)responses.get('/'+i)({status:'complete',url:'/stale.mp3'});
});
test('changing courses cancels an in-flight preparation before loading old audio',async t=>{
 const original=globalThis.setTimeout;t.after(()=>globalThis.setTimeout=original);globalThis.setTimeout=()=>0;
 let resolve;const queue=speechQueue(()=>new Promise(done=>resolve=done));
 const pending=queue.prepare('/old');queue.clear();resolve({status:'complete',url:'/old.mp3'});
 await assert.rejects(pending,{name:'AbortError'});
});
test('clearing a course releases preloaded audio and permits a fresh request',async t=>{
 const original={Audio:globalThis.Audio,setTimeout:globalThis.setTimeout};t.after(()=>Object.assign(globalThis,original));globalThis.setTimeout=()=>0;
 let released=0,calls=0;globalThis.Audio=class{load(){}pause(){released++}removeAttribute(){this.src=''}};
 const queue=speechQueue(async()=>{calls++;return {status:'complete',url:'/clip.mp3'}});
 await queue.prepare('/voice');queue.clear();await Promise.resolve();assert.equal(released,1);
 await queue.prepare('/voice');assert.equal(calls,2);queue.clear();
});
