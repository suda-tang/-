const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const values=[[4,'whole',false],[3,'half',true],[2,'half',false],[1.5,'quarter',true],[1,'quarter',false],[.75,'eighth',true],[.5,'eighth',false],[.375,'16th',true],[.25,'16th',false],[.125,'32nd',false]];
function durations(length){let units=Math.max(1,Math.round(length*8)),out=[];while(units){const item=values.find(v=>v[0]*8<=units);out.push(item);units-=item[0]*8;}return out;}
function pitch(midi){const names=[['C',0],['C',1],['D',0],['E',-1],['E',0],['F',0],['F',1],['G',0],['A',-1],['A',0],['B',-1],['B',0]],s=names[midi%12];return `<pitch><step>${s[0]}</step>${s[1]?`<alter>${s[1]}</alter>`:''}<octave>${Math.floor(midi/12)-1}</octave></pitch>`;}
export function engraveMidi(score){
 const signature=String(score.timeSignature||'4/4').split('/').map(Number),barLength=signature[0]*4/signature[1],parts=score.parts;
 const starts=new Map([[1,0]]);for(const event of score.events||parts.flatMap(p=>p.events)){const start=event.beat-(Number(event.offset)||0);if(!starts.has(event.measure)||start<starts.get(event.measure))starts.set(event.measure,start);}
 const count=Math.max(score.measures||1,...starts.keys()),ordered=[...starts].sort((a,b)=>a[0]-b[0]);
 for(let i=0;i<ordered.length-1;i++){const [m,start]=ordered[i],[next,end]=ordered[i+1];for(let n=m+1;n<next;n++)starts.set(n,start+(end-start)*(n-m)/(next-m));}
 for(let m=1;m<=count;m++)if(!starts.has(m))starts.set(m,(starts.get(m-1)||0)+barLength);
 const spans=Array.from({length:count},(_,i)=>{const start=starts.get(i+1),end=starts.get(i+2)??Math.max(start+barLength,score.totalBeats||0);return{start,end,length:end-start};});
 const meterFor=length=>{for(const denominator of [4,8,16,32]){const numerator=length*denominator/4;if(numerator>=1&&numerator<=32&&Math.abs(numerator-Math.round(numerator))<.0001)return[Math.round(numerator),denominator];}return signature;};
 const definitions=parts.map(p=>{const instruments=p.percussion?[...new Set(p.events.flatMap(e=>e.notes.map(n=>n.midi)))].map(midi=>`<score-instrument id="${p.id}-D${midi}"><instrument-name>Drum ${midi}</instrument-name></score-instrument><midi-instrument id="${p.id}-D${midi}"><midi-channel>10</midi-channel><midi-unpitched>${midi+1}</midi-unpitched></midi-instrument>`).join(''):`<score-instrument id="${p.id}-I1"><instrument-name>${esc(p.name)}</instrument-name></score-instrument><midi-instrument id="${p.id}-I1"><midi-channel>${(p.channel||0)+1}</midi-channel><midi-program>${(p.program||0)+1}</midi-program></midi-instrument>`;return `<score-part id="${p.id}"><part-name>${esc(p.name)}</part-name><part-abbreviation>${esc(p.name)}</part-abbreviation>${instruments}</score-part>`;}).join('');
 const bodies=parts.map(part=>{
  const staves=part.piano?2:1,voices=[];
  for(let staff=1;staff<=staves;staff++){
   const groups=new Map();for(const event of part.events)for(const note of event.notes){if(staves===2&&note.staff!==staff)continue;const start=Math.round(event.beat*8)/8,end=Math.max(start+.125,Math.round((event.beat+note.duration)*8)/8),key=start+':'+end;if(!groups.has(key))groups.set(key,{start,end,notes:[],staff});groups.get(key).notes.push(note);}
   const lanes=[];for(const group of [...groups.values()].sort((a,b)=>a.start-b.start||a.end-b.end)){let lane=lanes.find(l=>l.end<=group.start+.0001);if(!lane){lane={staff,end:0,groups:[],voice:voices.length+lanes.length+1};lanes.push(lane);}lane.groups.push(group);lane.end=group.end;}if(!lanes.length)lanes.push({staff,groups:[],voice:voices.length+1});voices.push(...lanes);
  }
  let result='';let previousMeter='';
  for(let measure=1;measure<=count;measure++){
   const {start,end,length}=spans[measure-1],meter=meterFor(length),meterKey=meter.join('/');let body='';
   for(const [laneIndex,lane] of voices.entries()){
    if(laneIndex)body+=`<backup><duration>${Math.round(length*96)}</duration></backup>`;
    let cursor=start;const rest=len=>durations(len).map(([d,type,dot])=>`<note><rest/><duration>${d*96}</duration><voice>${lane.voice}</voice><type>${type}</type>${dot?'<dot/>':''}<staff>${lane.staff}</staff></note>`).join('');
    for(const group of lane.groups.filter(g=>g.start<end&&g.end>start)){
     const at=Math.max(start,group.start),until=Math.min(end,group.end);if(at>cursor+.001)body+=rest(at-cursor);let position=at;
     for(const [d,type,dot] of durations(until-at)){
      for(const [chordIndex,note] of group.notes.entries()){
       const stop=position>group.start+.001,tieStart=position+d<group.end-.001;
       const unpitched=`<unpitched><display-step>${note.midi===35||note.midi===36?'F':note.midi===38||note.midi===40?'C':'G'}</display-step><display-octave>${note.midi===35||note.midi===36?4:5}</display-octave></unpitched>`;
       body+=`<note dynamics="${((note.velocity||80)/127*100).toFixed(2)}">${chordIndex?'<chord/>':''}${part.percussion?unpitched:pitch(note.midi)}<instrument id="${part.percussion?`${part.id}-D${note.midi}`:`${part.id}-I1`}"/><duration>${d*96}</duration>${stop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}<voice>${lane.voice}</voice><type>${type}</type>${dot?'<dot/>':''}<staff>${lane.staff}</staff>${stop||tieStart?`<notations>${stop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}</notations>`:''}</note>`;
      }position+=d;
     }cursor=until;
    }if(cursor<end-.001)body+=rest(end-cursor);
   }
   result+=`<measure number="${measure}">${measure===1?`<attributes><divisions>96</divisions><time><beats>${meter[0]}</beats><beat-type>${meter[1]}</beat-type></time><staves>${staves}</staves>${part.percussion?'<clef><sign>percussion</sign></clef>':'<clef number="1"><sign>G</sign><line>2</line></clef>'}${staves===2?'<clef number="2"><sign>F</sign><line>4</line></clef>':''}</attributes><direction><sound tempo="${score.tempo}"/></direction>`:meterKey!==previousMeter?`<attributes><time><beats>${meter[0]}</beats><beat-type>${meter[1]}</beat-type></time></attributes>`:''}${body}</measure>`;previousMeter=meterKey;
  }return `<part id="${part.id}">${result}</part>`;
 }).join('');return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${esc(score.title)}</work-title></work><part-list>${definitions}</part-list>${bodies}</score-partwise>`;
}

export function engraveMidiPlayback(score){
 const tracks=score.midiParts||[];
 const parts=tracks.map(track=>{const match=track.id.match(/^P(\d+)-(\d+)$/);return{...track,channel:track.instrument==='drums'?9:Math.max(0,Number(match?.[1]||1)-1),program:Math.max(0,Number(match?.[2]||1)-1),piano:/piano|salamander/.test(track.instrument),percussion:track.instrument==='drums',events:score.events.map(event=>({...event,notes:event.notes.filter(note=>note.part===track.id)})).filter(event=>event.notes.length)};});
 return engraveMidi({...score,parts,measures:Math.max(...score.events.map(e=>e.measure))});
}
