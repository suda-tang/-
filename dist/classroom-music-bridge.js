// Sandboxed activities control only the current score through this validated bridge.
export function attachActivityMusic(iframe,channel,host){
 const snapshot=()=>{const score=host.score(),player=host.player();return {scoreId:score?.serverId,title:score?.title,playing:!!player?.playing,beat:Number(player?.beat)||0,bpm:Number(player?.bpm)||80,totalBeats:Number(player?.totalBeats)||0,parts:(score?.parts||score?.midiParts||[]).map(p=>({id:String(p.value??p.id),name:p.label||p.name||p.title||String(p.value??p.id),enabled:!player?.disabledParts?.has(String(p.value??p.id)),volume:player?.partVolumes?.get(String(p.value??p.id))??1}))}};
 let busy=false,timer;
 const send=()=>{if(iframe.isConnected)iframe.contentWindow?.postMessage({type:'classroom-music-state',channel,state:snapshot()},'*')};
 const receive=async event=>{
  if(event.source!==iframe.contentWindow||event.data?.channel!==channel||event.data.type!=='classroom-music-request')return;
  const {requestId,action}=event.data;let result,error;
  try{
   if(!iframe.isConnected||!host.current())throw Error('课堂与当前作品已不一致，请返回当前作品的课堂');
   if(busy)throw Error('上一项播放操作尚未完成');busy=true;
   const parts=snapshot().parts,ids=parts.map(p=>p.id),requirePart=id=>{if(!ids.includes(String(id)))throw Error('当前作品没有这个独立音轨，请在下方选择实际声部');return String(id)};
   switch(action?.type){
    case 'state':break;
    case 'play':await host.call('ai-play-score',{},60000);break;
    case 'pause':if(host.player()?.playing)await host.call('ai-transport',{command:'pause'});break;
    case 'stop':await host.call('ai-transport',{command:'stop'});break;
    case 'seek':{const measure=Number(action.measure);if(!Number.isInteger(measure)||measure<1)throw Error('请输入有效小节');await host.call('ai-seek-measure',{measure});break;}
    case 'tempo':{const value=Number(action.value);if(!Number.isFinite(value)||value<30||value>240)throw Error('速度范围为30至240');await host.call('ai-set-tempo',{value});break;}
    case 'solo':{const selected=(action.ids||[action.part]).map(requirePart);if(!selected.length)throw Error('请先选择声部');await host.call('ai-solo-group',{ids:selected});break;}
    case 'mix':if(ids.length)await host.call('ai-solo-group',{ids});break;
    case 'mute':{const part=requirePart(action.part),enabled=parts.filter(p=>p.id===part?!action.muted:p.enabled).map(p=>p.id);if(!enabled.length)throw Error('请至少保留一个声部，或使用暂停');await host.call('ai-solo-group',{ids:enabled});break;}
    case 'volume':{const part=requirePart(action.part),value=Number(action.value);if(!Number.isFinite(value)||value<0||value>1)throw Error('音量范围为0至1');await host.call('ai-part-volume',{value:{part,value}});break;}
    default:throw Error('这个操作尚未绑定工作区，请使用活动内的音轨控制');
   }
   if(!host.current())throw Error('作品已切换，旧课堂操作已停止');result=snapshot();
  }catch(e){error=e.message}finally{busy=false;iframe.contentWindow?.postMessage({type:'classroom-music-result',channel,requestId,result,error},'*');send()}
 };
 window.addEventListener('message',receive);
 iframe.addEventListener('load',()=>{send();clearInterval(timer);timer=setInterval(()=>{if(!iframe.isConnected){clearInterval(timer);window.removeEventListener('message',receive);return}if(iframe.getBoundingClientRect().height)send()},350)});
}
export function activityMusicScript(channel){
 return '<script>('+activityClient.toString()+')('+JSON.stringify(channel)+')<\/script>';
}
function activityClient(channel){
 const requests=new Map();let sequence=0,state={parts:[]};
 const command=action=>new Promise((resolve,reject)=>{const requestId=++sequence,timer=setTimeout(()=>{requests.delete(requestId);reject(Error('工作区未响应，请确认曲谱已载入'))},65000);requests.set(requestId,{resolve,reject,timer});parent.postMessage({type:'classroom-music-request',channel,requestId,action},'*')});
 window.maic.music={command,play:()=>command({type:'play'}),pause:()=>command({type:'pause'}),stop:()=>command({type:'stop'}),seek:measure=>command({type:'seek',measure}),solo:ids=>command({type:'solo',ids:Array.isArray(ids)?ids:[ids]}),mix:()=>command({type:'mix'}),volume:(part,value)=>command({type:'volume',part,value}),mute:(part,muted=true)=>command({type:'mute',part,muted}),tempo:value=>command({type:'tempo',value}),getState:()=>state};
 let bar,tracks,output,play,signature='';const bindings=[];
 function render(){if(!bar)return;for(const {select}of bindings){const key=JSON.stringify(state.parts.map(p=>p.id));if(select.dataset.key!==key){const prior=select.value;select.replaceChildren(new Option('选择工作区音轨',''),...state.parts.map(p=>new Option(p.name,p.id)));select.value=prior;select.dataset.key=key;}}play.textContent=state.playing?'暂停':'播放';output.textContent=(state.title||'当前作品')+'　'+state.bpm+' BPM';const next=JSON.stringify(state.parts.map(p=>[p.id,p.name]));if(next!==signature){signature=next;tracks.replaceChildren();for(const part of state.parts){const row=document.createElement('div'),name=document.createElement('span'),solo=document.createElement('button'),mute=document.createElement('button'),volume=document.createElement('input');name.textContent=part.name;solo.textContent='独奏';mute.textContent='静音';volume.type='range';volume.min=0;volume.max=1;volume.step=.01;volume.setAttribute('aria-label',part.name+'音量');row.dataset.part=part.id;row.append(name,solo,mute,volume);solo.onclick=()=>run({type:'solo',part:part.id});mute.onclick=()=>run({type:'mute',part:part.id,muted:!!state.parts.find(p=>p.id===part.id)?.enabled});volume.onchange=()=>run({type:'volume',part:part.id,value:Number(volume.value)});tracks.append(row)}}for(const row of tracks.children){const part=state.parts.find(p=>p.id===row.dataset.part);row.querySelector('input').value=part.volume;row.querySelectorAll('button')[1].setAttribute('aria-pressed',String(!part.enabled))}}
 async function run(action){try{await command(action);output.removeAttribute('role')}catch(e){output.textContent=e.message;output.setAttribute('role','alert')}}
 addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!==channel)return;const d=e.data;if(d.type==='classroom-music-state'){state=d.state;render();dispatchEvent(new CustomEvent('maic-music-state',{detail:state}))}if(d.type==='classroom-music-result'){const p=requests.get(d.requestId);if(p){clearTimeout(p.timer);requests.delete(d.requestId);d.error?p.reject(Error(d.error)):p.resolve(d.result)}}});
 document.addEventListener('DOMContentLoaded',()=>{
  const style=document.createElement('style');style.textContent='.maic-music{margin:18px 12px;padding:16px;border:1px solid #87435730;border-radius:18px;background:#f7f2f5;color:#493746;font:14px/1.5 system-ui}.maic-music button{font:inherit;border:1px solid #87435730;border-radius:12px;background:#ffffffb0;color:#874357;padding:8px 12px;cursor:pointer}.maic-music button[aria-pressed=true]{background:#874357;color:white}.maic-music header{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.maic-music output{display:block;margin:10px 0}.maic-music-tracks>div{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:10px 0;border-top:1px solid #87435715}.maic-music input{grid-column:1/-1;width:100%;accent-color:#874357}';document.head.append(style);
  bar=document.createElement('section');bar.className='maic-music';const header=document.createElement('header');play=document.createElement('button');play.textContent='播放';play.onclick=()=>run({type:state.playing?'pause':'play'});header.append(play);for(const [label,type]of[['停止','stop'],['全部声部','mix']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>run({type});header.append(b)}output=document.createElement('output');tracks=document.createElement('div');tracks.className='maic-music-tracks';bar.append(header,output,tracks);document.body.append(bar);for(const input of document.querySelectorAll('input[type=range]')){if(bar.contains(input)||!/melody|accomp|volume|gain|balance|音量|旋律|伴奏/i.test([input.id,input.name,input.getAttribute('aria-label'),input.closest('label')?.textContent].join(' ')))continue;const select=document.createElement('select');select.setAttribute('aria-label','绑定此滑块的音轨');select.style.cssText='display:block;max-width:100%;margin:8px 0;padding:8px;border-radius:10px;border:1px solid #87435740;font:14px system-ui;color:#874357';input.after(select);bindings.push({input,select});let pending;input.addEventListener('input',()=>{clearTimeout(pending);pending=setTimeout(()=>{if(!select.value){output.textContent='请在这个滑块下方选择它要控制的音轨';return}const min=Number(input.min)||0,max=Number(input.max)||100;run({type:'volume',part:select.value,value:Math.max(0,Math.min(1,(Number(input.value)-min)/(max-min||1)))})},90)});select.onchange=()=>input.dispatchEvent(new Event('input'));}render();command({type:'state'}).catch(()=>{});
  // Legacy generated play buttons previously animated a pretend player only.
  document.addEventListener('click',event=>{const target=event.target.closest('button');if(!target||bar.contains(target)||target.dataset.maicCommand)return;const label=target.textContent.trim();if(/^(?:[▶⏸⏯▸►\s]*)(?:播放|暂停|试听|聆听|听一听|开始聆听)/.test(label)&&!/(?:PPT|课件|讲解|朗读|视频)/i.test(label)){event.preventDefault();event.stopImmediatePropagation();(async()=>{try{const range=label.match(/第?\s*(\d+)\s*(?:[—–~～至到-]\s*(\d+))?\s*小节/);if(range)await command({type:'seek',measure:Number(range[1])});await command({type:/暂停/.test(label)?'pause':'play'});}catch(error){output.textContent=error.message;output.setAttribute('role','alert')}})()}},true);
 });
}
