const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const {VocalTransport}=await import('data:text/javascript;base64,'+fs.readFileSync('dist/vocal-transport.js').toString('base64'));
 const audio={src:'',paused:true,currentTime:0,duration:100,playbackRate:1,load(){},removeAttribute(){},pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}};
 const p={bpm:120,clockTime:1,clockBeat:0,beat:0,playing:true,soloPart:'all',disabledParts:new Set(),context:{currentTime:1},timeAtBeat:b=>b*.5,beatAtTime:s=>s*2};
 const v=new VocalTransport(audio,()=>p);v.configure({serverId:'test',tempo:120,vocal:{mime:'audio/mpeg',offsetSeconds:-2,timeScale:1.05}});
 assert.equal(v.timeFor(0,false),-2);v.start();await new Promise(r=>setTimeout(r,60));assert.equal(audio.paused,true);
 p.context.currentTime=3.1;await new Promise(r=>setTimeout(r,70));assert.equal(audio.paused,false);assert.ok(Math.abs(audio.currentTime-.205)<.001);assert.ok(Math.abs(audio.playbackRate-1.05)<.001);
 v.pause();console.log({delayedEntry:true,recordingTempoScale:true});
})().catch(e=>{console.error(e);process.exit(1)});
