import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePracticePlan,matchesPracticeStep} from '../dist/practice-plan.js';
import {groupOnsets,resampleMono,PolyphonicPitchStream} from '../dist/pitch-stream.js';
const context={version:'local:123',measures:[0,1,2,4]},plan={scoreVersion:'local:123',goal:'两小节慢练',steps:[{start:0,end:2,bpm:60,rounds:3,method:'每次先核对低音，再合手。',criterion:'自己核对相邻起音是否均匀。'}]};
test('transferred audio retains its commit timeline',async()=>{
 const heard=[],stream=new PolyphonicPitchStream((p,t)=>heard.push({p,t}));
 stream.infer=async samples=>{structuredClone(samples.buffer,{transfer:[samples.buffer]});return [{pitch:60,start:.3,duration:.2,confidence:.8}];};
 stream.enqueue(new Float32Array(22050),5);await stream.finish();
 assert.deepEqual(heard,[{p:[60],t:5.3}]);assert.equal(stream.committed,5.8);
});
test('structured proposal is bound to the loaded score and supported controls',()=>{
 assert.deepEqual(validatePracticePlan(JSON.stringify(plan),context),plan);
 for(const change of [{scoreVersion:'old'},{delete:true},{steps:[]},{steps:[{...plan.steps[0],bpm:241}]},{steps:[{...plan.steps[0],end:99}]},{steps:[{...plan.steps[0],rounds:true}]},{steps:[{...plan.steps[0],start:3,end:3}]},{steps:[{...plan.steps[0],microphone:true}]}])assert.throws(()=>validatePracticePlan({...plan,...change},context));
 assert.ok(matchesPracticeStep({range:{start:0,end:2},bpm:60},plan.steps[0]));assert.ok(!matchesPracticeStep({range:null,bpm:60},plan.steps[0]));
});
test('onset windows group actual chords and reject low-confidence/duplicate boundaries',()=>{
 const notes=[{pitch:60,start:.3,duration:.3,confidence:.8},{pitch:64,start:.32,duration:.4,confidence:.7},{pitch:67,start:.34,duration:.3,confidence:.9},{pitch:72,start:.8,duration:.3,confidence:.1},{pitch:60,start:1,duration:.3,confidence:.8}];
 const first=groupOnsets(notes,5,0,1);assert.equal(first.length,1);assert.deepEqual(first[0].pitches,[60,64,67]);assert.equal(first[0].time,5.3);assert.equal(groupOnsets(notes,5,1,2)[0].time,6);
});
test('resampling preserves silence/DC, duration and sample ownership',()=>{
 const src=new Float32Array(48000).fill(.25),out=resampleMono(src,48000);assert.equal(out.length,22050);assert.ok(out.every(v=>Math.abs(v-.25)<1e-6));assert.notEqual(resampleMono(out,22050),out);
});
