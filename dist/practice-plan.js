const integer=(v,min,max)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
export function validatePracticePlan(value,context){
 let plan=value;if(typeof plan==='string'){try{plan=JSON.parse(plan);}catch{throw Error('练习建议格式不完整，请重新生成');}}
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||Object.keys(plan).some(k=>!['scoreVersion','goal','steps'].includes(k)))throw Error('练习建议包含不支持的设置');
 if(!context?.version||plan.scoreVersion!==context.version)throw Error('曲谱已更换，这份建议不能应用到当前曲谱');
 if(typeof plan.goal!=='string'||!plan.goal.trim()||plan.goal.length>160||!Array.isArray(plan.steps)||!plan.steps.length||plan.steps.length>6)throw Error('请提供目标和 1–6 个练习段落');
 const numbers=context.measures||[];
 const steps=plan.steps.map(s=>{
  if(!s||Object.keys(s).some(k=>!['start','end','bpm','rounds','method','criterion'].includes(k)))throw Error('练习段落包含不支持的设置');
  if(!integer(s.start,Math.min(...numbers),Math.max(...numbers))||!integer(s.end,s.start,Math.max(...numbers))||!numbers.some(n=>n>=s.start&&n<=s.end))throw Error('建议的小节范围不在当前谱面中');
  if(!integer(s.bpm,30,240)||!integer(s.rounds,1,10))throw Error('速度须为 30–240 BPM，遍数须为 1–10');
  for(const key of ['method','criterion'])if(typeof s[key]!=='string'||!s[key].trim()||s[key].length>400)throw Error('每段需要具体练法和检查点');
  return {...s,method:s.method.trim(),criterion:s.criterion.trim()};
 });return {scoreVersion:plan.scoreVersion,goal:plan.goal.trim(),steps};
}
export function matchesPracticeStep(state,step){return !!step&&state.range?.start===step.start&&state.range?.end===step.end&&state.bpm===step.bpm;}
