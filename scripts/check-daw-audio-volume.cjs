const assert=require('node:assert/strict');const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/portrait-upload.html');
const result=await p.evaluate(async()=>{
 const {ScorePlayer}=await import('/player.js'),{DawView}=await import('/daw.js'),{VocalTransport}=await import('/vocal-transport.js');
 const player=new ScorePlayer();await player.unlock();const ctx=player.context;const host=document.createElement('div');document.body.append(host);
 const score={tempo:80,totalBeats:8,events:[{beat:0,measure:1,notes:[{part:'P1',instrument:'flute',midi:72,duration:8},{part:'P2',instrument:'violin',midi:60,duration:8}]}]};
 player.load(score);player.clockTime=ctx.currentTime;player.clockBeat=0;const daw=new DawView(host,player,()=>{},()=>{});daw.load(score);daw.show();
 const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.sin(i/ctx.sampleRate*2*Math.PI*440)*.3;
 player.instrumentBanks.set('flute',new Map(Array.from({length:128},(_,i)=>[i,buffer])));player.sound(score.events[0].notes[0],8,.6,0,ctx.currentTime);
 const analyser=ctx.createAnalyser();player.partBus('P1').connect(analyser);const samples=new Float32Array(analyser.fftSize);const rms=async()=>{await new Promise(r=>setTimeout(r,650));analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((s,n)=>s+n*n,0)/samples.length);};
 const full=await rms();const slider=host.querySelector('[aria-label="长笛音量"]');slider.value='20';slider.dispatchEvent(new Event('input'));const low=await rms();slider.value='0';slider.dispatchEvent(new Event('input'));const zero=await rms();
 const audio=new Audio(),vocal=new VocalTransport(audio,()=>player);vocal.connect();vocal.setVolume(.25);await new Promise(r=>setTimeout(r,650));const vocalGain=vocal.volumeBus.gain.value;vocal.setVolume(0);await new Promise(r=>setTimeout(r,650));const vocalZero=vocal.volumeBus.gain.value;
 const result={state:ctx.state,bus:player.partBus('P1').gain.value,full,low,zero,vocalGain,vocalZero,otherVolume:player.partVolumes.get('P2')??1};player.stop();await ctx.close();return result;
});console.log(result);assert.ok(result.full>.001);assert.ok(result.low/result.full<.3&&result.low/result.full>.1);assert.ok(result.zero<.0001);assert.ok(Math.abs(result.vocalGain-.25)<.002);assert.ok(result.vocalZero<.002);assert.equal(result.otherVolume,1);console.log('PASS real audio gain',result);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
