import {abortTimeout} from './abort-timeout.js';
import {onlineClassroomVoice} from './classroom-online-voice.js';

export function classroomNetworkError(error,signal){
 if(signal?.aborted||/AbortError|TimeoutError/.test(error?.name)||/fetch is aborted/i.test(error?.message||''))return '课堂请求长时间没有收到响应。已有课程和讲解位置已保留，后台生成不会因此停止。';
 if(/load failed|failed to fetch|network|connection/i.test(error?.message||''))return '课堂连接暂时中断。已有课程和讲解位置已保留，请连接恢复后继续。';
 return error?.message||'课堂请求未完成';
}

export async function classroomRequest(url,body,{timeout=60000}={}){
 if(!body&&url.startsWith('/api/tour-voice?')){const online=await onlineClassroomVoice(url);if(online)return online;}
 // Retry reads only. Replaying a create/edit request could duplicate work.
 for(let attempt=0;attempt<(body?1:2);attempt++){
  const wait=abortTimeout(null,timeout);
  try{
   const response=await fetch(url,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:wait.signal});
   let data;
   try{data=await response.json();}catch{
    const error=Error(response.ok?'课堂服务返回了无法读取的数据':`课堂服务暂不可用（HTTP ${response.status}）`);
    error.http=!response.ok;error.retryable=[408,429,502,503,504].includes(response.status);throw error;
   }
   if(!response.ok||data?.error){const error=Error(data?.error||`课堂服务暂不可用（HTTP ${response.status}）`);error.http=true;error.retryable=[408,429,502,503,504].includes(response.status);throw error;}
   if(!data||typeof data!=='object')throw Error('课堂服务返回了空结果，请重试。');
   return data;
  }catch(error){
   if(!body&&(!error.http||error.retryable)&&attempt===0)continue;
   throw Error(classroomNetworkError(error,wait.signal));
  }finally{wait.dispose();}
 }
}
