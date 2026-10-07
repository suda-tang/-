import {reportTask} from './task-center.js?v=folded-groups1';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function readableNetworkError(error){
 const text=String(error?.message||error||'');
 // AI 服务自己的故障要和「连不上」分开说。以前 401 会原样透出
 // 「401 Client Error: Unauthorized for url: http://127.0.0.1:8765/...」——
 // 用户看到的是 Python 内部错误，根本不知道该做什么（报告 B4）。
 // ★ 措辞不要出现「本地模型」「本机模型服务」：助手对外只有一个身份 SUPERTANG AI。
 if(/401|Unauthorized/i.test(text))return 'SUPERTANG AI 鉴权失败（401）：服务端的访问凭据可能已失效，请在服务器电脑上重启 AI 服务后重试。';
 if(/403|Forbidden/i.test(text))return 'SUPERTANG AI 拒绝了这次请求（403），请检查服务器上的 AI 服务配置。';
 if(/429|Too Many Requests|rate.?limit/i.test(text))return 'SUPERTANG AI 请求过于频繁（429），请稍等十几秒再试。';
 if(/HTTP\s*5\d\d|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out/i.test(text))return 'SUPERTANG AI 服务端出错了（5xx），通常稍后重试即可；若持续出现，请查看服务器电脑上的 AI 服务日志。';
 if(['AbortError','TimeoutError'].includes(error?.name)||/fetch is aborted|signal.*abort/i.test(text))return '请求等待超时或连接被中止，操作尚未完成。请重试；若持续出现，请检查外网隧道连接。';
 if(error?.name==='TypeError'||/load failed|failed to fetch/i.test(text))return 'AI 请求未能连接服务，网络或隧道连接已中断。';
 return text||'连接失败';
}
async function requestAI(payload,onEvent,signal){
 const isConnectionError=error=>['TypeError','AbortError','TimeoutError','SyntaxError'].includes(error?.name)||/load failed|failed to fetch|network|连接已结束/i.test(error?.message||'');
 const deadline=signal||AbortSignal.timeout(300000);
 try{
  const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,stream:true}),signal:deadline});
  if(!response.ok){const data=await response.json();throw Error(data.error||'AI 服务返回 HTTP '+response.status);}
  if(!response.body?.getReader)throw new TypeError('此浏览器未提供流式响应');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
  const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.text);if(event.type==='result')result=event;else onEvent(event);};
  for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);if(done){consume(buffer);break;}}
  if(!result)throw new TypeError('连接已结束，但操作方案未接收完整');return result;
 }catch(error){
  // 用户主动关掉对话时中止的请求，不要当成「连接中断」去重试 —— 那会在后台白跑两次。
  if(signal?.aborted)throw error;
  if(!isConnectionError(error))throw error;
  onEvent({type:'reset'});onEvent({type:'status',text:'AI 连接中断，正在改用完整响应重新获取操作方案；尚未执行任何操作…'});
  for(let attempt=0;attempt<2;attempt++){
   try{const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,stream:false}),signal:AbortSignal.timeout(120000)});const data=await response.json();if(!response.ok)throw Error(data.error||'AI 服务返回 HTTP '+response.status);onEvent({type:'delta',text:data.reply||''});return data;}
   catch(next){if(signal?.aborted)throw next;if(!isConnectionError(next))throw next;if(attempt===1)throw Error('AI 服务连接连续中断，流式和完整响应均未成功。自动重连已尝试两次，尚未执行操作；请检查当前网址的服务或 FRP 隧道是否在线。');await wait(800);}
  }
 }
}
function init(){
 if(document.querySelector('#workspace-ai'))return;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(ios)document.documentElement.classList.add('ios-low-memory');
 const nav=document.querySelector('.workspace-nav');if(!nav)return;
 const trigger=document.createElement('button');trigger.id='workspace-ai';trigger.type='button';trigger.innerHTML='<span>AI</span><svg class="ai-task-ring" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="ai-task-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#74bfff"/><stop offset=".5" stop-color="#bf88ef"/><stop offset="1" stop-color="#f8a487"/></linearGradient></defs><circle cx="24" cy="24" r="22"/></svg>';trigger.setAttribute('aria-label','打开 SUPERTANG AI');const dock=document.createElement('div');dock.className='ai-navigation-dock';nav.before(dock);dock.append(nav,trigger);
 const dialog=document.createElement('dialog');dialog.className='ai-conversation';
 dialog.innerHTML='<div class="ai-screen-aura" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="ai-history-frame"><div class="ai-messages" role="log" aria-live="polite"></div></div><form><input aria-label="告诉我你想做什么" placeholder="告诉我你想做什么" maxlength="2000" required><button type="submit" aria-label="发送">↑</button><button type="button" class="ai-close" aria-label="关闭">×</button></form>';
 document.body.append(dialog);const log=dialog.querySelector('.ai-messages'),input=dialog.querySelector('input'),form=dialog.querySelector('form');let messages=[],executedActions=[],busy=false,transitioning=false,selectedScoreId=null,lastUserText="";
 // 这一轮操作跑完后，是否还有事情要用户来定（列出曲谱、联网结果、被回绝、报错）。
 // 没有的话 AI 面板就保持收回状态，不挡着谱面 —— 见 runActions 结尾。
 let awaitingUser=false;
 // 关掉对话时要能中止在途请求：否则用户以为关了，服务端还在跑，回复还会把对话重新弹开。
 let abortCurrent=null,userClosed=false,cancelledByUser=false;
 // 给请求同时挂上「超时」和「用户关闭」两个中止源。
 const deadline=ms=>abortCurrent?.signal&&typeof AbortSignal.any==='function'?AbortSignal.any([abortCurrent.signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
 // ★ 上下文预算已经全部放开（后端 MAX_MESSAGE_CHARS=60000 / CONTEXT_CHARS=120000，
 //   包装层 WEB_PROMPT_LIMIT=150000），所以这里**不再为了省字数截断对话**：
 //   以前 messages 只留 40 条、发给模型只留 24 条，长会话里最早的 user 指令会被挤掉，
 //   模型就忘了用户到底要什么（报告 B3）。
 //   唯一保留的是纯渲染层的保护 —— 节点无上限会让长时间开着的页面内存一直涨，
 //   这只影响「看得见的历史」，不影响发给模型的任何内容。
 function trimConversation(){while(log.children.length>600)log.firstElementChild.remove();}
 // 发给模型的历史：整段对话原样发出，不截断、也不做「只保第一条」的取舍。
 function historyForModel(){return messages;}
 function line(text,role='assistant'){if(role==='assistant'&&aiTask)taskLines.push(text);trimConversation();const p=document.createElement('p');p.className=role;p.textContent=text;log.append(p);log.scrollTop=log.scrollHeight;}
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 const operation=document.createElement('div');operation.className='ai-operation-layer';operation.innerHTML='<div class="ai-screen-aura" aria-hidden="true"><i></i><i></i><i></i><i></i></div><span role="status"></span>';document.body.append(operation);
 let taskPercent=0,aiTask=null,saveTimer=0,saveChain=Promise.resolve(),taskLines=[];
 function taskReport(changes){if(!aiTask)return;aiTask={...aiTask,...changes,updated:Date.now()};reportTask(aiTask.id,aiTask);clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const snapshot={...aiTask};saveChain=saveChain.catch(()=>{}).then(async()=>{const r=await fetch('/api/ai-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('AI 任务保存失败');}).catch(e=>console.warn(e));},changes.status==='complete'||changes.status==='failed'?0:300);}
 // 页面被关掉 / 刷新 / 崩溃时，下面的 finally 根本不会执行，任务就永远挂在「进行中」
 // （测试报告 #8，实测积了 8 条）。后端有 10 分钟 TTL 兜底，这里再补一个即时上报，
 // 让任务中心当场就能看到「中断」，而不是等十分钟。
 const reportInterrupted=()=>{
  if(!aiTask||aiTask.status!=='running')return;
  const body=JSON.stringify({...aiTask,status:'failed',detail:'中断：页面已关闭或刷新，这次请求没有跑完。',updated:Date.now()});
  try{navigator.sendBeacon('/api/ai-tasks',new Blob([body],{type:'application/json'}));}catch{}
 };
 addEventListener('pagehide',reportInterrupted);

 function taskProgress(percent,label){taskPercent=Math.max(taskPercent,Math.min(100,percent));trigger.dataset.taskProgress=String(Math.round(taskPercent));trigger.style.setProperty('--ai-task-progress',taskPercent/100);trigger.classList.add('has-task');trigger.title=label+' '+Math.round(taskPercent)+'%';trigger.setAttribute('aria-label',trigger.title);operation.querySelector('span').textContent=trigger.title;taskReport({progress:Math.round(taskPercent),detail:label});}
 async function showResults(){while(transitioning)await wait(30);if(!dialog.open)await trigger.onclick({result:true});log.scrollTop=log.scrollHeight;}
 // 操作已经做完、面板收回时，用一小条气泡把结果说一句。
 // 为什么需要：runActions 一开头就把面板收回（要腾出屏幕执行操作），
 // 执行过程中 line() 写的「已暂停播放」「速度已设为 120 BPM」都在收回的面板里，
 // 用户看不到；光靠按钮上的进度圈说不清「刚才那步到底成没成」。
 let settleTimer=0;
 function settle(text){
  if(!text)return;
  const pill=document.createElement('div');pill.className='ai-settle-pill';pill.textContent=text;
  document.body.append(pill);requestAnimationFrame(()=>pill.classList.add('is-visible'));
  clearTimeout(settleTimer);settleTimer=setTimeout(()=>{pill.classList.remove('is-visible');setTimeout(()=>pill.remove(),420);},4600);
 }
 const labels={panel:'切换工作区',view:'切换谱面',search:'查找曲谱',open:'打开曲谱',play:'开始播放',pause:'暂停播放',stop:'停止播放',solo:'选择独奏声部',solo_group:'声部分组',mute:'调整声部',unmute:'恢复声部',set_tempo:'调整速度',set_metronome:'开关节拍器',set_instrument:'切换音色',set_arrangement:'选择配器',generate_arrangement:'生成总谱',web_search:'联网搜索',skill_search:'查找技能',choose_scores:'列出曲谱',seek_measure:'定位小节',chords:'提取和弦',score_report:'核对曲谱'};
// 动作执行后回读界面，确认它真的生效了。
// 为什么需要：AI 常说「我来处理」并发回动作，但动作在界面上什么都没改变 ——
// 这类「嘴上说好了、界面没动」的失败最难发现，只能靠执行后回读来兜住。
const PANELS=['library','play','arrange','tasks'];
// 模型常把面板写成中文名或别名（「演奏」「任务中心」）。以前认不出来就一律退回曲库，
// 于是「切换到演奏」会跳到曲库——看着像执行了，其实跑偏。这里先归一，认不出才退回曲库。
const PANEL_ALIAS={library:'library',曲库:'library',乐谱库:'library',乐谱:'library',play:'play',演奏:'play',播放:'play',弹奏:'play',arrange:'arrange',改编:'arrange',tasks:'tasks',任务:'tasks',任务中心:'tasks'};
const panelValue=value=>PANEL_ALIAS[String(value??'').trim().toLowerCase()]||'library';
const KNOWN_TYPES=new Set(['view','solo_group','choose_scores','panel','search','open','chords','score_report','seek_measure','play','pause','stop','solo','mute','unmute','set_tempo','set_metronome','set_instrument','set_arrangement','generate_arrangement','skill_search','web_search']);
// ★ 破坏性动作在**前端也拦一道**：后端 ai_workspace 的 FORBIDDEN_TYPES 是第一道闸，
//   这里补第二道 —— 万一以后新增了动作类型、或绕过模型直连的路径把这类动作送进来，
//   也不允许碰云曲库。放在 KNOWN_TYPES 之前判定，否则会先落进「暂时不支持这个操作」，
//   触发一轮注定失败的「重新核对」（白调一次模型），而不是明确回绝。
const FORBIDDEN_TYPES=new Set(['delete','delete_score','delete_scores','delete_song','remove','remove_score','remove_scores','remove_song','clear','clear_score','clear_scores','purge','trash','wipe','uninstall','overwrite','overwrite_score','replace_score','reset','reset_score','destroy','drop','erase','unlink','rm','delete_file','delete_pdf']);
const REFUSAL='我不会删除或改动云曲库里的曲谱，这条我不做。可以帮你打开、播放、调速度、换音色或改配器。';
// 声部名称对不上就用显示名模糊匹配：模型回「左手」而选项里是「Left Hand」时也能命中。
function findPart(value){const want=String(value??'').trim();if(!want)return null;
 const options=parts();return options.find(p=>p.value===want)||options.find(p=>p.name&&(p.name.includes(want)||want.includes(p.name)))||null;}
function findMixes(value){
 const want=String(value??'').trim();
 const inputs=[...document.querySelectorAll('#part-mix input[data-part]')];
 // 「全部静音」以前必然失败：这里只认单个声部名，'all' 找不到就报错，
 // 于是触发一次注定无效的「重新核对」重试（测试报告 A4）。整组返回即可。
 if(/^(all|全部|所有|全部声部|全部乐器|所有声部)$/i.test(want))return inputs;
 if(!want)return [];
 const one=inputs.find(x=>x.dataset.part===want)||inputs.find(x=>{const name=x.parentElement?.querySelector('span')?.textContent||'';return name&&(name.includes(want)||want.includes(name));});
 return one?[one]:[];
}
// 下拉框按「value 精确 → 文本精确 → 文本包含 → 反向包含」四级匹配。
// 模型给的是中文名（「管弦乐」「大提琴」），而 option.value 常是英文 id（orchestra）。
function findOption(select,value){
 const want=String(value??'').trim();if(!select||!want)return null;
 const options=[...select.options];
 return options.find(o=>o.value===want)||options.find(o=>o.textContent.trim()===want)
  ||options.find(o=>o.textContent.includes(want))||options.find(o=>want.includes(o.textContent.trim()))||null;
}
function snapshot(){
 const play=document.querySelector('#play-button'),select=document.querySelector('#part-solo-select');
 return {panel:document.body.dataset.workspace||'',
  // 四个谱面视图都要认：以前只认五线谱/简谱，切到「原稿」或「音轨」时回读永远是空串，
  // 于是 view 动作会被误判成「执行后界面没有变化」。
  viewMode:(()=>{const on=id=>document.querySelector('#'+id)?.classList.contains('active');return on('notation-button')?'engraved':on('simple-button')?'simple':on('original-button')?'pdf':on('daw-button')?'daw':'';})(),
  title:document.querySelector('#score-title')?.textContent||'',
  // ★ 曲谱 id 才是唯一标识。重名曲谱（《知足》×2、《星海欢迎你》×3…）标题完全一样，
  //   「换另一首《知足》」成功后 title 不变 → 只比 title 会把「真的换成了另一份」
  //   误判成「执行后界面没有变化，可能没有真正生效」，把 AI 的正确回复覆盖成报警。
  //   library.js 每次打开曲谱都会写 body.dataset.currentScoreId，这里同步读即可。
  scoreId:document.body.dataset.currentScoreId||'',
  playing:play?play.textContent.trim():'',playDisabled:play?play.disabled:null,
  solo:select?select.value:'',muted:[...document.querySelectorAll('#part-mix input')].filter(x=>!x.checked).map(x=>x.dataset.part),
  // 这四个是「控件类」动作的回读依据：速度/节拍器/音色/配器改没改，只能看控件本身。
  tempo:document.querySelector('#tempo')?.value||'',metronome:!!document.querySelector('#metronome')?.checked,
  instrument:document.querySelector('#instrument-select')?.value||'',arrangement:document.querySelector('#arrangement-select')?.value||'',
  position:document.querySelector('#position')?.textContent||'',logLines:log.children.length};
}
// 每种动作预期会改动哪些字段；产出文字/按钮的动作以「对话多了一行」为准。
// view 看谱面按钮的选中态（切谱面不会动工作区面板），solo_group 看声部勾选。
const EXPECT={panel:['panel'],view:['viewMode'],open:['title','scoreId'],play:['playing','playDisabled'],pause:['playing','playDisabled'],stop:['playing','playDisabled'],solo:['solo'],mute:['muted'],unmute:['muted'],solo_group:['solo','muted'],set_tempo:['tempo'],set_metronome:['metronome'],set_instrument:['instrument'],set_arrangement:['arrangement'],generate_arrangement:['logLines'],seek_measure:['position'],chords:['logLines'],score_report:['logLines'],search:['logLines'],web_search:['logLines'],skill_search:['logLines'],choose_scores:['logLines']};
// 回读留一个观察窗口：切面板、换谱面这类改动要过一帧才落到 DOM，
// 立刻比对会把「其实成功了」误判成「没生效」。已经站在目标面板上则直接算完成。
async function verifyAction(a,before){
 const keys=EXPECT[a.type];if(!keys)return true;
 if(a.type==='panel'&&before.panel===panelValue(a.value))return true;
 // ★ 重名曲谱（《知足》×2、《星海欢迎你》×3…）：两份标题完全一样，「换另一首」成功后
 //   title 不变 —— 只比 title 会把「真的换成了另一份」误判成「执行后界面没有变化」，
 //   于是 AI 的正确回复被报警覆盖（长流程报告 #52）。
 //   权威判据是**当前曲谱 id**，但它只能从 live context（异步事件）读到，所以这里单独判。
 if(a.type==='open'){
  const want=String(a.value||'');
  if(want)for(let i=0;i<6;i++){if(await currentScoreId()===want)return true;await wait(120);}
 }
 const changed=()=>{const after=snapshot();return keys.some(key=>JSON.stringify(before[key])!==JSON.stringify(after[key]));};
 for(let i=0;i<12;i++){await wait(60);if(changed())return true;}
 return false;
}
 async function readCloudLibrary(){
  const cached=window.cloudLibrarySnapshot;if(cached?.scores&&Date.now()-cached.saved<60000)return {scores:cached.scores};
  const response=await fetch('/api/scores',{priority:'high',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('曲库读取失败');const data=await response.json();window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};return data;
 }
 function readLiveContext(){return Promise.race([new Promise(resolve=>document.dispatchEvent(new CustomEvent('ai-workspace-context',{detail:{resolve}}))),new Promise((_,reject)=>setTimeout(()=>reject(Error('播放工作区尚未响应，请关闭并重新打开 AI')),3000))]);}
 async function currentScoreId(){try{const live=await readLiveContext();return live?.currentId||null;}catch(e){return null;}}
// ★ 把**当前控件值**一起发给模型。CONTROLS 只是「能做哪些事」的能力清单，**不含任何当前值**，
//   于是「快一点 / 慢一点 / 太吵了」这类**相对**指令模型没有基准，只能反问或瞎猜一个绝对
//   数字（长流程报告 #29）。后端把整个 context 原样 JSON 进提示词，所以这里加上就通。
//   放在 workspace-ai.js 而不是 app.js：后者是多会话共用的在途文件，不宜整文件提交。
function currentSettings(){
 const num=el=>{const v=Number(el?.value);return Number.isFinite(v)?v:null;};
 return {tempo:num(document.querySelector('#tempo')),metronome:!!document.querySelector('#metronome')?.checked,instrument:(document.querySelector('#instrument-select')?.selectedOptions?.[0]?.textContent||'').trim()||null,arrangement:document.querySelector('#arrangement-select')?.value||null};
}
// ★ 全站**唯一**的 context 构造入口。主流程以前在别处手工拼了第二份（漏了 settings），
//   于是「快一点 / 慢一点」的基准永远到不了后端 —— 长流程 #29 的波动就是这么来的。
//   以后要加 context 字段**只改这里**，不要再手工拼一份。
async function workspaceContext(extra){const data=await readCloudLibrary();const live=await readLiveContext();return {...libraryContext(data.scores),...live,language:document.documentElement.lang,controls:CONTROLS,settings:currentSettings(),parts:parts(),current:document.querySelector('#score-title')?.textContent,...extra};}
 async function repairActions(failed,error,completed){line('操作没有完成，正在重新核对曲谱、声部和播放位置…');const context=await workspaceContext();const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:historyForModel(),context:{...context,executed:executedActions.slice(-12)},repair:{failed,error:readableNetworkError(error),completed}}),signal:deadline(110000)});const result=await response.json();if(!response.ok)throw Error(result.error);line(result.reply);if(!result.actions?.length)throw Error('重新核对后仍无法完成：'+error.message);return result.actions;}
 async function runActions(actions,summary=''){if(!actions.length)return false;actions=[...actions];let repairCount=0,unverified=0;const failedStates=new Set();const completed=[];awaitingUser=false;await close();document.body.classList.add('ai-executing');trigger.disabled=true;taskPercent=0;taskProgress(0,'准备操作');try{for(let i=0;i<actions.length;i++){const a=actions[i];taskProgress(i/actions.length*100,labels[a.type]||'正在操作');const snapBefore=snapshot();try{const outcome=await action(a,p=>taskProgress((i+p)/actions.length*100,labels[a.type]||'正在操作'));if(outcome!=='skipped'&&!await verifyAction(a,snapBefore)){unverified++;line('注意：'+(labels[a.type]||'这一步')+'执行后界面没有变化，可能没有真正生效。');}}catch(error){const signature=JSON.stringify(a)+'|'+error.message;if(repairCount>=2||failedStates.has(signature))throw error;failedStates.add(signature);repairCount++;const replacement=await repairActions(a,error,completed);actions.splice(i,actions.length-i,...replacement.slice(0,6));i--;continue;}completed.push(a);executedActions.push({type:a.type,value:a.value});if(executedActions.length>30)executedActions=executedActions.slice(-30);taskProgress((i+1)/actions.length*100,labels[a.type]||'正在操作');}if(unverified)line('这一步里共有 '+unverified+' 个子操作执行后界面没有变化，可能没有真正生效。建议换个更具体的说法再试一次（例如直接点曲名或说面板名）。');taskProgress(100,'已完成');await wait(reduced()?0:350);}catch(error){trigger.classList.add('task-failed');throw error;}finally{document.body.classList.remove('ai-executing');trigger.disabled=false;}
 // ★ 操作已经做完（比如已经在自动演奏）就把面板收回，不挡着谱面；只有还需要用户拍板
 //   （列出曲谱、联网结果、被回绝、报错）时才把面板留在眼前。
 if(awaitingUser){await showResults();return true;}
 settle(summary||('已完成：'+[...new Set(completed.map(a=>labels[a.type]||a.type))].join('、')));
 return false;}


 let layoutFrame=0;
 function visibleLayout(){const v=window.visualViewport;const width=v?.width||innerWidth,height=v?.height||innerHeight,left=v?.offsetLeft||0,top=v?.offsetTop||0;const w=Math.min(560,width-32);return {width:w,left:left+(width-w)/2,top:top+height-74,height};}
 function syncViewport(){if(!dialog.open||transitioning)return;const v=visibleLayout();dialog.style.width=v.width+'px';dialog.style.left=v.left+'px';dialog.style.top=v.top+'px';dialog.style.setProperty('--ai-history-height',Math.max(80,v.height-118)+'px');}
 function scheduleViewport(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(syncViewport);}
 window.visualViewport?.addEventListener('resize',scheduleViewport);window.visualViewport?.addEventListener('scroll',scheduleViewport);addEventListener('resize',scheduleViewport);input.addEventListener('focus',scheduleViewport);

 let dockMotion=null,dockExpanded=false;
 function animateDock(expanded){
  const current=getComputedStyle(nav).transform;const matrix=new DOMMatrixReadOnly(current==='none'?undefined:current);const from=matrix.m41;
  const bounds=nav.getBoundingClientRect(),area=dock.getBoundingClientRect();
  const target=expanded?area.left+area.width/2-(bounds.left+bounds.width/2-from):0;
  dockMotion?.cancel();dockExpanded=expanded;nav.style.transform=`translateX(${target}px)`;
  if(reduced())return;
  const delta=target-from;
  dockMotion=nav.animate([
   {transform:`translateX(${from}px) scaleX(1)`,offset:0},
   {transform:`translateX(${target+delta*.09}px) scaleX(1.018)`,offset:.65},
   {transform:`translateX(${target-delta*.025}px) scaleX(.996)`,offset:.85},
   {transform:`translateX(${target}px) scaleX(1)`,offset:1}
  ],{duration:640,easing:'cubic-bezier(.22,.75,.25,1)'});
 }
 addEventListener('resize',()=>{if(dockExpanded)animateDock(true);});
 async function morphSurface(from,to,duration){
  const surface=document.createElement('div');surface.className='ai-morph-surface';
  Object.assign(surface.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px'});
  surface.setAttribute('popover','manual');document.body.append(surface);surface.showPopover?.();
  const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/to.width,sy=from.height/to.height;
  try{await surface.animate([{transform:`translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})`},{transform:'translate3d(0,0,0) scale(1,1)'}],{duration:reduced()?0:duration,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'}).finished;}finally{surface.hidePopover?.();surface.remove();}
 }
 async function close(){if(!dialog.open||transitioning)return;transitioning=true;animateDock(false);const from=dialog.getBoundingClientRect();input.blur();const to=trigger.getBoundingClientRect();document.body.classList.remove('ai-listening');dialog.classList.add('is-morphing');dialog.style.opacity='0';try{await morphSurface(from,to,480);}finally{dialog.close();dialog.style.opacity='';dialog.classList.remove('is-morphing');trigger.style.opacity='';trigger.focus({preventScroll:true});transitioning=false;}}
 // 用户主动关闭（× 或 Esc）。注意不能把这个中止逻辑放进 close() 本身：
 // runActions 开头也会调 close()，那时 busy 仍为 true，会把「用户关闭」的标记错误地置上。
 function closeByUser(){if(busy&&abortCurrent){userClosed=true;abortCurrent.abort();}return close();}
 trigger.onclick=async event=>{if(transitioning)return;transitioning=true;const from=trigger.getBoundingClientRect();dialog.style.width=from.width+'px';dialog.style.left=from.left+'px';dialog.style.top=from.top+'px';dialog.classList.add('is-morphing');dialog.style.opacity='0';dialog.showModal();if(!event?.result)input.focus({preventScroll:true});trigger.style.opacity='0';animateDock(true);requestAnimationFrame(()=>document.body.classList.add('ai-listening'));
 // Focus first; wait for the keyboard viewport to settle before choosing the destination.
 if(matchMedia('(pointer:coarse)').matches&&!reduced()){await new Promise(resolve=>{let settle;const v=window.visualViewport;const finish=()=>{clearTimeout(settle);clearTimeout(deadline);v?.removeEventListener('resize',changed);resolve();};const changed=()=>{clearTimeout(settle);settle=setTimeout(finish,120);};const deadline=setTimeout(finish,650);v?.addEventListener('resize',changed);});}
 const layout=visibleLayout(),{width,top,left}=layout;dialog.style.width=width+'px';dialog.style.left=left+'px';dialog.style.top=top+'px';try{await morphSurface(from,{left,top,width,height:57},520);}finally{dialog.style.opacity='';dialog.classList.remove('is-morphing');transitioning=false;syncViewport();}};dialog.querySelector('.ai-close').onclick=closeByUser;dialog.addEventListener('cancel',e=>{e.preventDefault();void closeByUser();});
 async function spotlight(el){if(!el)return;el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('ai-operating');try{await wait(matchMedia('(prefers-reduced-motion:reduce)').matches?0:650);}finally{el.classList.remove('ai-operating');}}
 // 播放传输控制。暂停/停止以前没有独立入口，只能借 play —— 而 ai-play-score 的语义是
 // 「确保在播放」，于是用户说「暂停」音乐反而响起来。现在走独立事件，由 app.js 明确实现。
 function transport(command){return new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-transport',{detail:{command,resolve,reject}})));}
 // 速度必须走这个入口，不能直接改 #tempo 的值：
 // app.js 的 setTempo() 开头是 `if(running)return`（跟练进行中不许改），
 // 直接改值再 dispatch change 会被静默丢弃，而这里照样会打印「速度已设为 X BPM」。
 // 走事件才能拿到「到底改没改」的真话。
 function applyTempo(value){return new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-set-tempo',{detail:{value,resolve,reject}})));}
 function characterStream(){let queue=[],timer=0,node=null,finished=false,resolve;const drained=new Promise(r=>resolve=r);function tick(){timer=0;if(queue.length){if(!node){node=document.createElement('p');node.className='assistant ai-streaming-text';log.append(node);}const char=queue.shift();if(node.lastChild?.nodeType===Node.TEXT_NODE)node.lastChild.appendData(char);else node.append(document.createTextNode(char));log.scrollTop=log.scrollHeight;timer=setTimeout(tick,18);}else if(finished){node?.classList.remove('ai-streaming-text');resolve();}}return {push(text){queue.push(...Array.from(text));if(!timer)timer=setTimeout(tick,0);},finish(){finished=true;if(!timer)tick();return drained;},cancel(){clearTimeout(timer);queue=[];node?.classList.remove('ai-streaming-text');resolve();}};}
 const parts=()=>[...document.querySelectorAll('#part-solo-select option')].map(o=>({value:o.value,name:o.textContent}));
// 曲库清单必须「索引 + 完整 id 列表」一起发，两者分工不同，缺一不可：
//   · library 紧凑索引（一行「共 N 首：a/b/c」）—— 负责「有几首/都有哪些」。
//     模型数串数不准（实测把 75 首数成 92），给它现成数字才答得对；
//     只发带 id 的清单时它又会自作主张按 ready 过滤，实测 65 首只答出 54 首。
//   · scores 完整 {id,title,ready} —— 负责 open。后端 ai_workspace 用 context.scores
//     当 id 白名单（不在表里就判「选择了不存在的曲谱」），清单为空时模型路径下的
//     open 一律失败，只能退化成 search。
// ★ 曾经为了省额度改成「只有问云曲库+声部/和弦时才附 id」，结果把「打开曲谱」整条路砍断：
//   实测「我要听《起风了》」变成 play value="起风了"（去播当前那首），「打开《月亮代表我的心》」
//   只剩 search。现在 system 段上限已从 4000 放开到 20000，8854 字符的完整上下文装得下，
//   实测「索引 + 完整清单」同发：列全率 65/65，open 也能拿到真实 id。
function libraryContext(scores){
 const titles=scores.map(c=>c.title).filter(Boolean);
 const index='共'+titles.length+'首：'+titles.join('/');
 // ★ 带上 status：曲库里有一批 status=failed 却 ready=true 的记录（实测 5 首：
 // 未命名曲谱/兰亭序/晚安/周杰伦/12.31），只发 {id,title,ready} 的话模型看不出来，
 // 就会把它们当正常曲目推荐出去 —— 用户点了必然播不出来（报告 #14）。
 // ★ saved（上传时间）**只在重名条目上带**：它唯一的用途是区分同名曲谱
 //   （后端 choose_payload 用它生成 hover 提示，见 ai_workspace.py 的 saved_label）。
 //   79 首全带上会白占 1000+ 字符 —— 曲库还会长，上下文预算要省着用。
 const counts={};for(const t of titles)counts[t]=(counts[t]||0)+1;
 return {library:index,scores:scores.map(c=>({id:c.id,title:c.title,ready:c.ready,status:c.status||'',...(c.title&&counts[c.title]>1?{saved:c.saved||0}:{})}))};
}
// 界面上真实存在的控件清单。模型看不见它就会答「不支持」，
// 或者跑去 GitHub 找 "tempo control plugin"（测试报告 B1/C5）。
// 只列 AI 真能操作的，不列纯展示元素，避免把模型引到没实现的路上。
const CONTROLS=[
 '演奏速度 set_tempo 30–240 BPM（原谱 BPM 会显示在旁）',
 '节拍器 set_metronome 开/关（音量 metronome-volume 0.1–1，界面上手动调）',
 '音色 set_instrument（音乐会钢琴/三角钢琴等，选项见 #instrument-select）',
 '配器 set_arrangement（原谱/原谱加鼓/室内乐/管弦乐/弦乐四重奏/木管四重奏/铜管四重奏/自选编制），generate_arrangement 生成总谱',
 '播放声部 solo 独奏 / solo_group 声部分组 / mute 静音 / unmute 取消静音（值用 context.parts 里的真实声部名，mute/unmute 用 all 表示全部）',
 '谱面 view：engraved 五线谱 / simple 简谱 / pdf 原稿 / daw 音轨',
 '和弦分析 chords（value=all 或 piano）；score_report 核对全部声部的拍号、时值、力度和曲谱档案；支持结合实际小节的练习建议',
 '播放 pause 暂停 / stop 停止并回到开头 / play 开始播放 / seek_measure 跳到第 N 小节',
 '工作区面板 panel：library 曲库 / play 演奏 / arrange 改编 / tasks 任务',
 '跟练相关（start-button 开始跟练、sensitivity 麦克风灵敏度 1–5）目前不支持用指令调整'
].join('；');
 async function watchImport(id){for(let i=0;i<240;i++){await wait(5000);try{const r=await fetch('/api/scores');const data=await r.json();const score=data.scores?.find(x=>x.id===id);if(score?.ready){document.querySelector('.library-refresh')?.click();await wait(1800);await action({type:'open',value:id});await action({type:'play'});line('识谱完成，已开始播放。');return;}if(score?.status==='failed'){line('识谱失败，请到任务中心查看详细原因。');return;}}catch(e){line('自动打开没有完成：'+e.message);return;}}line('识谱仍在后台处理，请到任务中心查看。');}
 async function action(a,onProgress=()=>{}){
 // 删除/清空/覆盖云曲库的动作：明确回绝，且**不要**走「重新核对」——
 // 那是给「动作参数不对、值得换个写法再试」用的，删除不是这类问题，重试多少次都不该做。
 if(FORBIDDEN_TYPES.has(String(a.type||'').toLowerCase())){line(REFUSAL);awaitingUser=true;return 'skipped';}
 // 不认识的动作直接报错走「重新核对」，不要静默空转——那是「AI 说好了但什么都没发生」的主力来源。
 if(!KNOWN_TYPES.has(a.type))throw Error('暂时不支持这个操作：'+a.type);
  if(a.type==='pause'||a.type==='stop'){
   const command=a.type==='pause'?'pause':'stop';
   try{await transport(command);}
   catch(error){
    // 「本来就没在播放」不算失败。当成错误会白跑一轮「重新核对」（多一次模型调用、约十秒），
    // 还会给用户一句「操作没有完成」—— 什么都没坏，只是没什么可暂停的。
    if(/没有在播放|不需要暂停/.test(error.message)){line('当前没有在播放，'+(command==='pause'?'不需要暂停。':'已经停在开头了。'));return;}
    throw error;
   }
   line(command==='pause'?'已暂停播放。':'已停止播放，并回到开头。');return;
  }
  if(a.type==='set_tempo'){
   const asked=Number(String(a.value).replace(/[^\d.]/g,''));
   if(!Number.isFinite(asked)||asked<=0)throw Error('没有听懂要调到多少速度：'+a.value);
   const applied=await applyTempo(asked);
   line('速度已设为 '+applied.tempo+' BPM。');return;
  }
  if(a.type==='set_metronome'){
   const raw=String(a.value).trim(),off=/^(0|off|false|关|关闭|关掉|停|停用|不要|no)$/i.test(raw);
   const on=off?false:/^(1|on|true|开|开启|打开|启用|是|yes)$/i.test(raw);
   if(!on&&!off)throw Error('没有听懂节拍器要开还是要关：'+raw);
   const box=document.querySelector('#metronome');if(!box)throw Error('界面上没有节拍器开关');
   if(box.checked===on){line('节拍器已经是'+(on?'开启':'关闭')+'状态，不需要改。');return;}
   await spotlight(box.parentElement);box.checked=on;box.dispatchEvent(new Event('change',{bubbles:true}));
   line('节拍器已'+(on?'开启':'关闭')+'。');return;
  }
  if(a.type==='set_instrument'){
   const select=document.querySelector('#instrument-select');const hit=findOption(select,a.value);
   if(!hit)throw Error('没有这个音色：'+a.value);
   await spotlight(select.parentElement);select.value=hit.value;select.dispatchEvent(new Event('change',{bubbles:true}));
   line('音色已切换为「'+hit.textContent.trim()+'」。');return;
  }
  if(a.type==='set_arrangement'){
   // 配器的可见控件是改编面板里的预设按钮（点它会同步隐藏的 #arrangement-select），
   // 所以优先点按钮，而不是去改那个 hidden 的下拉框。
   await action({type:'panel',value:'arrange'});
   const want=String(a.value).trim();
   const presets=[...document.querySelectorAll('.arrangement-presets .preset-choice')];
   const button=presets.find(b=>b.dataset.style===want)||presets.find(b=>b.textContent.trim()===want)
    ||presets.find(b=>b.textContent.includes(want))||presets.find(b=>want.includes(b.textContent.trim()));
   if(!button)throw Error('没有这个配器方案：'+want+(presets.length?'（可选：'+presets.map(b=>b.textContent.trim()).join('、')+'）':''));
   await spotlight(button);button.click();
   line('配器已选择「'+button.textContent.trim()+'」。需要生成总谱就说「生成'+button.textContent.trim()+'」。');return;
  }
  if(a.type==='generate_arrangement'){
   await action({type:'panel',value:'arrange'});
   const button=document.querySelector('#generate-arrangement');if(!button)throw Error('界面上没有生成总谱按钮');
   if(button.disabled)throw Error('生成总谱按钮当前不可用，请先打开一首云端曲谱');
   await spotlight(button);button.click();line('已提交生成总谱，进度可以在改编面板或任务中心查看。');return;
  }
  if(a.type==='view'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-set-view',{detail:{mode:a.value,resolve,reject}})));return;}
  if(a.type==='solo_group'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-solo-group',{detail:{ids:(Array.isArray(a.value)?a.value:JSON.parse(a.value)),resolve,reject}})));return;}
  // 下面四种动作会把「待选的东西」写进对话（曲谱按钮、网页链接）——必须让用户看见，所以留面板。
  if(a.type==='choose_scores'){awaitingUser=true;const items=(Array.isArray(a.value)?a.value:JSON.parse(a.value));if(!items.length){line('没有找到可以打开的曲谱。换个曲名或歌手再说一次，或者直接点曲库里的卡片。');return;}for(const item of items){const button=document.createElement('button');button.type='button';
   // 「识谱中」和「识谱失败」是两回事，别都写成识谱中 —— 失败的那批点开也播不出来。
   button.textContent=item.title+(item.status==='failed'?'（识谱失败）':item.ready===false?'（识谱中）':'');
   if(item.evidence)button.title=item.evidence;button.onclick=()=>{if(busy)return;selectedScoreId=item.id;input.value=lastUserText;form.requestSubmit();};log.append(button);}return;}

  // 已经站在目标面板上就别再点一遍：省掉 650ms 的聚光动画，也不会被回读当成「没生效」。
  if(a.type==='panel'){const value=panelValue(a.value);if(document.body.dataset.workspace===value)return;const el=document.querySelector(`.workspace-nav [data-panel="${value}"]`);await spotlight(el);el?.click();return;}
  if(a.type==='search'){
   awaitingUser=true;await action({type:'panel',value:'library'});
   const terms=String(a.value||'').replace(/的歌|歌曲|播放/g,'').trim();
   if(!terms){line('你想找哪一首？说个曲名或歌手，我就去曲库里翻。');return;}
   const catalog=(await readCloudLibrary()).scores||[];
   let hits=catalog.filter(item=>String(item.title||'').toLowerCase().includes(terms.toLowerCase()));
   if(!hits.length){
    const response=await fetch('/api/scores/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:terms,scores:catalog.map(({id,title})=>({id,title}))}),signal:deadline(90000)});
    const result=await response.json();if(!response.ok)throw Error(result.error||'曲库搜索失败');const ids=new Set(result.ids||[]);hits=catalog.filter(item=>ids.has(item.id));if(result.warning)line(result.warning);
   }
   line(hits.length?'找到 '+hits.length+' 首相关曲谱，请选择：':'曲库里没有找到，要在网上查找吗？');
   let offset=0;const more=document.createElement('button');more.type='button';more.textContent='更多结果';
   const reveal=()=>{more.remove();for(const item of hits.slice(offset,offset+12)){const choice=document.createElement('button');choice.type='button';choice.textContent=item.title+(item.ready?'':'（尚未就绪）');choice.onclick=async()=>{choice.disabled=true;try{await runActions([{type:'open',value:item.id},...(item.ready?[{type:'play',value:''}]:[])]);}catch(error){line(readableNetworkError(error));}finally{choice.disabled=false;}};log.append(choice);}offset+=12;if(offset<hits.length)log.append(more);};more.onclick=reveal;reveal();
   messages.push({role:'assistant',content:'曲库实际结果：'+JSON.stringify(hits.map(({id,title,ready})=>({id,title,ready}))) });return;
  }
  if(a.type==='score_report'){
   awaitingUser=true;
   const ident=a.value||await currentScoreId();if(!ident)throw Error('请先选择曲谱');
   onProgress(.15);const response=await fetch('/api/scores/'+encodeURIComponent(ident)+'/profile',{signal:deadline(90000)});const result=await response.json();if(!response.ok)throw Error(result.error||'曲谱档案读取失败');onProgress(.9);
   line('《'+result.title+'》：'+result.measureCount+' 小节，'+result.parts.length+' 个声部。'+(result.tempo?'原谱速度 '+result.tempo+' BPM。':'谱面未提供明确速度。'));
   line(result.parts.map(part=>part.name+'：'+part.notes+' 个音符'+(part.staves.length>1?'，'+part.staves.length+' 行谱表':'')).join('；')+'。');
   line(result.writtenDynamics?'谱面包含 '+result.writtenDynamics+' 处力度信息，可以沿用原谱。':'未检出明确力度标记；这不代表作品没有表情要求。');
   const issues=result.issues||[];line(issues.length?'有 '+issues.length+' 处记谱疑点，需对照原稿核对；未改动音符或节奏。':'未发现时值检查能确定的异常；仍需对照原稿核对音高与声部。');
   let offset=0;const more=document.createElement('button');more.type='button';more.textContent='更多核对位置';
   const show=()=>{more.remove();for(const issue of issues.slice(offset,offset+12)){const part=result.parts.find(p=>p.value===issue.part);const label='第 '+issue.measure+' 小节 '+(part?.name||'')+'：'+issue.message;const button=document.createElement('button');button.type='button';button.textContent=label;button.title='定位试听这一小节';button.onclick=()=>void runActions([{type:'seek_measure',value:String(issue.measure)}]).catch(error=>line(readableNetworkError(error)));log.append(button);taskLines.push(label);}offset+=12;if(offset<issues.length)log.append(more);};more.onclick=show;show();onProgress(1);return;
  }
  if(a.type==='open'){
   // 实测抓到的主力失败：后端路由听不懂指令时，兜底会把「打开当前这首」当成动作发回来
   // （0.07 秒返回，根本没过模型）。于是「把钢琴静音」「上网找卡农」「换一首」全都变成
   // 重新打开同一首曲谱 —— 界面动了动画、看起来在干活，其实什么都没变。
   // 这里认出这种「自己打开自己」，直接说没听懂，别让用户以为在执行。
   const liveId=await currentScoreId();
   if(liveId&&a.value===liveId){line('这条指令我没有听懂。它被理解成了「重新打开当前这首曲谱」，界面不会有变化。请换个说法，例如想关掉某个乐器就说「关闭钢琴声部」，想找网上的谱就说「网上找《卡农》」；也可以直接点曲库里的曲子。');return 'skipped';}
   await action({type:'panel',value:'library'});
   const card=[...document.querySelectorAll('.library-score')].find(c=>c.dataset.scoreId===a.value);if(card)await spotlight(card);
   await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-open-score',{detail:{id:a.value,resolve,reject,onProgress}})));
  }
  if(a.type==='chords'){awaitingUser=true;const result=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-analyze-chords',{detail:{part:a.value,resolve,reject,onProgress}})));const known=result.chords.filter(c=>c.name).length;
   // 三个数分开说。以前只说「N 个得到和弦候选，其余需核对」，而下面按小节列了全部行，
   // 用户会觉得「说 8 个却列了 35 行」是错的（报告 #6）。把总数/命中/待核对都写出来。
   line('《'+result.title+'》：共分析 '+result.chords.length+' 个小节，其中 '+known+' 个得到和弦候选，另有 '+(result.chords.length-known)+' 个需核对。以下按小节列出，属于音符匹配结果，不是已核定的和声分析。');line(result.chords.map(c=>'第 '+c.measure+' 小节：'+(c.name||'待核对')).join('\n'));messages.push({role:'assistant',content:JSON.stringify(result)});return;}
  // ★ 这个事件的 resolve **可能永不触发**，必须加超时兜底。
  //   链路：ai-seek-measure → app.js 监听器 await playFromNote → playScore，
  //   而 playScore 里有 `await player.unlock()` / `await player.play()` ——
  //   没有用户手势时受浏览器自动播放策略限制会挂住，于是 resolve 一直不调用，
  //   runActions 就卡在这一步直到外层 deadline，用户看到的是「整个流程莫名卡死」。
  //   正常路径 resolve 很快（实测各 seek 用例都通过），这里只是兜底：
  //   · resolve → 继续；· reject（小节不存在）→ 照旧抛错走 repair；· 15 秒没动静 → 当完成放行。
  //   （为什么是 15 秒：音源加载通常 5~10 秒，10 秒太紧 —— 长流程 #2 实测就是被
  //    「10 秒就放行、可播放还没起来」误伤的。放行后 verifyAction 仍比对 position。）
  //   （放行后 verifyAction 仍会比对 position，真没跳过去会如实报「界面没有变化」。）
  if(a.type==='seek_measure'){await spotlight(document.querySelector('#sheet-scroll'));await new Promise((resolve,reject)=>{
   const timer=setTimeout(resolve,15000);
   const done=()=>{clearTimeout(timer);resolve();};
   const fail=error=>{clearTimeout(timer);reject(error);};
   document.dispatchEvent(new CustomEvent('ai-seek-measure',{detail:{measure:Number(a.value),resolve:done,reject:fail}}));
  });}
  // 模型会用 play 的 value 带速度意图（tempo=1.2 表示「再快一点」），
  // 也常把「暂停/停止」塞进同一个 value（测试报告 A1）。
  // 后者必须拦住：ai-play-score 的语义是「确保在播放」，不拦就会「说暂停反而开始播放」。
  if(a.type==='play'){const el=document.querySelector('#play-button');if(!el||el.disabled)throw Error('请先载入一首已经识别好的曲谱');
   const raw=String(a.value||'').trim();
   if(!/tempo/i.test(raw)){
    if(/暂停|pause/i.test(raw)){await transport('pause');line('已暂停播放。');return;}
    if(/^(stop|停止|停下|停|别放|不要放|关掉播放)/i.test(raw)){await transport('stop');line('已停止播放，并回到开头。');return;}
   }
   const wanted=/tempo\s*=\s*([0-9.]+)/.exec(raw);
   if(wanted){const input=document.querySelector('#tempo');if(input){const current=Number(input.value)||80,asked=Number(wanted[1]);
    const target=asked>=30?asked:current*asked;const next=Math.round(Math.min(240,Math.max(30,target)));
    const applied=await applyTempo(next);line('速度已设为 '+applied.tempo+' BPM（原 '+Math.round(current)+'）。');}}
   await spotlight(el);await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-play-score',{detail:{resolve,reject}})));}
  if(a.type==='solo'){const select=document.querySelector('#part-solo-select');const hit=findPart(a.value);if(!hit)throw Error('当前曲谱没有这个声部');await spotlight(select);select.value=hit.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
  if(a.type==='mute'){const els=findMixes(a.value);if(!els.length)throw Error('当前曲谱没有这个声部');let closed=0;
   for(const el of els){if(!el.checked)continue;await spotlight(el.parentElement);el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));closed++;}
   if(els.length>1)line(closed?'已关闭全部 '+closed+' 个声部。':'这些声部本来就都已经关闭了。');}
  // 静音以前是单向的：只能关不能开，用户说「把钢琴打开」时模型没法表达（报告 #13）。
  if(a.type==='unmute'){const els=findMixes(a.value);if(!els.length)throw Error('当前曲谱没有这个声部');let opened=0;
   for(const el of els){if(el.checked)continue;await spotlight(el.parentElement);el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));opened++;}
   if(!opened)line('这些声部本来就是开启的。');
   else if(els.length>1)line('已恢复全部 '+opened+' 个声部。');
   else line('已恢复「'+(els[0].parentElement?.querySelector('span')?.textContent||'该声部')+'」。');}
  if(a.type==='skill_search'){
   awaitingUser=true;
   const response=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'skills',query:a.value}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Error(result.error);line(result.notice);for(const item of result.results){line(item.title+' — '+item.description+'（许可：'+item.license+'）');const link=document.createElement('a');link.href=item.url;link.textContent='查看开源项目';link.target='_blank';link.rel='noopener';log.append(link);}if(!result.results.length)line('没有找到匹配的 Skill，请补充功能描述。');return;
  }
  if(a.type==='web_search'){
   const r=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'search',query:a.value}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Error(result.error);
   // 以前这里写「直接 PDF 可以导入」，但实测乐谱站几乎不给直链 PDF（报告 #7），
   // 于是用户等半天、按钮也不出现。改成实话实说，并把来源标出来。
   line(result.results.length?'找到这些页面，可以点开查看：':'没有找到可用结果，可以换个曲名再试。');
   if(result.notice)line(result.notice);
   for(const item of result.results){const link=document.createElement('a');link.textContent=item.title+(item.source?'（'+item.source+'）':'');link.href=item.url;link.target='_blank';link.rel='noopener';log.append(link);if(item.directPdf){const button=document.createElement('button');button.textContent='导入这份谱';button.onclick=async()=>{button.disabled=true;try{line('正在下载并提交识谱…');const response=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'import',url:item.url,title:a.value}),signal:AbortSignal.timeout(90000)});const data=await response.json();if(!response.ok)throw Error(data.error);line('已加入识谱队列；完成后会尝试打开并播放。');await action({type:'panel',value:'tasks'});void watchImport(data.id);}catch(e){line(readableNetworkError(e));}finally{button.disabled=false;}};log.append(button);}}
  }
 }
 form.onsubmit=async e=>{e.preventDefault();
 // 忙的时候这个按钮变成「停止」。报告 B6：中位 6.3 秒、最大 58 秒，用户只能干等。
 // 复用同一个圆形按钮（不新增控件，省得打乱已有的紧凑布局）。
 if(busy){cancelledByUser=true;abortCurrent?.abort();return;}
 const text=input.value.trim();if(!text)return;lastUserText=text;busy=true;abortCurrent=new AbortController();userClosed=false;cancelledByUser=false;taskLines=[];aiTask={id:'ai-'+crypto.randomUUID(),label:text,created:Date.now(),kind:'ai',status:'running',progress:0,detail:'读取曲库'};taskReport({});trigger.classList.remove('task-failed','has-task');taskPercent=0;dialog.classList.add('is-thinking');input.value='';messages.push({role:'user',content:text});line(text,'user');const send=form.querySelector('button[type="submit"]');send.textContent='■';send.setAttribute('aria-label','停止这次请求');send.classList.add('is-cancel');const status=document.createElement('p');status.className='ai-operation-detail';const statusText=document.createElement('span');const statusClock=document.createElement('span');statusClock.className='ai-wait-clock';status.append(statusText,statusClock);log.append(status);let statusTimer=0;function streamStatus(text){clearInterval(statusTimer);statusText.textContent='';const chars=Array.from(text);let index=0;statusTimer=setInterval(()=>{if(index>=chars.length){clearInterval(statusTimer);return;}statusText.textContent+=chars[index++];log.scrollTop=log.scrollHeight;},12);}streamStatus('读取云曲库，获取当前曲谱、播放位置和可用声部…');
 // ★ 首字之前有一段「模型在思考」的空档（实测 3~7 秒，长回答可到 10 秒），
 //   状态行的打字机放完就静止了，用户会以为卡死。这里补一个秒表：
 //   每 0.5 秒刷新「已等待 N 秒」，收到第一个 delta 就停 —— 那时正文开始逐字长出来，
 //   秒表再留着反而干扰阅读。2 秒以内不显示，免得正常快响应时闪一下。
 let waitTimer=0;const waitStart=Date.now();function stopWaitClock(){clearInterval(waitTimer);waitTimer=0;statusClock.textContent='';}waitTimer=setInterval(()=>{const secs=Math.floor((Date.now()-waitStart)/1000);statusClock.textContent=secs>=2?'已等待 '+secs+' 秒…':'';},500);let reveal=characterStream();
 // 15 秒还没回来就告诉用户「还能等，也能停」，别让人以为卡死了。
 const slowHint=setTimeout(()=>{if(busy){statusText.textContent='SUPERTANG AI 仍在处理，可以点输入框右侧的方块停止这次请求。';stopWaitClock();}},15000);
 // ★ 前端超时(110s)必须**比后端的读超时(90s)长**：后端 ai_workspace 到 8765 的
 //   requests 超时是 (5, 90)，它到点会回一句准确的「SUPERTANG AI 暂时没有响应，请稍后重试。」
 //   以前前端也是 90s，两边撞在一起，前端先 abort —— 用户看到的是
 //   「请求等待超时或连接被中止…请检查外网隧道连接」，把模型没响应错怪到隧道上。
 try{const context=await workspaceContext({executed:executedActions.slice(-12),selectionId:selectedScoreId});selectedScoreId=null;const result=await requestAI({messages:historyForModel(),context},event=>{if(event.type==='reset'){const partial=log.querySelector('.ai-streaming-text');reveal.cancel();partial?.remove();reveal=characterStream();}if(event.type==='status'){streamStatus(event.text);taskReport({detail:event.text});}if(event.type==='delta'){stopWaitClock();reveal.push(event.text);}},deadline(110000));clearInterval(statusTimer);stopWaitClock();status.remove();await reveal.finish();messages.push({role:'assistant',content:result.reply});await runActions(result.actions||[],result.reply);
  // 只答应不干活：回复里满口「我来处理」却一个动作都没给，用户看到的就是什么都没发生。
  if(!result.actions?.length&&/我来处理|我来帮|马上|没问题|好的|可以[，。]?$|已经帮你/.test(String(result.reply||'')))line('这一步没有生成可执行的操作，界面不会变化。请说得更具体一点，例如「打开《…》」「切换到演奏面板」「只听左手」。');taskReport({status:'complete',progress:100,detail:result.actions?.some(a=>['choose_scores','search','web_search'].includes(a.type))?'结果已列出，等待选择':'已完成',result:[result.reply,...taskLines].filter(Boolean).join('\n\n')}); }
  // 用户自己关掉对话、或按了停止：静默收尾，不要把对话重新弹开（showResults 会 showModal）。
  catch(error){
   if(userClosed||cancelledByUser){const stopped=cancelledByUser;userClosed=false;cancelledByUser=false;reveal.cancel();clearInterval(statusTimer);status.remove();if(stopped){taskReport({status:'cancelled',detail:'已由用户停止',result:taskLines.join('\n\n')});line('已停止这次请求，界面没有变化。');}return;}
   taskReport({status:'failed',detail:readableNetworkError(error),result:taskLines.join('\n\n')});reveal.cancel();clearInterval(statusTimer);status.remove();line(readableNetworkError(error));await showResults();messages.push({role:'assistant',content:'操作未完成：'+error.message});}
  finally{clearInterval(statusTimer);stopWaitClock();clearTimeout(slowHint);clearTimeout(saveTimer);abortCurrent=null;const snapshot=aiTask?{...aiTask}:null;busy=false;dialog.classList.remove('is-thinking');send.textContent='↑';send.setAttribute('aria-label','发送');send.classList.remove('is-cancel');if(snapshot){saveChain=saveChain.catch(()=>{}).then(async()=>{const saved=await fetch('/api/ai-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(8000)});if(!saved.ok)throw Error('任务结果未能保存');}).catch(error=>console.warn('AI 任务保存失败',error));}}

 };
}
if(document.querySelector('.workspace-nav'))init();else window.addEventListener('workspace-ready',init,{once:true});
