import test from 'node:test';
import assert from 'node:assert/strict';
import {ScorePlayer} from '../dist/player.js';

function fixture() {
  const starts=[],pulses=[];
  const player=new ScorePlayer({onPulse:(beat,time)=>pulses.push({beat,time})});
  player.context={currentTime:0,state:'running',resume:async()=>{}};
  player.unlock=async()=>{};player.loadSamples=async()=>{};
  const events=Array.from({length:24},(_,i)=>({beat:i/4,notes:[{midi:60,duration:.25}]}));
  player.score=player.originalScore={events};player.totalBeats=6;player.bpm=120;
  player.sound=(note,end,velocity,delay,time)=>starts.push({beat:end-note.duration,time});
  return {player,starts,pulses};
}

test('irregular timer callbacks keep notes and metronome on the audio clock',async()=>{
  const {player,starts,pulses}=fixture();
  try {
    await player.play();clearInterval(player.timer);
    for(const time of [.031,.09,.17,.24,.35,.43,.55,.67,.76,.89,1.01,1.14]){
      player.context.currentTime=time;player.tick();
    }
    assert.ok(starts.length>=9);
    for(const note of starts)assert.ok(Math.abs(note.time-(.1+note.beat*.5))<1e-9);
    for(const pulse of pulses)assert.ok(Math.abs(pulse.time-(.1+pulse.beat*.5))<1e-9);
    assert.equal(new Set(starts.map(n=>n.beat)).size,starts.length);
  } finally {player.pause();}
});

test('render stalls of half a second do not compress note attacks',async()=>{
 const {player,starts}=fixture();
 try{await player.play();clearInterval(player.timer);
  for(const time of [.5,1,1.5,2]){player.context.currentTime=time;player.tick();}
  assert.ok(starts.length>=20);
  for(const n of starts)assert.ok(Math.abs(n.time-(.1+n.beat*.5))<1e-9);
 }finally{player.pause();}
});

test('pause cancels lookahead and resume requeues future notes without rewinding',async()=>{
  const {player,starts}=fixture();
  try {
    await player.play();clearInterval(player.timer);
    player.context.currentTime=.16;player.tick();player.pause();
    assert.ok(Math.abs(player.beat-.12)<1e-9);
    assert.equal(player.next,1);
    starts.length=0;player.context.currentTime=2;
    await player.play();clearInterval(player.timer);
    const future=starts.find(n=>n.beat===.25);
    assert.ok(future);assert.ok(Math.abs(future.time-2.165)<1e-9);
    assert.ok(Math.abs(player.beat-.12)<1e-9);
  } finally {player.pause();}
});

test('tempo change preserves position and applies the new beat spacing',async()=>{
  const {player,starts}=fixture();
  try {
    await player.play();clearInterval(player.timer);
    player.context.currentTime=.6;player.pause();
    assert.equal(player.beat,1);player.setTempo(60);starts.length=0;
    await player.play();clearInterval(player.timer);
    player.context.currentTime=.9;player.tick();
    const note=starts.find(n=>n.beat===1.25);
    assert.ok(note);assert.ok(Math.abs(note.time-.95)<1e-9);
  } finally {player.pause();}
});
