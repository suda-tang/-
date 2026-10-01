export const INSTRUMENTS=[['salamander','音乐会钢琴'],['acoustic_grand_piano','三角钢琴'],['bright_acoustic_piano','明亮钢琴'],['electric_grand_piano','电三角钢琴'],['honkytonk_piano','酒吧钢琴'],['electric_piano_1','电钢琴 I'],['electric_piano_2','电钢琴 II'],['harpsichord','羽管键琴'],['clavinet','击弦古钢琴'],['celesta','钢片琴'],['glockenspiel','钟琴'],['vibraphone','颤音琴'],['marimba','马林巴'],['tubular_bells','管钟'],['church_organ','管风琴'],['acoustic_guitar_nylon','尼龙吉他'],['acoustic_guitar_steel','钢弦吉他'],['orchestral_harp','竖琴'],['violin','小提琴'],['viola','中提琴'],['cello','大提琴'],['contrabass','低音提琴'],['flute','长笛'],['clarinet','单簧管'],['oboe','双簧管'],['bassoon','巴松'],['french_horn','圆号'],['trumpet','小号'],['trombone','长号'],['string_ensemble_1','弦乐合奏']];
const cachesByContext=new WeakMap();
const MIRRORS=globalThis.SOUND_FONT_MIRRORS||['https://cdn.jsdelivr.net/gh/super-tang/piano-soundfonts@main/instruments'];
async function fetchAudio(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(url,{signal:controller.signal,cache:'force-cache'});if(!response.ok)throw Error(String(response.status));return response.arrayBuffer();}finally{clearTimeout(timer);}}
const DRUM_ROOTS=[36,38,42,43,46,47,49,50,51];
export const rootFor=(midi,name)=>{if(name==='drums')return DRUM_ROOTS.reduce((best,root)=>Math.abs(root-midi)<Math.abs(best-midi)?root:best,DRUM_ROOTS[0]);const bounds=name==='contrabass'?[27,48]:[21,108];return Math.max(bounds[0],Math.min(bounds[1],21+Math.round((midi-21)/3)*3));};
export async function loadInstrument(context,name,notes,progress=()=>{}){
 if(name!=='drums'&&!INSTRUMENTS.some(x=>x[0]===name))throw Error('未知音源');
 let cache=cachesByContext.get(context);if(!cache){cache=new Map();cachesByContext.set(context,cache);}
 const roots=[...new Set(notes.map(n=>rootFor(n,name)))],result=new Map();let done=0;
 for(const root of roots){const key=name+':'+root;if(!cache.has(key))cache.set(key,(async()=>{const paths=[`/assets/instruments/${name}/${root}.mp3`,...MIRRORS.map(base=>`${base}/${name}/${root}.mp3`)];for(const url of paths){try{return await context.decodeAudioData(await fetchAudio(url));}catch{}}throw Error(`音源加载失败（${name} ${root}）：本机与公网镜像均不可用`);})().catch(e=>{cache.delete(key);throw e;}));result.set(root,await cache.get(key));progress(++done,roots.length);}
 return result;
}
