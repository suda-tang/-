import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioPreview} from '../dist/audio-preview.js';
function setup(t){
 const saved={fetch:globalThis.fetch,Audio:globalThis.Audio,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 const audios=[],revoked=[],reports=[];let serial=0;
 globalThis.fetch=async()=>({ok:true,blob:async()=>({size:20})});
 URL.createObjectURL=()=> 'blob:'+ ++serial;URL.revokeObjectURL=url=>revoked.push(url);
 globalThis.Audio=class{constructor(){this.paused=true;audios.push(this);}async play(){this.paused=false;}pause(){this.paused=true;}removeAttribute(){}};
 t.after(()=>{globalThis.fetch=saved.fetch;globalThis.Audio=saved.Audio;URL.createObjectURL=saved.create;URL.revokeObjectURL=saved.revoke;});
 const player=createAudioPreview(message=>reports.push(message));t.after(()=>player.stop());
 return {player,audios,revoked,reports};
}
const button=()=>({textContent:'试听',disabled:false,setAttribute(k,v){this[k]=v;}});
test('stop aborts a pending download and restores the button immediately',async t=>{
 const {player,reports}=setup(t);let signal;
 globalThis.fetch=(url,options)=>new Promise((resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new Error('aborted')));});
 const b=button(),work=player.play('/slow',b);assert.equal(b.disabled,true);
 player.stop();assert.equal(signal.aborted,true);assert.equal(b.disabled,false);assert.equal(b.textContent,'试听');
 await work;assert.deepEqual(reports,[]);
});
test('late resume failure cannot stop the replacement preview',async t=>{
 const {player,audios,reports}=setup(t);const a=button(),b=button();
 await player.play('/a',a);await player.play('/a',a);
 let rejectResume;audios[0].play=()=>new Promise((resolve,reject)=>{rejectResume=reject;});
 const resuming=player.play('/a',a);await player.play('/b',b,'second');
 rejectResume(new Error('old playback failed'));await resuming;
 assert.equal(audios[1].paused,false);assert.equal(b.textContent,'暂停试听');assert.equal(reports.includes('old playback failed'),false);
});
test('replaced request cannot overwrite a new request using the same button',async t=>{
 const {player}=setup(t);let finishOld;
 globalThis.fetch=()=>new Promise(resolve=>{finishOld=resolve;});
 const b=button(),old=player.play('/old',b);player.stop();
 globalThis.fetch=async()=>({ok:true,blob:async()=>({size:20})});
 await player.play('/new',b);finishOld({ok:true,blob:async()=>({size:20})});await old;
 assert.equal(b.textContent,'暂停试听');assert.equal(b['aria-pressed'],'true');
});
test('HTML upstream failure has a readable error and is retryable',async t=>{
 const {player,reports}=setup(t);const b=button();
 globalThis.fetch=async()=>({ok:false,status:502,json:async()=>{throw Error('invalid json');}});
 await player.play('/bad',b);assert.match(reports[0],/HTTP 502/);assert.equal(b.disabled,false);
 globalThis.fetch=async()=>({ok:true,blob:async()=>({size:20})});
 await player.play('/good',b);assert.equal(b.textContent,'暂停试听');
});
test('audio construction failure releases its object URL',async t=>{
 const {player,revoked}=setup(t);globalThis.Audio=class{constructor(){throw Error('unsupported');}};
 const b=button();await player.play('/a',b);assert.deepEqual(revoked,['blob:1']);assert.equal(b.disabled,false);
});
