import test from 'node:test';
import assert from 'node:assert/strict';
import {detectPitches,Follower,summarize} from '../dist/engine.js';

const event=(beat,pitches)=>({beat,pitches,measure:Math.floor(beat/4)+1});
test('MIDI notes without derived pitches follow correctly without mutating score',()=>{
 const events=[{beat:0,measure:1,notes:[{midi:60},{midi:64},{midi:60},{midi:36,percussion:true}]},{beat:1,measure:1,notes:[{midi:62}]}];
 const follower=new Follower(events,80);
 assert.equal(follower.consume([60,64],0)[0].type,'correct');
 assert.equal(follower.consume([62],1)[0].type,'correct');
 assert.equal(follower.index,2);assert.equal(events[0].pitches,undefined);
});
test('events without pitched material do not crash or invent a match',()=>{
 const follower=new Follower([{beat:0,measure:1,notes:[]}],80);
 assert.equal(follower.consume([60],0)[0].type,'extra');assert.equal(follower.index,0);
});
test('silence is not an onset and has no invented metrics',()=>{assert.deepEqual(detectPitches(new Float32Array(8192),44100),[]);const f=new Follower([event(0,[60])],80);assert.deepEqual(f.consume([],0),[]);assert.equal(f.index,0);assert.equal(summarize([],80).accuracy,null);});
test('middle-register single tones and non-octave triads',()=>{for(const notes of [[60],[69],[72],[60,64,67]]){const samples=Float32Array.from({length:8192},(_,i)=>notes.reduce((sum,n)=>sum+.1*Math.sin(2*Math.PI*440*2**((n-69)/12)*i/44100),0));assert.deepEqual(detectPitches(samples,44100),notes);}});
test('lookahead records skipped notes but unrelated input cannot drag the score forward',()=>{const f=new Follower([event(0,[60]),event(1,[62]),event(2,[64]),event(3,[65])],60);assert.equal(f.consume([60],0)[0].type,'correct');const result=f.consume([64],2);assert.deepEqual(result.map(r=>r.type),['missed','correct']);assert.equal(f.consume([66],3)[0].type,'extra');assert.equal(f.index,3);assert.equal(f.consume([65],4)[0].type,'correct');assert.equal(f.index,4);});
test('tempo is normalized by score beat intervals, pause reanchors time',()=>{const f=new Follower([event(0,[60]),event(2,[62]),event(3,[64]),event(4,[65])],120);const rows=[...f.consume([60],10),...f.consume([62],11),...f.consume([64],11.5)];assert.equal(summarize(rows,120).bpm,120);assert.equal(summarize(rows,120).rhythm,100);f.pause();assert.equal(f.consume([65],0)[0].offsetMs,null);});
test('extra notes reduce pitch F1 and do not inflate score',()=>{const f=new Follower([event(0,[60,64,67])],80);const row=f.consume([60,64,67,70],0);assert.equal(summarize(row,80).accuracy,86);assert.equal(row[0].type,'wrong');});
