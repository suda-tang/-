// The one place a style id is turned into Chinese. Both the preset picker and
// the title of the score that opens use it, so a new preset cannot end up
// labelled with the wrong name (the woodwind quartet used to open as 鼓伴奏).
export const ARRANGEMENT_NAMES={original:'原谱',drums:'原谱加鼓',chamber:'室内弦乐',orchestra:'管弦乐',strings:'弦乐四重奏',woodwinds:'木管四重奏',brass:'铜管四重奏',custom:'自选编制'};
const programs={0:'salamander',4:'electric_piano_1',8:'celesta',16:'church_organ',24:'acoustic_guitar_nylon',26:'acoustic_guitar_steel',29:'acoustic_guitar_steel',32:'contrabass',33:'contrabass',40:'violin',41:'viola',42:'cello',43:'contrabass',46:'orchestral_harp',47:'contrabass',48:'string_ensemble_1',50:'string_ensemble_1',52:'string_ensemble_1',55:'string_ensemble_1',56:'trumpet',57:'trombone',58:'trombone',60:'french_horn',61:'french_horn',64:'clarinet',66:'clarinet',67:'bassoon',68:'oboe',69:'oboe',70:'bassoon',71:'clarinet',72:'flute',73:'flute',80:'electric_piano_1',88:'electric_piano_2'};
export function applyArrangement(score,data){
 const accompanimentCount=data.tracks.filter(t=>!t.drums&&t.name!=='Piano').length;
 const doc=new DOMParser().parseFromString(data.xml,'application/xml');const parts=[...doc.querySelectorAll('score-partwise > part')];
 const definitions=[...doc.querySelectorAll('score-part')];const byPart=new Map();
 for(const part of parts){const definition=definitions.find(d=>d.id===part.id);const name=definition?.querySelector('part-name')?.textContent;const program=Number(definition?.querySelector('midi-program')?.textContent||1)-1;const percussion=!!part.querySelector('unpitched');const candidates=data.tracks.filter(t=>!!t.drums===percussion);const track=candidates.find(t=>t.name===name)||candidates.find(t=>t.program===program);byPart.set(part.id,track);}
 for(const e of score.events)for(const n of e.notes){const track=byPart.get(n.part);if(!track)continue;n.instrument=track.drums?'drums':programs[track.program]||'salamander';const match=track.notes.filter(x=>x.midi===n.midi&&Math.abs(x.beat-e.beat)<.2).sort((a,b)=>Math.abs(a.beat-e.beat)-Math.abs(b.beat-e.beat))[0];if(match){n.generatedVelocity=match.velocity;n.generatedDelay=Math.max(-.03,Math.min(.12,match.beat-e.beat));}n.gainScale=track.drums?.7:track.program===0?1:.8;}
 for(const e of score.events)for(const n of e.notes)if(n.instrument&&n.instrument!=='salamander'&&n.instrument!=='drums')n.gainScale=.48/Math.sqrt(Math.max(1,accompanimentCount));
 score.generated=true;score.arrangementKey=data.key;return score;
}
export function initArrangements({getScore,request,message,open}){
 const panel=document.createElement('section');panel.className='arrangement-studio unified-arrangement';panel.id='arrangement-workspace';
 const select=document.querySelector('#arrangement-select');select.closest('label').remove();select.replaceChildren();select.hidden=true;
 panel.innerHTML='<h3>作品改编</h3><div class="arrangement-presets"></div><div class="custom-programs" hidden></div><label class="drum-option"><input id="generation-drums" type="checkbox">加入鼓声部</label><button class="primary" id="generate-arrangement">生成总谱</button><p class="arrangement-status" role="status">原谱保留，生成结果保存到云端。</p><details class="saved-scores"><summary>已生成总谱</summary><div class="saved-arrangements"></div></details>';
 panel.prepend(select);document.querySelector('.playback-panel').append(panel);
 const custom=panel.querySelector('.custom-programs'),presets=panel.querySelector('.arrangement-presets'),saved=panel.querySelector('.saved-arrangements');
 select.onchange=()=>{custom.hidden=select.value!=='custom';};let remote=[],signature='';
 const names=ARRANGEMENT_NAMES;
 function choices(capabilities){
  for(const style of capabilities.styles){
   const option=document.createElement('option');option.value=style.id;option.textContent=style.name;select.append(option);
   const button=document.createElement('button');button.type='button';button.className='preset-choice';button.textContent=style.name;button.dataset.style=style.id;button.setAttribute('aria-pressed',String(style.id==='chamber'));
   button.onclick=()=>{select.value=style.id;select.dispatchEvent(new Event('change'));for(const other of presets.children)other.setAttribute('aria-pressed',String(other===button));};presets.append(button);
  }
  select.value='chamber';
  for(const program of capabilities.programs||[]){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=program.id;input.name='arrangement-program';label.append(input,program.name);custom.append(label);}
 }
 const offlineCapabilities={styles:[{id:'original',name:'原谱加鼓'},{id:'chamber',name:'室内乐'},{id:'orchestra',name:'管弦乐'},{id:'strings',name:'弦乐四重奏'},{id:'woodwinds',name:'木管四重奏'},{id:'brass',name:'铜管四重奏'},{id:'custom',name:'自选编制'}],programs:[['三角钢琴',0],['电钢琴',4],['钢片琴',8],['管风琴',16],['尼龙吉他',24],['爵士吉他',26],['过载吉他',29],['原声贝斯',32],['指弹贝斯',33],['小提琴',40],['中提琴',41],['大提琴',42],['低音提琴',43],['竖琴',46],['定音鼓',47],['弦乐合奏',48],['合成弦乐',50],['合唱',52],['乐队齐奏',55],['小号',56],['长号',57],['大号',58],['圆号',60],['铜管合奏',61],['高音萨克斯',64],['次中音萨克斯',66],['上低音萨克斯',67],['双簧管',68],['英国管',69],['巴松',70],['单簧管',71],['短笛',72],['方波主奏',80],['氛围音色',88]].map(([name,id])=>({name,id}))};
 request('/api/arrangement-capabilities').then(choices).catch(()=>{choices(offlineCapabilities);panel.querySelector('.arrangement-status').textContent='已显示全部编制。刷新后若仍不能生成，请重启本机服务以载入新配器引擎。';});
 function draw(){
  const digest=getScore()?.serverId||getScore()?.sourceDigest,rows=remote.filter(t=>t.kind==='arrangement'&&t.digest===digest);
  const next=digest+JSON.stringify(rows.map(t=>[t.id,t.status,t.progress,t.detail]));if(next===signature)return;signature=next;saved.replaceChildren();
  if(!rows.length){saved.textContent='暂无已保存的改编';return;}
  for(const task of rows){const params=typeof task.params==='string'?JSON.parse(task.params):task.params||{};const card=document.createElement('div');card.className='arrangement-job';card.dataset.status=task.status;const row=document.createElement('button');row.className='small-button';const progress=Math.round(Math.max(0,Math.min(100,Number(task.progress)||0)));row.textContent=(names[params.style]||'改编')+(params.drums?' + 鼓':'')+'　'+(task.status==='complete'?'打开':`${progress}%`);row.disabled=task.status!=='complete';row.onclick=()=>open(task);const bar=document.createElement('progress');bar.max=100;bar.value=progress;bar.setAttribute('aria-label',row.textContent);const detail=document.createElement('small');detail.textContent=task.stage||task.detail||'等待空闲处理';card.append(row,bar,detail);saved.append(card);}
  if(rows.some(t=>['running','queued'].includes(t.status)))panel.querySelector('details').open=true;
 }
 document.addEventListener('cloud-jobs-update',event=>{remote=event.detail;draw();});
 panel.querySelector('#generate-arrangement').onclick=async event=>{
  const digest=getScore()?.serverId||getScore()?.sourceDigest;if(!digest)return message('请先打开云曲谱','warning');
  const style=select.value,drums=panel.querySelector('#generation-drums').checked||style==='original',programs=[...custom.querySelectorAll('input:checked')].map(el=>Number(el.value));
  if(style==='custom'&&(!programs.length||programs.length>8))return message('请选择 1–8 个乐器声部','warning');
  const button=event.currentTarget;button.disabled=true;
  try{await request(`/api/scores/${digest}/arrange`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({style,drums,...(style==='custom'?{programs}:{})})});panel.querySelector('.arrangement-status').textContent='已加入任务队列，空闲时生成。当前演奏可继续。';panel.querySelector('details').open=true;}
  catch(error){message(/请选择原谱.*室内乐.*管弦乐/.test(error.message)?'本机仍在运行旧版服务。请重启钢琴服务后再生成，木管四重奏等新编制已包含在更新中。':error.message,'error');}finally{button.disabled=false;}
 };
}
