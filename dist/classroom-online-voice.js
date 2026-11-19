import {abortTimeout} from './abort-timeout.js';

// Public anonymous endpoint. No credentials, recordings or audio files are saved.
const pending=new Map(),clips=new Map();
let retryAt=0;
export async function onlineClassroomVoice(url){
 const query=new URL(url,location.href).searchParams,role=query.get('role'),locale=query.get('locale');
 if(!['classroom-teacher','student','narrator'].includes(role)||locale!=='zh'||Date.now()<retryAt)return null;
 const text=query.get('text')||'',key=role+':'+text;
 if(!text||text.length>500)return null;
 if(clips.has(key))return clips.get(key);
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const wait=abortTimeout(null,2500);
  try{
   // The anonymous API accepts at most 500 characters. Larger passages use
   // the existing streaming backend rather than burn several daily requests.
   const response=await fetch('https://v1.apizero.cn/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,voice_type:role==='classroom-teacher'?'female_zhubo':'male_zhubo'}),signal:wait.signal});
   const result=await response.json();
   if(!response.ok||result.code!==0||!result.data?.audio){retryAt=Date.now()+(/4030|4029/.test(String(result.code))?15*60*1000:60000);return null;}
   const binary=atob(result.data.audio),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   if(bytes.length<1000)throw Error('Empty speech');
   const audioUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/mpeg'}));
   const value={status:'complete',streaming:false,url:audioUrl,provider:'apizero-browser',voice:role==='classroom-teacher'?'女声':'男声'};
   clips.set(key,value);
   if(clips.size>12){const oldest=clips.keys().next().value;URL.revokeObjectURL(clips.get(oldest).url);clips.delete(oldest);}
   // A small session-only replay window avoids duplicate prefetch requests.
   setTimeout(()=>{if(clips.get(key)===value){clips.delete(key);URL.revokeObjectURL(audioUrl)}},10*60*1000);
   return value;
  }catch{retryAt=Date.now()+60000;return null;}
  finally{wait.dispose();pending.delete(key);}
 })();pending.set(key,job);return job;
}
