// One-shot worker; the caller transfers an owned copy, never an AudioBuffer.
self.onmessage=({data:{samples,bins}})=>{
 const step=Math.max(1,Math.ceil(samples.length/bins)),peaks=[];
 for(let i=0;i<samples.length;i+=step){let peak=0;for(let j=i;j<Math.min(i+step,samples.length);j++)peak=Math.max(peak,Math.abs(samples[j]));peaks.push(peak);}
 self.postMessage(peaks);
};
