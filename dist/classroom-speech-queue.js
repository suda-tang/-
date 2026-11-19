// Prepare the next utterance during music, without playing or advancing cues.
export function speechQueue(request){
 const jobs=new Map();let generation=0;
 const cancelled=()=>new DOMException('讲解准备已取消','AbortError');
 function prepare(url){
  if(jobs.has(url))return jobs.get(url);
  const version=generation;let retired=false,rejectCancellation;
  const cancellation=new Promise((resolve,reject)=>{rejectCancellation=reject;});
  const valid=()=>version===generation&&!retired;
  const job=(async()=>{
   for(let attempt=0;attempt<150;attempt++){
    if(!valid())throw cancelled();
    const result=await Promise.race([request(url),cancellation]);
    if(!valid())throw cancelled();
    if(result.status==='failed')throw Error(result.message||'讲解合成未完成');
    if(result.status==='complete'&&result.url){
     const audio=result.streaming?null:new Audio();if(audio){audio.preload='auto';audio.src=result.url;audio.load?.();}
     return {...result,preloadedAudio:audio};
    }
    await new Promise(resolve=>setTimeout(resolve,300));
   }
   throw Error('下一段讲解仍在生成');
  })();
  jobs.set(url,job);
  job.retire=()=>{if(retired)return;retired=true;rejectCancellation(cancelled());clearTimeout(expiry);job.then(result=>{const audio=result.preloadedAudio;if(audio){audio.pause();audio.removeAttribute('src');audio.load?.();}},()=>{});};
  const expiry=setTimeout(()=>{if(jobs.get(url)===job){jobs.delete(url);job.retire();}},120000);
  job.catch(()=>{clearTimeout(expiry);if(jobs.get(url)===job)jobs.delete(url)});
  if(jobs.size>4){const key=jobs.keys().next().value,old=jobs.get(key);jobs.delete(key);old.retire();}
  return job;
 }
 return {prepare,clear:()=>{generation++;for(const job of jobs.values())job.retire();jobs.clear();}};
}
