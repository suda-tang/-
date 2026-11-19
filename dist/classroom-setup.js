export function scoreMeasureCount(score){
 let count=Number(score?.measures)||0;
 for(const event of score?.events||[])if(Number.isFinite(Number(event.measure)))count=Math.max(count,Number(event.measure));
 return Math.max(1,count);
}
export function classroomGoal(score,settings){
 if(!score)return '';
 const stage={primary:'小学',junior:'初中',senior:'高中'}[settings.schoolStage]||'高中';
 const range=settings.scope==='whole'?`全曲（第1—${scoreMeasureCount(score)}小节）`:`第${settings.start}—${settings.end}小节`;
 const names=(score.parts||score.midiParts||[]).map(p=>p.label||p.name||p.title).filter(Boolean);
 const evidence=[score.timeSignature?`拍号${score.timeSignature}`:'',score.tempo?`原谱速度${score.tempo} BPM`:'',names.length?`声部为${names.join('、')}`:''].filter(Boolean).join('，');
 const start=`以《${score.title||'当前作品'}》的${range}为材料，为${settings.level||stage+'学生'}安排${settings.duration||45}分钟的${settings.mode==='piano'?'钢琴课':stage+'音乐课'}。`;
 const tasks=settings.mode==='piano'?'先听示范，再从实际谱面找出节奏、分句和声部平衡的难点，安排分段练习与合奏验证。':settings.schoolStage==='primary'?'从聆听、模唱和身体律动开始，让学生用自己的声音或动作回应音乐，再比较听到的不同。':settings.schoolStage==='junior'?'安排初听、旋律模唱和音乐要素比较，让学生用谱面和聆听证据说明判断，再做短句改编。':'围绕音乐表现与结构安排完整聆听、片段对比和讨论，让学生说明依据；历史背景与作者信息须核验，不把鉴赏课上成钢琴训练。';
 const activities=[settings.features?.includes('interactive')?'加入能控制本曲真实播放的互动活动':'',settings.features?.includes('pbl')?'安排小组合作创作与展示':'',settings.features?.includes('quiz')?'用课堂提问检查理解':''].filter(Boolean).join('，');
 return start+(evidence?'以当前谱面为准：'+evidence+'。':'')+tasks+(activities?activities+'。':'');
}
