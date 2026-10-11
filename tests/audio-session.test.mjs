import test from 'node:test';
import assert from 'node:assert/strict';
import {beginAudioCapture,prepareAudioPlayback} from '../dist/audio-session.js';
import {PitchListener} from '../dist/engine.js';
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
globalThis.Worker=class{constructor(){queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));}terminate(){}postMessage(){}};
globalThis.AudioWorkletNode=class{constructor(){this.port={postMessage(){}};}connect(){}disconnect(){}};
let stopped=0,contexts=[];
function setup({deny=false,resumeError=false,pending=false}={}){
 stopped=0;contexts=[];const session={type:'playback'};let resolve;
 const stream={getTracks:()=>[{stop(){stopped++;}}]};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{audioSession:session,mediaDevices:{getUserMedia(){assert.notEqual(session.type,'playback','capture forbidden in playback category');if(deny)return Promise.reject(Object.assign(Error('denied'),{name:'NotAllowedError'}));if(pending)return new Promise(r=>resolve=r);return Promise.resolve(stream);}}}});
 globalThis.AudioContext=class{constructor(){this.state='running';this.currentTime=0;this.audioWorklet={addModule:async()=>{}};contexts.push(this);}resume(){return resumeError?Promise.reject(Error('resume failed')):Promise.resolve();}createMediaStreamSource(){return{connect(){},disconnect(){}};}createAnalyser(){return{};}close(){this.state='closed';return Promise.resolve();}};
 return{session,finish:()=>resolve(stream)};
}
test('playback → microphone → playback switches category and releases input',async()=>{
 const {session}=setup();prepareAudioPlayback();assert.equal(session.type,'playback');
 const listener=new PitchListener();await listener.start(()=>{},()=>{},()=>3);assert.equal(session.type,'play-and-record');prepareAudioPlayback();assert.equal(session.type,'play-and-record');listener.stop();assert.equal(stopped,1);assert.equal(session.type,'playback');assert.equal(contexts[0].state,'closed');listener.stop();assert.equal(stopped,1);
});
test('permission denial and audio initialization failure restore the category',async()=>{
 let env=setup({deny:true});await assert.rejects(new PitchListener().start(),{name:'NotAllowedError'});assert.equal(env.session.type,'playback');
 env=setup({resumeError:true});await assert.rejects(new PitchListener().start(),/resume failed/);assert.equal(stopped,1);assert.equal(env.session.type,'playback');assert.equal(contexts[0].state,'closed');
});
test('cancel while permission is pending stops late-arriving tracks',async()=>{
 const env=setup({pending:true}),listener=new PitchListener(),request=listener.start();listener.stop();env.finish();await request;assert.equal(stopped,1);assert.equal(contexts.length,0);assert.equal(env.session.type,'playback');
});
test('overlapping owners and browsers without Audio Session API are safe',()=>{
 const env=setup(),a=beginAudioCapture(),b=beginAudioCapture();a();assert.equal(env.session.type,'play-and-record');b();assert.equal(env.session.type,'playback');delete navigator.audioSession;const release=beginAudioCapture();prepareAudioPlayback();release();
});
