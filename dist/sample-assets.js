// Shared bounded network/decode queues for all instruments.
const entries=new Map(),network=[],decoders=[],pipelines=[];
const active={network:0,decode:0,sample:0};let bytes=0;
const BUDGET=8*1024*1024;
function pump(queue,kind){
 const limit=kind==='decode'?2:4;
 while(queue.length&&active[kind]<limit){
  const job=queue.shift();active[kind]++;
  Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{active[kind]--;pump(queue,kind);});
 }
}
function schedule(queue,kind,task,background=false){return new Promise((resolve,reject)=>{const job={task,resolve,reject,background};if(background)queue.push(job);else{const i=queue.findIndex(j=>j.background);queue.splice(i<0?queue.length:i,0,job);}pump(queue,kind);});}
export const loadSample=task=>schedule(pipelines,'sample',task);
export const decodeSample=task=>schedule(decoders,'decode',task);
export async function fetchSampleAsset(urls,{background=false,copy=true}={}){
 const key=JSON.stringify(urls);let entry=entries.get(key);
 if(entry){entries.delete(key);entries.set(key,entry);}
 else{
  entry={size:0,promise:null};entries.set(key,entry);
  entry.promise=schedule(network,'network',async()=>{
   for(const url of urls){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch(url,{signal:controller.signal,cache:'force-cache',priority:background?'low':'high'});if(!response.ok)throw Error(String(response.status));return await response.arrayBuffer();}catch{}finally{clearTimeout(timer);}
   }throw Error('音源加载失败，本机与公网镜像均不可用');
  },background).then(buffer=>{entry.size=buffer.byteLength;bytes+=entry.size;for(const [oldKey,old]of entries){if(bytes<=BUDGET)break;if(old.size){entries.delete(oldKey);bytes-=old.size;}}return buffer;}).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;});
 }
 const buffer=await entry.promise;return copy?buffer.slice(0):buffer;
}
