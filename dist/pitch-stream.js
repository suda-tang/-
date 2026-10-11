export function resampleMono(samples,rate,target=22050){
 if(rate===target)return Float32Array.from(samples);
 const out=new Float32Array(Math.floor(samples.length*target/rate)),ratio=rate/target;
 for(let i=0;i<out.length;i++){const from=i*ratio,to=(i+1)*ratio;let sum=0,weight=0;for(let j=Math.floor(from);j<Math.ceil(to)&&j<samples.length;j++){const w=Math.max(0,Math.min(to,j+1)-Math.max(from,j));sum+=samples[j]*w;weight+=w;}out[i]=weight?sum/weight:0;}return out;
}
export function groupOnsets(notes,offset,from,to,window=.085,minimumConfidence=.35){
 const candidates=notes.filter(n=>Number.isInteger(n.pitch)&&n.pitch>=21&&n.pitch<=108&&Number.isFinite(n.start)&&n.start>=0&&n.duration>=.045&&n.confidence>=minimumConfidence);
 // Piano harmonics may produce a brief, weak octave at the exact same attack.
 // Only suppress when amplitude AND duration are much lower; retain sustained
 // octaves and independent attacks. This is a conservative heuristic, not proof.
 const valid=candidates.filter(n=>!candidates.some(base=>base.pitch===n.pitch-12&&Math.abs(base.start-n.start)<.025&&n.confidence<.4&&n.confidence<base.confidence*.65&&n.duration<base.duration*.65)).sort((a,b)=>a.start-b.start),groups=[];
 for(const n of valid){let g=groups.at(-1);if(!g||n.start-g.start>window){g={start:n.start,time:offset+n.start,pitches:[],confidence:1};groups.push(g);}if(!g.pitches.includes(n.pitch))g.pitches.push(n.pitch);g.confidence=Math.min(g.confidence,n.confidence);}
 return groups.filter(g=>g.start>=from&&g.start<to).map(g=>({...g,pitches:g.pitches.sort((a,b)=>a-b)}));
}
export class PolyphonicPitchStream{
 constructor(onNotes,onStatus){this.onNotes=onNotes;this.onStatus=onStatus;this.serial=0;this.pending=new Map();this.queue=[];this.closed=false;this.committed=0;}
 async initialize(){
  this.worker=new Worker('/vendor/basic-pitch/worker.js?v=1.0.1-practice1');
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('听音模型载入超时，请检查资源是否部署完整')),45000);this.rejectReady=error=>{clearTimeout(timer);reject(error);};
   this.worker.onerror=()=>{const error=Error('听音模型运行失败，请重试');clearTimeout(timer);reject(error);this.fail(error);};
   this.worker.onmessage=e=>{const m=e.data;if(m.type==='ready'){clearTimeout(timer);resolve();}else if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.type==='error'?p.reject(Error(m.error)):p.resolve(m.notes);}else if(m.type==='error'){clearTimeout(timer);reject(Error(m.error));}};
  });
 }
 infer(samples){return new Promise((resolve,reject)=>{if(this.closed){resolve([]);return;}const id=++this.serial,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('设备处理听音过慢，请关闭其他高负载页面后重试'));},15000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,samples:samples.buffer,threshold:this.threshold||.5},[samples.buffer]);});}
 enqueue(samples,start,final=false){
  if(this.closed||!samples.length)return;
  // Never silently skip an overloaded window; terminate recognition instead of
  // creating a false missed-note score from audio we did not analyze.
  if(this.queue.length>=4){this.fail(Error('设备处理听音过慢，本次已暂停；请关闭其他高负载页面或换用性能更好的设备'));return;}
  this.queue.push({samples,start,final});this.drain();
 }
 async drain(){
  if(this.busy||this.closed)return;this.busy=true;
  try{while(this.queue.length&&!this.closed){const {samples,start,final}=this.queue.shift();
    // Transfer detaches the input buffer: retain its timeline before inference.
    const end=start+samples.length/22050,commitEnd=final?end:end-.2,notes=await this.infer(samples);if(this.closed)break;
    for(const group of groupOnsets(notes,start,Math.max(0,this.committed-start),Math.max(0,commitEnd-start),this.groupWindow||.085,this.minimumConfidence||.35)){if(this.closed)break;this.onNotes(group.pitches,group.time,{confidence:group.confidence,engine:'basic-pitch'});}
    this.committed=Math.max(this.committed,commitEnd);this.onStatus?.({phase:'listening',lag:Math.max(0,end-this.committed),queued:this.queue.length});
  }}catch(error){this.fail(error);}finally{this.busy=false;if(!this.queue.length)this.waiter?.();}
 }
 async finish(){if(this.closed)return;await new Promise(resolve=>{if(!this.busy&&!this.queue.length)resolve();else this.waiter=resolve;});}
 fail(error){if(this.closed)return;this.onStatus?.({phase:'error',error:error.message});this.stop();}
 stop(){if(this.closed)return;this.closed=true;this.rejectReady?.(Error('听音已停止'));this.worker?.terminate();this.queue=[];for(const p of this.pending.values()){clearTimeout(p.timer);p.resolve([]);}this.pending.clear();this.waiter?.();}
}
