// Explicit course preparation can bypass model latency; execution still validates the live score.
export function classroomIntent(payload){
 const text=String([...payload.messages||[]].reverse().find(m=>m.role==='user')?.content||'');
 const preparation=/备课|备(?:一|这|下).{0,8}课|(?:生成|创建|制作|做|准备|设计|安排|整理|写|完善|优化|补全).{0,24}(?:PPT|课件|教案|课程|音乐课|这节课)|(?:PPT|课件|教案|课程|这节课).{0,18}(?:生成|创建|制作|做|准备|设计|备|整理|完善|写|安排|补全|优化)/i;
 if(!preparation.test(text)||/(?:不要|先不|别)[^，,。；;]{0,4}(?:生成|创建|制作|准备|备课|做)|如何|怎么做/.test(text))return null;
 if(/(?:并|然后|同时).*(?:播放|静音|独奏|节拍器|切换|打开曲库)/.test(text)||(/^(?:请|帮我)?(?:找|搜|推荐)/.test(text)&&! /当前|这首/.test(text)))return null;
 const context=payload.context||{};
 if(!context.currentId)return {reply:'先选择要讲授的曲谱，再生成对应课件。',actions:[{type:'panel',value:'library'}]};
 if([...text.matchAll(/《([^》]+)》/g)].some(m=>!String(context.current||'').includes(m[1])))return null;
const course=context.classroom,previous=course?.scoreId===context.currentId?course.settings||{}:{};
 if(course?.id&&course.scoreId===context.currentId&&!/重新|重做|小学|初中|高中|分钟|小节|视角|要求|加入|增加|改|完善|优化/.test(text)&&['queued','generating','complete'].includes(course.status))return {reply:course.status==='complete'?'这节课已有课件，我先打开现有课堂。':'这节课正在生成，我打开课堂查看当前进度。',actions:[{type:'classroom',value:{operation:'open'}},{type:'classroom',value:{operation:'status'}}]};
 const settings={goal:previous.goal||text,schoolStage:text.includes('小学')?'primary':text.includes('初中')?'junior':text.includes('高中')?'senior':previous.schoolStage||'senior',mode:text.includes('钢琴教学')?'piano':previous.mode||'classroom',scope:'whole'};
 if(previous.duration)settings.duration=previous.duration;
 if(/小学|初中|高中|视角|要求|加入|增加|改|完善|优化/.test(text))settings.goal=text;

 const range=text.match(/第?(\d+)\s*(?:到|至|—|-)\s*(\d+)小节/);if(range){settings.scope='range';settings.start=Number(range[1]);settings.end=Number(range[2]);}
 const duration=text.match(/(20|35|40|45|90)\s*分钟/);if(duration)settings.duration=duration[1];
 return {reply:'按当前曲谱准备课程和 PPT，生成进度会显示在课堂和任务中心。',actions:[{type:'create_classroom',value:settings}]};
}

export function transportIntent(payload){
 if(payload.repair)return null;
 const text=String([...payload.messages||[]].reverse().find(m=>m.role==='user')?.content||'').trim(),context=payload.context||{};
 if(!context.currentId)return null;
 if(/^(?:请|现在)?(?:开始|继续|恢复)?播放[。！!]?$/u.test(text))return {reply:'开始播放。',actions:[{type:'play',value:''}]};
 const match=text.match(/^从第?(\d+)小节(?:开始)?(?:只)?播放(.*?)[。！!]?\s*$/u);if(!match)return null;
 const number=Number(match[1]);if(number<1||number>Number(context.measureCount||0))return null;
 const target=match[2].trim().replace(/声部$/u,''),actions=[];
 if(target){const parts=(context.parts||[]).filter(p=>p.value!=='all'&&String(p.name||p.label||'').trim().replace(/声部$/u,'')===target);if(parts.length!==1)return null;actions.push({type:'solo',value:parts[0].value});}
 actions.push({type:'seek_measure',value:String(number)},{type:'play',value:''});
 return {reply:'从第 '+number+' 小节播放'+target+'。',actions};
}

function workNumber(text){
 let match=text.match(/第?([0-9一二三四五六七八九十百]+)\s*(交响曲|协奏曲|奏鸣曲)/i),kind,raw;
 if(match){raw=match[1];kind=match[2];}else{match=text.match(/(symphony|concerto|sonata)\s*(?:no\.?|number|第)?\s*(\d+)(?!\d)/i);if(!match)return null;kind=match[1].toLowerCase();raw=match[2];}
 let number=Number(raw);if(!number){const digits='零一二三四五六七八九';if(raw.includes('十')){const [a,b]=raw.split('十');number=(a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}else number=digits.indexOf(raw);}
 return [({'交响曲':'symphony','协奏曲':'concerto','奏鸣曲':'sonata'})[kind]||kind,number].join(':');
}
export function numberedWorkIntent(payload){
 const text=String([...payload.messages||[]].reverse().find(m=>m.role==='user')?.content||'');const work=workNumber(text);
 if(!work||! /^(?:请|帮我|找|搜|查找|推荐|想听|我要听)/.test(text)||/分析|和弦|播放|小节|不要|排除|联网/.test(text))return null;
 const composers=[['贝多芬','beethoven'],['德沃夏克','dvorak'],['马勒','mahler'],['舒伯特','schubert'],['海顿','haydn'],['莫扎特','mozart'],['肖斯塔科维奇','shostakovich']];
 const matches=(payload.context?.scores||[]).filter(item=>item.ready!==false&&item.status!=='failed'&&workNumber(item.title||'')===work&&composers.every(([zh,en])=>!(text.includes(zh)||text.toLowerCase().includes(en))||String(item.title).includes(zh)||String(item.title).toLowerCase().includes(en)));
 return matches.length?{reply:'曲库里有这些版本，请选择。',actions:[{type:'choose_scores',value:matches}]}:{reply:'先按作品名称检索曲库。',actions:[{type:'search',value:text}]};
}

export const classroomOperations=['status','open','close','configure','goto_slide','next','previous','present','minimize','speak','pause','stop','listen','rate','continuous','export','images','ask'];
export function classroomControlIntent(payload){
 const text=String([...payload.messages||[]].reverse().find(m=>m.role==='user')?.content||'').trim(),state=payload.context?.classroom;
 if(payload.repair||!(/课堂|讲课|讲解|课件|PPT|幻灯片/i.test(text)||state?.open))return null;
 const answer=value=>({reply:'正在处理课堂操作。',actions:[{type:'classroom',value}]});
 const stage=text.match(/^(?:把|将)?(?:课堂|课程)(?:的)?(?:对象)?(?:改成|改为|设为)(小学|初中|高中)(?:学生|课堂)?$/);if(stage)return answer({operation:'configure',settings:{schoolStage:{小学:'primary',初中:'junior',高中:'senior'}[stage[1]]}});
 if(/^(?:请)?(?:打开|展开|进入)(?:曲谱课堂|音乐课堂|课堂)$/.test(text))return answer({operation:'open'});
 if(/^(?:查看|查询|看看)?(?:课堂|课程|课件)(?:的)?(?:进度|状态|生成进度)[？?。]?$/.test(text))return answer({operation:'status'});
 if(/^(?:请)?(?:关闭|收起)(?:曲谱课堂|音乐课堂|课堂)$/.test(text))return answer({operation:'close'});
 if(/^(?:请)?(?:播放|放映|全屏播放|全屏放映)\s*(?:PPT|课件|幻灯片)$/i.test(text))return answer({operation:'present'});
 if(/^(?:退出放映|收起PPT|退出PPT全屏|收起课件|课堂最小化)$/i.test(text))return answer({operation:'minimize'});
 const page=text.match(/^(?:请)?(?:跳到|转到|切到|打开)?(?:PPT|课件|幻灯片)?第?(\d+)页[。]?$/i);if(page)return answer({operation:'goto_slide',page:Number(page[1])});
 if(/^(?:下一页|下一环节|课堂下一页|PPT下一页)$/i.test(text))return answer({operation:'next'});
 if(/^(?:上一页|上一环节|课堂上一页|PPT上一页)$/i.test(text))return answer({operation:'previous'});
 if(/^(?:开始|继续|恢复)(?:讲课|讲解|课堂讲解)$/.test(text))return answer({operation:'speak'});
 if(/^(?:暂停|停一下)(?:讲课|讲解|课堂讲解)$/.test(text))return answer({operation:'pause'});
 if(/^(?:停止|结束)(?:讲课|讲解|课堂讲解)$/.test(text))return answer({operation:'stop'});
 if(/^(?:课堂)?(?:聆听作品|播放课堂音乐|听一下当前作品)$/.test(text))return answer({operation:'listen'});
 const rate=text.match(/^(?:把)?(?:讲解|课堂|老师)(?:的)?语速(?:调到|改为|设为)([\d.]+)(?:倍|倍速)?$/);if(rate)return answer({operation:'rate',rate:Number(rate[1])});
 const continuous=text.match(/^(打开|开启|关闭)连续讲解$/);if(continuous)return answer({operation:'continuous',enabled:continuous[1]!=='关闭'});
 if(/^(?:导出|下载)(?:当前)?(?:PPT|课件)$/i.test(text))return answer({operation:'export'});
 if(/^(?:补充|补上|重新获取)(?:PPT|课件)?(?:联网)?(?:图片|插图)$/i.test(text))return answer({operation:'images'});
 if(/^(?:请)?(?:老师|课堂老师)[，,:：]/.test(text))return answer({operation:'ask',question:text.replace(/^(?:请)?(?:老师|课堂老师)[，,:：]/,''),role:'teacher'});
 if(/^(?:让|请)?(?:模拟)?学生(?:提问|发言)[：:]?/.test(text))return answer({operation:'ask',question:text,role:'student'});
 return null;
}
