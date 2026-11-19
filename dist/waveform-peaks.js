import {yieldToBrowser} from './yield-to-browser.js?v=1';

export async function waveformPeaks(samples,bins=1200,{signal}={}){
 bins=Math.max(1,Math.floor(Number(bins)||1200));
 const check=()=>{if(signal?.aborted)throw new DOMException('Waveform cancelled','AbortError');};
 check();
 if(typeof Worker==='function'){
  try{return await new Promise((resolve,reject)=>{
   const worker=new Worker(new URL('./waveform-peaks-worker.js',import.meta.url));
   let timer;
   const cleanup=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};
   const abort=()=>{cleanup();reject(new DOMException('Waveform cancelled','AbortError'));};
   signal?.addEventListener('abort',abort,{once:true});
   worker.onmessage=({data})=>{cleanup();resolve(data);};
   worker.onerror=()=>{cleanup();reject(Error('Waveform worker unavailable'));};
   timer=setTimeout(()=>{cleanup();reject(Error('Waveform worker timed out'));},30000);
   // Caller owns this temporary channel copy and permits its buffer to detach.
   try{worker.postMessage({samples,bins},[samples.buffer]);}catch(error){cleanup();reject(error);}
  });}catch(error){check();if(!samples.byteLength)throw error;}
 }
 const step=Math.max(1,Math.ceil(samples.length/bins)),peaks=[];let deadline=performance.now()+5;
 for(let i=0;i<samples.length;i+=step){let peak=0;for(let j=i;j<Math.min(i+step,samples.length);j++)peak=Math.max(peak,Math.abs(samples[j]));peaks.push(peak);if(performance.now()>deadline){await yieldToBrowser();check();deadline=performance.now()+5;}}
 return peaks;
}
