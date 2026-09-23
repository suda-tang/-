const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/');const result=await p.evaluate(async()=>{
 const {ScorePlayer}=await import('/player.js');const player=new ScorePlayer();
 player.load({totalBeats:4,events:[{measure:1,offset:0,beat:0,notes:[{midi:60,duration:4}]}]});
 await player.unlock();await player.loadSamples();const samples=player.samples;
 const renders=[];
 for(const velocity of [.1,.3,.5,.7,.9]){
  const ctx=new OfflineAudioContext(2,48000,24000);player.context=ctx;player.output=ctx.destination;
  player.sound({midi:60},4,velocity);const voice=[...player.voices].at(-1);
  const audio=await ctx.startRendering();const channel=audio.getChannelData(0);
  let power=0,peak=0;for(const value of channel){power+=value*value;peak=Math.max(peak,Math.abs(value));}
  renders.push({layer:voice.layer,rms:Math.sqrt(power/channel.length),peak});
 }
 return {count:samples.length,durations:samples.map(s=>s[1].duration),renders};
 });assert.equal(result.count,5);assert.deepEqual(result.renders.map(r=>r.layer),[2,5,8,11,15]);assert.ok(result.renders.every(r=>r.rms>.0001&&r.peak<1));assert.ok(result.renders[4].rms>result.renders[0].rms);console.log(JSON.stringify(result));console.log('PASS: five distinct recordings decode, render audible audio and follow touch strength');}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
