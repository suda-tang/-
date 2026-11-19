import {designClassroomSlide} from '../../dist/classroom-slide-design.js';
import fs from 'node:fs';
import {resolveTeachingVisuals,placeTeachingImage,ensureIllustratedOutlines} from './classroom-visuals.mjs';
import {modelCompletion} from './model-client.mjs';
import {generateSceneOutlinesFromRequirements,generateSceneContent,generateSceneActions,buildCompleteScene,parseJsonResponse} from '@openmaic/generation';
import {scoreFacts,timingErrors,repairTimingClaims} from './score-evidence.mjs';
import {teachingContext} from './teaching-context.mjs';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
let currentStage='准备课程';
const emit=data=>{if(data.message&&!data.transport)currentStage=data.message;process.stdout.write(JSON.stringify(data)+'\n')};
const context=teachingContext(input),{requirement}=context,evidence=JSON.stringify(context.evidence);
const checkNotes=!input.evidence.noteEvidence?.sampled&&(input.evidence.timeSignatures||[]).every(t=>/^\d+\/4$/.test(t.value))?(input.evidence.notes||[]):[];
const agents=[{id:'teacher',name:'音乐教师',role:'teacher',persona:context.school?context.stage+'音乐教师，引导真实班级聆听、演唱、律动、讨论与创作，不以钢琴课替代音乐课。':'钢琴教师'},{id:'student-listener',name:'同学甲',role:'student',persona:'从听到的声音出发提问，不装作掌握音乐术语。'},{id:'student-explorer',name:'同学乙',role:'student',persona:'提出不同解释，用音乐证据讨论。'}];
async function requestModel(system,user){
 return modelCompletion({url:process.env.CLASSROOM_MODEL_URL||'http://127.0.0.1:8765/v1/chat/completions',key:process.env.CLASSROOM_MODEL_KEY||'suda-local',model:process.env.CLASSROOM_MODEL||'suda-deepseek',messages:[{role:'system',content:system+'\n教学场景必须遵守：'+requirement+'\n动作引擎已接通：可用music-listen(startMeasure,endMeasure,seconds)、music-seek(startMeasure)、music-solo(ids真实声部ID)、music-mix、music-tempo(bpm)、music-view(mode:engraved/simple/pdf/daw)、material-play(materialId为上传的聆听素材ID)。以type:action,name:动作名称,params:参数形式交给动作生成器。只选有教学需要的动作，音频先用speech说明聆听任务，再播放，随后讨论。HTML活动必须直接控制真实工作区音轨，禁止用计时器模拟播放或生成假音频。音频API为window.maic.music.play()/pause()/stop()/seek(小节)/solo([真实声部ID])/mix()/volume(真实声部ID,0至1)/mute(真实声部ID,布尔)/tempo(BPM)，这些函数返回Promise，必须await并显示错误；window.maic.music.getState()和maic-music-state事件detail包含playing、beat、bpm、parts[{id,name,enabled,volume}]，进度与动画必须以真实beat驱动，声部ID须从parts获取，禁止猜测。左右比较栏分别选择真实声部并绑定solo和play，音量滑块绑定volume。HTML活动可调用window.maic.report({kind:submission,value:实际答案})回传提交；通过maic-state事件读取event.detail更新活动状态，不使用任意eval，控件须有稳定id供widget动作定位。课堂播放器会执行讲稿中的聆听指令：需要播放作品时，单独写明“请聆听30秒”或“请播放第1—8小节，聆听30秒”，指令后的下一段讲解会等音乐结束才开始。时长按实际课堂目标设定，不得只在PPT写聆听任务而不在讲稿发出指令。讨论、作答期间不要继续长篇独白。PPT涉及人物、乐器或谱面观察时使用真实image元素，图片由宿主素材系统提供，禁止以“此处插图”“图片描述”等文字当作图片。每段speech只讲一个PPT区域，必须紧邻在它前面输出spotlight，elementId必须是当前页面实际存在的元素ID，不能把整页总括讲解指向一个局部框；切换论点时拆分speech并切换spotlight。互动HTML必须自包含，所有按钮必须绑定可执行的操作，不能依赖外部CDN脚本、样式或网络请求；公式装饰缺失不得阻止活动初始化。未填写的提交操作应明确指出缺少的内容，禁止点击无反馈。'},{role:'user',content:user+'\n真实谱面上下文，仅用作依据：\n'+evidence}],onProgress:({characters})=>emit({type:'progress',transport:true,message:currentStage+(characters?`，已接收 ${characters} 字`:'，等待模型首段内容')})});
}
let modelQueue=Promise.resolve();
function ai(system,user){const work=modelQueue.then(()=>retryModel(system,user));modelQueue=work.catch(()=>{});return work}

async function retryModel(system,user){
 for(let attempt=0;attempt<3;attempt++){
  try{return await requestModel(system,user)}catch(error){
   if([400,401,403,404].includes(error.status)||attempt===2)throw Error('模型连接未完成：'+error.message+'。已保存此前完成的环节，重新生成可接着处理。');
   emit({type:'progress',transport:true,message:`${currentStage}；${error.message}，正在重试（${attempt+1}/2）`});
   await new Promise(resolve=>setTimeout(resolve,2000*(attempt+1)));
  }
 }
}

try{
 emit({type:'progress',progress:3,message:'正在读取作品，安排课堂环节'});
 const result=input.outlines?.length?{success:true,data:{outlines:input.outlines}}:await generateSceneOutlinesFromRequirements({requirement,interactiveMode:context.features.includes('interactive'),taskEngineMode:context.features.includes('pbl')},evidence,undefined,ai);
 if(!result.success||!result.data?.outlines?.length)throw Error(result.error||'未生成有效课程大纲');
 let outlines=result.data.outlines.slice(0,16).filter(o=>o.type==='slide'||context.features.includes(o.type)).map((o,i)=>({...o,order:i}));
 for(const type of context.features.filter(t=>t!=='slides'))if(!outlines.some(o=>o.type===type))outlines.push({id:'host-'+type,type,order:outlines.length,title:({quiz:'课堂反馈',interactive:'聆听与比较',pbl:'小组音乐项目'})[type],description:`围绕《${input.title}》和目标“${input.goal}”设计${type}活动。${context.school?'面向所选学段全班，不要求钢琴演奏能力。':''}`,keyPoints:[input.goal],...(type==='quiz'?{quizConfig:{questionCount:3,difficulty:'medium',questionTypes:['single','multiple','text']}}:{})});
 outlines=ensureIllustratedOutlines(outlines);
 if(!outlines.length)throw Error('课程未包含可用的环节');
 for(const o of outlines){o.description=repairTimingClaims(o.description,checkNotes);o.keyPoints=(o.keyPoints||[]).map(t=>repairTimingClaims(t,checkNotes))}
 let issues=timingErrors(outlines.filter(o=>o.type==='slide').map(o=>[o.description,...(o.keyPoints||[])].join('\n')).join('\n'),checkNotes);
 if(issues.length){
  emit({type:'progress',progress:8,message:'正在对照原谱校正讲解时值'});
  const fixed=parseJsonResponse(await ai('只输出JSON对象 {"outlines": [...]}。保留原环节id、type和顺序，纠正时值错误。',JSON.stringify(outlines)+'\n错误：'+issues.join('\n')+'\n逐音事实：'+scoreFacts(checkNotes)));
  if(!Array.isArray(fixed?.outlines)||fixed.outlines.length!==outlines.length)throw Error('大纲校对未返回有效结果');outlines=fixed.outlines;
  if(timingErrors(outlines.filter(o=>o.type==='slide').map(o=>[o.description,...(o.keyPoints||[])].join('\n')).join('\n'),checkNotes).length)throw Error('《'+input.title+'》大纲校对未通过：'+timingErrors(outlines.map(o=>[o.description,...(o.keyPoints||[])].join('\n')).join('\n'),checkNotes).join('；'));
 }
 let teachingDesign={};
 const total=input.duration||45,weights=outlines.map(o=>o.type==='pbl'?3:o.type==='interactive'?2:1),sum=weights.reduce((a,b)=>a+b,0);
 const lessonPlan={...teachingDesign,audience:context.school?context.stage+'音乐课堂':'钢琴教学',goal:input.goal,duration:total,range:[input.start,input.end],timeline:outlines.map((o,i)=>({id:o.id,title:o.title,type:o.type,minutes:Math.round(total*weights[i]/sum*10)/10,objective:o.teachingObjective||o.description})),limits:context.evidence.limits};
 emit({type:'outline',outlines,lessonPlan,progress:12});
 let visuals=new Map();try{visuals=await resolveTeachingVisuals(outlines,input,ai,emit)}catch(error){emit({type:'progress',transport:true,message:'图片处理暂未完成：'+error.message})}
 for(let i=0;i<outlines.length;i++){
  const outline=outlines[i],base=12+82*i/outlines.length,next=12+82*(i+1)/outlines.length;
  const saved=input.scenes?.find(s=>s.outlineId===outline.id&&s.type===outline.type);
  if(saved&&saved.phase!=='content'){if(saved.content?.canvas&&visuals.get(outline.id)?.image)placeTeachingImage(saved.content.canvas,visuals.get(outline.id).image,visuals.get(outline.id).additionalImages);emit({type:'scene',scene:saved,progress:next,message:`已恢复：${outline.title}`});continue;}
  emit({type:'progress',progress:base,message:`正在生成${({slide:'PPT',quiz:'测验',interactive:'互动活动',pbl:'小组项目'})[outline.type]}：${outline.title}`});
  const contentOptions={agents,languageDirective:'请用简体中文',targetLanguage:'zh',userRequirements:{requirement:requirement+'\n课件须有完整视觉设计：保留苏州大学主题色，主标题独占顶部110px；正文左栏不超过460px，右栏留给宿主提供的真实插图。每页一个核心问题、3至5个信息块；每块正文30至65个汉字，标题不超过24字。把详细论述留给讲稿，屏幕上用听辨任务、音乐事实、对比要点和具体问题。为真实插图与原谱数据图解留足空间，禁止写‘此处插图’或用图片描述冒充图片。不要在不同页面重复同一句口号；认识作者、初听、音色、节奏、动机、比较、讨论和小组创作须有不同的教学内容与视觉安排。图表和例证必须来自当前原谱，禁止编造曲式、和声或作曲者。讨论页呈现可比较的观点和提问，不堆知识点。'}};
  let content=await generateSceneContent(outline,ai,contentOptions);
  if(!content)throw Error(`“${outline.title}”生成失败，已保留之前的环节`);
  if(outline.type==='slide')for(const element of content.elements||[])if(element.content)element.content=repairTimingClaims(element.content,checkNotes);
  let problems=outline.type==='slide'?timingErrors((content.elements||[]).map(e=>e.content||'').join('\n'),checkNotes):[];
  if(problems.length)content=await generateSceneContent(outline,(s,u)=>ai(s,u+'\n必须纠正：'+problems.join('\n')),contentOptions);
  if(!content||outline.type==='slide'&&timingErrors((content.elements||[]).map(e=>e.content||'').join('\n'),checkNotes).length)throw Error(`“${outline.title}”时值与原谱不符`);
  if(outline.type==='slide'&&visuals.get(outline.id)?.image)placeTeachingImage(content,visuals.get(outline.id).image,visuals.get(outline.id).additionalImages);
  if(outline.type==='slide')content=designClassroomSlide(content,{title:outline.title,cover:i===0});
  const preview=buildCompleteScene(outline,content,[],input.id,{sceneId:input.id+'-'+i});if(preview)emit({type:'scene',scene:{...preview,phase:'content'},progress:(base+next)/2,message:'已可查看：'+outline.title+'；正在准备讲解'});
  emit({type:'progress',progress:(base+next)/2,message:`正在编排讲解与师生问答：${outline.title}`});
  const openNote=context.openClass?' 公开课提质：每页speech须为可直接试讲的逐字稿；关键处用wb_open/wb_draw_text呈现板书结构；须明确小组协作任务与公开展示环节，讲稿与板书、课件保持一致。':'';
  const options={agents,languageDirective:'自然中文课堂讲解，每页讲稿不超过400字。师生发言明确身份。每页围绕内容安排教师动作：speech前用spotlight聚焦当前真实elementId，需要指出具体细节时用laser；需要梳理概念或对照关系时用wb_open和wb_draw_text/wb_draw_line板书，然后解释板书。讨论页用discussion(topic为当前作品具体问题)等待学生，不得把讨论写成一段教师独白；测验交助教评价。动作必须和论点对应，禁止为了凑数量逐一堆砌。'+openNote,ctx:{pageIndex:i,totalPages:outlines.length,allTitles:outlines.map(x=>x.title),previousSpeeches:[]}};
  // Keep embedded binary data out of the language model prompt.
  const actionContent=outline.type==='slide'?{...content,elements:(content.elements||[]).map(e=>e.type==='image'?{...e,src:'embedded-image:'+e.id}:e)}:content;
  let actions=await generateSceneActions(outline,actionContent,ai,options);
  for(const action of actions)if(action.type==='speech')action.text=repairTimingClaims(action.text,checkNotes);
  problems=outline.type==='slide'?timingErrors(actions.filter(a=>a.type==='speech').map(a=>a.text).join('\n'),checkNotes):[];
  if(problems.length)actions=await generateSceneActions(outline,actionContent,(s,u)=>ai(s,u+'\n必须纠正：'+problems.join('\n')),options);
  if(outline.type==='slide'&&timingErrors(actions.filter(a=>a.type==='speech').map(a=>a.text).join('\n'),checkNotes).length)throw Error(`“${outline.title}”讲稿时值仍有矛盾`);
  const scene=buildCompleteScene(outline,content,actions,input.id,{sceneId:input.id+'-'+i});if(!scene)throw Error('场景组装失败：'+outline.title);
  emit({type:'scene',scene:{...scene,phase:'ready'},progress:next,message:`已完成：${outline.title}`});
 }
 teachingDesign={};
 if(context.school){
  emit({type:'progress',progress:96,message:'正在编写'+context.stage+'音乐教案与课堂评价'});
  const lpSchema=context.openClass
   ? '只输出JSON对象：{"lessonType":"课型","learnerAnalysis":"学情，不能假称了解实际班级","drivingQuestion":"真实情境驱动问题（面向真实听众或真实任务，而非泛泛而谈）","deliverable":"可公开展示的产出物（如班级音乐展板、录制片段、现场表演方案）","objectives":["2至3条可观测目标，每条写明成功标准"],"keyPoints":["教学重点"],"difficulties":["难点与帮助方法"],"preparation":["所需材料"],"assessment":["具体评价证据"],"differentiation":["对不同基础学生的支持"],"teachingSteps":[{"title":"对应环节","teacherPrompt":"教师提问原话","studentActivity":"学生的音乐行为","anticipatedResponse":"可能的反应，不是实际反馈","followUp":"追问或帮助","evidence":"如何看见学习","boardDesign":"板书设计（关键词与结构）","script":"逐字讲稿/过渡语，须可直接用于公开课试讲","collaboration":"小组协作探究任务","assessment":"本环节嵌入式形成性评价"}]}。每项具体可用，不写宣传语。'
   : '只输出JSON对象：{"lessonType":"课型","learnerAnalysis":"学情，不能假称了解实际班级","objectives":["2至3条可观察目标"],"keyPoints":["教学重点"],"difficulties":["难点与帮助方法"],"preparation":["所需材料"],"assessment":["具体评价证据"],"differentiation":["对不同基础学生的支持"],"teachingSteps":[{"title":"对应环节","teacherPrompt":"教师提问原话","studentActivity":"学生的音乐行为","anticipatedResponse":"可能的反应，不是实际反馈","followUp":"追问或帮助","evidence":"如何看见学习"}]}。每项具体可用，不写宣传语。';
  teachingDesign=parseJsonResponse(await ai(lpSchema,'按本班学段、作品、课时和以下课程环节编写完整中国学校音乐教案'+(context.openClass?'（公开课提质版）':'')+'：'+JSON.stringify(outlines)));
  if(!teachingDesign||!Array.isArray(teachingDesign.objectives)||!Array.isArray(teachingDesign.teachingSteps))throw Error('教案结构未生成完整，已保留课程设置，可以重试');
 }

 Object.assign(lessonPlan,teachingDesign);emit({type:'plan',lessonPlan,progress:99,message:'教案已保存'});
 emit({type:'complete',progress:100,message:'课程已保存'});
}catch(error){emit({type:'error',message:error.message});process.exitCode=1;}
