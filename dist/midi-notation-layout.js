// Re-notate generated MIDI voices for display only. Playback retains raw events.
export function consolidateMidiStaves(doc, width=1200){
 const values=[[4,'whole',0],[3,'half',1],[2,'half',0],[1.5,'quarter',1],[1,'quarter',0],[.75,'eighth',1],[.5,'eighth',0],[.375,'16th',1],[.25,'16th',0],[.1875,'32nd',1],[.125,'32nd',0],[.0625,'64th',0],[.03125,'128th',0]];
 const value=(node,name,fallback)=>Number(node.querySelector(name)?.textContent??fallback);
 const add=(node,name,text)=>{const child=doc.createElement(name);if(text!==undefined)child.textContent=String(text);node.append(child);return child;};
 const parts=[...doc.querySelectorAll('score-partwise > part')],data=parts.map(part=>{let divisions=1;return [...part.querySelectorAll(':scope > measure')].map(bar=>{
  divisions=value(bar,'attributes > divisions',divisions);let cursor=0,last=0,end=0;const notes=[],staffs=new Set(),voices=new Map();
  for(const item of bar.children){if(item.tagName==='backup')cursor-=value(item,'duration',0);else if(item.tagName==='forward')cursor+=value(item,'duration',0);else if(item.tagName==='note'){const duration=value(item,'duration',0),staff=value(item,'staff',1),start=item.querySelector('chord')?last:cursor;if(!item.querySelector('chord')){last=start;cursor+=duration;}end=Math.max(end,start+duration);staffs.add(staff);if(!voices.has(staff))voices.set(staff,new Set());voices.get(staff).add(value(item,'voice',1));if(!item.querySelector('rest'))notes.push({node:item,start,end:start+duration,staff});}}
  return {bar,notes,staffs,voices,divisions,end};
 });});
 // Every part uses the same split boundaries, preserving alignment across instruments.
 const cuts=[];for(let m=0;m<Math.max(0,...data.map(p=>p.length));m++){
  const onsets=new Set();let beats=0;for(const bars of data){const b=bars[m];if(!b)continue;beats=Math.max(beats,b.end/b.divisions);for(const n of b.notes){onsets.add(n.start/b.divisions);onsets.add(n.end/b.divisions);}}
  const split=width<850&&onsets.size>(width<600?9:16),step=width<600?1:2;cuts[m]=[0];if(split)for(let at=step;at<beats-.0001;at+=step)cuts[m].push(at);cuts[m].push(beats);
 }
 for(const bars of data)for(const [m,b] of bars.entries()){
  const {bar,notes,staffs,voices,divisions,end}=b,points=cuts[m];
  bar.setAttribute('data-source-measure',String(m+1));bar.setAttribute('data-source-offset','0');
  if(points.length===2&&![...voices.values()].some(v=>v.size>2))continue;
  const replacements=[];let valid=true;
  for(let segment=0;segment<points.length-1;segment++){
   const from=points[segment]*divisions,to=Math.min(end,points[segment+1]*divisions);if(to<=from)continue;
   const result=bar.cloneNode(false);result.setAttribute('data-source-offset',String(points[segment]));if(points.length>2)result.setAttribute('implicit','yes');
   if(segment===0)for(const child of bar.children)if(!['note','backup','forward','barline'].includes(child.tagName))result.append(child.cloneNode(true));
   let staffIndex=0;
   for(const staff of [...staffs].sort((a,b)=>a-b)){
    if(staffIndex++){const backup=add(result,'backup');add(backup,'duration',to-from);}
    const selected=notes.filter(n=>n.staff===staff&&n.start<to&&n.end>from),boundaries=[...new Set([from,to,...selected.flatMap(n=>[Math.max(from,n.start),Math.min(to,n.end)])])].sort((a,b)=>a-b);
    for(let i=0;i<boundaries.length-1;i++){
     let start=boundaries[i],remaining=boundaries[i+1]-start;const active=selected.filter(n=>n.start<=start&&n.end>start);
     while(remaining>1e-6){const choice=values.find(([beats])=>beats*divisions<=remaining+1e-6);if(!choice){valid=false;break;}const [beats,type,dot]=choice,length=beats*divisions;
      for(const [index,source] of (active.length?active:[null]).entries()){
       const note=doc.createElement('note');if(source)for(const attr of source.node.attributes)note.setAttribute(attr.name,attr.value);
       if(index)add(note,'chord');if(source){for(const name of ['pitch','unpitched','instrument']){const child=source.node.querySelector(':scope > '+name);if(child)note.append(child.cloneNode(true));}}else add(note,'rest');
       add(note,'duration',length);const stop=source&&(start>source.start||source.node.querySelector('tie[type="stop"]')),begin=source&&(start+length<source.end||source.node.querySelector('tie[type="start"]'));
       for(const [kind,on] of [['stop',stop],['start',begin]])if(on)add(note,'tie').setAttribute('type',kind);
       add(note,'voice',staff);add(note,'type',type);if(dot)add(note,'dot');add(note,'staff',staff);
       if(stop||begin){const notations=add(note,'notations');for(const [kind,on] of [['stop',stop],['start',begin]])if(on)add(notations,'tied').setAttribute('type',kind);}
       result.append(note);
      }start+=length;remaining-=length;
     }
    }
   }
   replacements.push(result);
  }
  if(valid&&replacements.length)bar.replaceWith(...replacements);
 }
}
