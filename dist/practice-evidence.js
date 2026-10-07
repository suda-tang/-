export function practiceEvidence(records){
 const real=records.filter(row=>row.source==='microphone');if(!real.length)return null;
 const measures=new Map();for(const row of real){if(!Number.isFinite(Number(row.measure)))continue;const key=Number(row.measure);if(!measures.has(key))measures.set(key,{measure:key,observations:0,correct:0,wrong:0,missed:0,extra:0,offsets:[]});const group=measures.get(key);group.observations++;if(['correct','wrong','missed','extra'].includes(row.type))group[row.type]++;if(Number.isFinite(row.offsetMs))group.offsets.push(row.offsetMs);}
 return {source:'microphone',observations:real.length,measures:[...measures.values()].sort((a,b)=>a.measure-b.measure).map(({offsets,...row})=>({...row,meanOffsetMs:offsets.length?Math.round(offsets.reduce((a,b)=>a+b,0)/offsets.length):null})),limits:'这是麦克风匹配记录，可能包含识别误差；不能据此诊断学生能力或认定所有偏差都是演奏错误。'};
}
