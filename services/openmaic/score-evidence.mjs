const digits={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
function number(s){if(/^\d/.test(s))return Number(s);if(s.includes('十')){const [a,b]=s.split('十');return(digits[a]||1)*10+(digits[b]||0)}return digits[s]}
export function pitchName(note){if(!note.pitch)return null;const p=note.pitch;return p.step+({'-2':'bb','-1':'b','0':'','1':'#','2':'##'}[String(p.alter||0)]||'')+p.octave;}
export function scoreFacts(notes){return notes.map(n=>`第${n.measure}小节，谱表${n.staff||'未标'}，声部${n.voice}：位置${n.beat}，${n.rest?'休止':pitchName(n)}，时值${n.duration}个四分音符（${n.writtenType||'原谱未标类型'}）。`).join('\n');}
// Conservative gate: only reject explicit pitch/duration claims with an explicit
// measure and an unambiguous duration in the original. Never guess missing facts.
export function timingErrors(text,notes){
 const clean=String(text).replace(/<[^>]+>/g,' ').replace(/♯/g,'#');
 const markers=[...clean.matchAll(/第([一二三四五六七八九十\d]+)小节/g)],errors=[];
 for(let i=0;i<markers.length;i++){
  const measure=number(markers[i][1]),chunk=clean.slice(markers[i].index,markers[i+1]?.index||clean.length);
  const pitches=[...chunk.matchAll(/(?<![A-Za-z])[A-G](?:#{1,2}|b{1,2})?[0-8]?(?![A-Za-z])/g)];
  for(const claim of chunk.matchAll(/(\d+(?:\.\d+)?|[一二两三四])拍/g)){
   const duration=number(claim[1]);
   const before=chunk.slice(0,claim.index),preceding=pitches.filter(p=>p.index<claim.index);
   const near=before.slice(-12).includes('各')?preceding.filter(p=>claim.index-p.index<24):preceding.slice(-1).filter(p=>claim.index-p.index<12);
   for(const p of near){const gap=chunk.slice(p.index+p[0].length,claim.index);if(!/^[，、\s（(]*(?:(?:音(?:符)?|弹|持续|时值(?:为|是)?|各)[：:\s]*)?$/.test(gap)&&!before.slice(-12).includes('各'))continue;let matches=notes.filter(n=>n.measure===measure&&(pitchName(n)===p[0]||!/[0-8]$/.test(p[0])&&pitchName(n)?.replace(/[0-8]$/,'')===p[0]));if(!/[0-8]$/.test(p[0])&&/左手|低音/.test(clean.slice(0,markers[i].index+chunk.length)))matches=matches.filter(n=>n.staff==='2');const values=new Set(matches.map(n=>n.duration));if(values.size===1&&!values.has(duration))errors.push(`第${measure}小节的${p[0]}在原谱是${[...values][0]}个四分音符的时值，不能说成${duration}拍。`);}
  }
 }
 return [...new Set(errors)];
}

// Correct only explicit single-note duration claims supported by unambiguous
// original notes. Keep uncertain and compound claims for the model to review.
export function repairTimingClaims(text,notes){
 return String(text||'').replace(/第([一二三四五六七八九十\d]+)小节[\s\S]*?(?=第[一二三四五六七八九十\d]+小节|$)/g,chunk=>{
  const measure=number(chunk.match(/^第([一二三四五六七八九十\d]+)小节/)[1]);
  chunk=chunk.replace(/((?:[A-G](?:#{1,2}|b{1,2})?[0-8]?[、，\s]+)+[A-G](?:#{1,2}|b{1,2})?[0-8]?)各(?:\d+(?:\.\d+)?|[一二两三四])拍/g,(all,list)=>{const pitches=list.match(/[A-G](?:#{1,2}|b{1,2})?[0-8]?/g);const resolved=pitches.map(pitch=>{const values=new Set(notes.filter(n=>n.measure===measure&&(pitchName(n)===pitch||!/[0-8]$/.test(pitch)&&pitchName(n)?.replace(/[0-8]$/,'')===pitch)).map(n=>n.duration));return values.size===1&&[...values][0]>0?pitch+'（时值为'+[...values][0]+'个四分音符）':null});return resolved.every(Boolean)?resolved.join('、'):all});
  return chunk.replace(/(?<![A-Za-z])([A-G](?:#{1,2}|b{1,2})?[0-8]?)([，、\s（(]*(?:音(?:符)?|弹|持续|时值(?:为|是)?)?[：:\s]*)(\d+(?:\.\d+)?|[一二两三四])拍/g,(all,pitch,gap,value)=>{
   const matches=notes.filter(n=>n.measure===measure&&(pitchName(n)===pitch||!/[0-8]$/.test(pitch)&&pitchName(n)?.replace(/[0-8]$/,'')===pitch));const durations=new Set(matches.map(n=>n.duration));
   if(durations.size!==1)return all;const duration=[...durations][0];if(!Number.isFinite(duration)||duration<=0||duration===number(value))return all;
   return pitch+'，时值为'+duration+'个四分音符';
  });
 });
}
