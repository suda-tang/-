import test from 'node:test';
import assert from 'node:assert/strict';
import {Follower} from '../dist/engine.js';
import {practiceInstruments,defaultPracticeInstrument,instrumentEvents,instrumentFollower} from '../dist/practice-instrument.js';
test('default piano and isolate selected notes without changing source',()=>{
 const score={midiParts:[{id:'v',name:'小提琴',instrument:'violin'},{id:'p',name:'钢琴',instrument:'piano'}],events:[{measure:1,beat:0,notes:[{midi:60,part:'p'},{midi:72,part:'v'}]}]};
 assert.equal(defaultPracticeInstrument(practiceInstruments(score)),'p');
 assert.deepEqual(instrumentEvents(score.events,'p')[0].pitches,[60]);
 assert.equal(score.events[0].notes.length,2);
});
test('instrument-only follower keeps global score indices across silent groups',()=>{
 const events=[{measure:1,beat:0,pitches:[60]},{measure:1,beat:1,pitches:[]},{measure:2,beat:2,pitches:[62]}];
 const follower=instrumentFollower(Follower,events,60,0,3);
 assert.equal(follower.consume([60],0)[0].index,0);assert.equal(follower.index,2);
 assert.equal(follower.consume([62],2)[0].index,2);assert.equal(follower.index,3);
});
