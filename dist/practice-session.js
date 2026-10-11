// Passage bounds retain score-wide event indices, including in exported records.
export function passageBounds(events, range) {
 const indices=events.map((e,i)=>!range||(Number(e.measure)>=range.start&&Number(e.measure)<=range.end)?i:-1).filter(i=>i>=0);
 if(!indices.length)return {start:0,end:0,count:0};
 return {start:indices[0],end:indices.at(-1)+1,count:indices.length};
}
export function scoreVersion(score){
 if(!score)return '';
 let hash=2166136261;const text=score.xml||JSON.stringify(score.events);
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return `${score.serverId||'local'}:${hash>>>0}`;
}
export function practiceAdvice(evidence,bpm){
 if(!evidence)return '弹完一段后，这里会列出需要回看的小节。';
 if(evidence.reviewMeasures.length)return `先回看第 ${evidence.reviewMeasures.slice(0,3).join('、')} 小节。核对谱面与听音记录，确认后再分段慢练。`;
 const timings=evidence.measures.flatMap(m=>m.timingObservations>=3?[m.meanAbsoluteOffsetMs]:[]);
 if(!timings.length)return '暂未记录到音符差异；起音数据还少，继续练习后再比较节奏。';
 return Math.max(...timings)>Math.max(80,60000/bpm*.18)?'音符匹配较稳定。先保持当前速度，留意相邻起音是否均匀。':'这一段的匹配记录较稳定。可以再练一次，或手动提高少量速度。';
}
