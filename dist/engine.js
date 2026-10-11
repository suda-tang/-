export function spectrum(samples){const n=samples.length,re=new Float64Array(n),im=new Float64Array(n);for(let i=0;i<n;i++)re[i]=samples[i]*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const tmp=re[i];re[i]=re[j];re[j]=tmp;}}for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len;for(let i=0;i<n;i+=len){for(let j=0;j<len/2;j++){const c=Math.cos(angle*j),s=Math.sin(angle*j),k=i+j,h=k+len/2;const tr=c*re[h]-s*im[h],ti=s*re[h]+c*im[h];re[h]=re[k]-tr;im[h]=im[k]-ti;re[k]+=tr;im[k]+=ti;}}}const out=new Float64Array(n/2);for(let i=0;i<n/2;i++)out[i]=Math.hypot(re[i],im[i]);return out;}
// Greedy harmonic-template fitting. Experimental, particularly for octaves/pedal.
export function detectPitches(samples,sampleRate){const bins=spectrum(samples),resolution=sampleRate/samples.length;const residual=Float64Array.from(bins);const result=[];const originalMax=Math.max(...bins);if(originalMax<.02)return[];for(let voice=0;voice<6;voice++){let best=null;for(let midi=36;midi<=96;midi++){if(result.includes(midi))continue;const frequency=440*2**((midi-69)/12);let energy=0,weight=0,fundamental=0;for(let h=1;h<=6;h++){const center=frequency*h/resolution;if(center>=bins.length-2)break;const k=Math.round(center);const value=Math.max(residual[k-1]||0,residual[k]||0,residual[k+1]||0);if(h===1)fundamental=value;energy+=value/h;weight+=1/h;}const value=energy/weight;if(fundamental<originalMax*.08)continue;if(!best||value>best.value)best={midi,value,frequency,fundamental};}if(!best||best.value<originalMax*.14||best.fundamental<originalMax*.10)break;result.push(best.midi);for(let h=1;h<=10;h++){const k=Math.round(best.frequency*h/resolution);for(let d=-2;d<=2;d++)if(k+d>0&&k+d<residual.length)residual[k+d]*=.08;}}return result.sort((a,b)=>a-b);}
export class PitchListener{
 async start(onNotes,onLevel,sensitivity=()=>3,onStatus=()=>{}){
  if(!navigator.mediaDevices?.getUserMedia)throw Error('请通过 localhost 或 HTTPS 打开网页');
  this.stopped=false;this.releaseSession=beginAudioCapture();this.onStatus=onStatus;this.tail=new Float32Array(0);
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
   if(this.stopped){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;const Context=globalThis.AudioContext||globalThis.webkitAudioContext,context=this.context=new Context();
   await context.resume();if(this.stopped||this.context!==context)return;
   onStatus({phase:'loading'});
   const model=this.model=new PolyphonicPitchStream((notes,time,meta)=>{if(!this.stopped){this.heard=notes;this.heardAt=performance.now();onNotes(notes,time,meta);}},status=>{if(!this.stopped&&!(this.finishing&&status.phase==='listening'))onStatus(status);});
   model.groupWindow=this.chordWindow||.085;await model.initialize();if(this.stopped)return;
   if(!context.audioWorklet)throw Error('当前浏览器不支持音频采集处理，请使用新版 Safari、Edge 或 Chrome');
   await context.audioWorklet.addModule('/pitch-capture-worklet.js');if(this.stopped)return;
   const source=this.source=context.createMediaStreamSource(stream),analyser=this.analyser=context.createAnalyser();analyser.fftSize=2048;source.connect(analyser);
   const node=this.capture=new AudioWorkletNode(context,'practice-capture');source.connect(node);node.connect(context.destination);
   node.port.onmessage=event=>{const m=event.data;if(m.type==='ended'){this.captureEnded?.();return;}if(this.stopped||m.type!=='audio')return;
    const audio=resampleMono(m.samples,m.rate),previous=this.tail,window=new Float32Array(previous.length+audio.length);window.set(previous);window.set(audio,previous.length);
    model.threshold=[.65,.58,.5,.42,.35][sensitivity()-1]||.5;
    model.minimumConfidence=[.5,.42,.35,.3,.25][sensitivity()-1]||.35;
    model.enqueue(window,m.start-previous.length/22050,false);this.tail=audio.slice(-8820);this.tailEnd=m.start+audio.length/22050;
   };
   const samples=new Float32Array(2048);const meter=()=>{if(this.stopped)return;analyser.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);onLevel({level:Math.min(100,Math.round(rms*650)),pitches:performance.now()-(this.heardAt||0)<500?this.heard||[]:[]});this.raf=requestAnimationFrame(meter);};this.raf=requestAnimationFrame(meter);onStatus({phase:'listening'});
  }catch(error){this.stop();throw error;}
 }
 async finish(){
  if(this.stopped||this.finishing)return;this.finishing=true;this.onStatus?.({phase:'finishing'});
  try{
   if(this.capture)await new Promise(resolve=>{const timer=setTimeout(resolve,1000);this.captureEnded=()=>{clearTimeout(timer);resolve();};this.capture.port.postMessage('finish');});
   this.stream?.getTracks().forEach(t=>t.stop());
   if(!this.stopped&&this.tail?.length)this.model.enqueue(Float32Array.from(this.tail),this.tailEnd-this.tail.length/22050,true);
   await this.model?.finish();
  }finally{this.finishing=false;}
 }
 stop(){
  this.stopped=true;cancelAnimationFrame(this.raf);this.captureEnded?.();this.model?.stop();this.capture?.disconnect();this.capture=null;
  try{this.source?.disconnect();}catch{}this.source=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  const context=this.context;this.context=null;if(context&&context.state!=='closed')void context.close().catch(()=>{});
  this.releaseSession?.();this.releaseSession=null;this.tail=null;
 }
}
const overlap=(a,b)=>a.filter(n=>b.includes(n)).length;
export class Follower{
 constructor(events,bpm){
  // Imported MIDI playback events can carry notes without the MusicXML
  // parser's derived pitches field. Normalize without mutating the score or
  // dropping events (global event indices must remain aligned with the UI).
  this.events=events.map(event=>{const pitches=Array.isArray(event.pitches)?event.pitches:(event.notes||[]).filter(note=>!note.percussion&&!/drum|鼓/i.test(note.instrument||'')).map(note=>note.midi);
   return {...event,pitches:[...new Set(pitches.filter(pitch=>Number.isInteger(pitch)&&pitch>=0&&pitch<=127))]};});
  this.bpm=bpm;this.index=0;this.last=null;
 }
 pause(){this.last=null;}
 consume(pitches,time){if(this.index>=this.events.length)return[];pitches=[...new Set(pitches)];if(!pitches.length)return[];const rows=[];let bestIndex=this.index,bestCost=Infinity;
 for(let i=this.index;i<Math.min(this.index+4,this.events.length);i++){const expected=this.events[i].pitches;const f1=2*overlap(expected,pitches)/(expected.length+pitches.length);const cost=1-f1+(i-this.index)*.26;if(cost<bestCost){bestCost=cost;bestIndex=i;}}
 const current=this.events[this.index];const matches=overlap(current.pitches,pitches);const fastExtra=this.last&&time-this.last.time<Math.max(.12,(current.beat-this.last.beat)*60/this.bpm*.35);
 if(matches===0&&(overlap(this.events[bestIndex].pitches,pitches)===0||bestCost>=.99&&fastExtra))return[{index:this.index,measure:current.measure,beat:current.beat,expected:[],heard:pitches,type:'extra',time,offsetMs:null,matched:0,missed:0,extra:pitches.length,interval:null,beatInterval:null}];
 while(this.index<bestIndex){const e=this.events[this.index];rows.push({index:this.index,measure:e.measure,beat:e.beat,expected:e.pitches,heard:[],type:'missed',time,offsetMs:null,matched:0,missed:e.pitches.length,extra:0,interval:null,beatInterval:null});this.index++;}
 const event=this.events[this.index],matched=overlap(event.pitches,pitches);const interval=this.last?time-this.last.time:null,beatInterval=this.last?event.beat-this.last.beat:null;rows.push({index:this.index,measure:event.measure,beat:event.beat,expected:event.pitches,heard:pitches,type:matched===event.pitches.length&&matched===pitches.length?'correct':'wrong',time,offsetMs:interval!==null?(interval-beatInterval*60/this.bpm)*1000:null,matched,missed:event.pitches.length-matched,extra:pitches.length-matched,interval,beatInterval});this.last={time,beat:event.beat};this.index++;return rows;
 }
}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;};
export function summarize(rows,target){const matched=rows.reduce((s,r)=>s+r.matched,0),missed=rows.reduce((s,r)=>s+r.missed,0),extra=rows.reduce((s,r)=>s+r.extra,0);const intervals=rows.filter(r=>r.interval>0&&r.beatInterval>0&&r.interval/r.beatInterval<6).slice(-12);const rates=intervals.map(r=>r.interval/r.beatInterval);const secPerBeat=rates.length>=2?median(rates):null;return{matched,missed,extra,accuracy:rows.length?Math.round(100*2*matched/Math.max(1,2*matched+missed+extra)):null,bpm:secPerBeat?Math.round(60/secPerBeat):null,rhythm:secPerBeat?Math.round(100*Math.max(0,1-median(rates.map(r=>Math.abs(r-secPerBeat)/secPerBeat)))):null,target};}
import {beginAudioCapture} from './audio-session.js';
import {PolyphonicPitchStream,resampleMono} from './pitch-stream.js';
