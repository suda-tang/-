// Bundled by vendor-practice-pitch.mjs. Upstream API and Apache-2.0 attribution
// are retained in dist/vendor/basic-pitch; microphone audio never leaves worker.
import * as tf from '@tensorflow/tfjs';
import {setWasmPaths} from '@tensorflow/tfjs-backend-wasm';
import {BasicPitch,outputToNotesPoly,noteFramesToTime} from '@spotify/basic-pitch';
let model=null;
async function initialize(){
 setWasmPaths('/vendor/basic-pitch/');
 // tfjs 3.21's WASM Fill does not supply the public op's float32 default.
 // Basic Pitch's padding calls Fill without dtype; align it with the CPU op.
 const fill=tf.getKernel('Fill','wasm');if(fill){tf.unregisterKernel('Fill','wasm');tf.registerKernel({...fill,kernelFunc:args=>fill.kernelFunc({...args,attrs:{...args.attrs,dtype:args.attrs.dtype||'float32'}})});}
 await tf.setBackend('wasm');await tf.ready();
 model=new BasicPitch('/vendor/basic-pitch/model/model.json');await model.model;
}
const ready=initialize();
ready.then(()=>postMessage({type:'ready'})).catch(error=>postMessage({type:'error',error:'听音模型未能载入：'+error.message}));
self.onmessage=async event=>{
 const {id,samples,threshold=.5}=event.data;if(!samples)return;
 try{
  await ready;tf.engine().startScope();
  try{
   const frames=[],onsets=[];
   await model.evaluateModel(new Float32Array(samples),(f,o)=>{frames.push(...f);onsets.push(...o);},()=>{});
   const notes=noteFramesToTime(outputToNotesPoly(frames,onsets,threshold,.3,5,true));
   postMessage({type:'result',id,notes:notes.map(n=>({pitch:n.pitchMidi,start:n.startTimeSeconds,duration:n.durationSeconds,confidence:n.amplitude}))});
  }finally{tf.engine().endScope();}
 }catch(error){console.error(error);postMessage({type:'error',id,error:error.message});}
};
