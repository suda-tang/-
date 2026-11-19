import assert from 'node:assert/strict';
import {classroomControlIntent,classroomIntent} from '../dist/ai-classroom-intent.js';
const payload=text=>({messages:[{role:'user',content:text}],context:{currentId:'score',current:'测试作品',classroom:{open:true}}});
for(const [text,operation]of [['课堂状态','status'],['进入音乐课堂','open'],['PPT第2页','goto_slide'],['下一页','next'],['上一页','previous'],['播放PPT','present'],['收起PPT','minimize'],['开始讲解','speak'],['暂停讲解','pause'],['课堂聆听作品','listen'],['讲解语速调到1.4倍','rate'],['关闭连续讲解','continuous'],['补充课件插图','images'],['老师，为什么这里用减七和弦','ask'],['学生提问','ask'],['导出PPT','export'],['把课堂改成初中','configure']])assert.equal(classroomControlIntent(payload(text))?.actions[0].value.operation,operation,text);
assert.equal(classroomControlIntent(payload('讲解语速调到1.4倍，再打开节拍器')),null);
assert.equal(classroomIntent(payload('生成第1到4小节的高中音乐课PPT')).actions[0].value.scope,'range');
assert.equal(classroomIntent(payload('生成PPT，然后播放钢琴')),null);
assert.equal(classroomIntent(payload('找一首作品生成PPT')),null);
console.log('PASS 21 classroom intent checks');

const {normalizeClassroomCommand}=await import('../dist/classroom-command.js');
for(const command of [{operation:'configure',start:1,end:4},{operation:'configure',settings:{range:{from:1,to:4}}},{operation:'configure',settings:{from:1,to:4}}]){const value=normalizeClassroomCommand(command);assert.equal(value.settings.scope,'range');assert.equal(value.settings.start,1);assert.equal(value.settings.end,4);}
assert.throws(()=>normalizeClassroomCommand({operation:'configure',settings:{unsupported:true}}));
console.log('PASS classroom parameter normalization and empty-update rejection');
