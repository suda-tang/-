const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const {VocalTransport}=await import('data:text/javascript;base64,'+fs.readFileSync('dist/vocal-transport.js').toString('base64'));
 const events={},writes=[];let rate=1,seeks=0,time=0;
 const audio={src:'',paused:true,muted:false,duration:100,load(){},removeAttribute(){},addEventListener(n,f){events[n]=f;},play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},get playbackRate(){return rate;},set playbackRate(v){writes.push(v);rate=v;},get currentTime(){return time;},set currentTime(v){seeks++;time=v;}};
 const p={bpm:120,beat:0,clockTime:1,clockBeat:0,playing:true,soloPart:'all',disabledParts:new Set(),context:{currentTime:1},timeAtBeat:b=>b*.5,beatAtTime:s=>s*2};
 const v=new VocalTransport(audio,()=>p);v.configure({serverId:'test',tempo:120,vocal:{mime:'audio/mpeg',offsetSeconds:-.3}});v.start();
 await new Promise(r=>setTimeout(r,70));assert.equal(audio.paused,true,'late vocal entry must not begin early');
 p.context.currentTime=1.4;await new Promise(r=>setTimeout(r,80));assert.equal(audio.paused,false);
 const initialSeeks=seeks;
 for(let i=0;i<100;i++){p.context.currentTime=2+i*.25;time=(p.context.currentTime-1)-.3+.2*Math.sin(i);v.sync();}
 events.waiting();events.playing();v.sync();assert.equal(seeks,initialSeeks,'buffer recovery and drift must not seek');assert.ok(writes.every(n=>n===1),'must not modulate vocal playback rate');
 p.bpm=150;p.context.currentTime+=.25;v.sync();assert.equal(audio.playbackRate,1.25);v.pause();console.log('PASS fixed-rate voice, delayed entry, no automatic seeking after buffering');
})().catch(e=>{console.error(e);process.exit(1)});
