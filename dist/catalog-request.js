// Share a full-catalog read across refresh, polling and background hydration.
let pending=null,latest=null,saved=0;
export function fetchCatalog(){
 if(pending)return pending;
 if(latest&&Date.now()-saved<600)return Promise.resolve(latest);
 pending=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  let earlyTimer;
  try{
   const early=window.cloudLibraryRequest;window.cloudLibraryRequest=null;
   let data;
   // Startup prefetch may belong to an abandoned request. Do not let it hold
   // every subsequent catalog refresh indefinitely.
   if(early)try{data=await Promise.race([early,new Promise(resolve=>{earlyTimer=setTimeout(()=>resolve(null),1500);})]);}catch{}finally{clearTimeout(earlyTimer);}
   if(!Array.isArray(data?.scores)){
    const response=await fetch('/api/scores',{signal:controller.signal});
    if(!response.ok)throw Error('HTTP '+response.status);data=await response.json();
   }
   if(!Array.isArray(data?.scores))throw Error('云曲库列表格式不完整');
   latest=data;saved=Date.now();return data;
  }finally{clearTimeout(timer);clearTimeout(earlyTimer);pending=null;}
 })();
 return pending;
}
