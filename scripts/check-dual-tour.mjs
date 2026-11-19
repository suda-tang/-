import assert from 'node:assert/strict';
import {createTourCopy} from '../dist/tour-copy.js';
import {tourAudience} from '../dist/tour-audiences.js';
const education=createTourCopy('education'),technology=createTourCopy('technology');
assert.equal(education.length,technology.length);
assert.ok(education.length>=44);
for(const steps of [education,technology]){
 assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
 assert.equal(steps[0].id,'opening');assert.equal(steps[1].id,'select');assert.equal(steps.at(-1).id,'research');
 assert.ok(steps.every(s=>s[3].length>50));
 assert.ok(steps.some(s=>s.demo==='classroom-configure'));
 assert.ok(steps.some(s=>s.demo==='ai-chords'));
}
assert.notEqual(education[0][3],technology[0][3]);
assert.notDeepEqual(education.map(s=>s.id),technology.map(s=>s.id));
assert.ok(education.findIndex(s=>s.id==='classroom-design')<education.findIndex(s=>s.id==='inputs'));
assert.ok(technology.findIndex(s=>s.id==='shared-time')<technology.findIndex(s=>s.id==='classroom-design'));
assert.equal(tourAudience('generation'),'technology');assert.equal(tourAudience('ensemble'),'education');
console.log('PASS two distinct',education.length,'chapter routes, complete chapter identities, current classroom and AI demonstrations');
