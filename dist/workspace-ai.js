import {abortTimeout} from './abort-timeout.js';
import {targetReached} from './ai-action-state.js';
import {normalizeClassroomCommand} from './classroom-command.js';
import {classroomIntent,transportIntent,numberedWorkIntent,classroomControlIntent,classroomOperations} from './ai-classroom-intent.js';
import {renderAssistantText} from './ai-text.js';
import {offerScoreStarling} from './scorestarling-agent.js?v=music-first2';
import {webSearchCard,webResultCards} from './ai-search-cards.js';
import {validatePracticePlan} from './practice-plan.js';
import {arrangementCapabilities,configureArrangement,validateArrangementIntent} from './arrangement-intent.js';
import {reportTask,taskContext} from './task-center.js?v=home-attach3';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Task IDs do not require HTTPS-only randomUUID support.
function taskId(){if(typeof globalThis.crypto?.randomUUID==='function')return crypto.randomUUID();const bytes=new Uint8Array(16);if(globalThis.crypto?.getRandomValues){crypto.getRandomValues(bytes);return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');}return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
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
 if(['AbortError','TimeoutError'].includes(error?.name)||/fetch is aborted|signal.*abort/i.test(text))return '这次请求超时或被中断，操作没有完成。谱面较大或本机网络较慢时容易发生，可以再说一次；若反复出现，请查看服务器电脑上 5173 服务的日志（多数情况与外网隧道无关）。';
 if(error?.name==='TypeError'||/load failed|failed to fetch/i.test(text))return 'AI 请求未能连接服务，网络或隧道连接已中断。';
 return text||'连接失败';
}
async function requestAI(payload,onEvent,signal){
 const control=classroomControlIntent(payload);if(control)return control;
 const numbered=numberedWorkIntent(payload);if(numbered&&!payload.repair)return numbered;
 const transport=transportIntent(payload);if(transport)return transport;
 const classroom=classroomIntent(payload);if(classroom&&!payload.repair){onEvent?.({type:'status',text:'正在准备当前曲目的课堂设置'});return classroom;}
 // 重试只看「是不是连接/上游出问题」：HTTP 5xx（模型或网关临时不可用）、真正的传输错误
// （fetch 抛 TypeError/AbortError/TimeoutError、连接重置等）。不再靠匹配中文报错文案决定。
const isConnectionError=error=>(error?.status&&error.status>=500)||['TypeError','AbortError','TimeoutError','SyntaxError'].includes(error?.name)||/failed to fetch|load failed|network|connection|timeout|timed?out|abort|reset|econn|socket|断线|连接/i.test(error?.message||'');
 const deadline=signal||AbortSignal.timeout(300000);
 try{
  const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,stream:true}),signal:deadline});
  if(!response.ok){const data=await response.json().catch(()=>({}));const e=Error(data.error||('AI 服务返回 HTTP '+response.status));e.status=response.status;throw e;}
  if(!response.body?.getReader)throw new TypeError('此浏览器未提供流式响应');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result=null;
  const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.text);if(event.type==='result')result=event;else onEvent(event);};
  for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);
   // ★ 关键修复（2026-10-11）：以前只在 done（连接关闭）时跳出。实测浏览器里这条流迟迟不关闭，
   //   reader.read() 一直挂着 → requestAI 永不返回 → runActions 永远不执行（谱面/速度/静音全没反应），
   //   且 busy 永久卡住，后续每句都只能「先排队」。result 事件就是这条流的终点，收到即可收工。
   if(result&&!result.partial){try{void reader.cancel();}catch{}buffer='';break;}
   if(done){consume(buffer);break;}}
  if(!result)throw new TypeError('连接已结束，但操作方案未接收完整');
  if(!payload.emptyRecovery&&!result.actions?.length&&/这一轮模型没有返回可用内容|不确定你想让我执行哪一步/.test(result.reply||'')){
   onEvent?.({type:'status',text:'正在保留原要求，重新核对可执行步骤'});
   const original=[...payload.messages||[]].reverse().find(m=>m.role==='user')?.content||'';
   return requestAI({...payload,emptyRecovery:true,messages:[...payload.messages||[],{role:'user',content:'继续完成原请求：'+original+'。结合当前作品和课堂状态使用已有功能执行，不要要求我重复原话。'}]},onEvent,deadline);
  }
  return result;
 }catch(error){
  // 用户主动关掉对话时中止的请求，不要当成「连接中断」去重试 —— 那会在后台白跑两次。
  if(signal?.aborted)throw error;
  if(!isConnectionError(error))throw error;
  onEvent({type:'reset'});onEvent({type:'status',text:'AI 连接中断，正在改用完整响应重新获取操作方案；尚未执行任何操作…'});
  for(let attempt=0;attempt<3;attempt++){
   try{const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,stream:false}),signal:AbortSignal.timeout(180000)});const data=await response.json().catch(()=>({}));if(!response.ok){const e=Error(data.error||('AI 服务返回 HTTP '+response.status));e.status=response.status;throw e;}onEvent({type:'delta',text:data.reply||''});return data;}
   catch(next){if(signal?.aborted)throw next;if(!isConnectionError(next))throw next;if(attempt===1)throw Error('AI 服务连接连续中断，流式和完整响应均未成功。自动重连已尝试两次，尚未执行操作；请检查当前网址的服务或 FRP 隧道是否在线。');await wait(800);}
  }
 }
}
function init(){
 if(document.querySelector('#workspace-ai')&&!document.querySelector('#workspace-ai[data-pending-controller]'))return;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(ios)document.documentElement.classList.add('ios-low-memory');
 const nav=document.querySelector('.workspace-nav');if(!nav)return;
 const trigger=document.querySelector('#workspace-ai[data-pending-controller]')||document.createElement('button');delete trigger.dataset.pendingController;trigger.disabled=false;trigger.id='workspace-ai';trigger.type='button';trigger.innerHTML='<span>AI</span><svg class="ai-task-ring" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="ai-task-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#74bfff"/><stop offset=".5" stop-color="#bf88ef"/><stop offset="1" stop-color="#f8a487"/></linearGradient></defs><circle cx="24" cy="24" r="22"/></svg>';trigger.setAttribute('aria-label','打开 SUPERTANG AI');const dock=nav.closest('.ai-navigation-dock')||document.createElement('div');dock.className='ai-navigation-dock';if(!dock.isConnected)nav.before(dock);dock.append(nav,trigger);
 const dialog=document.createElement('dialog');dialog.className='ai-conversation';
 dialog.innerHTML='<div class="ai-screen-aura" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="ai-history-frame"><div class="ai-messages" role="log" aria-live="polite"></div></div><form><input aria-label="告诉我你想做什么" placeholder="告诉我你想做什么" maxlength="2000"><button type="submit" aria-label="发送">↑</button><button type="button" class="ai-close" aria-label="关闭">×</button></form>';
 document.body.append(dialog);const log=dialog.querySelector('.ai-messages'),input=dialog.querySelector('input'),form=dialog.querySelector('form');let submissionQueue=Promise.resolve();let messages=[],executedActions=[],busy=false,transitioning=false,closeRequested=false,selectedScoreId=null,lastUserText="";
 const historyFrame=dialog.querySelector('.ai-history-frame');let historyFrameTick=0;
 const resizeHistory=new ResizeObserver(()=>{cancelAnimationFrame(historyFrameTick);historyFrameTick=requestAnimationFrame(()=>{const height=log.children.length?log.getBoundingClientRect().height:0;historyFrame.style.height=height+'px';historyFrame.classList.toggle('has-content',height>0);});});
 resizeHistory.observe(log);

 form.noValidate=true;
 let practiceRequest=false;
 document.addEventListener('ai-compose',async event=>{if(busy||transitioning){event.detail.resolve?.({error:'请等待当前对话结束'});return;}practiceRequest=!!event.detail.practice;input.value=String(event.detail.text||'').slice(0,2000);await trigger.onclick({});input.focus({preventScroll:true});event.detail.resolve?.({ok:true});});
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
 // ★ 动作执行期间（runActions 已把面板收回腾屏幕），这些**短回执**用户当场根本看不到；
 //   而服务端的回复随后也会进同一个日志 —— 面板再打开就变成「同一件事说两遍」
 //   （实测：停止播放 → 「已停止播放《知足》，现在回到开头。」+「已停止播放，并回到开头。」）。
 //   ⚠ 压制范围必须收窄：和弦清单、检索结果、跟弹正确率这些**结果内容也是走 line() 渲染的**，
 //   一刀切会把它们一起吞掉。所以只压「短、单行、且以确认语开头」的；其余一律照常显示。
 //   另外被压制的回执仍计入 suppressedLogCount —— verifyAction 用 logLines 判断
 //   「导出/循环/音量/和弦分析」这类动作是否生效，否则会被误判成「没有真正生效」。
 let inActionPhase=false,suppressedLogCount=0;
 const ACTION_WARN_RE=/注意|失败|没有找到|未完成|无法|不能|请先|超时|中断|仍在|排队|错误|没有变化/;
 const ACTION_CONFIRM_RE=/^(已|好的|速度已|节拍器已|节拍器已经是|音色已|编制、|配器已|只播第|分段建议已)/;
 function line(text,role='assistant'){if(role==='assistant'&&aiTask)taskLines.push(text);const _s=String(text||'');if(role==='assistant'&&tourOwned&&inActionPhase&&_s.length<=48&&!_s.includes('\n')&&ACTION_CONFIRM_RE.test(_s)&&!ACTION_WARN_RE.test(_s)){suppressedLogCount++;return;}trimConversation();const p=document.createElement(role==='assistant'?'div':'p');p.className=role;if(role==='assistant')renderAssistantText(p,text);else p.textContent=text;log.append(p);log.scrollTop=log.scrollHeight;}
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

 function taskActivity(label){operation.classList.add('is-indeterminate');trigger.classList.add('is-indeterminate');trigger.classList.add('has-task');trigger.title=label;trigger.setAttribute('aria-label','打开 SUPERTANG AI；'+label);const span=operation.querySelector('span');span.textContent=label;span.setAttribute('role','status');span.removeAttribute('aria-valuenow');taskReport({detail:label,indeterminate:true});}
 function taskProgress(percent,label){operation.classList.remove('is-indeterminate');trigger.classList.remove('is-indeterminate');taskPercent=Math.max(taskPercent,Math.min(100,percent));trigger.dataset.taskProgress=String(Math.round(taskPercent));trigger.style.setProperty('--ai-task-progress',taskPercent/100);trigger.classList.add('has-task');trigger.title=label+' '+Math.round(taskPercent)+'%';trigger.setAttribute('aria-label','打开 SUPERTANG AI；'+trigger.title);operation.querySelector('span').textContent=trigger.title;operation.style.setProperty('--ai-operation-progress',taskPercent+'%');operation.querySelector('span').setAttribute('role','progressbar');operation.querySelector('span').setAttribute('aria-valuenow',String(Math.round(taskPercent)));operation.querySelector('span').setAttribute('aria-valuemin','0');operation.querySelector('span').setAttribute('aria-valuemax','100');taskReport({progress:Math.round(taskPercent),detail:label,indeterminate:false});}
 async function showResults(){while(transitioning)await wait(30);if(!dialog.open)await trigger.onclick({result:true,origin:lastOrigin?.isConnected&&lastOrigin.getClientRects().length?lastOrigin:trigger});log.scrollTop=log.scrollHeight;}
 // 操作已经做完、面板收回时，用一小条气泡把结果说一句。
 // 为什么需要：runActions 一开头就把面板收回（要腾出屏幕执行操作），
 // 执行过程中 line() 写的「已暂停播放」「速度已设为 120 BPM」都在收回的面板里，
 // 用户看不到；光靠按钮上的进度圈说不清「刚才那步到底成没成」。
 let settleTimer=0;
 function settle(text){
  if(!text)return;
  const pill=document.createElement('div');pill.className='ai-settle-pill';renderAssistantText(pill,text);
  document.body.append(pill);requestAnimationFrame(()=>pill.classList.add('is-visible'));
  clearTimeout(settleTimer);settleTimer=setTimeout(()=>{pill.classList.remove('is-visible');setTimeout(()=>pill.remove(),420);},4600);
 }
 // ★ 2026-10-10 唐老师要求：AI 面板**不再显示任何用时**（「⏱ 本次 27.7 秒
//   （其中 AI 24.3 秒）」这类）。此前是 2026-07 要的「看得见等了多久」，
//   现在撤回 —— 秒数对用户没有意义，只会把注意力从「AI 在做什么」上拉走。
//   耗时改为**只打到 console** 供排查；面板里改成持续显示「正在做什么」。
function logLatency(result,startedAt){
 const total=(Date.now()-(startedAt||Date.now()))/1000;
 const backend=result&&typeof result.latencyMs==='number'&&result.latencyMs>0?result.latencyMs:0;
 console.info('[AI] 回复用时 '+total.toFixed(1)+'s，后端 AI '+(backend?(backend/1000).toFixed(1)+'s':'(未上报)'));
}
const labels={classroom:'控制音乐课堂',create_classroom:'生成课程与课件',practice_plan:'提供分段练习建议',configure_arrangement:'设置配器乐器',panel:'切换工作区',view:'切换谱面',search:'查找曲谱',open:'打开曲谱',play:'开始播放',pause:'暂停播放',stop:'停止播放',solo:'选择独奏声部',solo_group:'声部分组',mute:'调整声部',unmute:'恢复声部',set_tempo:'调整速度',set_metronome:'开关节拍器',set_instrument:'切换音色',set_arrangement:'选择配器',generate_arrangement:'生成总谱',web_search:'联网搜索',skill_search:'查找技能',choose_scores:'列出曲谱',seek_measure:'定位小节',chords:'提取和弦',score_report:'核对曲谱',set_part_volume:'调整声部音量',set_loop:'设置循环区间',set_range:'只播指定区间',tempo_curve:'设置速度渐变',export_score:'导出曲谱',print_score:'打印曲谱',practice_score:'读取跟弹评分'};
// 动作执行后回读界面，确认它真的生效了。
// 为什么需要：AI 常说「我来处理」并发回动作，但动作在界面上什么都没改变 ——
// 这类「嘴上说好了、界面没动」的失败最难发现，只能靠执行后回读来兜住。
const PANELS=['library','play','arrange','tasks'];
// 模型常把面板写成中文名或别名（「演奏」「任务中心」）。以前认不出来就一律退回曲库，
// 于是「切换到演奏」会跳到曲库——看着像执行了，其实跑偏。这里先归一，认不出才退回曲库。
const PANEL_ALIAS={library:'library',曲库:'library',乐谱库:'library',乐谱:'library',play:'play',演奏:'play',播放:'play',弹奏:'play',arrange:'arrange',改编:'arrange',tasks:'tasks',任务:'tasks',任务中心:'tasks'};
const panelValue=value=>PANEL_ALIAS[String(value??'').trim().toLowerCase()]||'library';
const KNOWN_TYPES=new Set(['classroom','create_classroom','practice_plan','configure_arrangement','view','solo_group','choose_scores','panel','search','open','chords','score_report','seek_measure','play','pause','stop','solo','mute','unmute','set_tempo','set_metronome','set_instrument','set_arrangement','generate_arrangement','skill_search','web_search','set_part_volume','set_loop','set_range','tempo_curve','export_score','print_score','practice_score','edit_score']);
// 乐谱精准编辑（SeraEdit）：以前这些意图被 UNSUPPORTED_EDIT_RE 判为「做不到」如实拒答，
// 现在改为生成可审查的编辑提案。提案一律要用户在面板里确认，AI 不能直接改谱。
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
  arrangementPrograms:currentSettings().arrangementPrograms,drums:currentSettings().drums,
  // suppressedLogCount：动作执行期间被压制的本地回执也计入 —— 它们确实是这次动作产生的
  // 输出，只是没往日志里画（见 line()）。不加上，EXPECT 里靠 logLines 判断的那些动作
  // （导出/循环/声部音量/和弦分析…）会被 verifyAction 误判成「执行后界面没有变化」。
  position:document.querySelector('#position')?.textContent||'',logLines:log.children.length+suppressedLogCount};
}
// 每种动作预期会改动哪些字段；产出文字/按钮的动作以「对话多了一行」为准。
// view 看谱面按钮的选中态（切谱面不会动工作区面板），solo_group 看声部勾选。
const EXPECT={configure_arrangement:['arrangement','arrangementPrograms','drums'],panel:['panel'],view:['viewMode'],open:['title','scoreId'],play:['playing','playDisabled'],pause:['playing','playDisabled'],stop:['playing','playDisabled'],solo:['solo'],mute:['muted'],unmute:['muted'],solo_group:['solo','muted'],set_tempo:['tempo'],set_metronome:['metronome'],set_instrument:['instrument'],set_arrangement:['arrangement'],generate_arrangement:['logLines'],seek_measure:['position'],chords:['logLines'],score_report:['logLines'],search:['logLines'],web_search:['logLines'],skill_search:['logLines'],choose_scores:['logLines'],set_part_volume:['logLines'],set_loop:['logLines'],set_range:['logLines'],tempo_curve:['logLines'],export_score:['logLines'],print_score:['logLines'],practice_score:['logLines']};
// 回读留一个观察窗口：切面板、换谱面这类改动要过一帧才落到 DOM，
// 立刻比对会把「其实成功了」误判成「没生效」。已经站在目标面板上则直接算完成。
async function verifyAction(a,before){
 const keys=EXPECT[a.type];if(!keys)return true;
 if(a.type==='pause'||a.type==='stop'){const live=await readLiveContext();return !live.playing;}
 if(a.type==='play'){const live=await readLiveContext();return !!live.playing;}
 const now=snapshot();
 if(targetReached(a,now))return true;
 if(a.type==='view'&&now.viewMode===a.value)return true;
 if(a.type==='solo'&&now.solo===a.value)return true;
 if(a.type==='set_tempo'&&Number(now.tempo)===Number(a.value))return true;
 if(a.type==='set_metronome'&&now.metronome===/^(1|on|true|开|开启|打开|启用|是|yes)$/i.test(String(a.value)))return true;
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
 let libraryRefresh=null;
 async function readCloudLibrary(){
  const cached=window.cloudLibrarySnapshot;
  if(cached?.scores){
   if(Date.now()-cached.saved>=60000&&!libraryRefresh){
    libraryRefresh=fetch('/api/scores',{signal:AbortSignal.timeout(25000)}).then(async r=>{if(!r.ok)throw Error('曲库刷新失败');const data=await r.json();if(Array.isArray(data.scores))window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};}).catch(error=>console.warn('[AI] 后台刷新曲库失败',error)).finally(()=>libraryRefresh=null);
   }
   return {scores:cached.scores};
  }
  try{
   const response=await fetch('/api/scores',{priority:'high',signal:AbortSignal.timeout(25000)});
   if(!response.ok)throw Error('曲库读取失败');
   const data=await response.json();window.cloudLibrarySnapshot={scores:data.scores,saved:Date.now()};return data;
  }catch(error){
   // ★ 2026-10-11：曲库读不到不该让整条 AI 请求陪葬 —— 页面刚开时 /api/scores 是 722KB，
   //   15 秒硬超时一到就 AbortError，AI 连模型都还没问就失败了。现在降级：
   //   有旧快照就用旧的，没有就空着继续问，AI 照常回答。
   console.warn('[AI] 曲库读取失败，本次降级处理',error);
   if(window.cloudLibrarySnapshot?.scores)return {scores:window.cloudLibrarySnapshot.scores,degraded:true};
   return {scores:[],degraded:true};
  }
 }
 function readLiveContext(){return Promise.race([new Promise(resolve=>document.dispatchEvent(new CustomEvent('ai-workspace-context',{detail:{resolve}}))),new Promise((_,reject)=>setTimeout(()=>reject(Error('播放工作区尚未响应，请关闭并重新打开 AI')),3000))]);}
 async function currentScoreId(){try{const live=await readLiveContext();return live?.currentId||null;}catch(e){return null;}}
// ★ 把**当前控件值**一起发给模型。CONTROLS 只是「能做哪些事」的能力清单，**不含任何当前值**，
//   于是「快一点 / 慢一点 / 太吵了」这类**相对**指令模型没有基准，只能反问或瞎猜一个绝对
//   数字（长流程报告 #29）。后端把整个 context 原样 JSON 进提示词，所以这里加上就通。
//   放在 workspace-ai.js 而不是 app.js：后者是多会话共用的在途文件，不宜整文件提交。
function currentSettings(){
 const num=el=>{const v=Number(el?.value);return Number.isFinite(v)?v:null;};
 return {tempo:num(document.querySelector('#tempo')),metronome:!!document.querySelector('#metronome')?.checked,instrument:(document.querySelector('#instrument-select')?.selectedOptions?.[0]?.textContent||'').trim()||null,arrangement:document.querySelector('#arrangement-select')?.value||null,drums:!!document.querySelector('#generation-drums')?.checked,arrangementPrograms:[...document.querySelectorAll('input[name="arrangement-program"]:checked')].map(i=>Number(i.value))};
}
// ★ 全站**唯一**的 context 构造入口。主流程以前在别处手工拼了第二份（漏了 settings），
//   于是「快一点 / 慢一点」的基准永远到不了后端 —— 长流程 #29 的波动就是这么来的。
//   以后要加 context 字段**只改这里**，不要再手工拼一份。
async function workspaceContext(extra,onProgress=()=>{}){const [data,live,classroom]=await Promise.all([readCloudLibrary(),readLiveContext(),new Promise(resolve=>{const timer=setTimeout(()=>resolve({status:'not-loaded'}),300);document.dispatchEvent(new CustomEvent('ai-classroom-context',{detail:{resolve:value=>{clearTimeout(timer);resolve(value)}}}));})]);onProgress('正在读曲库，共 '+(data.scores?.length||0)+' 首');onProgress(live.currentId?'正在读当前打开的曲谱、播放位置和练习记录':'当前没有打开云曲谱，只能按曲库里的条件回答');return {...libraryContext(data.scores),...live,classroom,agentCapabilities:{classroom:classroomOperations,workspace:[...KNOWN_TYPES],execution:'只操作已注册能力，读取真实状态，不生成任意脚本。'},panel:document.body.dataset.workspace,arrangementCapabilities:arrangementCapabilities(),tasks:taskContext(),language:document.documentElement.lang,controls:CONTROLS,settings:currentSettings(),parts:parts(),current:document.querySelector('#score-title')?.textContent,...extra};}
 async function repairActions(failed,error,completed,pending=[]){line('操作没有完成，正在重新核对曲谱、声部和播放位置…');const context=await workspaceContext();const response=await fetch('/api/workspace-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:historyForModel(),context:{...context,executed:executedActions.slice(-12)},repair:{failed,error:readableNetworkError(error),completed,pending}}),signal:deadline(110000)});const result=await response.json();if(!response.ok)throw Error(result.error);line(result.reply);if(!result.actions?.length)throw Error('重新核对后仍无法完成：'+error.message);return result.actions;}
 async function runActions(actions,summary=''){if(!actions.length)return false;actions=[...actions];let repairCount=0;const failedStates=new Set();const completed=[];awaitingUser=false;await close();inActionPhase=true;document.body.classList.add('ai-executing');trigger.setAttribute('aria-busy','true');taskPercent=0;taskProgress(0,'准备操作');try{for(let i=0;i<actions.length;i++){const a=actions[i];taskProgress(i/actions.length*100,labels[a.type]||'正在操作');const snapBefore=snapshot();try{const outcome=await action(a,p=>taskProgress((i+p)/actions.length*100,labels[a.type]||'正在操作'));if(outcome!=='skipped'&&!await verifyAction(a,snapBefore)){throw Error((labels[a.type]||'这一步')+'未通过执行后校验；请读取最新状态，修订尚未完成的操作');}}catch(error){if(a.type==='practice_plan'||(a.type==='chords'&&/没有钢琴声部/.test(error.message)))throw error;const signature=JSON.stringify(a)+'|'+error.message;if(repairCount>=2||failedStates.has(signature))throw error;failedStates.add(signature);repairCount++;const pending=actions.slice(i+1),replacement=await repairActions(a,error,completed,pending);const planned=new Set(replacement.map(x=>JSON.stringify(x)));const remaining=[...replacement,...pending.filter(x=>!planned.has(JSON.stringify(x)))];if(!remaining.length)throw Error('修复方案没有可执行步骤');actions.splice(i,actions.length-i,...remaining);i--;continue;}completed.push(a);if(tourOwned)tourActions.push({...a});executedActions.push({type:a.type,value:a.value});if(executedActions.length>30)executedActions=executedActions.slice(-30);taskProgress((i+1)/actions.length*100,labels[a.type]||'正在操作');}taskProgress(100,'已完成');await wait(reduced()?0:350);}catch(error){trigger.classList.add('task-failed');throw error;}finally{inActionPhase=false;document.body.classList.remove('ai-executing');trigger.disabled=false;trigger.removeAttribute('aria-busy');}
 // ★ 操作已经做完（比如已经在自动演奏）就把面板收回，不挡着谱面；只有还需要用户拍板
 //   （列出曲谱、联网结果、被回绝、报错）时才把面板留在眼前。
 if(awaitingUser){await showResults();return true;}
 settle(summary||('已完成：'+[...new Set(completed.map(a=>labels[a.type]||a.type))].join('、')));
 return false;}


 let layoutFrame=0;
 function visibleLayout(){const v=window.visualViewport;const width=v?.width||innerWidth,height=v?.height||innerHeight,left=v?.offsetLeft||0,top=v?.offsetTop||0;const w=Math.min(560,width-32);return {width:w,left:left+(width-w)/2,top:top+height-74,height};}
 // ★ Bug B 兜底（2026-10-11）：用户明确说「打开/播放《X》」，AI 也回了「已打开/准备《X》」，
 //   但模型偶发漏发 open 动作（代码注释 #47 记载同类「模型会漏掉打开」问题），导致谱面没切过去、
 //   用户以为成功了。整轮结束后补一道保险：曲库里确有《X》且当前没打开它，就直接补开。
 async function ensureScoreOpened(userText,replyText){
  if(transitioning)return;                                        // 视口切换中不抢；忙标记交给下方补开时自行管理
  const m=(userText||'').match(/(?:打开|播放|放一下|听一下|来一首|播一下|弹奏)[^《。！？]{0,12}《([^》]{1,100})》/);
  const target=m&&m[1]&&m[1].trim();
  if(!target)return;                                              // 用户没点名曲子就不干预
  const norm=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'');
  const t=norm(target);
  const snap=window.cloudLibrarySnapshot;
  if(!snap||!Array.isArray(snap.scores))return;
  const curId=document.body.dataset.currentScoreId;
  const curTitle=norm(document.querySelector('#score-title')?.textContent);
  if(curTitle===t)return;
  const cands=snap.scores.filter(s=>norm(s.title)===t);
  if(cands.length!==1)return;
  const ready=cands.filter(s=>s.ready);
  const pick=(ready.length?ready:cands)[0];
  if(!pick||!pick.id||pick.id===curId)return;
  line('（已自动打开《'+(pick.title||target)+'》—— 刚才那句回复没有真正切到这份谱面。）');
  busy=true;                                                      // 补开期间标记忙，避免并发输入抢同一份谱面
  try{ await runActions([{type:'open',value:pick.id}],'（自动补开）'); return true; }
  finally{ busy=false; }
 }
 function syncViewport(){if(!dialog.open||transitioning)return;const v=visibleLayout();dialog.style.width=v.width+'px';dialog.style.left=v.left+'px';dialog.style.top=v.top+'px';dialog.style.setProperty('--ai-history-height',Math.max(80,v.height-118)+'px');}
 function scheduleViewport(){cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(syncViewport);}
 window.visualViewport?.addEventListener('resize',scheduleViewport);window.visualViewport?.addEventListener('scroll',scheduleViewport);addEventListener('resize',scheduleViewport);input.addEventListener('focus',scheduleViewport);

 let dockMotion=null,dockExpanded=false,activeOrigin=trigger,lastOrigin=trigger;
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
 async function morphSurface(from,to,duration,handoff=()=>{},returning=false){
  const surface=document.createElement('div');surface.className='ai-morph-surface';
  Object.assign(surface.style,{left:to.left+'px',top:to.top+'px',width:to.width+'px',height:to.height+'px'});
  surface.setAttribute('popover','manual');document.body.append(surface);let animation,timer;
  try{
   surface.showPopover?.();
   if(returning){const label=document.createElement('span');label.className='ai-morph-label';label.textContent='AI';const style=getComputedStyle(activeOrigin?.isConnected?activeOrigin:trigger);label.style.font=style.font;label.style.color=style.color;surface.append(label);label.animate([{opacity:0,filter:'blur(3px)',offset:0},{opacity:0,filter:'blur(3px)',offset:.48},{opacity:1,filter:'blur(0px)',offset:1}],{duration:reduced()?0:duration,easing:'ease-out',fill:'both'});}
   const dx=from.left-to.left,dy=from.top-to.top,sx=from.width/Math.max(1,to.width),sy=from.height/Math.max(1,to.height);
   animation=surface.animate([{transform:`translate3d(${dx}px,${dy}px,0) scale(${sx},${sy})`},{transform:'translate3d(0,0,0) scale(1,1)'}],{duration:reduced()?0:duration,easing:'cubic-bezier(.22,.8,.25,1)',fill:'both'});
   await Promise.race([animation.finished.catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,duration+250);})]);
  }catch(error){console.warn('AI transition skipped',error);}
  finally{clearTimeout(timer);handoff();animation?.cancel();try{surface.hidePopover?.();}catch{}surface.remove();}
 }
 async function close(){if(!dialog.open)return;if(transitioning){closeRequested=true;return;}closeRequested=false;transitioning=true;if(activeOrigin===trigger)animateDock(false);const from=dialog.getBoundingClientRect();input.blur();const originBounds=activeOrigin?.isConnected?activeOrigin.getBoundingClientRect():null,returnOrigin=originBounds?.width&&originBounds?.height?activeOrigin:trigger;const to=returnOrigin.getBoundingClientRect();document.body.classList.remove('ai-listening');dialog.classList.add('is-morphing');dialog.style.opacity='0';try{await morphSurface(from,to,640,()=>{dialog.close();trigger.style.opacity='';returnOrigin.style.opacity='';},true);}finally{dialog.close();dialog.style.opacity='';dialog.classList.remove('is-morphing');trigger.style.opacity='';if(activeOrigin?.isConnected)activeOrigin.style.opacity='';returnOrigin.focus({preventScroll:true});activeOrigin=trigger;transitioning=false;}}
 // 用户主动关闭（× 或 Esc）。注意不能把这个中止逻辑放进 close() 本身：
 // runActions 开头也会调 close()，那时 busy 仍为 true，会把「用户关闭」的标记错误地置上。
 function closeByUser(){if(busy&&abortCurrent){userClosed=true;abortCurrent.abort();}return close();}
 trigger.onclick=async event=>{if(transitioning||dialog.open)return;transitioning=true;try{activeOrigin=event?.origin?.isConnected&&event.origin.getClientRects().length?event.origin:trigger;lastOrigin=activeOrigin;const from=activeOrigin.getBoundingClientRect();dialog.style.width=from.width+'px';dialog.style.left=from.left+'px';dialog.style.top=from.top+'px';dialog.classList.add('is-morphing');dialog.style.opacity='0';dialog.showModal();if(!event?.result)input.focus({preventScroll:true});trigger.style.opacity='0';activeOrigin.style.opacity='0';if(activeOrigin===trigger)animateDock(true);requestAnimationFrame(()=>document.body.classList.add('ai-listening'));
 // Focus first; wait for the keyboard viewport to settle before choosing the destination.
 if(matchMedia('(pointer:coarse)').matches&&!reduced()){await new Promise(resolve=>{let settle;const v=window.visualViewport;const finish=()=>{clearTimeout(settle);clearTimeout(deadline);v?.removeEventListener('resize',changed);resolve();};const changed=()=>{clearTimeout(settle);settle=setTimeout(finish,120);};const deadline=setTimeout(finish,650);v?.addEventListener('resize',changed);});}
 const layout=visibleLayout(),{width,top,left}=layout;dialog.style.width=width+'px';dialog.style.left=left+'px';dialog.style.top=top+'px';await morphSurface(from,{left,top,width,height:57},520);}catch(error){console.warn('AI panel could not open',error);if(dialog.open)dialog.close();document.body.classList.remove('ai-listening');trigger.style.opacity='';if(activeOrigin?.isConnected)activeOrigin.style.opacity='';if(activeOrigin===trigger)animateDock(false);activeOrigin=trigger;}finally{dialog.style.opacity='';dialog.classList.remove('is-morphing');transitioning=false;syncViewport();if(closeRequested){closeRequested=false;void close();}}};dialog.querySelector('.ai-close').onclick=closeByUser;dialog.addEventListener('cancel',e=>{e.preventDefault();void closeByUser();});
 async function spotlight(el){if(!el)return;el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('ai-operating');try{await wait(matchMedia('(prefers-reduced-motion:reduce)').matches?0:650);}finally{el.classList.remove('ai-operating');}}
 // 播放传输控制。暂停/停止以前没有独立入口，只能借 play —— 而 ai-play-score 的语义是
 // 「确保在播放」，于是用户说「暂停」音乐反而响起来。现在走独立事件，由 app.js 明确实现。
 function transport(command){return new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-transport',{detail:{command,resolve,reject}})));}
 // 速度必须走这个入口，不能直接改 #tempo 的值：
 // app.js 的 setTempo() 开头是 `if(running)return`（跟练进行中不许改），
 // 直接改值再 dispatch change 会被静默丢弃，而这里照样会打印「速度已设为 X BPM」。
 // 走事件才能拿到「到底改没改」的真话。
 function applyTempo(value){return new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-set-tempo',{detail:{value,resolve,reject}})));}
 function characterStream(){
  let queue=[],head=0,timer=0,node=null,finished=false,shown='',authoritative=null,lastPaint=0,resolve;
  const drained=new Promise(r=>resolve=r);
  function paint(){if(!node){node=document.createElement('div');node.className='assistant ai-streaming-text';log.append(node);}const follow=log.scrollHeight-log.scrollTop-log.clientHeight<80;renderAssistantText(node,shown);if(follow)log.scrollTop=log.scrollHeight;lastPaint=performance.now();}
  function tick(){
   timer=0;const remaining=queue.length-head;
   if(remaining){const count=Math.min(remaining,Math.max(2,Math.ceil(remaining/12)));shown+=queue.slice(head,head+count).join('');head+=count;if(performance.now()-lastPaint>=80||head===queue.length)paint();timer=setTimeout(tick,33);}
   else if(finished){if(authoritative!==null&&shown!==authoritative){shown=authoritative;paint();}node?.classList.remove('ai-streaming-text');resolve();}
  }
  return {push(text){queue.push(...Array.from(text));if(!timer)timer=setTimeout(tick,0);},finish(text=null){clearTimeout(timer);timer=0;authoritative=text;finished=true;shown=text??queue.join('');head=queue.length;paint();tick();return drained;},cancel(){clearTimeout(timer);queue=[];head=0;node?.classList.remove('ai-streaming-text');resolve();}};
 }
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
 // ★ 2026-10-11：不再构造/发送 `library` 索引。后端 ai_workspace.py 在拼给模型的上下文时
 //   明确把它整个丢掉（那里的注释：「与 scores 完全重复，模型从不读它」），所以这个
 //   「共 N 首：曲名/曲名/…」的 56KB 字符串每轮都白传（实测请求体 364KB，其中 56KB 是它）。
 //   需要「共几首」这类数字时，由后端按自己手上的清单给出，别让前端把全量曲名再拼一遍。
 // ★ 带上 status：曲库里有一批 status=failed 却 ready=true 的记录（实测 5 首：
 // 未命名曲谱/兰亭序/晚安/周杰伦/12.31），只发 {id,title,ready} 的话模型看不出来，
 // 就会把它们当正常曲目推荐出去 —— 用户点了必然播不出来（报告 #14）。
 // ★ saved（上传时间）**只在重名条目上带**：它唯一的用途是区分同名曲谱
 //   （后端 choose_payload 用它生成 hover 提示，见 ai_workspace.py 的 saved_label）。
 //   79 首全带上会白占 1000+ 字符 —— 曲库还会长，上下文预算要省着用。
 const counts={};for(const t of titles)counts[t]=(counts[t]||0)+1;
 return {scores:scores.map(c=>({id:c.id,title:c.title,ready:c.ready,status:c.status||'',...(c.title&&counts[c.title]>1?{saved:c.saved||0}:{})}))};
}
// 界面上真实存在的控件清单。模型看不见它就会答「不支持」，
// 或者跑去 GitHub 找 "tempo control plugin"（测试报告 B1/C5）。
// 只列 AI 真能操作的，不列纯展示元素，避免把模型引到没实现的路上。
const CONTROLS=[
 '演奏速度 set_tempo 30–240 BPM（原谱 BPM 会显示在旁）',
 '节拍器 set_metronome 开/关（音量 metronome-volume 0.1–1，界面上手动调）',
 '音色 set_instrument（音乐会钢琴/三角钢琴等，选项见 #instrument-select）',
 '自选乐器 configure_arrangement（style、programs 数组、drums 布尔值，仅设置现有控件），',
 '配器 set_arrangement（原谱/原谱加鼓/室内乐/管弦乐/弦乐四重奏/木管四重奏/铜管四重奏/自选编制），generate_arrangement 生成总谱',
 '播放声部 solo 独奏 / solo_group 声部分组 / mute 静音 / unmute 取消静音（值用 context.parts 里的真实声部名，mute/unmute 用 all 表示全部）',
 '谱面 view：engraved 五线谱 / simple 简谱 / pdf 原稿 / daw 音轨',
 '和弦分析 chords（value=all 或 piano）；score_report 核对全部声部的拍号、时值、力度和曲谱档案；支持结合实际小节的练习建议',
 '播放 pause 暂停 / stop 停止并回到开头 / play 开始播放 / seek_measure 跳到第 N 小节',
 '工作区面板 panel：library 曲库 / play 演奏 / arrange 改编 / tasks 任务',
 'practice_plan 提供分段练习建议（实际小节、BPM、遍数、练法、检查点），仅展示在跟弹区域，用户确认后应用；不可自动开启麦克风',
 '声部音量 set_part_volume，value={"part":"声部value","value":0.7}，0–1 或百分比；值必须取自 context.parts',
 '循环 set_loop：value={"from":5,"to":8,"repeat":3}，按小节号循环播放这一段（repeat 省略表示一直循环）；set_range 同样参数但只播一遍就停',
 '速度渐变 tempo_curve：value={"from":5,"to":8,"fromBpm":80,"toBpm":120}，在第几小节到第几小节之间渐快或渐慢，区间之外保持原速',
 '导出 export_score：value 为 "midi" 或 "musicxml"，浏览器直接下载文件',
 '打印 print_score：value 为空，打开打印对话框，只打印谱面',
 '跟弹评分 practice_score：value 为空，读取当前跟弹的正确率、节奏与实测速度；没有练习记录时会如实报错'
].join('；');
 async function watchImport(id){for(let i=0;i<240;i++){await wait(5000);try{const r=await fetch('/api/scores');const data=await r.json();const score=data.scores?.find(x=>x.id===id);if(score?.ready){document.querySelector('.library-refresh')?.click();await wait(1800);await action({type:'open',value:id});await action({type:'play'});line('识谱完成，已开始播放。');return;}if(score?.status==='failed'){line('识谱失败，请到任务中心查看详细原因。');return;}}catch(e){line('自动打开没有完成：'+e.message);return;}}line('识谱仍在后台处理，请到任务中心查看。');}
// 联网找谱现在由模型自己决定：用户要找曲库外的谱，模型直接输出 web_search 动作
// （带干净检索词），前端只负责执行，不再用正则从原话里抠词、也不再显示死路提示。

 function offerWebSearch(query){awaitingUser=true;webSearchCard({query,log,onSearch:async value=>{await runActions([{type:'web_search',value}]);}});}
 async function action(a,onProgress=()=>{}){
 if(tourOwned&&tourPolicy.localOnly&&a.type==='web_search'){line('本轮只查本地曲库，已将联网提议改为本地检索。');a.type='search';a.value=tourPolicy.localQuery;}
 if(tourOwned&&['generate_arrangement','export_score','print_score'].includes(a.type))throw Error('本段只演示查看和操作，不自动生成、导出或打印');
 // 删除/清空/覆盖云曲库的动作：明确回绝，且**不要**走「重新核对」——
 // 那是给「动作参数不对、值得换个写法再试」用的，删除不是这类问题，重试多少次都不该做。
 if(FORBIDDEN_TYPES.has(String(a.type||'').toLowerCase())){line(REFUSAL);awaitingUser=true;return 'skipped';}
 // 不认识的动作直接报错走「重新核对」，不要静默空转——那是「AI 说好了但什么都没发生」的主力来源。
 if(!KNOWN_TYPES.has(a.type))throw Error('暂时不支持这个操作：'+a.type);
 if(a.type==='practice_plan'){const context=await readLiveContext();const plan=validatePracticePlan(a.value,{version:context.practiceVersion,measures:context.measureNumbers});const result=await new Promise(resolve=>document.dispatchEvent(new CustomEvent('practice-plan-proposed',{detail:{plan,resolve}})));if(!result?.ok)throw Error(result?.error||'练习建议未能送到跟弹区域');document.querySelector('[data-panel="play"]').click();line('分段建议已放入跟弹练习。请核对后点击“确认应用”，再自行开始跟弹。');onProgress(1);return;}
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
  // 新增能力：这些以前 AI 只能回答「做不到」，现在有真实控件可操作。
  if(a.type==='set_part_volume'){const r=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-part-volume',{detail:{value:a.value,resolve,reject}})));line('「'+r.label+'」的音量已设为 '+Math.round(r.level*100)+'%。');return;}
  // ★ 2026-11-17：setLoop() 在「取消循环 / 空值 / 退化区间」时返回 {cleared:true,had}，
  //   根本没有 from/to。以前无条件拼 r.from/r.to 会说出「第 undefined 到第 undefined 小节」。
  //   现在先认 cleared 分支，正常分支也用 Number.isFinite 兜底，杜绝裸拼 undefined。
  if(a.type==='set_loop'){const r=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-loop',{detail:{value:a.value,resolve,reject}})));if(r?.cleared){line(r.had?'已取消循环，恢复完整播放。':'当前没有设置循环，无需取消。');return;}const from=Number(r?.from),to=Number(r?.to);if(!Number.isFinite(from)||!Number.isFinite(to))throw Error('循环区间没有生效，请说明从第几小节到第几小节');line('已设置循环：第 '+from+' 到第 '+to+' 小节'+(from===to?'':'，播完自动回到开头')+'。');return;}
  if(a.type==='set_range'){const r=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-range-play',{detail:{value:a.value,resolve,reject}})));if(r?.cleared){line(r.had?'已取消区间播放，恢复完整播放。':'当前没有区间限制，无需取消。');return;}const from=Number(r?.from),to=Number(r?.to);if(!Number.isFinite(from)||!Number.isFinite(to))throw Error('区间没有生效，请说明从第几小节到第几小节');line('只播第 '+from+' 到第 '+to+' 小节，播完停住。');return;}
  if(a.type==='tempo_curve'){const r=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-tempo-curve',{detail:{value:a.value,resolve,reject}})));const from=Number(r?.from),to=Number(r?.to),sb=Number(r?.startBpm),eb=Number(r?.endBpm),base=Number(r?.base);if(![from,to,sb,eb,base].every(Number.isFinite))throw Error('速度渐变没有生效，请说明第几到第几小节、从多少到多少 BPM');line('第 '+from+' 到第 '+to+' 小节设为 '+sb+' → '+eb+' BPM 的渐变，其余段落仍是 '+base+' BPM。');return;}
  if(a.type==='export_score'){const r=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-export-score',{detail:{value:a.value,resolve,reject}})));awaitingUser=true;line(r.format==='midi'?('MIDI 下载请求已提交：'+r.file+'，共 '+r.notes+' 个音符、'+r.tracks+' 条轨。'):('MusicXML 下载请求已提交：'+r.file));return;}
  if(a.type==='print_score'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-print-score',{detail:{resolve,reject}})));line('已打开打印对话框，只会把谱面打进去，界面按钮不会出现在纸上。');return;}
  if(a.type==='edit_score'){await import('/sera-edit.js?v=sera1');const r=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('乐谱编辑提案超时，请在「乐谱精准编辑」面板核对')),90000);document.dispatchEvent(new CustomEvent('ai-edit-score',{detail:{value:a.value,resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}}}));});awaitingUser=true;line(r.applied?('已生成并应用修订：'+r.summary+'。原谱未改动，可在编辑面板撤销。'):('已生成乐谱编辑提案：'+r.summary+'。请在「乐谱精准编辑」面板核对后点击「应用到当前谱面」。'));return;}
  if(a.type==='classroom'){const value=normalizeClassroomCommand(typeof a.value==='string'?JSON.parse(a.value):a.value);if(!classroomOperations.includes(value?.operation))throw Error('未知课堂操作');if(['status','ask'].includes(value.operation))awaitingUser=true;const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('课堂操作尚未返回结果，请核对课堂状态')),120000);document.dispatchEvent(new CustomEvent('ai-classroom-command',{detail:{value,resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}}}));});const receipt={classroom:result};messages.push({role:'assistant',content:JSON.stringify(receipt)});if(value.operation!=='open')line(result.receipt||('《'+(result.title||'当前作品')+'》：'+result.message+'；已生成 '+result.sceneCount+' 个环节，当前第 '+result.scene+' 个环节。'));return;}
  if(a.type==='create_classroom'){const rawSettings=typeof a.value==='string'?JSON.parse(a.value):a.value;const settings=Object.fromEntries(Object.entries(rawSettings||{}).filter(([,value])=>value!=null&&value!==''));const created=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('课堂提交超时，请在任务中心核对生成状态')),60000);document.dispatchEvent(new CustomEvent('ai-create-classroom',{detail:{settings,resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}}}));});line('《'+created.title+'》课程已提交，进度显示在音乐课堂和任务中心。');return;}
  if(a.type==='practice_score'){const r=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-practice-score',{detail:{resolve,reject}})));line('这一段跟弹：正确率 '+r.accuracy+'、节奏 '+r.rhythm+'、实测速度 '+r.bpm+'。');return;}
  if(a.type==='configure_arrangement'){
   validateArrangementIntent(a.value,arrangementCapabilities());
   await action({type:'panel',value:'arrange'});
   configureArrangement(a.value);
   line('编制、乐器和鼓声部已按要求设置，尚未生成总谱。');return 'skipped';
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
   await spotlight(button);await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-generate-arrangement',{detail:{resolve,reject}})));line('已提交生成总谱，进度可以在改编面板或任务中心查看。');return;
  }
  if(a.type==='view'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-set-view',{detail:{mode:a.value,resolve,reject}})));return;}
  if(a.type==='solo_group'){await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-solo-group',{detail:{ids:(Array.isArray(a.value)?a.value:JSON.parse(a.value)),resolve,reject}})));return;}
  // 下面四种动作会把「待选的东西」写进对话（曲谱按钮、网页链接）——必须让用户看见，所以留面板。
  if(a.type==='choose_scores'){awaitingUser=true;const items=(Array.isArray(a.value)?a.value:JSON.parse(a.value));messages.push({role:'assistant',content:'曲谱候选：'+JSON.stringify(items.map(({id,title,ready,status})=>({id,title,ready,status})))});if(!items.length){line('没有找到可以打开的曲谱。');offerWebSearch(lastUserText.replace(/^(请|帮我|我要听|我想听|播放|搜索|查找|找一下|找一首|找一份)+/g,'').replace(/[《》]/g,'').trim());return;}for(const item of items){const button=document.createElement('button');button.type='button';
   // 「识谱中」和「识谱失败」是两回事，别都写成识谱中 —— 失败的那批点开也播不出来。
   button.textContent=item.title+(item.status==='failed'?'（识谱失败）':item.ready===false?'（识谱中）':'');
   if(item.evidence)button.title=item.evidence;button.onclick=()=>{if(busy)return;selectedScoreId=item.id;input.value=lastUserText;form.requestSubmit();};log.append(button);}return;}

  // 已经站在目标面板上就别再点一遍：省掉 650ms 的聚光动画，也不会被回读当成「没生效」。
  if(a.type==='panel'){const value=panelValue(a.value);if(document.body.dataset.workspace===value)return;const el=document.querySelector(`.workspace-nav [data-panel="${value}"]`);await spotlight(el);el?.click();return;}
  if(a.type==='search'){
   awaitingUser=true;onProgress(.05);await action({type:'panel',value:'library'});onProgress(.12);
   const terms=String(a.value||'').trim();
   if(!terms){line('你想找哪一首？说个曲名或歌手，我就去曲库里翻。');return;}
   const catalog=(await readCloudLibrary()).scores||[];onProgress(.25);
   const exactTitle=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().replace(/[\s《》「」]/g,'');
   let hits=catalog.filter(item=>exactTitle(item.title)===exactTitle(terms));
   if(!hits.length){
    const response=await fetch('/api/scores/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:terms,stream:true,scores:catalog.map(({id,title})=>({id,title}))}),signal:deadline(180000)});
    if(!response.ok){const failed=await response.json();throw Error(failed.error||'曲库搜索失败');}
    let result=null;
    if(response.headers.get('Content-Type')?.includes('ndjson')&&response.body?.getReader){
     const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
     const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='progress'){if(event.total&&event.completed>0){onProgress(.25+.65*event.completed/event.total);}else taskActivity(event.text||'正在检索曲库');if(event.text)taskReport({detail:event.text});}if(event.type==='result')result=event;};
     // ★ 同 Bug7（2026-10-11）：result 事件才是这条流的终点，不能只等 done（连接关闭）。
//   否则结果早收到了、循环却还挂着，整段卡到外层 deadline。
for(;;){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);if(result&&!result.partial){try{void reader.cancel();}catch{}buffer='';break;}if(done){consume(buffer);break;}}
    }else result=await response.json();
    if(!result)throw Error('搜索连接已结束，但结果未接收完整');
    const ids=new Set(result.ids||[]);hits=catalog.filter(item=>ids.has(item.id));if(result.warning)line(result.warning);

   }
   onProgress(.95);
   line(hits.length?'找到 '+hits.length+' 首相关曲谱，请选择：':'曲库里没有找到，要在网上查找吗？');
   if(!hits.length)offerWebSearch(terms);
   let offset=0;const more=document.createElement('button');more.type='button';more.textContent='更多结果';
   const reveal=()=>{more.remove();for(const item of hits.slice(offset,offset+12)){const choice=document.createElement('button');choice.type='button';choice.textContent=item.title+(item.ready?'':'（尚未就绪）');choice.onclick=async()=>{choice.disabled=true;try{await runActions([{type:'open',value:item.id},...(item.ready?[{type:'play',value:''}]:[])]);}catch(error){line(readableNetworkError(error));}finally{choice.disabled=false;}};log.append(choice);}offset+=12;if(offset<hits.length)log.append(more);};more.onclick=reveal;reveal();
   messages.push({role:'assistant',content:'曲库实际结果：'+JSON.stringify(hits.map(({id,title,ready})=>({id,title,ready}))) });onProgress(1);return;
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
  if(a.type==='chords'){awaitingUser=true;let scope={part:a.value};if(typeof a.value==='object')scope=a.value;else if(String(a.value).startsWith('{'))scope=JSON.parse(a.value);const result=await new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('ai-analyze-chords',{detail:{...scope,resolve,reject,onProgress}})));if(result.quality){const title={dim7:'减七和弦','half-dim7':'半减七和弦',dom7:'属七和弦',min7:'小七和弦',maj7:'大七和弦'}[result.quality]||result.quality;line('《'+result.title+'》：核对了 '+result.analyzedMeasures+' 个小节，找到 '+result.chords.length+' 处'+title+'的同时发声候选。经过音、分解和弦及和声功能仍需结合原谱核对。');if(result.chords.length)line(result.chords.map(c=>'第 '+c.measure+' 小节，距小节起点 '+Number(c.offset.toFixed(3))+' 个四分音符：'+c.name).join('\n'));messages.push({role:'assistant',content:JSON.stringify(result)});onProgress(1);return;}const known=result.chords.filter(c=>c.name).length;
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
  if(a.type==='play'&&!/tempo/i.test(String(a.value||''))&&/暂停|pause|^(?:stop|停止|停下|停|别放|不要放|关掉播放)/i.test(String(a.value||'').trim())){a.type=/暂停|pause/i.test(String(a.value))?'pause':'stop';a.value='';return action(a,onProgress);}
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
  if(a.type==='solo'){const select=document.querySelector('#part-solo-select');const hit=findPart(a.value);if(!hit)throw Error('当前曲谱没有这个声部');await spotlight(select);for(const mix of findMixes(hit.value)){if(!mix.checked){mix.checked=true;mix.dispatchEvent(new Event('change',{bubbles:true}));}}select.value=hit.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
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
   awaitingUser=true;taskActivity('正在查找可转谱的演奏链接');
   if(!/谱/.test(String(a.value))||/视频|演奏链接|转录/.test(String(a.value))){const scope=abortTimeout(abortCurrent?.signal,12000);try{if(await offerScoreStarling({query:a.value,log,line,action,signal:scope.signal}))return;}catch(e){if(abortCurrent?.signal.aborted)throw e;line(scope.signal.aborted?'音乐检索未及时返回，正在改查曲谱网页。':'链接转谱暂未完成：'+readableNetworkError(e));}finally{scope.dispose();}}
   taskActivity('正在联网查询曲谱来源');const r=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'search',query:a.value}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Error(result.error);onProgress(1);
   // 以前这里写「直接 PDF 可以导入」，但实测乐谱站几乎不给直链 PDF（报告 #7），
   // 于是用户等半天、按钮也不出现。改成实话实说，并把来源标出来。
   line(result.results.length?'找到这些页面，可以点开查看：':'没有找到可用结果，可以换个曲名再试。');
   if(result.notice)line(result.notice);
   webResultCards({items:result.results,query:a.value,log,onImport:async item=>{line('正在下载并提交识谱…');const response=await fetch('/api/workspace-ai/web',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'import',url:item.url,title:a.value}),signal:AbortSignal.timeout(90000)});const data=await response.json();if(!response.ok)throw Error(data.error);line('已加入识谱队列。');void watchImport(data.id);}});
  }
 }
 form.onsubmit=async e=>{e.preventDefault();
 // 忙的时候这个按钮变成「停止」。报告 B6：中位 6.3 秒、最大 58 秒，用户只能干等。
 // 复用同一个圆形按钮（不新增控件，省得打乱已有的紧凑布局）。
 if(busy){
  // ★ 2026-10-11：以前 busy 时点按钮一律当成「停止」——用户在输入框里打好了下一句话、
  //   点发送却被判成停止，回一句「已停止这次请求」，连续对话整段被吞掉
  //   （实测音乐家 9 轮连续对话 0 轮成功）。现在分情况：
  //   输入框有内容 = 用户要提问 → 排队等这一轮做完；空着 = 确实要停止。
  if(input.value.trim()){
   const queued=input.value.trim();input.value='';
   line('上一条还在处理，这句先排队，马上就轮到。');
   submissionQueue=submissionQueue.catch(()=>{}).then(async()=>{
    const queuedAt=Date.now();
    while(busy&&Date.now()-queuedAt<180000)await wait(250);
    if(busy){line('排队超时，未执行：'+queued);return;}
    const draft=input.value;input.value=queued;
    const running=form.onsubmit({preventDefault(){}});
    if(!input.value)input.value=draft;
    await running;await showResults();
   });
   return;
  }else{cancelledByUser=true;abortCurrent?.abort();return;}
 }
 const text=input.value.trim();if(!text){input.focus();input.animate?.([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:220});return;}lastUserText=text;busy=true;const requestStart=Date.now();abortCurrent=new AbortController();userClosed=false;cancelledByUser=false;taskLines=[];aiTask={id:'ai-'+taskId(),label:text,created:Date.now(),kind:'ai',status:'running',progress:0,detail:'正在读取曲库与当前打开的谱面'};taskReport({});trigger.classList.remove('task-failed','has-task');taskPercent=0;dialog.classList.add('is-thinking');input.value='';messages.push({role:'user',content:text});line(text,'user');const send=form.querySelector('button[type="submit"]');send.textContent='■';send.setAttribute('aria-label','停止这次请求');send.classList.add('is-cancel');const status=document.createElement('p');status.className='ai-operation-detail';status.setAttribute('role','status');const statusText=document.createElement('span');status.append(statusText);log.append(status);let statusTimer=0,receiving=false;function streamStatus(text){if(!text||statusText.textContent===text)return;if(!status.isConnected)log.append(status);const stick=log.scrollHeight-log.scrollTop-log.clientHeight<80;statusText.textContent=text;if(stick)log.scrollTop=log.scrollHeight;}streamStatus('正在读取曲库与当前打开的谱面');
 // ★ 首字之前有一段「模型在思考」的空档（实测 3~7 秒，长回答可到 10 秒），
 //   状态行静止时用户会以为卡死。这里**不再显示秒表**（唐老师 2026-10-10 要求去掉计时），
 //   改成轮换「现在在做什么」的措辞——和后端 `_wait_step` 同一套写法，
 //   两边都在推进，所以用户看到的是一条连续更新的进度，而不是一个跳动的数字。
 const localSteps=['正在理解你的问题','正在对照这份谱核实和声与段落','正在判断哪些操作界面真的能执行','正在组织答复和操作步骤'];
 let waitTimer=0;const waitStart=Date.now();
 function stopWaitClock(){clearInterval(waitTimer);waitTimer=0;}
 waitTimer=setInterval(()=>{if(receiving||!status.isConnected)return;const i=Math.floor((Date.now()-waitStart)/4000);streamStatus(localSteps[Math.min(i,localSteps.length-1)]);},4000);
 let reveal=characterStream();
 // 15 秒还没回来就告诉用户「还能等，也能停」，别让人以为卡死了。
 const slowHint=setTimeout(()=>{if(busy&&!receiving){status.title='还在处理中，点发送按钮的位置可以随时停止这次请求';}},15000);
 // ★ 前端超时(200s)必须**比后端的读超时(90s)长**：后端 ai_workspace 到 8765 的
 //   requests 超时是 (5, 90)，它到点会回一句准确的「SUPERTANG AI 暂时没有响应，请稍后重试。」
 //   以前前端也是 90s，两边撞在一起，前端先 abort —— 用户看到的是
 //   「请求等待超时或连接被中止…请检查外网隧道连接」，把模型没响应错怪到隧道上。
 try{const context=await workspaceContext({executed:executedActions.slice(-12),selectionId:selectedScoreId,practiceRequest},streamStatus);practiceRequest=false;selectedScoreId=null;const result=await requestAI({messages:historyForModel(),context},event=>{if(event.type==='reset'){const partial=log.querySelector('.ai-streaming-text');reveal.cancel();partial?.remove();reveal=characterStream();receiving=false;if(!status.isConnected)log.append(status);}if(event.type==='status'){streamStatus(event.text);taskReport({detail:event.text});}if(event.type==='action'){streamStatus(event.label);taskReport({detail:event.label});}if(event.type==='delta'&&event.text){receiving=true;stopWaitClock();reveal.push(event.text);}},deadline(200000));clearInterval(statusTimer);stopWaitClock();status.remove();await reveal.finish(String(result.reply||''));logLatency(result,requestStart);messages.push({role:'assistant',content:result.reply});await runActions(result.actions||[],result.reply);
 // ★ Bug B 兜底：用户明确点名「打开/播放《X》」但谱面没切过去时，自动补开（见 ensureScoreOpened）。
 const autoOpened=await ensureScoreOpened(text,result.reply);
 // ★ 新增（2026-10-11，QA 报告「只答应不给动作」）：模型只回话、**不给任何动作**时，若回复
 //   又像在「承诺执行/声称已做」，必须如实告诉用户这次没做成 —— 不能让「我来处理」「已打开」
 //   这类话术单独出现（用户以为做成了，其实界面毫无变化）。
 //   仅在「无动作 + 兜底也没补开 + 回复是承诺措辞」时提示；纯乐理问答（无承诺措辞）不提示。
 if(!(result.actions||[]).length&&!autoOpened&&/(?:我来|我会|马上|这就|正在|已(?:经)?)(?:帮您|帮你|为您|为你)?[^。！？\n]{0,18}(?:检索|搜索|查找|打开|播放|切换|静音|调速|设置|定位|导出|制定|生成|处理|安排|搞定|办)/.test(result.reply||'')&&!/无法|不能|不支持|需要您|需要你|请先|是否|要不要|可以吗|尚未|没有执行/.test(result.reply||''))
  {taskActivity('正在补齐操作步骤');const recovered=await repairActions({type:'missing_actions'},new Error('回复承诺执行操作，但没有收到执行步骤；请核对原请求并补齐动作'),[]);await runActions(recovered,'');}
 // 模型已被要求自己产出动作（含 web_search）；不再用正则从回复里猜、也不显示死路提示。
 // 若模型确实没给动作，它的回复本身已经流给用户了，这里不做任何追加。
 taskReport({status:'complete',progress:100,indeterminate:false,detail:result.actions?.some(a=>['choose_scores','search','web_search'].includes(a.type))?'结果已列出，等待选择':'已完成',result:[result.reply,...taskLines].filter(Boolean).join('\n\n')}); }
  // 用户自己关掉对话、或按了停止：静默收尾，不要把对话重新弹开（showResults 会 showModal）。
  catch(error){
   if(userClosed||cancelledByUser){const stopped=cancelledByUser;userClosed=false;cancelledByUser=false;reveal.cancel();clearInterval(statusTimer);status.remove();if(stopped){taskReport({status:'cancelled',detail:'已由用户停止',result:taskLines.join('\n\n')});line('已停止这次请求，界面没有变化。');}return;}
   taskReport({status:'failed',detail:readableNetworkError(error),result:taskLines.join('\n\n')});reveal.cancel();clearInterval(statusTimer);status.remove();line(readableNetworkError(error));await showResults();messages.push({role:'assistant',content:'操作未完成：'+error.message});}
  finally{clearInterval(statusTimer);stopWaitClock();clearTimeout(slowHint);clearTimeout(saveTimer);abortCurrent=null;const snapshot=aiTask?{...aiTask}:null;busy=false;dialog.classList.remove('is-thinking');send.textContent='↑';send.setAttribute('aria-label','发送');send.classList.remove('is-cancel');if(snapshot){saveChain=saveChain.catch(()=>{}).then(async()=>{const saved=await fetch('/api/ai-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot),signal:AbortSignal.timeout(8000)});if(!saved.ok)throw Error('任务结果未能保存');}).catch(error=>console.warn('AI 任务保存失败',error));}}

 };
 let tourOwned=false,tourCancelled=false,tourActions=[],tourPolicy={};
 document.addEventListener('ai-tour-cancel',()=>{if(tourOwned){tourCancelled=true;if(abortCurrent){cancelledByUser=true;abortCurrent.abort();}}});
 document.addEventListener('ai-tour-request',async event=>{
  if(busy||transitioning||tourOwned){event.detail.resolve?.({ok:false,detail:'AI 正在处理另一条请求，请等它完成后再演示'});return;}
  tourOwned=true;tourCancelled=false;tourActions=[];tourPolicy=event.detail.policy||{};const oldLinks=new Set(log.querySelectorAll('a'));
  try{
   if(!dialog.open)await trigger.onclick({});const requested=String(event.detail.text||'').slice(0,2000);input.value='';
   for(let i=0;i<requested.length;i+=4){if(tourCancelled)throw new DOMException('演示已停止','AbortError');input.value=requested.slice(0,i+4);if(!reduced())await wait(14);}
   if(tourCancelled)throw new DOMException('演示已停止','AbortError');
   await form.onsubmit({preventDefault(){}});
   const result={actions:[...tourActions],ok:aiTask?.status==='complete',detail:aiTask?.detail,result:taskLines.join('\n\n')||aiTask?.result,reply:messages.filter(m=>m.role==='assistant').at(-1)?.content,links:[...log.querySelectorAll('a[href]')].filter(a=>!oldLinks.has(a)&&/^https?:/.test(a.href)).map(a=>({href:a.href,text:a.textContent||a.href}))};
   for(const match of String(result.reply||'').matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g)){const href=match[2]||match[3];if(!result.links.some(link=>link.href===href))result.links.push({href,text:match[1]||href});}
   if(event.detail.holdResults&&!tourCancelled){
    await showResults();
    const review=document.createElement('button');review.type='button';review.className='small-button ai-tour-review';review.textContent='已看完，返回导览';dialog.append(review);
    await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;review.remove();dialog.removeEventListener('close',finish);document.removeEventListener('ai-tour-cancel',finish);resolve();};review.onclick=finish;dialog.addEventListener('close',finish);document.addEventListener('ai-tour-cancel',finish);});
   }
   if(dialog.open&&!busy)await close();
   event.detail.resolve?.(result);
  }catch(error){if(dialog.open&&!busy)await close();event.detail.reject?.(error)}finally{tourOwned=false;tourCancelled=false;tourPolicy={};}
 });
}
if(document.querySelector('.workspace-nav'))init();else window.addEventListener('workspace-ready',init,{once:true});
