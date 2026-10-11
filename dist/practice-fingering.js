import {reportTask} from './task-center.js?v=folded-groups1';

function context(){let value;document.dispatchEvent(new CustomEvent('practice-command',{detail:{action:'fingering-context',resolve:x=>value=x}}));return value;}
export function fingeringNotes(score,part,mode='staff'){
 const all=[];const selected=score.events.flatMap(e=>e.notes).filter(n=>!n.percussion&&(n.part||'__unassigned')===part),twoStaves=selected.some(n=>Number(n.staff)>1);
 score.events.forEach((event,i)=>event.notes.forEach((note,j)=>{if(note.percussion||(note.part||'__unassigned')!==part)return;const hand=mode==='left'?'left':mode==='right'?'right':twoStaves?(Number(note.staff)>1?'left':'right'):Number(note.midi)<60?'left':'right';all.push({id:`${i}:${j}`,midi:Number(note.midi),beat:Number(event.beat),duration:Number(note.duration),measure:Number(event.measure),hand,finger:[1,2,3,4,5].includes(note.fingering)?note.fingering:0});}));
 return all;
}

export function mountPracticeFingering(host){
 const box=document.createElement('div');box.className='practice-fingering';box.innerHTML=`<div class="fingering-actions"><button type="button" class="small-button" data-finger-generate>标注钢琴指法</button><label><input type="checkbox" data-finger-visible checked>显示指法</label><button type="button" class="text-button" data-finger-export disabled>导出指法</button></div><details><summary>指法设置</summary><label>手型<select data-finger-size><option value="S">偏小</option><option value="M" selected>适中</option><option value="L">偏大</option></select></label><label>分手<select data-finger-hand><option value="staff">按谱表（单谱表按中央 C 分手）</option><option value="right">全部右手</option><option value="left">全部左手</option></select></label></details><div class="fingering-progress" hidden><progress max="100" value="0"></progress><span role="status"></span></div><p class="fingering-message" role="status"></p><div class="fingering-editor" hidden></div>`;
 host.append(box);const $=q=>box.querySelector(q);let current='',notes=[],fingers={},job=null,busy=false,revision=0,paintFrame=0;
 const manual=new Set();
 const key=()=>`practice-fingers-v1:${current}`;
 function remember(){try{localStorage.setItem(key(),JSON.stringify({fingers,manual:[...manual],size:$('[data-finger-size]').value,hand:$('[data-finger-hand]').value}));}catch{}}
 function paint(){cancelAnimationFrame(paintFrame);paintFrame=requestAnimationFrame(()=>{
  const pane=document.getElementById('notation');if(!pane)return;
  const show=$('[data-finger-visible]').checked,notesById=new Map(notes.map(n=>[n.id,n]));
  pane.classList.toggle('practice-fingers-hidden',!show);
  for(const group of pane.querySelectorAll('.note-event[data-fingering-notes]')){
   if(group.dataset.fingerRevision===String(revision))continue;
   group.dataset.fingerRevision=String(revision);group.querySelectorAll('.practice-finger').forEach(el=>el.remove());
   const refs=JSON.parse(group.dataset.fingeringNotes),entries=[];
   for(const ref of refs){const event=contextScore?.events[ref.index];if(!event)continue;const j=event.notes.findIndex(n=>(!n.part||n.part===ref.part)&&Math.abs(n.midi-ref.midi)<.01&&Number(n.staff||1)===Number(ref.staff||1));if(j<0)continue;const id=`${ref.index}:${j}`,finger=fingers[id];if(finger)entries.push({id,finger,midi:ref.midi,hand:notesById.get(id)?.hand||'right'});}
   if(!entries.length)continue;
   const heads=[...group.querySelectorAll('.vf-notehead')].map(el=>el.getBBox()).sort((a,b)=>a.y-b.y);
   entries.sort((a,b)=>b.midi-a.midi);
   const fallback=group.querySelector('.score-hit')?.getBBox();
   entries.forEach((entry,i)=>{const head=heads[i]||fallback;if(!head)return;const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.classList.add('practice-finger');text.dataset.fingerId=entry.id;text.setAttribute('x',String(head.x+head.width+5));text.setAttribute('y',String(head.y+head.height/2+3));text.setAttribute('font-size','10');text.setAttribute('fill','#8b3654');text.setAttribute('aria-label',`${entry.hand==='left'?'左':'右'}手 ${entry.finger} 指，点击修改`);text.setAttribute('role','button');text.setAttribute('tabindex','0');text.textContent=String(entry.finger);group.append(text);});
  }
 });}
 let contextScore=null;
 function sync(){const ctx=context(),id=ctx?.score?`${ctx.version}:${ctx.instrument}`:'';if(id===current)return;current=id;contextScore=ctx?.score;job=null;busy=false;fingers={};notes=[];manual.clear();revision++;$('.fingering-editor').hidden=true;$('.fingering-progress').hidden=true;$('.fingering-message').textContent='';$('[data-finger-generate]').disabled=!id;$('[data-finger-export]').disabled=true;
  if(id){let saved;try{saved=JSON.parse(localStorage.getItem(key())||'null');}catch{}if(saved){$('[data-finger-size]').value=saved.size||'M';$('[data-finger-hand]').value=saved.hand||'staff';fingers=saved.fingers||{};for(const id of saved.manual||[])manual.add(id);}notes=fingeringNotes(ctx.score,ctx.instrument,$('[data-finger-hand]').value);for(const n of notes)if(n.finger&&!fingers[n.id])fingers[n.id]=n.finger;$('[data-finger-export]').disabled=!Object.keys(fingers).length;}
  paint();if(id){const original=id;void json('/api/fingering/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes,size:$('[data-finger-size]').value})}).then(saved=>{if(current!==original||busy||!Object.keys(saved.fingers||{}).length)return;fingers=saved.fingers;for(const id of saved.manual||[])manual.add(id);revision++;remember();paint();$('[data-finger-export]').disabled=false;}).catch(()=>{});}
 }
 document.addEventListener('practice-state',sync);
 const pane=document.getElementById('notation');if(pane)new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&!n.classList?.contains('practice-finger'))))paint();}).observe(pane,{childList:true,subtree:true});
 async function json(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw Error(data.error||'指法服务未连接');return data;}
 $('[data-finger-generate]').onclick=async()=>{if(busy)return;const ctx=context();if(!ctx?.score)return;const original=current;notes=fingeringNotes(ctx.score,ctx.instrument,$('[data-finger-hand]').value);for(const n of notes)if(fingers[n.id]&&manual.has(n.id))n.finger=fingers[n.id];busy=true;$('[data-finger-generate]').disabled=true;$('.fingering-progress').hidden=false;
  try{let task=await json('/api/fingering',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:ctx.score.title,notes,size:$('[data-finger-size]').value})});job=task.id;
   for(;;){const detail=task.detail||(task.status==='queued'?'等待计算':'计算指法');reportTask(`omr-${task.id}`,{kind:'fingering',scoreTitle:ctx.score.title,label:'钢琴指法',status:task.status,progress:task.progress||0,detail:task.error||detail});if(current===original){$('.fingering-progress progress').value=task.progress||0;$('.fingering-progress span').textContent=`${detail} ${task.progress||0}%`;}
    if(task.status==='complete'){if(current===original){fingers=task.result.fingers;revision++;remember();paint();$('[data-finger-export]').disabled=false;$('.fingering-message').textContent=task.result.review.length?task.result.review.map(r=>`第 ${r.measure} 小节：${r.reason}`).join('；'):'指法已保存，点谱面上的数字可以修改。';}break;}
    if(!['queued','running'].includes(task.status))throw Error(task.error||'指法任务未完成');await new Promise(r=>setTimeout(r,900));task=await json(`/api/fingering/${task.id}`);
   }
  }catch(error){if(current===original)$('.fingering-message').textContent=error.message;if(job)reportTask(`omr-${job}`,{status:'failed',detail:error.message});}
  finally{if(current===original){busy=false;$('[data-finger-generate]').disabled=false;$('.fingering-progress').hidden=true;}}
 };
 function edit(event){const label=event.target.closest?.('.practice-finger');if(!label)return;event.preventDefault();event.stopImmediatePropagation();const id=label.dataset.fingerId;const editor=$('.fingering-editor');editor.replaceChildren();editor.hidden=false;const caption=document.createElement('span');caption.textContent=`第 ${notes.find(n=>n.id===id)?.measure||''} 小节，选择指法`;editor.append(caption);for(const finger of [1,2,3,4,5]){const button=document.createElement('button');button.type='button';button.className='small-button';button.textContent=String(finger);button.onclick=()=>{fingers[id]=finger;manual.add(id);remember();revision++;paint();editor.hidden=true;void json('/api/fingering/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes,size:$('[data-finger-size]').value,fingers,manual:[...manual]})}).catch(error=>$('.fingering-message').textContent='修改已留在本机，云端保存失败：'+error.message);};editor.append(button);}const close=document.createElement('button');close.type='button';close.className='text-button';close.textContent='取消';close.onclick=()=>editor.hidden=true;editor.append(close);}
 pane?.addEventListener('click',edit,true);pane?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')edit(event);},true);
 $('[data-finger-visible]').onchange=paint;for(const el of box.querySelectorAll('select'))el.onchange=()=>{notes=contextScore?fingeringNotes(contextScore,context()?.instrument, $('[data-finger-hand]').value):[];$('.fingering-message').textContent='设置已更改，点击标注钢琴指法重新计算。';};
 $('[data-finger-export]').onclick=()=>{if(!contextScore?.xml){$('.fingering-message').textContent='请先导入 MusicXML 或 MIDI 乐谱。';return;}const xml=annotatedXML(contextScore,notes,fingers);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([xml],{type:'application/vnd.recordare.musicxml+xml'}));a.href=url;a.download=`${contextScore.title||'曲谱'}-指法.musicxml`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
 sync();
}

export function annotatedXML(score,notes,fingers){
 const doc=new DOMParser().parseFromString(score.xml,'application/xml'),byPosition=new Map();
 for(const n of notes){const [i,j]=n.id.split(':').map(Number),e=score.events[i],note=e.notes[j];if(fingers[n.id])byPosition.set(`${note.part}:${e.measure}:${Number(e.offset??0).toFixed(5)}:${note.midi}:${note.staff||1}`,fingers[n.id]);}
 for(const part of doc.querySelectorAll('score-partwise > part')){let divisions=1,transpose=0;[...part.children].filter(n=>n.localName==='measure').forEach((measure,m)=>{let cursor=0,last=0;for(const n of measure.children){const kind=n.localName;if(kind==='attributes'){divisions=Number(n.querySelector('divisions')?.textContent)||divisions;const tr=n.querySelector('transpose');if(tr)transpose=Number(tr.querySelector('chromatic')?.textContent||0)+12*Number(tr.querySelector('octave-change')?.textContent||0);}const duration=Number(n.querySelector('duration')?.textContent||0)/divisions;if(kind==='backup'){cursor-=duration;continue;}if(kind==='forward'){cursor+=duration;continue;}if(kind!=='note'||n.querySelector('grace'))continue;const offset=n.querySelector('chord')?last:cursor;if(!n.querySelector('chord')){last=offset;cursor+=duration;}const pitch=n.querySelector('pitch');if(!pitch)continue;const midi=12*(Number(pitch.querySelector('octave')?.textContent)+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[pitch.querySelector('step')?.textContent])+Number(pitch.querySelector('alter')?.textContent||0)+transpose;const finger=byPosition.get(`${part.id}:${m+1}:${offset.toFixed(5)}:${midi}:${n.querySelector('staff')?.textContent||1}`);if(!finger)continue;let notation=n.querySelector('notations');if(!notation){notation=doc.createElement('notations');n.append(notation);}let tech=notation.querySelector('technical');if(!tech){tech=doc.createElement('technical');notation.append(tech);}tech.querySelectorAll('fingering').forEach(f=>f.remove());const f=doc.createElement('fingering');f.textContent=String(finger);f.setAttribute('placement',Number(n.querySelector('staff')?.textContent||1)>1?'below':'above');tech.append(f);}});}
 return new XMLSerializer().serializeToString(doc);
}
