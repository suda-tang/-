export function practiceEvidence(records){
 const real=records.filter(row=>row.source==='microphone');if(!real.length)return null;
 const measures=new Map();
 for(const row of real){
  if(row.measure==null||!Number.isFinite(Number(row.measure)))continue;
  const key=Number(row.measure);
  if(!measures.has(key))measures.set(key,{measure:key,observations:0,correct:0,wrong:0,missed:0,extra:0,offsets:[],pitchPairs:new Map()});
  const group=measures.get(key);group.observations++;
  if(['correct','wrong','missed','extra'].includes(row.type))group[row.type]++;
  if(Number.isFinite(row.offsetMs))group.offsets.push(row.offsetMs);
  if(row.type!=='correct'){
   const expected=(row.expected||[]).filter(Number.isFinite),heard=(row.heard||[]).filter(Number.isFinite);
   const id=JSON.stringify([row.type,expected,heard]);
   const entry=group.pitchPairs.get(id)||{type:row.type,expected,heard,count:0};entry.count++;group.pitchPairs.set(id,entry);
  }
 }
 const summary=[...measures.values()].sort((a,b)=>a.measure-b.measure).map(({offsets,pitchPairs,...row})=>{
  const mean=offsets.length?offsets.reduce((a,b)=>a+b,0)/offsets.length:null;
  return {...row,timingObservations:offsets.length,meanOffsetMs:mean===null?null:Math.round(mean),meanAbsoluteOffsetMs:offsets.length?Math.round(offsets.reduce((n,x)=>n+Math.abs(x),0)/offsets.length):null,timingSpreadMs:offsets.length>1?Math.round(Math.sqrt(offsets.reduce((n,x)=>n+(x-mean)**2,0)/offsets.length)):null,pitchPairs:[...pitchPairs.values()]};
 });
 return {source:'microphone',observations:real.length,measures:summary,reviewMeasures:summary.filter(r=>r.wrong+r.missed+r.extra>0).sort((a,b)=>(b.wrong+b.missed+b.extra)-(a.wrong+a.missed+a.extra)||a.measure-b.measure).map(r=>r.measure),limits:'这是麦克风匹配记录，可能包含识别误差；复核顺序按记录数量排序，不是能力评分。未记录的小节不能判定为正确；不能据此判断力度、音色、指法或学生能力。'};
}
