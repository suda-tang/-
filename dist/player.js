import {loadInstrument,rootFor} from './instruments.js';
import {arrangeScore} from './harmony.js';
import {preparePerformance} from './performance.js';
import {loadPianoSamples,sampleRoot,selectLayer} from './piano-samples.js';
// Recorded loudness differs wildly between the shipped sources: the Salamander
// layers peak around 0.70 while the sustained GM bank (violin, cello, flute,
// clarinet, horn, harp, ensemble) sits near 0.11. Without compensation a string
// arrangement played back about six times quieter than the same score on piano.
// Measured peaks: salamander 0.63-0.74, GM bank 0.106-0.117, drums 0.193.
const BANK_GAIN=4,DRUM_GAIN=2.4;
export const sourceGain=name=>name==='drums'?DRUM_GAIN:name==='salamander'?1:BANK_GAIN;
export class ScorePlayer {
  constructor({onUpdate=()=>{},onEnd=()=>{},onLoad=()=>{},onPulse=()=>{}}={}) {
    Object.assign(this,{onUpdate,onEnd,onLoad,onPulse,bpm:80,beat:0,playing:false,score:null,next:0,voices:new Set(),context:null,generation:0,expressive:true,instrument:"salamander",arrangement:"original",instrumentBanks:new Map()});
  }
  async unlock() {
    try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
    if(!this.context||this.context.state==='closed') {
      const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
      this.context=new Context();this.output=this.context.createGain();this.output.gain.value=.9;
      // A safety limiter, not a mix compressor: a -12 dB threshold used to duck
      // every ordinary note and made the whole instrument sound quiet. It now
      // only catches dense chords, so single notes keep their full level.
      const limiter=this.context.createDynamicsCompressor();limiter.threshold.value=-2;limiter.knee.value=6;limiter.ratio.value=3;limiter.attack.value=.01;limiter.release.value=.2;
      this.output.connect(limiter);limiter.connect(this.context.destination);
      // A quiet stereo room tail, keeping the direct attack clear.
      const room=this.context.createConvolver(),wet=this.context.createGain();wet.gain.value=.10;
      const impulse=this.context.createBuffer(2,this.context.sampleRate*1.4,this.context.sampleRate);
      let seed=42;for(let c=0;c<2;c++){const data=impulse.getChannelData(c);for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/2147483648-1)*Math.exp(-7*i/data.length)*(i>this.context.sampleRate*.018?1:0);}}
      room.buffer=impulse;this.output.connect(room);room.connect(wet);wet.connect(limiter);
    }
    // Start a buffer in the original tap handler, before sample fetch/decode.
    // Safari requires this gesture to activate the output route reliably.
    const prime=this.context.createBufferSource();prime.buffer=this.context.createBuffer(1,1,this.context.sampleRate);prime.connect(this.context.destination);prime.start();prime.onended=()=>prime.disconnect();
    await this.context.resume();
    if(this.context.state!=='running')throw Error('请点击“自动演奏”以允许浏览器播放声音');
  }
  load(score) {
    this.stop();this.originalScore=score;this.performanceCache??=new WeakMap();let versions=this.performanceCache.get(score);if(!versions){versions=new Map();this.performanceCache.set(score,versions);}const key=this.arrangement+':'+this.instrument;if(!versions.has(key)){versions.set(key,preparePerformance(score.generated?score:arrangeScore(score,this.arrangement,this.instrument)));if(versions.size>4)versions.delete(versions.keys().next().value);}this.score=versions.get(key);this.samples=null;this.samplePromise=null;
    this.totalBeats=Math.max(score.totalBeats||0,...score.events.flatMap(e=>e.notes.map(n=>e.beat+n.duration)));
  }
  displayIndex(beat){const events=this.originalScore.events;let low=0,high=events.length;while(low<high){const mid=(low+high)>>1;if(events[mid].beat<=beat+.005)low=mid+1;else high=mid;}return Math.max(0,low-1);}
  setModelPerformance(result){this.modelPerformance={source:this.originalScore,...result};}
  setInstrument(name){const wasPlaying=this.playing,position=this.beat;this.instrument=name;if(this.originalScore){this.load(this.originalScore);this.restorePosition(position,wasPlaying);}}
  setArrangement(mode){const wasPlaying=this.playing,position=this.beat;this.arrangement=mode;if(this.originalScore){this.load(this.originalScore);this.restorePosition(position,wasPlaying);}}
  restorePosition(position,wasPlaying=false){if(!this.originalScore?.events?.length)return;this.pause();this.beat=Math.max(0,Math.min(this.totalBeats,Number(position)||0));this.next=this.score.events.findIndex(e=>e.beat>=this.beat-.0001);if(this.next<0)this.next=this.score.events.length;this.onUpdate({beat:this.beat,index:this.displayIndex(this.beat),totalBeats:this.totalBeats,playing:false});if(wasPlaying)void this.play();}
  setTempo(bpm) {
    const value=Number(bpm);if(!Number.isFinite(value)||value<30||value>240)throw Error('速度应为 30–240 BPM');
    const wasPlaying=this.playing;if(wasPlaying)this.pause();this.bpm=value;
    if(wasPlaying)void this.play();
  }
  async play() {
    if(!this.score)throw Error('请先导入可演奏的琴谱');
    const generation=++this.generation;await this.unlock();await this.loadSamples();if(generation!==this.generation)return;
    await this.context.resume();if(this.context.state!=='running')throw Error('声音未启动，请再次点击播放');
    if(this.playing)return;if(this.beat>=this.totalBeats)this.rewind();
    this.playing=true;this.lastTime=this.context.currentTime+.10;
    this.clockTime=this.lastTime;this.clockBeat=this.beat;
    this.nextPulse=Math.ceil(this.beat-.0001);
    for(const event of this.score.events.slice(0,this.next))for(const note of event.notes)
      if(event.beat<this.beat&&event.beat+note.duration>this.beat)this.sound(note,event.beat+note.duration,.72,0,this.clockTime);
    this.timer=setInterval(()=>this.tick(),25);this.tick();
    const paint=()=>{if(!this.playing)return;this.advance();if(!this.lastPaintTime||this.context.currentTime-this.lastPaintTime>=.06){this.lastPaintTime=this.context.currentTime;this.onUpdate({beat:this.beat,index:this.displayIndex(this.beat),totalBeats:this.totalBeats,playing:true});}this.paintFrame=requestAnimationFrame(paint);};this.paintFrame=requestAnimationFrame(paint);
  }
  advance(){
    const now=this.context.currentTime;
    // Keep the written beat grid authoritative. Expression changes attack and
    // release only; scaling the transport clock made rests and bar lines drift,
    // and a model performance must never move a written onset or duration.
    this.beat=this.clockBeat+Math.max(0,now-this.clockTime)*this.bpm/60;
    this.lastTime=now;
  }
  async loadSamples(){
    const needed=new Map();for(const e of this.score.events)for(const n of e.notes){const name=n.instrument||this.instrument;if(!needed.has(name))needed.set(name,[]);needed.get(name).push(n.midi);}
    let completed=0;for(const [name,notes] of needed){if(name!=='salamander'){this.instrumentBanks.set(name,await loadInstrument(this.context,name,notes,(done,total)=>this.onLoad(completed+done/total,needed.size)));}completed++;}
    if(!needed.has('salamander')){this.onLoad(1,1);return;}
    if(this.samples)return;
    if(!this.samplePromise)this.samplePromise=(async()=>{
      const score=this.score;const pairs=await loadPianoSamples(this.context,score,this.onLoad);
      if(this.score===score)this.samples=pairs;
    })().catch(error=>{this.samplePromise=null;throw error;});
    await this.samplePromise;
  }
  seek(index){
    if(!this.score)return;
    this.pause();index=Math.max(0,Math.min(this.originalScore.events.length-1,Math.floor(index)));
    this.beat=this.originalScore.events[index].beat;this.next=Math.max(0,this.score.events.findIndex(e=>e.beat>=this.beat));
    this.onUpdate({beat:this.beat,index,totalBeats:this.totalBeats,playing:false});
  }
  sound(note,endBeat,velocity=.72,delay=0,scheduledTime=null) {
    const oscillator=this.context.createBufferSource(),gain=this.context.createGain(),filter=this.context.createBiquadFilter();
    const layer=selectLayer(velocity);
    const instrument=note.instrument||this.instrument;const root=instrument==='salamander'?sampleRoot(note.midi):rootFor(note.midi,instrument);const buffer=instrument==='salamander'?this.samples.find(item=>item[0]===root&&item[2]===layer)?.[1]:this.instrumentBanks.get(instrument)?.get(root);if(!buffer)return;
    oscillator.buffer=buffer;oscillator.playbackRate.value=2**((note.midi-root)/12);
    const now=Math.max(this.context.currentTime,scheduledTime??this.context.currentTime)+Math.max(0,delay);
    filter.type='lowpass';filter.frequency.value=10000;filter.Q.value=.45;
    // The recording supplies the attack and timbre; gain only smooths each
    // layer. The floor used to sit at 0.2, which flattened everything into a
    // narrow band — velocity .3 and .95 came out within 2 dB of each other, so
    // written and modelled dynamics were inaudible. A low floor with a slightly
    // steeper curve restores roughly 14 dB between ppp and fff.
    const level=(.08+Math.pow(velocity,1.5)*1.15)*(note.gainScale||1)*sourceGain(instrument);
    const sustained=/violin|viola|cello|contrabass|string_ensemble|flute|clarinet|oboe|bassoon|horn|trumpet|trombone/.test(instrument);
    const attack=sustained?.035:.004;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+attack);
    // A short, velocity-dependent settling of the hammer attack sounds less clipped.
    gain.gain.setTargetAtTime(level*.88,now+attack,.028);
    oscillator.connect(filter);filter.connect(gain);gain.connect(this.output);oscillator.start(now);
    // Let long tones sing while short notes release a little early, as a
    // pianist does between phrases. The written duration remains unchanged.
    const articulation=note.duration<.45?.93:note.duration>2?1.015:1;
    const releaseBeat=this.expressive&&instrument==='salamander'?Math.min(endBeat+.3,Math.max(endBeat+note.duration*(articulation-1),note.expression?.pedalEndBeat||endBeat)):endBeat;
    const voice={oscillator,gain,layer,level,endBeat:instrument==='drums'?endBeat+4:releaseBeat};this.voices.add(voice);
    voice.startTime=now;
    const releaseTime=instrument==='drums'?now+Math.min(3,buffer.duration/oscillator.playbackRate.value):Math.max(now+.025,this.clockTime+(releaseBeat-this.clockBeat)*60/this.bpm);
    gain.gain.setTargetAtTime(.0001,releaseTime,instrument==='drums'?.08:.06);
    oscillator.stop(releaseTime+.5);
    oscillator.onended=()=>{oscillator.disconnect();filter.disconnect();gain.disconnect();this.voices.delete(voice);};
  }
  release(voice) {
    if(voice.released)return;voice.released=true;const now=this.context.currentTime;
    if(voice.startTime>now){voice.oscillator.stop(now);return;}
    if(voice.gain.gain.cancelAndHoldAtTime)voice.gain.gain.cancelAndHoldAtTime(now);else{voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setValueAtTime(voice.level,now);}
    voice.gain.gain.setTargetAtTime(.0001,now,.075);voice.oscillator.stop(now+.45);
  }
  tick() {
    if(!this.playing)return;this.advance();
    // Engraving can occupy the UI thread for hundreds of milliseconds. Queue
    // enough audio ahead to survive it; pause/seek cancels all future voices.
    // Keep a longer audio queue than one visual frame. PDF turns and large
    // score updates can briefly occupy the main thread; the audio clock keeps
    // moving, so a short look-ahead previously left an audible hole at the
    // next bar. The eight-second queue covers costly page turns; seek/pause
    // cancels future voices. Visual updates run on their own animation frame.
    const horizon=this.clockBeat+(this.context.currentTime+8-this.clockTime)*this.bpm/60;
    while(this.nextPulse<=horizon&&this.nextPulse<this.totalBeats){
      const pulse=this.nextPulse++;
      const when=this.clockTime+(pulse-this.clockBeat)*60/this.bpm;
      if(when>=this.context.currentTime)this.onPulse(pulse,when);
    }
    while(this.next<this.score.events.length&&this.score.events[this.next].beat<=horizon) {
      const event=this.score.events[this.next++];
      const scheduled=this.clockTime+(event.beat-this.clockBeat)*60/this.bpm;
      // Never discard an onset after a momentary rendering stall. A late note
      // is still preferable to a silent beat, and subsequent notes remain on
      // the original transport grid.
      const audibleAt=Math.max(scheduled,this.context.currentTime+.008);
      const top=Math.max(...event.notes.map(n=>n.midi));
      for(const [i,note] of event.notes.entries())if(event.beat+note.duration>this.beat){
        // Keep the written pulse intact while avoiding machine-perfect attacks.
        // The deterministic curve makes playback stable between repetitions.
        const phrase=Math.sin((event.phraseProgress||0)*Math.PI)*.18-.09;
        // Shape loudness only; written onset times stay locked to the score.
        // A slow deterministic contour gives repeated phrases breath without
        // the unstable tempo changes caused by random micro-timing.
        const human=this.expressive?(1+phrase+.055*Math.sin(event.beat*1.37+i*1.91)+.025*Math.sin(event.beat*.41)) : 1;
        const isBass=(note.staff===2||note.midi<55)&&note.instrument!=='drums';
        const pulseAccent=isBass?(event.offset%2<.04?1.04:.91):1;
        const accompaniment=isBass?(.94+.055*Math.sin(event.beat*.73+note.midi*.11)) : 1;
        const melodicBoost=(note.instrument||this.instrument)==='drums'?1:note.midi===top?1.12:.82;
        const modelNote=this.expressive&&this.arrangement==='original'&&this.modelPerformance?.source===this.originalScore?this.modelPerformance.events[this.next-1]?.notes.find(n=>n.midi===note.midi):null;
        // The melody/accompaniment balance carries as much expression as the
        // overall level, so it is applied to written, arranged and modelled
        // touches alike; the model still supplies the phrasing within a voice.
        const modelVelocity=modelNote?Math.max(.2,Math.min(.92,modelNote.velocity))*.78+(note.expression?.velocity||.6)*.22:null;
        const velocity=this.expressive?Math.max(.14,Math.min(.92,(note.generatedVelocity??modelVelocity??(note.expression?.velocity||.6)*(event.breath?.95:1)*human)*melodicBoost*pulseAccent*accompaniment)):.72;
        // A generated performance may colour the touch, but it must never move
        // the written onset or duration. This preserves accompaniment rhythm.
        this.sound(note,event.beat+note.duration,velocity,0,audibleAt);
      }
    }
    if(this.beat>=this.totalBeats){this.pause();this.beat=this.totalBeats;this.onEnd();}
  }
  pause(){this.generation++;if(this.playing)this.advance();this.playing=false;clearInterval(this.timer);cancelAnimationFrame(this.paintFrame);for(const voice of this.voices)this.release(voice);if(this.score){this.next=this.score.events.findIndex(e=>e.beat>=this.beat-.0001);if(this.next<0)this.next=this.score.events.length;}}
  rewind(){this.pause();this.beat=0;this.next=0;}
  stop(){this.rewind();}
}
