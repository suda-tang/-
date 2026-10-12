import test from 'node:test';
import assert from 'node:assert/strict';
import {timingErrors,repairTimingClaims} from './score-evidence.mjs';
const notes=[{measure:1,pitch:{step:'A',octave:'2'},duration:1},{measure:1,pitch:{step:'D',octave:'3'},duration:1}];
test('rejects invented durations in a pickup bar',()=>{assert.equal(timingErrors('第1小节A2、D3各两拍',notes).length,2);assert.equal(timingErrors('第一小节，A2两拍，然后D3两拍',notes).length,2)});
test('allows correctly stated and ambiguous durations',()=>{assert.deepEqual(timingErrors('第1小节，A2（1拍）→D3（1拍）',notes),[]);assert.deepEqual(timingErrors('第2小节，A2两拍',notes),[])});
test('one pitch claim does not spill into its neighbour',()=>{assert.deepEqual(timingErrors('第1小节A2一拍，D3两拍',[notes[0],{...notes[1],duration:2}]),[])});
test('low register speech without octave is checked against bass staff',()=>{assert.equal(timingErrors('左手。第一小节：低音A弹两拍，然后D弹两拍',notes.map(n=>({...n,staff:'2'}))).length,2)});

 test('bar count does not become a note duration claim',()=>{assert.deepEqual(timingErrors('第1小节A2一拍，共四拍。',notes),[])});

test('repair uses original single-note durations, preserves ambiguous pitches',()=>{assert.equal(repairTimingClaims('第1小节A2两拍',notes),'第1小节A2，时值为1个四分音符');assert.equal(repairTimingClaims('第1小节A两拍',[...notes,{...notes[0],duration:2}]),'第1小节A两拍')});

test('shared duration claims repaired per original pitch',()=>{assert.deepEqual(timingErrors(repairTimingClaims('第1小节A2、D3各两拍',notes),notes),[]);assert(repairTimingClaims('第1小节A2、D3各两拍',notes).includes('A2（时值为1个四分音符）'))});
