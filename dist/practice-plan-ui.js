import {validatePracticePlan,matchesPracticeStep} from './practice-plan.js';
const KEY='piano-practice-plan-v1';
export function mountPracticePlan(host,{state,request}){
 const box=document.createElement('section');box.className='follow-plan';box.hidden=true;box.setAttribute('aria-label','分段练习建议');host.append(box);
 let proposal=null,active=null,loadedVersion='',counted=new Set();
 const error=text=>{let p=box.querySelector('.follow-plan-error');if(!p){p=document.createElement('p');p.className='follow-plan-error';p.setAttribute('role','alert');box.append(p);}p.textContent=text;};
 function save(){try{const all=JSON.parse(localStorage.getItem(KEY)||'{}');if(active)all[active.plan.scoreVersion]={...active,counted:[...counted].slice(-100)};localStorage.setItem(KEY,JSON.stringify(Object.fromEntries(Object.entries(all).slice(-5))));}catch{}}
 function render(){
  const item=proposal||active?.plan;box.replaceChildren();box.hidden=!item;if(!item)return;
  const title=document.createElement('strong');title.textContent=proposal?'待确认的练习建议':item.goal;box.append(title);
  if(proposal){const goal=document.createElement('p');goal.textContent=item.goal;box.append(goal);}
  const list=document.createElement('ol');list.className='follow-plan-steps';
  item.steps.forEach((s,i)=>{const li=document.createElement('li');li.textContent=`${s.start}–${s.end} 小节 · ${s.bpm} BPM · ${s.rounds} 遍`;if(!proposal){li.dataset.current=String(i===active.index);const button=document.createElement('button');button.className='text-button';button.type='button';button.textContent=i===active.index?'当前段':'选此段';button.onclick=()=>apply(i,false);li.append(button);}list.append(li);});box.append(list);
  const index=proposal?0:active.index,step=item.steps[index];
  const method=document.createElement('p'),criterion=document.createElement('p');method.textContent=step.method;criterion.textContent='检查点：'+step.criterion;box.append(method,criterion);
  const fields=document.createElement('div');fields.className='follow-plan-fields';for(const [key,label,min,max] of [['start','起始',Math.min(...state().measures),Math.max(...state().measures)],['end','结束',Math.min(...state().measures),Math.max(...state().measures)],['bpm','BPM',30,240],['rounds','遍数',1,10]]){const field=document.createElement('label'),input=document.createElement('input');field.textContent=label;input.type='number';input.step='1';input.min=String(min);input.max=String(max);input.value=step[key];input.dataset.setting=key;field.append(input);fields.append(field);}box.append(fields);
  const progress=document.createElement('p');progress.className='follow-plan-progress';progress.setAttribute('role','status');box.append(progress);
  const controls=document.createElement('div');controls.className='follow-plan-actions';const applyButton=document.createElement('button');applyButton.className='small-button';applyButton.type='button';applyButton.textContent=proposal?'确认应用，准备第一段':'应用本段设置';applyButton.onclick=()=>apply(index,true);controls.append(applyButton);
  if(!proposal&&index<item.steps.length-1){const next=document.createElement('button');next.type='button';next.className='text-button';next.textContent='下一段';next.dataset.next='true';next.onclick=()=>apply(index+1,false);controls.append(next);}
  const cancel=document.createElement('button');cancel.type='button';cancel.className='text-button';cancel.textContent=proposal?'暂不采用':'结束分段练习';cancel.onclick=()=>{if(proposal)proposal=null;else{try{const all=JSON.parse(localStorage.getItem(KEY)||'{}');delete all[state().version];localStorage.setItem(KEY,JSON.stringify(all));}catch{}active=null;}render();};controls.append(cancel);box.append(controls);
  const note=document.createElement('small');note.textContent='应用只修改选段与速度，不开启麦克风。遍数只统计完整实弹记录，不代表达到检查点。';box.append(note);update(state());
 }
 function apply(index,edited){
  try{
   const source=proposal||active.plan,copy=structuredClone(source);
   if(edited)for(const input of box.querySelectorAll('[data-setting]'))copy.steps[index][input.dataset.setting]=Number(input.value);
   const plan=validatePracticePlan(copy,state()),step=plan.steps[index];
   const result=request('configure',{version:plan.scoreVersion,...step});if(!result?.ok)throw Error(result?.error||'跟弹工作区未响应，尚未应用');
   const previous=active;active={plan,index,completed:proposal?plan.steps.map(()=>0):[...previous.completed]};
   if(!proposal&&JSON.stringify(previous.plan.steps[index])!==JSON.stringify(step))active.completed[index]=0;
   if(proposal)counted.clear();proposal=null;save();render();
  }catch(e){error(e.message);}
 }
 function update(next){
  if(!next)return;
  if(next.version!==loadedVersion){loadedVersion=next.version;proposal=null;active=null;counted.clear();try{const saved=JSON.parse(localStorage.getItem(KEY)||'{}')[next.version];if(saved){const plan=validatePracticePlan(saved.plan,next);if(Number.isInteger(saved.index)&&saved.index>=0&&saved.index<plan.steps.length&&Array.isArray(saved.completed)&&saved.completed.length===plan.steps.length&&saved.completed.every(n=>Number.isInteger(n)&&n>=0&&n<=10)){active={plan,index:saved.index,completed:saved.completed};counted=new Set(saved.counted||[]);}}}catch{}render();return;}
  if(!proposal&&active&&next.complete&&!next.running&&!next.demo&&next.evidence&&next.session&&!counted.has(next.session)&&matchesPracticeStep(next,active.plan.steps[active.index])){counted.add(next.session);active.completed[active.index]=Math.min(active.plan.steps[active.index].rounds,active.completed[active.index]+1);save();}
  const progress=box.querySelector('.follow-plan-progress');if(progress&&active&&!proposal){const step=active.plan.steps[active.index],done=active.completed[active.index];progress.textContent=matchesPracticeStep(next,step)?`第 ${active.index+1} 段 · 已完整练习 ${done} / ${step.rounds} 遍${done>=step.rounds?' · 请自行核对检查点':''}`:'当前控件与建议不同，应用本段设置后再统计遍数';const button=box.querySelector('[data-next]');if(button)button.disabled=next.running||next.starting||done<step.rounds;}
  for(const control of box.querySelectorAll('input,button:not([data-next])'))control.disabled=next.running||next.starting;
 }
 document.addEventListener('practice-plan-proposed',event=>{try{const plan=validatePracticePlan(event.detail.plan,state());proposal=plan;render();document.querySelector('.practice-settings').open=true;box.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});event.detail.resolve?.({ok:true});}catch(e){event.detail.resolve?.({error:e.message});}});
 return {update};
}
