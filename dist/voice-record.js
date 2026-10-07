import {requireUploadAccess} from './upload-auth.js';
import {initMentorVoice} from './mentor-voice.js';
const $=s=>document.querySelector(s);
await requireUploadAccess();
initMentorVoice();
let prompts=[],index=0,recorder,stream,context,raf,ticker,started=0,duration=0,blob,url,busy=false,recording=false,saved=false,records=[];
const message=t=>$('#message').textContent=t;
function controls(){ $('#record').disabled=busy||!prompts.length;$('#save').disabled=busy||!blob||saved;$('#record').hidden=recording;$('#stop').hidden=!recording;document.body.classList.toggle('recording',recording);document.querySelectorAll('nav button').forEach(b=>b.disabled=busy); }
function dispose(){clearInterval(ticker);cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());stream=null;if(context){context.close().catch(()=>{});context=null;}$('#meter').style.transform='scaleX(0)';}
function select(i){if(busy)return;if(blob&&!saved&&!confirm('这一段还没有保存，切换会放弃它。继续吗？'))return;index=i;blob=null;saved=false;if(url)URL.revokeObjectURL(url);$('#preview').pause();$('#preview').removeAttribute('src');$('#preview').hidden=true;$('#download').hidden=true;$('#next').hidden=true;$('#upload').hidden=true;$('#clock').textContent='00:00';$('#level').textContent='准备好后开始';$('#label').textContent=`第 ${i+1} 段 / ${prompts.length} 段`;$('#title').textContent=prompts[i].title;$('#script').textContent=prompts[i].text;document.querySelectorAll('nav button').forEach((b,j)=>b.setAttribute('aria-current',String(i===j)));message('按自己的语气完整读一遍，读完按“结束录音”。');controls();}
async function playPersonalTrial(item,button,variant=''){button.disabled=true;try{const r=await fetch(`/api/voice-reference/self/${item.id}/trial${variant?'?variant=cosy':''}`);if(!r.ok){const d=await r.json();throw Error(d.error||'试听不可用。');}const a=new Audio(URL.createObjectURL(await r.blob()));a.onended=()=>URL.revokeObjectURL(a.src);await a.play();message(variant==='cosy'?'正在播放 CosyVoice 对照试听。':'正在播放唐秋鸣个人旁白试听。');}catch(e){message(e.message||'试听暂时无法播放。');}finally{button.disabled=false;}}
async function refresh(){const r=await fetch('/api/voice-reference');const data=await r.json();if(!r.ok)throw Error(data.error||'暂时无法连接，请稍后重试。');records=data.recordings;$('#saved').replaceChildren();for(const p of prompts){const matched=records.filter(r=>r.promptId===p.id),n=matched.length;const li=document.createElement('li');li.textContent=p.title+(n?`：已保存 ${n} 次`:'：待录制');const trial=matched.find(r=>r.trialReady);if(trial){const b=document.createElement('button');b.type='button';b.className='personal-trial';b.textContent='播放个人试听';b.onclick=()=>playPersonalTrial(trial,b);li.append(b);}const cosy=matched.find(r=>r.cosyTrialReady);if(cosy){const b=document.createElement('button');b.type='button';b.className='personal-trial';b.textContent='CosyVoice 对照';b.onclick=()=>playPersonalTrial(cosy,b,'cosy');li.append(b);}$('#saved').append(li);}}
$('#record').onclick=async()=>{
 if(blob&&!saved&&!confirm('重新录制会替换未保存的这一段，继续吗？'))return;
 if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){message('麦克风需要安全连接。请使用 HTTPS 专属链接，或在本机 localhost 打开。');return;}
 if(!window.MediaRecorder){message('此浏览器不支持网页录音，请使用新版 Safari、Edge 或 Chrome。');return;}
 busy=true;controls();$('#preview').pause();message('请允许使用麦克风…');
 try{
 stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
 const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('此浏览器没有支持的录音格式，请换用 Safari、Edge 或 Chrome。');
 const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:128000});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 recorder.onerror=()=>{recording=false;busy=false;dispose();message('麦克风录制中断，请重新录制。');controls();};
 recorder.onstop=()=>{
 duration=(performance.now()-started)/1000;dispose();recording=false;busy=false;saved=false;
 blob=new Blob(chunks,{type:recorder.mimeType});if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);$('#preview').src=url;$('#preview').hidden=false;$('#download').href=url;$('#download').download=`唐秋鸣-${prompts[index].id}.${blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm'}`;$('#download').hidden=false;
 if(duration<8){blob=null;message('录音不足8秒，请完整读完这一段后重试。');}else message('先试听，确认没有漏字、杂音和其他人的声音，再保存。');$('#level').textContent='录制结束';controls();
 };
 recorder.start(500);started=performance.now();recording=true;saved=false;$('#next').hidden=true;$('#upload').hidden=true;$('#preview').hidden=true;$('#download').hidden=true;controls();message('正在录音。自然地讲，不必赶时间。');
 ticker=setInterval(()=>{const s=Math.floor((performance.now()-started)/1000);$('#clock').textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;if(s>=90&&recorder.state==='recording')recorder.stop();},200);
 try{context=new (window.AudioContext||window.webkitAudioContext)();await context.resume();if(!recording)return;const analyser=context.createAnalyser();analyser.fftSize=1024;context.createMediaStreamSource(stream).connect(analyser);const values=new Float32Array(analyser.fftSize);const draw=()=>{if(!recording)return;analyser.getFloatTimeDomainData(values);let sum=0,peak=0;for(const v of values){sum+=v*v;peak=Math.max(peak,Math.abs(v));}const rms=Math.sqrt(sum/values.length);$('#meter').style.transform=`scaleX(${Math.min(1,rms*8)})`;$('#level').textContent=peak>.98?'声音过大，请稍微离远一点':rms<.006?'等待声音…':'正在收音';raf=requestAnimationFrame(draw);};draw();}catch{ $('#level').textContent='正在录音';}
 }catch(e){dispose();busy=false;recording=false;message(e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器地址栏允许后重试。':e.name==='NotFoundError'?'没有找到麦克风，请连接设备后重试。':e.message);controls();}
};
$('#stop').onclick=()=>{if(recorder?.state==='recording')recorder.stop();};
$('#save').onclick=()=>{
 if(!blob||busy)return;busy=true;controls();$('#upload').hidden=false;$('#progress').value=0;$('#percent').textContent='0%';message('正在保存到你的录音空间…');
 const xhr=new XMLHttpRequest();xhr.open('POST','/api/voice-reference');xhr.timeout=120000;xhr.setRequestHeader('Content-Type',blob.type);xhr.setRequestHeader('X-Voice-Prompt',prompts[index].id);xhr.setRequestHeader('X-Voice-Duration',String(duration));
 xhr.upload.onprogress=e=>{if(e.lengthComputable){const n=Math.round(e.loaded/e.total*100);$('#progress').value=n;$('#percent').textContent=n===100?'服务端确认中':`${n}%`;}};
 xhr.onload=async()=>{busy=false;let data;try{data=JSON.parse(xhr.responseText);}catch{}if(xhr.status===201){saved=true;$('#percent').textContent='已保存';message(index===prompts.length-1?'四段读完后即可结束。录音已保存，接下来进行音色生成与试听。':'这一段已保存。可以继续录下一段。');$('#next').hidden=index===prompts.length-1;try{await refresh();}catch{message('录音已保存；列表暂时更新失败，稍后刷新即可。');}}else message(data?.error||'保存失败，录音仍在本页，可以重试或下载备份。');controls();};
 xhr.onerror=xhr.ontimeout=()=>{busy=false;message('连接中断，录音仍在本页。可以重新保存或先下载备份。');controls();};xhr.send(blob);
};
$('#next').onclick=()=>select(index+1);
addEventListener('beforeunload',e=>{if(recording||busy||(blob&&!saved)){e.preventDefault();e.returnValue='';}});
addEventListener('pagehide',()=>{if(recorder?.state==='recording')recorder.stop();dispose();});
try{const response=await fetch('/voice-prompts.json');if(!response.ok)throw Error('朗读稿加载失败，请刷新。');prompts=await response.json();prompts.forEach((p,i)=>{const b=document.createElement('button');b.textContent=`${i+1}`;b.setAttribute('aria-label',p.title);b.onclick=()=>select(i);$('#segments').append(b);});select(0);await refresh();}catch(e){message(e.message);}controls();
