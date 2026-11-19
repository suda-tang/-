import assert from 'node:assert/strict';
import {targetReached} from '../dist/ai-action-state.js';
for(const [action,state] of [
 [{type:'open',value:'score-a'},{scoreId:'score-a'}],
 [{type:'view',value:'daw'},{viewMode:'daw'}],
 [{type:'set_tempo',value:90},{tempo:'90'}],
 [{type:'set_instrument',value:'violin'},{instrument:'violin'}],
 [{type:'set_arrangement',value:'chamber'},{arrangement:'chamber'}],
 [{type:'mute',value:'strings'},{muted:['strings']}],
 [{type:'unmute',value:'all'},{muted:[]}],
 [{type:'set_metronome',value:'off'},{metronome:false}]
])assert.equal(targetReached(action,state),true,action.type);
assert.equal(targetReached({type:'open',value:'score-b'},{scoreId:'score-a',title:'同名作品'}),false);
assert.equal(targetReached({type:'mute',value:'all'},{muted:['strings']}),false);
assert.equal(targetReached({type:'set_tempo',value:90},{tempo:80}),false);
assert.equal(targetReached({type:'unmute',value:'piano'},{muted:['piano']}),false);
assert.equal(targetReached({type:'play'},{}),false);
console.log('PASS 13 action target-state checks');
