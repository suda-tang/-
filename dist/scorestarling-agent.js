import {abortTimeout} from './abort-timeout.js';
import {offerOnlineMusic} from './online-music-agent.js?v=music-first2';
// A server-side conversion survives closing this assistant panel.
export async function offerScoreStarling(context){
 try{if(await offerOnlineMusic(context))return true;}catch(error){context.line('音乐搜索通道暂未完成：'+error.message);}
 context.line('正在尝试第二转谱通道…');
 if(context.signal?.aborted)return false;
 return offerConnector(context);
}
async function offerConnector({query,log,line,action,signal}){
 const unavailable=()=>false;
 const call=async(path,body)=>{const scope=abortTimeout(signal,25000);try{const r=await fetch('/api/scorestarling'+path,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:scope.signal});const data=await r.json();if(!r.ok)throw Error(data.error);return data;}finally{scope.dispose()}};
 let status;try{status=await call('');}catch(error){line('第二转谱连接器暂时无法连接，请稍后重试。');return unavailable();}
 if(!status.connected){line('第二转谱连接器尚未连接，请先连接授权。');return unavailable();} line('正在寻找可转谱的钢琴演奏链接…');
 let found;const searchScope=abortTimeout(signal,30000);try{const r=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'search',kind:'recording',query}),signal:searchScope.signal});found=await r.json();if(!r.ok)throw Error(found.error);}catch(error){line('演奏链接检索暂时不可用，请稍后重试。');return unavailable();}finally{searchScope.dispose()}
 async function poll(id){let last='';for(let i=0;i<1000;i++){await new Promise(r=>setTimeout(r,2000));let state;try{state=await call('?id='+encodeURIComponent(id));}catch(error){line('第二转谱连接器查询中断，原任务编号仍保留在任务中心。');line('可稍后重试音乐搜索通道。');return;}if(state.detail!==last){last=state.detail;line(last);}if(state.status==='failed'){if(/ReadTimeout|ConnectTimeout|ConnectionError|网络或服务异常|网络连接|超时/.test(state.detail||'')){line('第二转谱连接器暂时不可用，原任务保留在任务中心。');line('可稍后重试音乐搜索通道。');}return;}if(state.status==='complete'){document.querySelector('.library-refresh')?.click();await action({type:'open',value:state.digest});await action({type:'play'});return;}if(state.status==='queued'&&state.credits!=null){const approve=document.createElement('button');approve.textContent=`使用 ${state.credits} 积分导出并导入`;approve.onclick=async()=>{approve.disabled=true;try{await call('/import',{id,consent:true,credits:state.credits});void poll(id);}catch(e){line(e.message);approve.disabled=false;}};log.append(approve);return;}}line('转谱仍在后台处理，可以到任务中心查看。');}
 async function start(item,button){if(button)button.disabled=true;try{const job=await call('/import',{url:item.url,title:query});line('已提交转谱，进度同步显示在任务中心。');void poll(job.id).catch(e=>line(e.message));}catch(e){line(e.message);if(button)button.disabled=false;if(/Timeout|网络|连接|Load failed|Failed to fetch/i.test(e.message))line('可稍后重试音乐搜索通道。');}}
 if(found.results?.length===1){await start(found.results[0]);return true;}
 if(found.results?.length){line('找到多个演奏版本，请选择要转录的版本：');for(const item of found.results){const button=document.createElement('button');button.textContent=item.title;button.onclick=()=>start(item,button);log.append(button);}return true;}
 line(found.notice||'没有找到可靠的演奏链接，可以更换关键词重试。');return unavailable();}
