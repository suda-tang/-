// ★ 2026-10-10：以前每次调用都把整份 score.xml 重新 DOMParser 一遍，只为读声部名。
//   大谱 XML 18MB、解析一次约 1.3 秒；而这个函数被 publishPractice() 调用，
//   refresh()（练习刷新 / 播放 / 改速度都会触发）每次都会走到 —— 一次打开里反复解析，
//   实测形成十几秒的单个长任务。这里按 score 缓存解析结果（xml 变了才重解析）。
// 共享 DOM：见 score-document.js。同一份 XML 只解析一次，供多个消费者复用。
import { scoreDocument } from './score-document.js?v=1';
const xmlPartsCache=new WeakMap();
function xmlScoreParts(score){
 if(!score)return [];
 const hit=xmlPartsCache.get(score);if(hit&&hit.xml===score.xml)return hit.map;
 const map=[];
 if(score.xml&&typeof DOMParser!=='undefined')for(const p of (scoreDocument(score.xml)?.querySelectorAll('score-part')||[])){const id=p.getAttribute('id');map.push({id,name:p.querySelector('part-name')?.textContent||id});}
 xmlPartsCache.set(score,{xml:score.xml,map});
 return map;
}
export function practiceInstruments(score){
 const known=new Map((score?.midiParts||[]).map(p=>[String(p.id),p]));
 for(const entry of xmlScoreParts(score))if(!known.has(entry.id))known.set(entry.id,entry);
 const parts=new Map();
 for(const e of score?.events||[])for(const n of e.notes||[]){if(n.percussion)continue;const id=String(n.part||'__unassigned');if(!parts.has(id))parts.set(id,{id,name:known.get(id)?.name||n.instrument||'钢琴',instrument:known.get(id)?.instrument||n.instrument||''});}
 return [...parts.values()];
}
export function defaultPracticeInstrument(parts){return parts.find(p=>/piano|salamander|grand|钢琴/i.test(p.name+' '+p.instrument))?.id||parts[0]?.id||'';}
export function instrumentEvents(events,id){return events.map(e=>{const notes=(e.notes||[]).filter(n=>!n.percussion&&(!id||String(n.part||'__unassigned')===id));return {...e,notes,pitches:[...new Set(notes.map(n=>n.midi))]};});}
export function instrumentFollower(Follower,events,bpm,start,end){
 const indices=[];const selected=[];
 events.forEach((e,i)=>{if(i>=start&&i<end&&e.pitches.length){indices.push(i);selected.push(e);}});
 const inner=new Follower(selected,bpm);
 return {get index(){return indices[inner.index]??end;},set index(value){const i=indices.findIndex(n=>n>=value);inner.index=i<0?indices.length:i;},get bpm(){return inner.bpm;},set bpm(value){inner.bpm=value;},pause(){inner.pause();},consume(pitches,time){return inner.consume(pitches,time).map(row=>({...row,index:indices[row.index]}));}};
}
