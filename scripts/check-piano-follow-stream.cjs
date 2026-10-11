const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/scores',r=>r.fulfill({json:{scores:[]}}));await page.goto('http://127.0.0.1:5173/');
 const result=await page.evaluate(async()=>{
  const {PitchListener,Follower}=await import('/engine.js'),events=[{beat:0,measure:1,pitches:[48,60]},{beat:1,measure:1,pitches:[62]},{beat:2,measure:1,pitches:[64]}];
  const offline=new OfflineAudioContext(1,Math.ceil(2.8*44100),44100);
  for(const [i,event] of events.entries())for(const midi of event.pitches){const root=21+Math.round((midi-21)/3)*3,name=['C','Cs','D','Ds','E','F','Fs','G','Gs','A','As','B'][root%12]+(Math.floor(root/12)-1),response=await fetch('/assets/piano/salamander/'+name+'v8.mp3');const source=offline.createBufferSource(),gain=offline.createGain();source.buffer=await offline.decodeAudioData(await response.arrayBuffer());source.playbackRate.value=2**((midi-root)/12);gain.gain.value=.65/Math.sqrt(event.pitches.length);source.connect(gain);gain.connect(offline.destination);source.start(.15+i*.7);source.stop(.15+i*.7+.5);}
  const rendered=await offline.startRendering(),output=new AudioContext();await output.resume();const destination=output.createMediaStreamDestination(),original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async()=>destination.stream;
  // Exercise imported MIDI's notes-only shape through the actual microphone
  // pipeline, not just the parser's precomputed pitches fixture.
  const midiEvents=events.map(({pitches,...event})=>({...event,notes:pitches.map(midi=>({midi}))}));
  const heard=[],statuses=[],records=[],follower=new Follower(midiEvents,60/.7),listener=new PitchListener();
  await listener.start((pitches,t,meta)=>{heard.push({pitches,t,meta});records.push(...follower.consume(pitches,t));},()=>{},()=>3,s=>statuses.push(s));
  const source=output.createBufferSource();source.buffer=rendered;source.connect(destination);source.start(output.currentTime+.2);await new Promise(r=>setTimeout(r,3400));await listener.finish();listener.stop();navigator.mediaDevices.getUserMedia=original;await output.close();return {heard,records,index:follower.index,statuses,tracksEnded:destination.stream.getTracks().every(t=>t.readyState==='ended')};
 });
 assert.equal(result.index,3,JSON.stringify(result));assert.equal(result.records.filter(r=>r.type==='correct').length,3,JSON.stringify(result));assert.ok(result.tracksEnded);assert.ok(!result.statuses.some(s=>s.phase==='error'),JSON.stringify(result.statuses));assert.deepEqual(errors,[]);console.log(JSON.stringify({index:result.index,records:result.records.map(r=>({type:r.type,expected:r.expected,heard:r.heard})),tracksEnded:result.tracksEnded,errors}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
