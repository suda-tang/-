import test from 'node:test';
import assert from 'node:assert/strict';
import {attachLectureMusic} from '../dist/lecture-music.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t){
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 class Audio extends EventTarget{constructor(){super();this.dataset={};this.paused=true;this.currentTime=1;this.duration=60;this.src='';}getAttribute(k){return this[k]||null;}removeAttribute(k){this[k]='';}pause(){this.paused=true;}async play(){this.paused=false;}load(){}remove(){this.removed=true;}}
 const music=new Audio(),voice=new Audio();voice.paused=false;
 const doc=new EventTarget();doc.body={append(){}};doc.createElement=()=>music;
 globalThis.document=doc;globalThis.window={};let tick;
 globalThis.setInterval=fn=>{tick=fn;return 1;};globalThis.clearInterval=()=>{};
 t.after(()=>{globalThis.window.__disposeLectureMusic?.();Object.assign(globalThis,saved);});
 return {music,voice,tick:()=>tick()};
}
test('slow music status requests never overlap and disposal aborts download',async t=>{
 const {voice,tick,music}=setup(t);let calls=0,signal;
 globalThis.fetch=(url,options)=>{calls++;signal=options.signal;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled'))));};
 const dispose=attachLectureMusic(voice);tick();tick();assert.equal(calls,1);
 dispose();await flush();assert.equal(signal.aborted,true);assert.equal(music.removed,true);assert.equal(music.paused,true);
});
test('removing uploaded music clears the existing source',async t=>{
 const {voice,tick,music}=setup(t);let config={url:'/music.m4a',volume:.35};
 globalThis.fetch=async()=>({ok:true,json:async()=>config});
 attachLectureMusic(voice);await flush();assert.equal(music.src,'/music.m4a');assert.equal(music.paused,false);
 config={url:''};await tick();assert.equal(music.src,'');assert.equal(music.paused,true);
});
test('chapter pauses preserve music while ordinary pauses stop it',async t=>{
 const {voice,music}=setup(t);globalThis.fetch=async()=>({ok:true,json:async()=>({url:'/music.m4a',volume:.35})});
 attachLectureMusic(voice);await flush();voice.dataset.chapterTransition='1';voice.dispatchEvent(new Event('pause'));assert.equal(music.paused,false);
 voice.dataset.chapterTransition='0';voice.dispatchEvent(new Event('pause'));assert.equal(music.paused,true);
});
test('late response cannot restore audio after disposal',async t=>{
 const {voice,music}=setup(t);let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
 const dispose=attachLectureMusic(voice);dispose();finish({ok:true,json:async()=>({url:'/late.m4a'})});await flush();assert.equal(music.src,'');assert.equal(music.paused,true);
});
