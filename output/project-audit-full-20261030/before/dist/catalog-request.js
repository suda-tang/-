// Share a full-catalog read across refresh, polling and background hydration.
let pending=null,latest=null,saved=0;
export function fetchCatalog(){
 if(pending)return pending;
 if(latest&&Date.now()-saved<600)return Promise.resolve(latest);
 pending=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{
   const early=window.cloudLibraryRequest;window.cloudLibraryRequest=null;
   let data;
   if(early)try{data=await early;}catch{}
   if(!data){const response=await fetch('/api/scores',{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);data=await response.json();}
   if(!Array.isArray(data.scores))throw Error('云曲库列表格式不完整');
   latest=data;saved=Date.now();return data;
  }finally{clearTimeout(timer);pending=null;}
 })();
 return pending;
}
