import {fingeringNotes} from './practice-fingering.js';
import {liveScore,livePlayer} from './capability-host.js';

const COLORS={L:'#2dd4a8',R:'#f5a623'},INK={L:'#0b7a5e',R:'#9a5c00'};
const black=midi=>[1,3,6,8,10].includes(midi%12);
export function pianoNote(note,score){
 if(note.percussion||note.instrument==='drums'||note.channel===9)return false;
 const parts=score.midiParts||score.parts||[];
 const part=parts.find(p=>p.id===note.part);
 if(part?.percussion)return false;
 if(parts.length>1)return /piano|钢琴|grand|salamander|keyboard/i.test([part?.name,part?.instrument,note.instrument].join(' '))||Number.isFinite(part?.program)&&part.program<8;
 return true;
}
export const noteHand=note=>Number(note.staff)>1||/left|左手/i.test(String(note.hand))?'L':'R';
const savedFingers=new WeakMap(),loadedProfiles=new WeakSet();
const fingerFor=(score,index,note)=>savedFingers.get(score)?.[`${index}:${score.events[index].notes.indexOf(note)}`]||Number(note.fingering||note.finger)||0;
export function keyboardTimeline(score){
 const notes=[];
 for(const [index,event]of score.events.entries())for(const note of event.notes||[]){if(!pianoNote(note,score)||!Number.isFinite(note.midi))continue;notes.push({start:event.beat,end:event.beat+Math.max(.015,Number(note.duration??event.duration)||.25),midi:note.midi,hand:noteHand(note),finger:String(fingerFor(score,index,note)||''),part:note.part,index});}
 return notes.sort((a,b)=>a.start-b.start);
}
let handsModel=null,handsRevision=0,handsStatus=null;
let enabled=false,current=null,timeline=[],cursor=0,active=[],previous=-Infinity,signature='',canvas,card,ctx,geom=new Map(),width=0,height=0,observer;
function resize(){if(!enabled)return;const r=canvas.getBoundingClientRect();if(!r.width)return;width=r.width;height=r.height;const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);geom.clear();
 let lo=48,hi=83;if(timeline.length){lo=Math.max(21,Math.floor(timeline.reduce((m,n)=>Math.min(m,n.midi),108)/12)*12);hi=Math.min(108,Math.floor(timeline.reduce((m,n)=>Math.max(m,n.midi),21)/12)*12+11);while(hi-lo<47){if(lo>=33)lo-=12;else if(hi<=96)hi+=12;else break;}}
 let whites=0;for(let m=lo;m<=hi;m++)if(!black(m))whites++;const w=width/whites;let x=0;for(let m=lo;m<=hi;m++){geom.set(m,{x:black(m)?x-w*.31:x,w:black(m)?w*.62:w,black:black(m)});if(!black(m))x+=w;}signature='';updateRealKeyboard(current||liveScore(),livePlayer()?.beat||0,!!livePlayer()?.playing);
}
function stateMap(notes){const result=new Map();for(const n of notes){if(!result.has(n.midi))result.set(n.midi,{});result.get(n.midi)[n.hand]=n.finger;}return result;}
function paint(down,next){ctx.clearRect(0,0,width,height);ctx.fillStyle='#3a3f47';ctx.fillRect(0,0,width,4);const h=height-4,bh=h*.62;
 const tint=(state,r,kh)=>{const hands=Object.keys(state);hands.forEach((hand,i)=>{ctx.fillStyle=COLORS[hand];ctx.fillRect(r.x+r.w*i/hands.length,4,r.w/hands.length,kh);});};
 for(const [m,r]of geom){if(r.black)continue;ctx.fillStyle='#fff';ctx.fillRect(r.x,4,r.w,h);if(down.has(m))tint(down.get(m),r,h);ctx.strokeStyle='#c9ccd1';ctx.lineWidth=1;ctx.strokeRect(r.x+.5,4.5,r.w-1,h-1);}
 for(const [m,r]of geom){if(!r.black)continue;ctx.fillStyle='#22252a';ctx.beginPath();ctx.roundRect(r.x,4,r.w,bh,[0,0,3,3]);ctx.fill();if(down.has(m)){ctx.save();ctx.clip();tint(down.get(m),r,bh);ctx.restore();}else{ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(r.x+r.w*.18,4,r.w*.12,bh*.85);}}
 const center=geom.get(60);if(center&&!down.has(60)){ctx.fillStyle='#9aa0a8';ctx.font=`600 ${Math.min(14,center.w*.5)}px system-ui`;ctx.textAlign='center';ctx.fillText('C',center.x+center.w/2,height-6);}
 for(const [m,hands]of down){const r=geom.get(m);if(!r)continue;const entries=Object.entries(hands);entries.forEach(([hand,finger],i)=>{if(!finger)return;ctx.fillStyle=r.black?'#fff':INK[hand];ctx.textAlign='center';ctx.font=`800 ${Math.max(10,Math.min(26,r.w*.65))}px system-ui`;ctx.fillText(finger,r.x+r.w*(i+.5)/entries.length,r.black?bh-8:height-15);});}
 for(const [m,hands]of next){const r=geom.get(m);if(!r)continue;Object.entries(hands).forEach(([hand,finger],i,entries)=>{const radius=Math.max(3,Math.min(10,r.w*.28)),x=r.x+r.w/2+(entries.length>1?(i-.5)*radius*2.2:0),y=r.black?4+bh*.34:4+bh+(h-bh)*.22;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=down.has(m)?'#fff':hand==='L'?'rgba(45,212,168,.28)':'rgba(245,166,35,.28)';ctx.fill();ctx.strokeStyle=COLORS[hand];ctx.lineWidth=2;ctx.stroke();if(finger){ctx.font=`700 ${radius*1.3}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=INK[hand];ctx.fillText(finger,x,y);ctx.textBaseline='alphabetic';}});}
}
export function updateRealKeyboard(score,beat=0,playing=false){if(!enabled||!score)return;if(current!==score){current=score;timeline=keyboardTimeline(score);cursor=0;active=[];previous=-Infinity;resize();colorScore();void loadFingers(score).then(()=>{if(handsModel)void ensureHandFingering(score);});updateRealKeyboard(score,beat,playing);return;}
 const p=livePlayer(),audible=n=>(p?.soloPart==='all'||!p?.soloPart||p.soloPart===n.part)&&!p?.disabledParts?.has(n.part);
 if(beat<previous-.001){cursor=0;active=[];}previous=beat;
 while(cursor<timeline.length&&timeline[cursor].start<=beat+.001)active.push(timeline[cursor++]);active=active.filter(n=>n.end>beat+.001);
 const next=[];const start=timeline[cursor]?.start;for(let i=cursor;i<timeline.length&&timeline[i].start===start;i++)next.push(timeline[i]);
 const down=stateMap(playing?active.filter(audible):[]),upcoming=stateMap((playing?next:active.length?active:next).filter(audible));const sig=JSON.stringify([[...down],[...upcoming]]);if(sig!==signature){signature=sig;paint(down,upcoming);}
 if(handsModel){const future=[],first={L:null,R:null};for(let i=cursor;i<Math.min(timeline.length,cursor+128);i++){const n=timeline[i];if(!audible(n))continue;if(first[n.hand]===null)first[n.hand]=n.start;if(n.start===first[n.hand])future.push(n);if(first.L!==null&&first.R!==null&&n.start>Math.max(first.L,first.R))break;}handsModel.update({width,height,geom,active:playing?active.filter(audible):[],next:(playing?next:active.length?active:next).filter(audible),future:playing?future:(active.length?active:next).filter(audible),beat,playing,score,bpm:p?.bpm||score.tempo||80});}
}
async function loadFingers(score){
 if(loadedProfiles.has(score))return;loadedProfiles.add(score);
 const parts=[...new Set(score.events.flatMap(e=>(e.notes||[]).filter(n=>pianoNote(n,score)).map(n=>n.part||'__unassigned')))];
 for(const part of parts){try{const notes=fingeringNotes(score,part);const response=await fetch('/api/fingering/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes,size:'M'}),signal:AbortSignal.timeout(8000)});if(!response.ok)continue;const data=await response.json();if(Object.keys(data.fingers||{}).length)applyFingers(score,data.fingers);}catch{}}
}
function applyFingers(score,fingers){colorRevision++;savedFingers.set(score,{...savedFingers.get(score),...fingers});if(current===score){timeline=keyboardTimeline(score);cursor=0;active=[];previous=-Infinity;signature='';document.querySelectorAll('[data-keyboard-fingers]').forEach(el=>el.removeAttribute('data-keyboard-fingers'));colorScore();updateRealKeyboard(score,livePlayer()?.beat||0,!!livePlayer()?.playing);}}
const handFingerJobs=new WeakSet();
async function ensureHandFingering(score){
 if(handFingerJobs.has(score))return;handFingerJobs.add(score);
 const {reportTask}=await import('./task-center.js?v=home-attach3');
 const parts=[...new Set(score.events.flatMap(e=>e.notes.filter(n=>pianoNote(n,score)).map(n=>n.part||'__unassigned')))];
 for(const part of parts){
  const notes=fingeringNotes(score,part);for(const n of notes)n.finger=savedFingers.get(score)?.[n.id]||n.finger;
  if(!notes.some(n=>!n.finger))continue;
  let taskId;
  try{const request=await fetch('/api/fingering',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:score.title,notes,size:'M'}),signal:AbortSignal.timeout(15000)});let task=await request.json();if(!request.ok)throw Error(task.error||'指法计算未完成');taskId=task.id;
   for(let count=0;count<1800;count++){
    reportTask('omr-'+task.id,{kind:'fingering',scoreTitle:score.title,label:'钢琴指法',status:task.status,progress:task.progress||0,detail:task.error||task.detail||'计算指法'});
    if(current===score&&handsModel)handsStatus.textContent=task.status==='complete'?'':`指法计算 ${Math.round(task.progress||0)}%`;
    if(task.status==='complete'){applyFingers(score,task.result.fingers||{});break;}
    if(!['running','queued'].includes(task.status))throw Error(task.error||'指法计算未完成');
    await new Promise(r=>setTimeout(r,1200));const response=await fetch('/api/fingering/'+task.id,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('指法进度暂不可用');task=await response.json();
   }
  }catch(error){if(taskId)reportTask('omr-'+taskId,{status:'failed',detail:error.message});if(current===score&&handsModel)handsStatus.textContent='手型预览；指法计算未完成';handFingerJobs.delete(score);}
 }
}
const coloredNotes=new WeakMap();let colorRevision=0;
function colorScore(root=document.getElementById('notation')){
 if(!enabled||!root||!current)return;
 const elements=root.matches?.('.note-event')?[root]:root.querySelectorAll('.note-event');
 for(const el of elements){
  const cached=coloredNotes.get(el);if(cached?.score===current&&cached.revision===colorRevision)continue;
  coloredNotes.set(el,{score:current,revision:colorRevision});
  let refs=[];try{refs=JSON.parse(el.dataset.fingeringNotes||'[]');}catch{}
  const index=Number(el.dataset.index),event=current.events[index];if(!event)continue;
  const notes=refs.length?refs.map(ref=>event.notes.find(n=>(!ref.part||n.part===ref.part)&&n.midi===ref.midi&&Number(n.staff||1)===Number(ref.staff||1))).filter(Boolean):(event.notes||[]).filter(n=>!el.dataset.part||n.part===el.dataset.part);
  const piano=notes.filter(n=>pianoNote(n,current)),hands=new Set(piano.map(noteHand));if(hands.size===1)el.dataset.keyboardHand=[...hands][0];
  const entries=piano.map(note=>({note,finger:fingerFor(current,index,note)})).filter(e=>e.finger>=1&&e.finger<=5).sort((a,b)=>b.note.midi-a.note.midi);
  const stamp=entries.map(e=>e.note.midi+':'+e.finger).join(',');if(el.dataset.keyboardFingers===stamp)continue;el.dataset.keyboardFingers=stamp;el.querySelectorAll('.keyboard-finger').forEach(n=>n.remove());
  if(el.namespaceURI==='http://www.w3.org/2000/svg'){
   const heads=[...el.querySelectorAll('.vf-notehead')].map(n=>n.getBBox()).sort((a,b)=>a.y-b.y);const all=[...piano].sort((a,b)=>b.midi-a.midi);
   for(const {note,finger}of entries){const pos=all.indexOf(note),head=heads[pos]||el.querySelector('.score-hit')?.getBBox();if(!head)continue;
    // Original engraver/practice labels already identify this note; do not double them.
    if(el.querySelector('.practice-finger,.vf-fingering'))continue;
    const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.classList.add('keyboard-finger');label.dataset.hand=noteHand(note);label.setAttribute('x',String(head.x+head.width/2));label.setAttribute('y',String(noteHand(note)==='L'?head.y+head.height+13+pos*2:head.y-7-pos*2));label.setAttribute('text-anchor','middle');label.setAttribute('font-size','11');label.textContent=String(finger);label.setAttribute('aria-label',`${noteHand(note)==='L'?'左':'右'}手${finger}指`);el.append(label);
   }
  }else{const pitches=[...el.querySelectorAll('.simple-pitches>span')];for(const {note,finger}of entries){const pos=[...notes].sort((a,b)=>b.midi-a.midi).indexOf(note),pitch=pitches[pos];if(!pitch)continue;const label=document.createElement('small');label.className='keyboard-finger';label.dataset.hand=noteHand(note);label.textContent=String(finger);label.setAttribute('aria-label',`${noteHand(note)==='L'?'左':'右'}手${finger}指`);pitch.append(label);}}
 }
}

function init(){const toggle=document.getElementById('real-keyboard-toggle');card=document.getElementById('real-keyboard-card');canvas=card?.querySelector('canvas');if(!toggle||!canvas)return;ctx=canvas.getContext('2d');const surface=document.createElement('div');surface.className='real-keyboard-surface';canvas.before(surface);surface.append(canvas);handsStatus=document.createElement('span');handsStatus.className='piano-hands-status';handsStatus.setAttribute('role','status');card.querySelector('header').append(handsStatus);
 const handsToggle=document.getElementById('piano-hands-toggle');
 handsToggle.onchange=async()=>{const revision=++handsRevision;try{localStorage.setItem('piano-hands',String(handsToggle.checked));}catch{}if(!handsToggle.checked){handsModel?.dispose();handsModel=null;handsStatus.textContent='';return;}
  if(!toggle.checked){toggle.checked=true;toggle.onchange();}handsStatus.textContent='正在加载手型';
  try{const {createPianoHands}=await import('./piano-hands-3d.js');if(revision!==handsRevision||!handsToggle.checked)return;handsModel?.dispose();handsModel=createPianoHands(surface);const created=handsModel;await created.ready;if(revision!==handsRevision||!handsToggle.checked)return;handsStatus.textContent='';updateRealKeyboard(liveScore(),livePlayer()?.beat||0,!!livePlayer()?.playing);const selected=liveScore();if(selected)void loadFingers(selected).then(()=>ensureHandFingering(selected));}
  catch(error){if(revision===handsRevision){handsModel?.dispose();handsModel=null;handsToggle.checked=false;handsStatus.textContent='手型未能显示：'+error.message;}}
 };
 const ro=new ResizeObserver(resize);ro.observe(canvas);let colorFrame=0;const pendingColors=new Set();
 const drainColors=()=>{colorFrame=0;const until=performance.now()+5;for(const node of pendingColors){pendingColors.delete(node);if(enabled&&node.isConnected)colorScore(node);if(performance.now()>=until)break;}if(pendingColors.size)colorFrame=requestAnimationFrame(drainColors);};
 observer=new MutationObserver(records=>{if(!enabled)return;for(const record of records)for(const node of record.addedNodes){if(node.nodeType!==1||node.classList.contains('keyboard-finger'))continue;if(node.matches('.note-event'))pendingColors.add(node);else for(const note of node.querySelectorAll('.note-event'))pendingColors.add(note);}if(pendingColors.size&&!colorFrame)colorFrame=requestAnimationFrame(drainColors);});observer.observe(document.getElementById('sheet-scroll'),{childList:true,subtree:true});
 document.addEventListener('piano-fingering-updated',event=>{if(event.detail?.score)applyFingers(event.detail.score,event.detail.fingers||{});});
 toggle.onchange=()=>{enabled=toggle.checked;if(!enabled&&handsToggle.checked){handsToggle.checked=false;void handsToggle.onchange();}card.hidden=!enabled;document.body.classList.toggle('has-real-keyboard',enabled);try{localStorage.setItem('real-keyboard',String(enabled));}catch{}if(enabled){document.dispatchEvent(new Event('piano-fingering-request'));current=null;updateRealKeyboard(liveScore(),livePlayer()?.beat||0,!!livePlayer()?.playing);resize();}};
 try{toggle.checked=localStorage.getItem('real-keyboard')==='true';}catch{}toggle.onchange();try{handsToggle.checked=localStorage.getItem('piano-hands')==='true';}catch{}if(handsToggle.checked)void handsToggle.onchange();
 document.addEventListener('transport-state',()=>updateRealKeyboard(liveScore(),livePlayer()?.beat||0,!!livePlayer()?.playing));
}
init();
