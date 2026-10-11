import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceEvidence} from '../dist/practice-evidence.js';
import {validateArrangementIntent} from '../dist/arrangement-intent.js';
import {scoreEvidence} from '../dist/score-evidence.js';
const capabilities={styles:[{id:'custom'},{id:'strings'},{id:'original'}],programs:[{id:40},{id:42}]};
test('custom arrangement accepts exact supported IDs',()=>{
 assert.deepEqual(validateArrangementIntent({style:'custom',programs:[40,42],drums:false},capabilities),{style:'custom',programs:[40,42],drums:false});
});
test('invalid arrangement proposals cannot partly apply',()=>{
 for(const programs of [[],[40,40],[999],['40'],[true]])assert.throws(()=>validateArrangementIntent({style:'custom',programs,drums:false},capabilities));
 assert.throws(()=>validateArrangementIntent({style:'strings',programs:[40],drums:false},capabilities));
 assert.throws(()=>validateArrangementIntent({style:'strings',drums:'false'},capabilities));
});
test('simulation cannot become student evidence',()=>assert.equal(practiceEvidence([{source:'simulation',measure:1,type:'wrong'}]),null));
test('opposite timing errors do not cancel in stability evidence',()=>{
 const result=practiceEvidence([-100,100].map(offsetMs=>({source:'microphone',measure:2,type:'wrong',offsetMs,expected:[60],heard:[61]})));
 assert.equal(result.measures[0].meanOffsetMs,0);
 assert.equal(result.measures[0].meanAbsoluteOffsetMs,100);
 assert.equal(result.measures[0].timingSpreadMs,100);
 assert.equal(result.measures[0].pitchPairs[0].count,2);
 assert.deepEqual(result.reviewMeasures,[2]);
});
test('missing timing is unknown, not zero',()=>{
 const result=practiceEvidence([{source:'microphone',measure:1,type:'missed'}]);
 assert.equal(result.measures[0].meanAbsoluteOffsetMs,null);
 assert.equal(result.measures[0].timingSpreadMs,null);
});
test('score evidence describes the active arrangement, excludes drum pitches and preserves empty bars',()=>{
 const result=scoreEvidence({generated:true,arrangementKey:'version-2',measures:4,events:[{measure:2,notes:[{midi:60,part:'p1',duration:.5},{midi:72,part:'p2',duration:1},{midi:36,part:'drums',percussion:true}]}]});
 assert.equal(result.arrangementKey,'version-2');assert.equal(result.measureCount,4);
 assert.equal(result.measures[0].measure,2);assert.equal(result.measures[0].notes,2);
 assert.equal(result.measures[0].pitchMin,60);assert.equal(result.measures[0].shortestDuration,.5);
 assert.equal(result.parts.length,2);assert.equal(scoreEvidence(null),null);
});
