import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonActions} from '../dist/classroom-listening.js';
const music=actions=>actions.filter(a=>['music-listen','listen','play_music'].includes(a.type));
test('an explicit listening action after a visual cue is not played twice',()=>{
 const actions=[{type:'speech',text:'请大家聆听30秒。'},{type:'spotlight',elementId:'theme'},{type:'music-listen',seconds:30}];
 assert.equal(music(lessonActions(actions)).length,1);
});
test('a spoken prohibition overrides a listening instruction on the slide',()=>{
 const actions=[{type:'spotlight',elementId:'theme'},{type:'speech',text:'暂不播放，先看看旋律。'}];
 assert.equal(music(lessonActions(actions,[{id:'theme',text:'请大家聆听30秒'}])).length,0);
});
test('fallback inserts listening when no explicit action exists',()=>{
 const actions=[{type:'speech',text:'请大家聆听30秒。'},{type:'speech',text:'你觉得这段旋律有什么特点？'}];
 assert.equal(music(lessonActions(actions)).length,1);
 assert.equal(lessonActions(actions)[1].seconds,30);
});
test('a later invitation after another speech remains a separate listening action',()=>{
 const actions=[{type:'speech',text:'请大家聆听30秒。'},{type:'speech',text:'接下来播放第3小节。'},{type:'music-listen',startMeasure:3,endMeasure:3}];
 assert.equal(music(lessonActions(actions)).length,2);
});
