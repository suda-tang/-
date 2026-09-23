// Salamander Grand Piano, Alexander Holm, CC BY 3.0.
// Five independently recorded touch strengths; three-semitone sample spacing.
export const LAYERS=[2,5,8,11,15];
export const ROOTS=Array.from({length:30},(_,i)=>21+i*3);
export const sampleRoot=midi=>ROOTS.reduce((a,b)=>Math.abs(b-midi)<Math.abs(a-midi)?b:a);
export function selectLayer(velocity){return LAYERS[Math.min(4,Math.max(0,Math.floor(velocity*5)))];}
export function preloadPianoSamples(){const roots=[48,60,72,84];return Promise.all(roots.flatMap(root=>LAYERS.map(layer=>fetch(`/assets/piano/salamander/${name(root)}v${layer}.mp3`,{cache:'force-cache'}).then(()=>true).catch(()=>false))));}
const name=midi=>['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'][midi%12]+(Math.floor(midi/12)-1);
// Keep decoded buffers for the lifetime of one AudioContext. Switching scores
// then reuses the same Salamander layers and only fetches registers that the
// new score actually needs.
const contextSampleCache=new WeakMap();
const PIANO_MIRRORS=globalThis.SOUND_FONT_MIRRORS||['https://cdn.jsdelivr.net/gh/super-tang/piano-soundfonts@main/piano/salamander'];
async function fetchPiano(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(url,{signal:controller.signal,cache:'force-cache'});if(!response.ok)throw Error();return response.arrayBuffer();}finally{clearTimeout(timer);}}
export async function loadPianoSamples(context,score,progress=()=>{}){
 const roots=[...new Set((score?.events.flatMap(e=>e.notes.map(n=>sampleRoot(n.midi)))||[60]))];
 const jobs=roots.flatMap(root=>LAYERS.map(layer=>({root,layer})));
 const samples=[];let completed=0;const total=jobs.length;
 let cache=contextSampleCache.get(context);if(!cache){cache=new Map();contextSampleCache.set(context,cache);}
 async function getSample(root,layer){
   const key=`${root}:${layer}`;const existing=cache.get(key);if(existing)return existing;
   const promise=(async()=>{
     const urls=[`/assets/piano/salamander/${name(root)}v${layer}.mp3`,...PIANO_MIRRORS.map(base=>`${base}/${name(root)}v${layer}.mp3`)];let raw;for(const url of urls){try{raw=await fetchPiano(url);break;}catch{}}if(!raw)throw Error('钢琴音源加载失败，本机与公网镜像均不可用');const decoded=await context.decodeAudioData(raw);
     // Resample once per context so subsequent scores use the same buffer.
     const rate=24000;
     const offline=new OfflineAudioContext(decoded.numberOfChannels,Math.ceil(decoded.duration*rate),rate);
     const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
     return offline.startRendering();
   })().catch(error=>{cache.delete(key);throw error;});
   cache.set(key,promise);return promise;
 }
 // Limit simultaneous network/decode work while preserving deterministic order.
 async function worker(){while(jobs.length){const {root,layer}=jobs.shift();
   const buffer=await getSample(root,layer);samples.push([root,buffer,layer]);progress(++completed,total);
 }}
 await Promise.all([worker(),worker()]);return samples;
}
