// Interpret written expression before adding small performance variations.
export function preparePerformance(score){
 const levels={ppp:.24,pp:.33,p:.43,mp:.54,mf:.65,f:.78,ff:.9,fff:.98};
 const lanes=new Map();
 if(score.xml){
  const doc=new DOMParser().parseFromString(score.xml,'application/xml');
  for(const part of doc.querySelectorAll('score-partwise > part')){
   let divisions=1;
   Array.from(part.children).filter(x=>x.localName==='measure').forEach((measure,m)=>{
    let offset=0;
    for(const item of measure.children){
     if(item.localName==='attributes')divisions=Number(item.querySelector('divisions')?.textContent)||divisions;
     if(item.localName==='backup')offset-=Number(item.querySelector('duration')?.textContent||0)/divisions;
     if(item.localName==='forward'||item.localName==='note'&&!item.querySelector('chord,grace'))offset+=Number(item.querySelector('duration')?.textContent||0)/divisions;
     if(item.localName!=='direction')continue;
     const staff=item.querySelector('staff')?.textContent||'1';const key=part.id+':'+staff;
     if(!lanes.has(key))lanes.set(key,[]);
     const dynamic=item.querySelector('dynamics')?.firstElementChild?.localName;
     const wedge=item.querySelector('wedge')?.getAttribute('type');const pedal=item.querySelector('pedal')?.getAttribute('type');
     lanes.get(key).push({measure:m+1,offset:offset+Number(item.querySelector('offset')?.textContent||0)/divisions,level:levels[dynamic],wedge,pedal});
    }
   });
  }
 }
 const starts=new Map(score.events.map(e=>[e.measure,e.beat-(e.offset||0)]));
 const beatsPerBar=Math.max(1,Number(String(score.timeSignature||'4/4').split('/')[0])||4);
 for(const controls of lanes.values()){
  controls.sort((a,b)=>a.measure-b.measure||a.offset-b.offset);
  for(const control of controls)control.beat=(starts.get(control.measure)||0)+control.offset;
 }
 for(const event of score.events){
  // Metric accent used whenever the score carries no written dynamic. A flat
  // default made "natural performance" a plateau, which is why the modelled
  // performance sounded barely different: the model had to supply all of the
  // shape on its own. The downbeat now leads and the backbeat recedes.
  const position=Math.round(Number(event.offset)||0)%beatsPerBar;
  const accent=position===0?1:position===beatsPerBar/2?.95:.85;
  const top=Math.max(...event.notes.map(other=>other.midi));
  for(const note of event.notes){
   const controls=lanes.get(`${note.part||'P1'}:${note.staff||1}`)||[];
   let level=.6,written=false,pedal=false,change=null;
   for(const control of controls){
    if(control.measure>event.measure||control.measure===event.measure&&control.offset>(event.offset||0))break;
    if(control.level!==undefined){level=control.level;written=true;change=null;}
    if(control.wedge==='crescendo'||control.wedge==='diminuendo')change=control;
    if(control.wedge==='stop')change=null;
    if(control.pedal==='start'||control.pedal==='change')pedal=true;
    if(control.pedal==='stop')pedal=false;
   }
   if(change)level+=(change.wedge==='crescendo'?1:-1)*Math.min(.2,((event.measure-change.measure)*4+(event.offset||0)-change.offset)*.018);
   // The damper pedal affects both hands, even when written on just one staff.
   const pedals=[...lanes.entries()].filter(([key])=>key.startsWith(`${note.part||'P1'}:`)).flatMap(([,values])=>values.filter(c=>c.pedal)).sort((a,b)=>a.beat-b.beat);
   const before=pedals.filter(c=>c.beat<=event.beat).at(-1);
   pedal=!!before&&['start','change','continue','resume'].includes(before.pedal);
   const lift=pedals.find(c=>c.beat>event.beat&&['stop','change','discontinue'].includes(c.pedal));
   const shape=written?1:accent*(note.midi===top?1.07:.93);
   note.expression={velocity:Math.max(.2,Math.min(.95,level*shape)),pedal,pedalEndBeat:pedal?(lift?.beat??score.totalBeats):undefined};
  }
 }
 score.events.forEach((event,index)=>{
  const next=score.events[index+1];const length=Math.max(...event.notes.map(n=>n.duration));
  event.breath=!next||next.beat-event.beat>length+.25;
 });
 let start=0;for(let i=0;i<score.events.length;i++){const e=score.events[i];if(e.breath||i===score.events.length-1||e.measure-score.events[start].measure>=4){const first=score.events[start].beat,span=Math.max(1,e.beat-first);for(let j=start;j<=i;j++)score.events[j].phraseProgress=(score.events[j].beat-first)/span;start=i+1;}}
 return score;
}
