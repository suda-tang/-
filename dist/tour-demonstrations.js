import {liveScore,livePlayer} from './capability-host.js';
import {rangeOf} from './ai-advanced-actions.js';

const stopped=()=>new DOMException('演示已停止','AbortError');
function call(name,detail,signal,timeout=20000){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(value)};
  const cancel=()=>{if(name==='ai-tour-request')document.dispatchEvent(new Event('ai-tour-cancel'));finish(reject,stopped())};
  const timer=setTimeout(()=>finish(reject,Error('这项演示尚未收到工作区结果，请查看任务中心')),timeout);
  if(signal?.aborted){cancel();return}signal?.addEventListener('abort',cancel,{once:true});
  document.dispatchEvent(new CustomEvent(name,{detail:{...detail,resolve:value=>finish(resolve,value),reject:error=>finish(reject,error)}}));
 });
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function context(){const score=liveScore();if(!score)throw Error('请先选择一首已就绪的作品，再演示这一项');
 const measures=[...new Set(score.events.map(e=>Number(e.measure)).filter(n=>Number.isFinite(n)&&n>=1))].sort((a,b)=>a-b);
 const parts=score.parts||score.midiParts||[];
 const options=[...document.querySelectorAll('#part-solo-select option')].filter(o=>o.value!=='all');
 const part=options.find(o=>/钢琴|piano|弦|violin|string/i.test(o.textContent))||options[0];
 return {score,measures,parts,part,from:measures[0]||1,to:measures[Math.min(3,measures.length-1)]||1};
}
export async function runTourDemo(key,{signal,onProgress=()=>{},holdResults=false}={}){
 if(key==='library-categories'){
  onProgress('正在打开已保存的曲库分类');
  const panel=document.querySelector('.score-library');
  if(!panel?.tourOpenCategories)throw Error('曲库尚未准备好');
  const browser=await panel.tourOpenCategories();
  if(signal?.aborted)throw stopped();
  const stack=browser.querySelector('.library-category-stack:not([hidden]) .card-stack-toggle');
  if(!stack)throw Error('分类尚未生成，当前分类进度保留在曲库顶部');
  stack.scrollIntoView({block:'center',behavior:'smooth'});
  if(stack.getAttribute('aria-expanded')!=='true')await stack.onclick();
  return '已打开实际分类目录，并展开发牌显示“'+stack.querySelector('span').textContent+'”中的作品。可以继续展开其他分类查看。';
 }
 if(key==='classroom-configure'||key==='classroom-status'){
  context();onProgress('正在打开当前作品的曲谱课堂');
  await call('ai-classroom-command',{value:{operation:'open'}},signal,30000);
  if(key==='classroom-configure'){
   await call('ai-classroom-command',{value:{operation:'configure',settings:{mode:'classroom',schoolStage:'senior',scope:'whole',duration:40,goal:'从高中音乐鉴赏课堂出发，结合当前作品安排聆听比较、学生讨论与有音乐证据的作答，不按钢琴个别课组织。'}}},signal,30000);
   return '已把当前作品及全曲范围放入课堂备课设置。可继续调整学段、补充材料并生成课堂；此步骤没有假装已经生成整节课。';
  }
  const result=await call('ai-classroom-command',{value:{operation:'status'}},signal,30000);
  return {reply:result.receipt||result.message||'已读取当前作品课堂状态',execution:JSON.stringify(result),links:[]};
 }
 const ctx=context(),{score,part,from,to}=ctx;
 const view=async mode=>{onProgress('正在切换到'+({pdf:'原稿',simple:'简谱',engraved:'五线谱',daw:'音轨'}[mode]));await call('ai-set-view',{mode},signal)};
 if(key==='view-pdf'){if(document.querySelector('#original-button')?.disabled)return '这首作品没有原始 PDF，保留当前电子谱；其他章节仍可演示。';await view('pdf');return '已打开当前作品的原稿。';}
 if(key==='view-daw'){await view('daw');return '已打开当前作品的真实音轨。';}
 if(key==='views'){for(const mode of ['simple','daw','engraved']){if(signal?.aborted)throw stopped();await view(mode);await wait(1100);}return '已依次展示简谱、音轨和五线谱，共用同一首作品。';}
 if(key==='mix-restore'){onProgress('正在恢复各声部');await call('ai-solo-group',{ids:[...document.querySelectorAll('#part-solo-select option')].map(o=>o.value).filter(v=>v!=='all')},signal);await call('ai-seek-measure',{measure:from},signal);await call('ai-play-score',{},signal,60000);await stopAfterExcerpt(signal);return '已恢复声部并试听原来的小节。';}
 const title=score.title||document.querySelector('#score-title')?.textContent||'当前作品';
 const prompts={
  'ai-find':`请先在本地云曲库查找《${title}》，列出匹配版本。不要联网，不要自动换曲或播放。`,
  'ai-view':'继续使用当前打开的这首作品，把谱面切换成简谱。请实际执行，不要只介绍操作方法。',
  'ai-web':`请联网查找《${title}》的可下载曲谱候选，列出来源让我选择。这里只检索，不要下载、导入或生成。`,
  'ai-solo':`仍然使用当前打开的《${title}》，只听${part?.textContent||'当前作品的第一声部'}，从第${from}小节开始播放。请实际独奏对应的已有音轨，不要换曲。`,
  'ai-range':`刚才这首先暂停。请只播放第${from}到第${to}小节，速度设为${Math.max(40,Math.round((score.tempo||80)*.8))} BPM，再开始播放，不要换曲。`,
  'ai-mix':`当前作品不变，把${part?.textContent||'第一声部'}的音量设为40%，从第${from}小节播放，实际调整音轨增益，不要换曲。`,
  'ai-tempo':`使用当前作品，先暂停，再设为${Math.max(40,Math.round((score.tempo||80)*.75))} BPM，只播放第${from}到第${to}小节，不改变音高，请实际执行。`,
  'ai-chords':`请分析当前打开的《${title}》的和弦，调用乐谱分析操作，列出小节和候选结果。不要换曲、不要播放，也不要只凭歌名推测。`,
  'ai-structure':`请依据当前打开的《${title}》谱面分析曲式结构，说明各段小节及重复、终止或织体证据，不确定的地方标为候选。不要换曲或播放。`,
  'ai-practice':`请根据当前打开的《${title}》制定分段练习建议，范围只使用当前谱面实际存在的小节。把建议送到跟弹练习供我核对，不要开启麦克风，也不要自动开始练习。`
 };
 const text=prompts[key];if(!text)throw Error('尚未配置这一项演示');
 onProgress('正在把演示要求交给工作区 AI：'+text);
 const result=await call('ai-tour-request',{text,holdResults,policy:key==='ai-find'?{localOnly:true,localQuery:title}:{}},signal,holdResults?1800000:220000);
 if(!result?.ok)throw Error(result?.detail||'这次 AI 操作未完成，请查看实际对话与任务结果');
 const expected={'ai-find':['search','choose_scores'],'ai-view':['view'],'ai-mix':['set_part_volume'],'ai-tempo':['set_tempo'],'ai-chords':['chords'],'ai-practice':['practice_plan']};
 if(expected[key]&&!result.actions?.some(a=>expected[key].includes(a.type)))throw Error('AI 已回复，但没有执行这项要求。实际回复：'+(result.reply||''));
 if(key==='ai-view'&&!document.querySelector('#simple-button')?.classList.contains('active'))throw Error('AI 已回复，但谱面还没有切到简谱');
 if(['ai-solo','ai-range','ai-mix','ai-tempo'].includes(key))await stopAfterExcerpt(signal);
 return {reply:result.reply||'',execution:result.result||'',links:result.links||[]};
}
async function stopAfterExcerpt(signal){
 const player=livePlayer();if(!player?.playing)throw Error('AI 已回复，但播放器尚未启动，请查看执行结果');
 const start=player.context?.currentTime??0,wall=performance.now();
 try{while(player.playing&&(player.context?.currentTime??start)-start<8&&performance.now()-wall<12000){if(signal?.aborted)throw stopped();await wait(100);}}
 finally{if(livePlayer()===player){await call('ai-transport',{command:'pause'},null);player.clearLoop?.();}}
}
