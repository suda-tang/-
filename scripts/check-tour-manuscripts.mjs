import assert from 'node:assert/strict';
import {chapters} from '../dist/tour-chapters.js';
import {createTourCopy} from '../dist/tour-copy.js';
import {manuscripts} from '../dist/tour-manuscripts.js';
// Copy edits must preserve the actions, targets and chapter links already in use.
for(const route of ['education','technology']){
 const steps=createTourCopy(route);
 assert.equal(Object.keys(manuscripts[route]).length,44);
 assert.equal(steps.length,44);
 for(const step of steps){
  const original=chapters.find(c=>c.id===step.id);
  assert.equal(step[0],original.panel);assert.equal(step[1],original.target);
  assert.ok(step[2].length>=3&&step[2].length<=22,route+'/'+step.id+' title');
  assert.ok(step[3].length>=80,route+'/'+step.id+' incomplete manuscript');
  assert.ok(!/假装|一首作品，一堂课|下面让我们|赋予.*灵魂/.test(step[3]));
  assert.notEqual(step[2],original.title);
  assert.notEqual(step[3],original.text);
  assert.equal(step.demo,step.id==='classroom-design'?'classroom-configure':step.id==='classroom-actions'?'classroom-status':original.demo);
 }
 console.log('PASS',route,'44 authored titles/bodies, targets and actions preserved');
}
for(const original of chapters){assert.notEqual(manuscripts.education[original.id][1],manuscripts.technology[original.id][1]);}
console.log('PASS 88 separate Chinese manuscripts, distinct route emphasis');
