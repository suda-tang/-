const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--js-flags=--max-old-space-size=128']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:5173/portrait-upload.html');
 const result=await page.evaluate(async()=>{
  const {parseMidi}=await import('/midi.js');const {parseMusicXML,renderNotation}=await import('/score.js');const {ScorePlayer}=await import('/player.js');
  const u16=n=>[n>>8&255,n&255],u32=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255],vlq=n=>{let bytes=[n&127];while(n>>=7)bytes.unshift((n&127)|128);return bytes;};
  const bytes=[77,84,104,100,...u32(6),...u16(1),...u16(4),...u16(480)];const track=events=>bytes.push(77,84,114,107,...u32(events.length),...events);
  track([0,255,81,3,7,161,32,...vlq(1920),255,81,3,15,66,64,0,255,47,0]);
  // Overlapping piano notes with unequal releases, including a bar-crossing tie.
  track([0,192,0,0,144,60,35,...vlq(240),144,64,90,...vlq(240),128,64,0,...vlq(1920),128,60,0,0,255,47,0]);
  track([0,193,40,0,145,67,70,...vlq(960),129,67,0,...vlq(960),145,69,100,...vlq(480),129,69,0,0,255,47,0]);
  track([0,153,36,110,...vlq(240),137,36,0,...vlq(240),153,38,60,...vlq(240),137,38,0,0,255,47,0]);
  const score=parseMidi(new Uint8Array(bytes).buffer,'Integrity.mid');if(score.midiParts.length!==3||score.tempo!==120||score.tempoMap.length!==2)throw Error('Lost parts or tempo map');
  const doc=new DOMParser().parseFromString(score.xml,'application/xml');if(!doc.querySelector('tie')||doc.querySelectorAll('part[id="P1-1"] voice').length<2)throw Error('Missing tied or overlapping notation');
  const saved=JSON.parse(JSON.stringify({events:score.events,totalBeats:score.totalBeats,tempoMap:score.tempoMap}));if(JSON.stringify(saved.events)!==JSON.stringify(score.events))throw Error('Cloud round-trip changed playback');
  const parsed=parseMusicXML(score.xml);if(parsed.events.some((e,i)=>i&&e.measure<parsed.events[i-1].measure))throw Error('Measure goes backwards');
  const player=new ScorePlayer();player.bpm=120;player.load(score);player.context={currentTime:0};player.clockTime=0;player.clockBeat=0;player.playing=true;player.nextPulse=0;player.sound=()=>{};player.tick();if(player.displayIndex(0)!==0||player.next<2)throw Error('Lookahead leaked into visual position');
  const clock=player.beat;player.setPartEnabled(score.midiParts[1].id,false);if(player.beat!==clock||!player.playing)throw Error('Mute restarted transport');
  const host=document.createElement('div');host.style.width='360px';document.body.append(host);await renderNotation(host,score);if(!host.querySelector('svg')||host.textContent.includes('排版失败'))throw Error('Engraving failed');
  const labels=[...host.querySelectorAll('.staff-instrument-label')];if(labels.length<4||!labels.some(l=>l.textContent.startsWith('鼓'))||!labels.some(l=>l.textContent==='小提琴'))throw Error('Missing instrument row labels '+JSON.stringify(labels.map(l=>l.textContent))+' rows '+host.querySelectorAll('g.staffline').length);const rows=[...host.querySelectorAll('g.staffline')];for(let i=0;i<labels.length;i++){const row=rows[i].getBBox(),label=labels[i].getBBox();if(label.x+label.width>row.x-3)throw Error('Instrument label overlaps staff');}host.id='spacing-check';for(const child of [...document.body.children])if(child!==host)child.remove();document.body.style.cssText='margin:0;background:white';return {labels:labels.map(l=>l.textContent),parts:score.midiParts.map(p=>p.name),tempo:score.tempo,tempoChanges:score.tempoMap.length,originalNotes:score.events.reduce((n,e)=>n+e.notes.length,0),cloudRoundTrip:true,liveMute:true,svg:host.querySelectorAll('svg').length};
 });console.log(JSON.stringify(result));await page.locator('#spacing-check').screenshot({path:'.sites-runtime/score-spacing-mobile.png'});
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exit(1)});


