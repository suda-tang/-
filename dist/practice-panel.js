import {mountPracticeFingering} from './practice-fingering.js?v=1';
import {practiceAdvice} from './practice-session.js';
import {mountPracticePlan} from './practice-plan-ui.js';
const KEY='piano-follow-history-v1';
export function mountPracticePanel(root){
 const css=document.createElement('link');css.rel='stylesheet';css.href='/practice-panel.css';document.head.append(css);
 root.classList.add('follow-practice');
 const section=document.createElement('div');section.className='follow-content';
 section.innerHTML=`<p class="follow-status" role="status">选择曲谱后，可以整曲跟弹，也可以只练一段。</p>
 <label class="follow-instrument">练习乐器<select name="instrument" aria-label="练习乐器"></select></label>
 <div class="follow-range"><label>起始小节<input name="from" type="number" step="1" aria-label="练习起始小节"></label><span>—</span><label>结束小节<input name="to" type="number" step="1" aria-label="练习结束小节"></label><button type="button" class="small-button" data-action="range">练这一段</button></div>
 <div class="follow-tools"><button type="button" class="text-button" data-action="whole">整曲</button><button type="button" class="text-button" data-action="slower">慢练 −10</button><button type="button" class="text-button" data-action="focus">定位起点</button></div>
 <p class="follow-error" role="alert" hidden></p><div class="follow-progress"><span></span><progress max="100" value="0" aria-label="本段跟弹进度"></progress></div>
 <div class="follow-live"></div><div class="follow-review"><p class="follow-advice"></p><div class="follow-measures"></div><button type="button" class="text-button" data-action="advice">请教练习方法</button></div>
 <details class="follow-history"><summary>最近练习 <span></span></summary><div></div></details>
`;
 const grid=root.querySelector('.control-grid'),actions=root.querySelector('.practice-actions');
 root.append(section);section.querySelector('.follow-progress').after(grid,actions);
 const $=s=>section.querySelector(s);let state=null,history=[];
 try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(Array.isArray(saved))history=saved.filter(x=>x&&typeof x.version==='string'&&Number.isFinite(x.at)).slice(0,60);}catch{}
 function request(action,extra={}){let result;document.dispatchEvent(new CustomEvent('practice-command',{detail:{action,...extra,resolve:r=>result=r}}));if(result?.error){$('.follow-error').textContent=result.error;$('.follow-error').hidden=false;}else $('.follow-error').hidden=true;return result;}
 const fingeringHost=document.createElement('div');$('.follow-range').before(fingeringHost);mountPracticeFingering(fingeringHost);
 const planHost=document.createElement('div');$('.follow-history').before(planHost);const planUI=mountPracticePlan(planHost,{state:()=>state||{version:'',measures:[]},request});
 function historyView(){
  const rows=history.filter(x=>x.version===state?.version).slice(0,5),box=$('.follow-history>div');box.replaceChildren();$('.follow-history summary span').textContent=rows.length?`· ${rows.length}`:'';
  if(!rows.length){box.textContent='本曲暂无练习记录。记录只保存在此浏览器。';return;}
  for(const row of rows){const p=document.createElement('p');p.textContent=`${new Date(row.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ${row.range?`${row.range.start}–${row.range.end} 小节`:'整曲'} · ${row.bpm} BPM · ${row.evidence.observations} 条记录${row.complete?' · 完成':' · 未完成'}`;box.append(p);}
 }
 function render(next){
  if(!next)return;const changed=next.version!==state?.version,rangeChanged=JSON.stringify(next.range)!==JSON.stringify(state?.range);state=next;
  const measures=next.measures||[],ready=measures.length>0;
  const select=$('[name=instrument]'),parts=next.instruments||[];const signature=JSON.stringify(parts);if(select.dataset.parts!==signature){select.replaceChildren(...parts.map(part=>{const option=document.createElement('option');option.value=part.id;option.textContent=part.name;return option;}));select.dataset.parts=signature;}select.value=next.instrument||'';select.disabled=!ready||next.running||next.starting;
  for(const input of section.querySelectorAll('input[type=number]')){input.min=String(measures[0]??1);input.max=String(measures.at(-1)??1);input.disabled=!ready||next.running||next.starting;}
  if(changed||rangeChanged||!$('[name=from]').value){$('[name=from]').value=next.range?.start??measures[0]??'';$('[name=to]').value=next.range?.end??measures.at(-1)??'';}
  for(const button of section.querySelectorAll('button')){if(button.closest('.practice-actions,.practice-fingering'))continue;button.disabled=!ready||next.running||next.starting;}
  $('[data-action=advice]').disabled=!ready||next.running||next.starting;
  $('.follow-status').textContent=!ready?'选择曲谱后，可以整曲跟弹，也可以只练一段。':next.finishing?'正在处理最后一段听音…':next.starting?'正在准备麦克风与复音听音模型…':next.running?(next.demo?'试听中，不计入练习记录':'正在聆听 · 短窗口识别，结果稍后显示'):next.complete?'本段已练完 · 可以再练一次':next.done?'已暂停 · 再次开始可接着练':'准备就绪 · 点击开始跟弹后才会开启麦克风';
  $('.follow-progress span').textContent=ready?`${next.range?`第 ${next.range.start}–${next.range.end} 小节`:'整曲'} · ${next.bpm} BPM · ${next.done} / ${next.total} 组`:'尚未选择曲谱';$('.follow-progress progress').value=next.total?Math.min(100,next.done/next.total*100):0;
  root.querySelector('#start-button').textContent=next.starting?'正在开启…':next.complete?'再练一遍':next.done&&!next.demo?'继续跟弹':'开始跟弹';root.querySelector('#reset-button').textContent=next.range?'回到本段起点':'从头练习';
  const ev=next.evidence;$('.follow-live').textContent=ev?`本次 ${ev.observations} 条匹配记录 · ${ev.measures.filter(m=>m.wrong+m.missed+m.extra>0).length} 个小节待核对`:'';
  $('.follow-advice').textContent=practiceAdvice(ev,next.bpm);const box=$('.follow-measures');box.replaceChildren();
  for(const number of ev?.reviewMeasures.slice(0,4)||[]){const m=ev.measures.find(x=>x.measure===number),button=document.createElement('button');button.type='button';button.className='small-button';button.textContent=`第 ${number} 小节 · ${m.wrong+m.missed+m.extra} 条差异`;button.disabled=next.running||next.starting;button.onclick=()=>{request('range',{start:number,end:number});request('focus');};box.append(button);}
  if(ev&&!next.running&&!next.starting&&next.session){const row={id:next.session,version:next.version,at:Date.now(),range:next.range,bpm:next.bpm,complete:next.complete,evidence:ev};history=[row,...history.filter(x=>x.id!==row.id)].slice(0,60);try{localStorage.setItem(KEY,JSON.stringify(history));$('.follow-history').title='记录只保存在此浏览器';}catch{$('.follow-history').title='浏览器存储不可用，本次记录暂存于内存';}}
  historyView();planUI.update(next);
 }
 section.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(action==='range')request(action,{start:Number($('[name=from]').value),end:Number($('[name=to]').value)});
  else if(action==='advice'){
   const ev=state?.evidence,summary=ev?{observations:ev.observations,reviewMeasures:ev.reviewMeasures.slice(0,4),measures:ev.measures.filter(m=>ev.reviewMeasures.slice(0,4).includes(m.measure)).map(({pitchPairs,...m})=>m)}:null;const prompt=`请根据当前曲谱，给我具体、简短、可操作的${state.instruments?.find(p=>p.id===state.instrument)?.name||'钢琴'}练习方法。范围：${state.range?`第${state.range.start}至${state.range.end}小节`:'整曲'}，速度${state.bpm} BPM。${ev?'麦克风匹配摘要（可能识别有误，不代表演奏能力）：'+JSON.stringify(summary):'还没有实弹记录，请仅依据谱面提出分段和慢练建议，不要虚构演奏问题。'}请指出先练哪一处、怎么练；无法从谱面或记录判断的地方明确说明。不要替我开启麦克风或自动播放。`;
   document.dispatchEvent(new CustomEvent('ai-compose',{detail:{text:prompt+'请同时提供可以应用到跟弹区域的分段练习计划，使用 practice_plan 动作。',practice:true,resolve:result=>{if(result?.error){$('.follow-error').textContent=result.error;$('.follow-error').hidden=false;}}}}));
  }else request(action);
 });
 $('[name=instrument]').onchange=e=>request('instrument',{id:e.target.value});
 document.addEventListener('practice-state',e=>render(e.detail));request('state');
}
