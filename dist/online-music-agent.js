// Use the library's server-owned search/transcription channel in AI dialogue.
import {abortTimeout} from './abort-timeout.js';
async function call(body,signal=null){const scope=abortTimeout(signal,35000);try{const r=await fetch('/api/online-music',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:scope.signal});const d=await r.json();if(!r.ok)throw Error(d.error);return d}finally{scope.dispose()}}
export async function offerOnlineMusic({query,log,line,action,signal}){
 line('正在通过音乐搜索通道查找《'+query+'》的音频版本…');
 const data=await call({action:'search',query},signal);
 if(!data.results?.length){line('音乐源没有找到可下载版本，可以换用歌名加歌手再搜索。');return false}
 const section=document.createElement('section');section.className='ai-search-card';
 const title=document.createElement('strong');title.textContent='音乐搜索与转谱';
 const recording=document.createElement('select');recording.setAttribute('aria-label','音频内容');
 for(const [value,label]of [['','完整歌曲／多件乐器'],['piano','钢琴独奏'],['voice','人声清唱']]){const option=document.createElement('option');option.value=value;option.textContent=label;recording.append(option)}
 section.append(title,recording);log.append(section);line('找到这些版本，请选择要转谱的一首：');
 for(const item of data.results.slice(0,8)){
  const button=document.createElement('button');button.type='button';button.textContent=item.title+(item.artist?' — '+item.artist:'');section.append(button);
  button.onclick=async()=>{
   for(const b of section.querySelectorAll('button'))b.disabled=true;
   try{let job=await call({action:'start',itemId:item.id,mode:'piano.full',recording:recording.value});line('音乐搜索通道已接手，进度同步到任务中心。');
    let last='';for(let i=0;i<900;i++){
     const text=job.detail+' '+Math.round(job.progress||0)+'%';if(text!==last){line(text);last=text}button.textContent=text;
     if(job.status==='failed')throw Error(job.detail);
     if(job.status==='complete'){document.querySelector('.library-refresh')?.click();await action({type:'open',value:job.scoreId});await action({type:'play'});button.textContent='已导入并播放';return}
     await new Promise(resolve=>setTimeout(resolve,2500));job=await call({action:'status',id:job.id});
    }line('转谱仍在后台处理，可以到任务中心查看。');
   }catch(error){line('转谱：'+error.message);for(const b of section.querySelectorAll('button'))b.disabled=false;button.textContent=item.title+' — 重试'}
  };
 }
 return true;
}
