// Keep the bound recording on the same score clock as the instrumental transport.
export class VocalTransport {
  constructor(audio,getPlayer,onError=()=>{}) {
    Object.assign(this,{audio,getPlayer,onError,enabled:false,offset:0,baseTempo:80,volume:1,epoch:0,timer:null,pending:false,lastSync:0,drift:0});
    this.audio.preservesPitch=true;
    this.audio.addEventListener?.('waiting',()=>{this.buffering=true;});
    this.audio.addEventListener?.('playing',()=>{this.buffering=false;});
  }
  configure(score){
    this.pause();this.buffer=null;this.bufferPromise=null;this.enabled=!!score?.vocal?.mime;this.scoreId=score?.serverId||'';
    this.offset=Number(score?.vocal?.offsetSeconds)||0;this.timeScale=Math.max(.5,Math.min(2,Number(score?.vocal?.timeScale)||1));this.baseTempo=Math.max(30,Number(score?.tempo)||80);
    this.audio.muted=false;
    if(this.enabled&&this.scoreId){this.audio.src=`/api/scores/${encodeURIComponent(this.scoreId)}/vocal`;this.audio.preload='auto';this.audio.load();}
    else this.audio.removeAttribute('src');
  }
  allowed(){const p=this.getPlayer();return this.enabled&&!!this.audio.src&&!p.disabledParts?.has('__vocal')&&['all','__vocal'].includes(p.soloPart);}
  setOffset(value){this.offset=Number(value)||0;const p=this.getPlayer();if(p.playing){this.pause();this.start();}}
  timeFor(beat,clamp=true){
    const p=this.getPlayer(),scale=(p.bpm||this.baseTempo)/this.baseTempo;
    const seconds=typeof p.timeAtBeat==='function'?p.timeAtBeat(Number(beat)||0)*scale:(Number(beat)||0)*60/this.baseTempo;
    const time=seconds*(this.timeScale||1)+this.offset;return clamp?Math.max(0,time):time;
  }
  prime(){
    if(!this.allowed()||!this.audio.paused||this.priming)return;
    const epoch=this.epoch;this.audio.muted=true;
    // A stalled media play promise must never hold up the recording transport.
    let timeout;
    const attempt=Promise.resolve(this.audio.play()).catch(()=>{});
    this.priming=Promise.race([attempt,new Promise(resolve=>{timeout=setTimeout(resolve,1500);})]).then(()=>{
      clearTimeout(timeout);
      if(this.epoch===epoch){this.audio.pause();this.audio.muted=false;}
      this.priming=null;
    });
  }
  async prepare(){
    if(!this.allowed())return;
    const context=this.getPlayer().context;
    if(!context)throw Error('声音引擎尚未启动');
    if(this.buffer)return this.buffer;
    if(!this.bufferPromise){
      const epoch=this.epoch,url=this.audio.src;
      this.bufferPromise=(async()=>{
        let bytes;
        for(let attempt=0;attempt<2;attempt++){
          const controller=new AbortController();let idle;
          const arm=()=>{clearTimeout(idle);idle=setTimeout(()=>controller.abort(),60000);};arm();
          const limit=setTimeout(()=>controller.abort(),300000);
          try{
            const response=await fetch(url,{signal:controller.signal});
            if(!response.ok)throw Error('人声音轨下载失败（HTTP '+response.status+'）');
            if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let length=0;
              for(;;){const {value,done}=await reader.read();if(done)break;arm();chunks.push(value);length+=value.length;}
              const combined=new Uint8Array(length);let offset=0;for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.length;}bytes=combined.buffer;
            }else bytes=await response.arrayBuffer();
            break;
          }catch(error){
            if(url!==this.audio.src)throw Error('已切换曲谱，旧人声请求已停止');
            const interrupted=controller.signal.aborted||['AbortError','TimeoutError','TypeError'].includes(error.name);
            if(interrupted&&attempt===0)continue;
            if(interrupted)throw Error('人声下载中断：连接连续 60 秒未返回数据或下载超过 5 分钟，自动重试后仍未恢复。');
            throw error;
          }finally{clearTimeout(idle);clearTimeout(limit);}
        }
        const buffer=await context.decodeAudioData(bytes);
        if(url!==this.audio.src)throw Error('曲谱已切换，人声加载已取消');
        this.buffer=buffer;return buffer;
      })().catch(error=>{this.bufferPromise=null;throw error;});
    }
    return this.bufferPromise;
  }
  startBuffer(){
    const p=this.getPlayer(),context=p.context;
    if(!context||!p.playing||!this.allowed())return;
    if(this.bufferSource&&this.startClock===p.clockTime)return;
    this.pause();this.startClock=p.clockTime;
    const beat=p.beatAtTime(p.timeAtBeat(p.clockBeat)+Math.max(0,context.currentTime-p.clockTime));
    const position=this.timeFor(beat,false),rate=Math.max(.5,Math.min(2,(p.bpm||this.baseTempo)/this.baseTempo*(this.timeScale||1)));
    if(position>=this.buffer.duration)return;
    this.bufferGain??=context.createGain();this.bufferGain.gain.value=this.volume;
    if(!this.bufferConnected){this.bufferGain.connect(context.destination);this.bufferConnected=true;}
    const source=context.createBufferSource();source.buffer=this.buffer;source.playbackRate.value=rate;source.connect(this.bufferGain);this.bufferSource=source;
    const when=Math.max(context.currentTime,p.clockTime)+Math.max(0,-position)/rate;
    source.onended=()=>{source.disconnect();if(this.bufferSource===source)this.bufferSource=null;};
    source.start(when,Math.max(0,position));
  }
  connect(){
    const context=this.getPlayer().context;if(!context||this.source)return;
    // iOS ignores HTMLMediaElement.volume: use an independent gain, bypassing
    // the accompaniment's compressor and room effect. Timing remains unchanged.
    try{this.source=context.createMediaElementSource(this.audio);this.volumeBus=context.createGain();this.volumeBus.gain.value=this.volume;this.source.connect(this.volumeBus);this.volumeBus.connect(context.destination);this.audio.volume=1;}catch{}
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));if(this.bufferGain){const context=this.getPlayer().context;this.bufferGain.gain.setTargetAtTime(this.volume,context.currentTime,.012);}if(this.volumeBus){const context=this.getPlayer().context;this.volumeBus.gain.cancelScheduledValues(context.currentTime);this.volumeBus.gain.setTargetAtTime(this.volume,context.currentTime,.012);}else this.audio.volume=this.volume;}
  start(){
    if(!this.allowed())return;
    if(this.buffer){this.startBuffer();return;}
    const p=this.getPlayer(),clock=p.clockTime;
    if(Number.isFinite(this.audio.duration)&&this.timeFor(p.beat)>=this.audio.duration)return;
    if(this.pending&&this.startClock===clock)return;
    if(!this.audio.paused&&this.startClock===clock)return;
    this.pause();const epoch=this.epoch;this.pending=true;this.startClock=clock;
    const launch=async()=>{
      if(this.priming)await this.priming;
      if(epoch!==this.epoch||!p.playing||!this.allowed()){if(epoch===this.epoch)this.pending=false;return;}
      const delay=p.context&&Number.isFinite(clock)?clock-p.context.currentTime:0;
      if(delay>.002){this.timer=setTimeout(launch,Math.max(1,delay*1000));return;}
      const beat=p.context&&typeof p.beatAtTime==='function'?p.beatAtTime(p.timeAtBeat(p.clockBeat)+Math.max(0,p.context.currentTime-clock)):p.beat;
      if(this.timeFor(beat,false)<0){this.timer=setTimeout(launch,50);return;}
      this.timer=null;this.connect();this.audio.muted=false;this.seek(beat);
      this.audio.playbackRate=Math.max(.5,Math.min(2,(p.bpm||this.baseTempo)/this.baseTempo*(this.timeScale||1)));
      try{await this.audio.play();}catch(error){if(epoch===this.epoch)this.onError(error);}
      if(epoch===this.epoch){this.pending=false;this.lastSync=0;this.drift=0;}
    };
    void launch();
  }
  sync(force=false){
    const p=this.getPlayer();if(this.buffer){if(!p.playing||!this.allowed()){if(this.bufferSource)this.pause();}else if(this.bufferSource){const rate=Math.max(.5,Math.min(2,(p.bpm||this.baseTempo)/this.baseTempo*(this.timeScale||1)));this.bufferSource.playbackRate.setValueAtTime(rate,p.context.currentTime);}return;}if(!p.playing||!this.allowed()){if(!this.audio.paused||this.pending)this.pause();return;}
    if(this.pending||this.audio.paused||this.buffering||this.audio.seeking)return;
    const now=p.context?.currentTime??performance.now()/1000;if(!force&&now-this.lastSync<.20)return;this.lastSync=now;
    // Derive the position from the audio clock, including when rendering stalls.
    const beat=p.context&&Number.isFinite(p.clockTime)&&typeof p.beatAtTime==='function'
      ?p.beatAtTime(p.timeAtBeat(p.clockBeat)+Math.max(0,now-p.clockTime)):p.beat;
    const expected=this.timeFor(beat),error=this.audio.currentTime-expected;
    if(Number.isFinite(this.audio.duration)&&expected>=this.audio.duration){this.pause();return;}
    // Hard seeks flush the media decoder. Reserve them for starting/resuming
    // after a real interruption, never for routine clock corrections.
    if(force&&Math.abs(error)>.03){this.audio.currentTime=expected;this.drift=0;}
    const base=Math.max(.5,Math.min(2,(p.bpm||this.baseTempo)/this.baseTempo*(this.timeScale||1)));
    // A recording runs continuously at one rate. Only explicit seeking or a
    // user tempo change adjusts it; never chase the clock on every paint frame.
    const rate=base;
    if(force||Math.abs(this.audio.playbackRate-rate)>.004)this.audio.playbackRate=rate;
  }
  pause(){if(this.bufferSource){const source=this.bufferSource;this.bufferSource=null;try{source.stop();}catch{}source.disconnect();}this.epoch++;clearTimeout(this.timer);this.timer=null;this.pending=false;this.startClock=null;this.buffering=false;this.drift=0;this.audio.pause();}
  seek(beat){if(this.audio.src)try{this.audio.currentTime=this.timeFor(beat);}catch{}}
}
