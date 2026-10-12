// Consume the gateway as a stream so long lessons do not wait on one silent response.
export async function modelCompletion({url,key,model,messages,onProgress=()=>{},idleMs=180000,totalMs=900000}){
 const controller=new AbortController();let idle,total,received=0,answer='',finished=false,reason='';
 const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>{reason='连续 '+Math.round(idleMs/1000)+' 秒未收到模型数据';controller.abort()},idleMs)};
 total=setTimeout(()=>{reason='单次模型生成超过 '+Math.round(totalMs/60000)+' 分钟';controller.abort()},totalMs);arm();
 let reader;const heartbeat=setInterval(()=>onProgress({characters:received}),5000);
 try{
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model,messages,temperature:.25,max_tokens:10000,stream:true}),signal:controller.signal});arm();
  if(!response.ok){const error=Error('模型服务返回 HTTP '+response.status);error.status=response.status;throw error}
  if(!/text\/event-stream/i.test(response.headers.get('content-type')||'')){
   const data=await response.json();if(data.error)throw Error(data.error.message||String(data.error));answer=data.choices?.[0]?.message?.content||'';
  }else{
   reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',lastReport=0;
   const line=row=>{
    if(!row.startsWith('data:'))return;const value=row.slice(5).trim();if(!value)return;if(value==='[DONE]'){finished=true;return}
    const data=JSON.parse(value);if(data.error)throw Error(data.error.message||String(data.error));
    const choice=data.choices?.[0];if(choice?.delta?.content){answer+=choice.delta.content;received=answer.length;}
    if(choice?.finish_reason){if(choice.finish_reason==='length')throw Error('模型输出达到长度上限，课件尚不完整');finished=true}
   };
   while(!finished){const chunk=await reader.read();arm();buffer+=decoder.decode(chunk.value||new Uint8Array(),{stream:!chunk.done});const rows=buffer.split('\n');buffer=rows.pop();for(const row of rows)line(row.trimEnd());if(Date.now()-lastReport>1500){lastReport=Date.now();onProgress({characters:received})}if(chunk.done){if(buffer.trim())line(buffer.trim());break}}
   if(!finished)throw Error('模型连接在回复完成前关闭，已接收 '+answer.length+' 字');
  }
  if(!answer.trim())throw Error('模型未返回课件内容');return answer;
 }catch(error){
  if(reason)throw Error(reason);if(error.cause?.code){const detailed=Error('模型连接失败：'+error.cause.code+(error.cause.code==='ECONNREFUSED'?'（本机模型服务未监听）':error.cause.code==='UND_ERR_SOCKET'?'（模型服务提前关闭连接）':''));detailed.cause=error;throw detailed}throw error;
 }finally{clearInterval(heartbeat);clearTimeout(idle);clearTimeout(total);if(reader)try{await reader.cancel()}catch{}}
}
