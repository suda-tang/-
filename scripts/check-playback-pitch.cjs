const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/portrait-upload.html');const rows=await p.evaluate(async()=>{
 const {ScorePlayer}=await import('/player.js');const {loadPianoSamples}=await import('/piano-samples.js');const {loadInstrument}=await import('/instruments.js');const results=[];
 for(const [instrument,midi,bpm=80]of [['salamander',48],['salamander',69],['salamander',71],['salamander',72],['salamander',69,160],['flute',69],['violin',69],['clarinet',69],['cello',57],['acoustic_guitar_steel',60],['acoustic_guitar_steel',61],['contrabass',36],['string_ensemble_1',67],['string_ensemble_1',79]]){
  const ctx=new OfflineAudioContext(1,36000,24000),player=new ScorePlayer();player.bpm=bpm;player.context=ctx;player.output=ctx.createGain();player.output.connect(ctx.destination);player.clockTime=0;player.clockBeat=0;player.originalScore={tempo:80};const note={midi,instrument,duration:4,part:'test'};
  if(instrument==='salamander')player.samples=await loadPianoSamples(ctx,{events:[{notes:[note]}]});else player.instrumentBanks.set(instrument,await loadInstrument(ctx,instrument,[midi]));
  player.sound(note,4,.65,0,0);const rendered=await ctx.startRendering(),raw=rendered.getChannelData(0);const data=[];for(let i=6000;i<24000;i++)data.push(raw[i]);const rate=24000,expected=440*2**((midi-69)/12),max=Math.ceil(rate/Math.max(30,expected*.45));const diff=[1];let sum=0;
  for(let lag=1;lag<=max;lag++){let d=0;for(let i=0;i<data.length-max;i++)d+=(data[i]-data[i+lag])**2;sum+=d;diff[lag]=sum?d*lag/sum:1;}
  let lag=2;while(lag<max){if(diff[lag]<.18){while(lag+1<max&&diff[lag+1]<diff[lag])lag++;break;}lag++;}
  const correction=(diff[lag-1]-diff[lag+1])/(2*(diff[lag-1]-2*diff[lag]+diff[lag+1]));const frequency=rate/(lag+(Number.isFinite(correction)?correction:0));results.push({instrument,midi,bpm,expected,frequency,cents:1200*Math.log2(frequency/expected),confidence:1-diff[lag]});
 }return results;
});console.log(JSON.stringify(rows,null,2));if(rows.some(r=>!Number.isFinite(r.cents)||Math.abs(r.cents)>25))process.exitCode=1;
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
