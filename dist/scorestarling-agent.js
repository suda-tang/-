// A server-side conversion survives closing this assistant panel.
export async function offerScoreStarling({query,log,line,action}){
 const call=async(path,body)=>{const r=await fetch('/api/scorestarling'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
 const status=await call('');
 if(!status.connected){const link=document.createElement('a');link.href='/scorestarling.html?title='+encodeURIComponent(query);link.target='_blank';link.rel='noopener';link.textContent='连接 SUPERTANG AI智能转谱，使用演奏链接转谱';log.append(link);return false;}
 line('正在寻找可转谱的钢琴演奏链接…');
 const r=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'search',kind:'recording',query}),signal:AbortSignal.timeout(30000)});const found=await r.json();if(!r.ok)throw Error(found.error);
 async function poll(id){let last='';for(let i=0;i<1000;i++){await new Promise(r=>setTimeout(r,2000));const state=await call('?id='+encodeURIComponent(id));if(state.detail!==last){last=state.detail;line(last);}if(state.status==='failed')return;if(state.status==='complete'){document.querySelector('.library-refresh')?.click();await action({type:'open',value:state.digest});await action({type:'play'});return;}if(state.status==='queued'&&state.credits!=null){const approve=document.createElement('button');approve.textContent=`使用 ${state.credits} 积分导出并导入`;approve.onclick=async()=>{approve.disabled=true;try{await call('/import',{id,consent:true,credits:state.credits});void poll(id);}catch(e){line(e.message);approve.disabled=false;}};log.append(approve);return;}}line('转谱仍在后台处理，可以到任务中心查看。');}
 async function start(item,button){if(button)button.disabled=true;try{const job=await call('/import',{url:item.url,title:query});line('已提交转谱，进度同步显示在任务中心。');void poll(job.id).catch(e=>line(e.message));}catch(e){line(e.message);if(button)button.disabled=false;}}
 if(found.results?.length===1){await start(found.results[0]);return true;}
 if(found.results?.length){line('找到多个演奏版本，请选择要转录的版本：');for(const item of found.results){const button=document.createElement('button');button.textContent=item.title;button.onclick=()=>start(item,button);log.append(button);}return true;}
 line(found.notice||'没有找到可靠的演奏链接。');const link=document.createElement('a');link.href='/scorestarling.html?title='+encodeURIComponent(query);link.target='_blank';link.rel='noopener';link.textContent='粘贴歌曲或视频链接转谱';log.append(link);return false;
}
