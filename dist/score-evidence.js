// Facts about the score actually loaded in the player, including generated parts.
// These are notation statistics, not an assessment of difficulty or performance.
export function scoreEvidence(score){
 if(!score)return null;
 const measures=new Map(),parts=new Map();
 for(const event of score.events||[]){
  if(!Number.isFinite(event.measure))continue;
  if(!measures.has(event.measure))measures.set(event.measure,{measure:event.measure,onsets:0,notes:0,parts:new Set(),shortestDuration:null,pitchMin:null,pitchMax:null,maxSimultaneousNotes:0});
  const bar=measures.get(event.measure);bar.onsets++;
  const pitched=(event.notes||[]).filter(n=>!n.percussion&&!/drum|鼓/i.test(n.instrument||'')&&Number.isFinite(n.midi));
  bar.maxSimultaneousNotes=Math.max(bar.maxSimultaneousNotes,pitched.length);
  for(const note of pitched){
   const id=String(note.part||'unknown');
   if(!parts.has(id))parts.set(id,{id,notes:0,pitchMin:note.midi,pitchMax:note.midi,firstMeasure:event.measure,lastMeasure:event.measure});
   const part=parts.get(id);part.notes++;part.pitchMin=Math.min(part.pitchMin,note.midi);part.pitchMax=Math.max(part.pitchMax,note.midi);part.lastMeasure=event.measure;
   bar.notes++;bar.parts.add(id);bar.pitchMin=bar.pitchMin===null?note.midi:Math.min(bar.pitchMin,note.midi);bar.pitchMax=bar.pitchMax===null?note.midi:Math.max(bar.pitchMax,note.midi);
   if(Number.isFinite(note.duration)&&note.duration>0)bar.shortestDuration=bar.shortestDuration===null?note.duration:Math.min(bar.shortestDuration,note.duration);
  }
 }
 return {source:'loaded-score',generated:!!score.generated,arrangementKey:score.arrangementKey||null,measureCount:score.measures||null,parts:[...parts.values()],measures:[...measures.values()].sort((a,b)=>a.measure-b.measure).map(b=>({...b,parts:[...b.parts]})),limits:'由当前载入的演奏事件统计。duration 单位沿用解析器的拍；不包含指法、踏板或演奏录音。整小节休止可能没有事件，未列出不等于小节不存在；跨声部同时发声数不是单手和弦跨度。'};
}
