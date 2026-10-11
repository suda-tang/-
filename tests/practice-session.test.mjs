import test from 'node:test';
import assert from 'node:assert/strict';
import {passageBounds,scoreVersion,practiceAdvice} from '../dist/practice-session.js';
import {Follower} from '../dist/engine.js';
import {practiceEvidence} from '../dist/practice-evidence.js';
const events=[{measure:0,beat:0,pitches:[60]},{measure:1,beat:1,pitches:[62]},{measure:1,beat:2,pitches:[64]},{measure:2,beat:3,pitches:[65]}];
test('passage preserves global indices and cannot follow beyond its end',()=>{
 const b=passageBounds(events,{start:1,end:1});assert.deepEqual(b,{start:1,end:3,count:2});
 const f=new Follower(events.slice(0,b.end),80);f.index=b.start;
 assert.equal(f.consume([62],0)[0].index,1);assert.equal(f.consume([64],.75)[0].index,2);assert.deepEqual(f.consume([65],1.5),[]);
 assert.deepEqual(passageBounds(events,{start:9,end:10}),{start:0,end:0,count:0});
});
test('pause resumes with no fabricated timing interval',()=>{
 const f=new Follower(events,80);f.consume([60],0);f.pause();assert.equal(f.consume([62],300)[0].offsetMs,null);
});
test('simulation is not practice evidence; differences identify actual measures',()=>{
 const f=new Follower(events,80);const rows=f.consume([61],0);
 assert.equal(practiceEvidence(rows.map(r=>({...r,source:'simulation'}))),null);
 const evidence=practiceEvidence(rows.map(r=>({...r,source:'microphone'})));assert.deepEqual(evidence.reviewMeasures,[0]);assert.match(practiceAdvice(evidence,80),/第 0 小节/);
});
test('history separates changed score versions',()=>{
 assert.equal(scoreVersion({events}),scoreVersion({events}));assert.notEqual(scoreVersion({events}),scoreVersion({events:events.slice(1)}));assert.equal(scoreVersion(null),'');
});
