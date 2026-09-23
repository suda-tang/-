const names=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const templates=[['',[0,4,7]],['m',[0,3,7]],['7',[0,4,7,10]],['maj7',[0,4,7,11]],['m7',[0,3,7,10]],['dim',[0,3,6]],['dim7',[0,3,6,9]],['aug',[0,4,8]],['sus2',[0,2,7]],['sus4',[0,5,7]],['m7♭5',[0,3,6,10]]];
export function detectChord(pitches){
 const pcs=[...new Set(pitches.map(n=>((n%12)+12)%12))];if(pcs.length<3)return null;
 const bass=((Math.min(...pitches)%12)+12)%12;let best=null;
 for(let root=0;root<12;root++)for(const [suffix,intervals] of templates){const tones=intervals.map(x=>(root+x)%12),hits=tones.filter(x=>pcs.includes(x)).length;if(hits!==tones.length)continue;const quality=hits*2-(pcs.length-hits)*2+(root===bass?.25:0);if(!best||quality>best.quality)best={name:names[root]+suffix+(bass!==root?'/'+names[bass]:''),root,tones,quality,confidence:hits/pcs.length};}
 return best?.confidence>=.75?best:null;
}
export function analyzeHarmony(score){
 const measures=new Map();for(const e of score.events){if(!measures.has(e.measure))measures.set(e.measure,[]);measures.get(e.measure).push(e);}
 const result=new Map();for(const [measure,events] of measures){const weighted=new Map();for(const e of events)for(const n of e.notes){const pc=n.midi%12;weighted.set(pc,(weighted.get(pc)||0)+n.duration);}
 const ordered=[...weighted].sort((a,b)=>b[1]-a[1]);const total=ordered.reduce((sum,x)=>sum+x[1],0);let coverage=0;const pcs=[];for(const [pc,weight] of ordered){pcs.push(pc);coverage+=weight;if(pcs.length>=3&&coverage>=total*.85)break;}
 const bass=Math.min(...events.flatMap(e=>e.notes.map(n=>n.midi)));const chord=detectChord([bass,...pcs.map(x=>60+x)]);result.set(measure,chord);}
 return result;
}
export function arrangeScore(original,mode='original',instrument='salamander'){
 const score={...original,events:original.events.map(e=>({...e,notes:e.notes.map(n=>({...n}))}))};
 if(mode==='original')return score;
 if(mode==='romantic'||mode==='baroque')return rewriteTexture(score,mode,instrument);
 for(const event of score.events){const sorted=[...event.notes].sort((a,b)=>a.midi-b.midi);const top=sorted.at(-1)?.midi;
  event.notes=sorted.map((note,index)=>{const melody=note.midi===top&&note.midi>=60,bass=note.midi<55;let voice=instrument;
   if(mode==='chamber')voice=melody?'violin':bass?'cello':'viola';
   if(mode==='orchestra')voice=melody?'flute':bass?'contrabass':note.midi<67?'french_horn':'string_ensemble_1';
   if(mode==='baroque')voice='harpsichord';
   return {...note,instrument:voice,arrangementDelayBeats:mode==='romantic'&&!melody?Math.min(index*.12,note.duration*.35):0};
  });
  if(mode==='orchestra'&&event.notes.length){const melody=event.notes.at(-1);if(melody.midi>=60)event.notes.push({...melody,instrument:'violin',gainScale:.5});}
 }
 return score;
}

function rewriteTexture(score,mode,instrument){
 const harmony=analyzeHarmony(score),groups=new Map();for(const e of score.events){if(!groups.has(e.measure))groups.set(e.measure,[]);groups.get(e.measure).push(e);}
 const rewritten=[];for(const [measure,events] of groups){const chord=harmony.get(measure);if(!chord){rewritten.push(...events);continue;}
  const start=events[0].beat-(events[0].offset||0),next=score.events.find(e=>e.measure>measure),end=next?next.beat-(next.offset||0):Math.max(...events.map(e=>e.beat+Math.max(...e.notes.map(n=>n.duration))));
  for(const e of events){const melody=[...e.notes].sort((a,b)=>b.midi-a.midi)[0];rewritten.push({...e,notes:[{...melody,instrument:mode==='baroque'?'harpsichord':instrument}]});}
  const tones=chord.tones.map(pc=>48+pc).sort((a,b)=>a-b),bass=36+chord.root;let last=tones[0];
  for(let beat=start,step=0;beat<end-.01;beat+=.5,step++){
   let pitch;
   if(mode==='romantic')pitch=step===0?bass:tones[(step-1)%tones.length]+(step%6>3?12:0);
   else{const motif=events[Math.min(events.length-1,Math.floor(step/2))].notes.at(-1).midi;pitch=tones.reduce((a,b)=>Math.abs(b-(last+(motif%3-1)*2))<Math.abs(a-(last+(motif%3-1)*2))?b:a);if(step%4===0)pitch=bass+12;last=pitch;}
   rewritten.push({beat,measure,offset:beat-start,notes:[{midi:pitch,duration:Math.min(mode==='baroque'?.42:.65,end-beat),instrument:mode==='baroque'?'harpsichord':instrument,staff:2,part:'Arrangement',gainScale:.66}]});
  }
 }
 rewritten.sort((a,b)=>a.beat-b.beat);const combined=[];for(const e of rewritten){const last=combined.at(-1);if(last&&Math.abs(last.beat-e.beat)<.0001)last.notes.push(...e.notes);else combined.push({...e,notes:[...e.notes]});}
 return {...score,events:combined};
}
