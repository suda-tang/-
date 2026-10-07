const lines={49:0,57:0,51:0,55:0,52:0,42:0,44:0,46:0,50:1,48:1,40:1,38:2,47:2,45:3,43:3,41:3,36:4,35:4};
export function layoutDrums(hits,totalBeats=0,available=600){
 const width=Math.max(240,Math.round(available)),items=[],bars=[],systems=[];
 const groups=new Map();for(const h of hits){const measure=h.event.measure||1;if(!groups.has(measure))groups.set(measure,[]);groups.get(measure).push(h);}
 let x=0,row=0;
 const limit=Math.max(4,Math.floor((width-40)/22));
 for(const [measure,notes] of [...groups].sort((a,b)=>a[0]-b[0])){
  const beats=[...new Set(notes.map(h=>Number(h.event.beat)||0))].sort((a,b)=>a-b);
  for(let start=0;start<beats.length;start+=limit){
   const part=beats.slice(start,start+limit),barWidth=Math.min(width,Math.max(104,part.length*22+36));
   if(x&&x+barWidth>width){row++;x=0;}
   bars.push({measure,x,y:row*130,width:barWidth});const seen=new Set();
   for(const hit of notes){const column=part.indexOf(Number(hit.event.beat)||0);if(column<0)continue;const line=lines[hit.note.midi]??2,key=column+':'+line;if(seen.has(key))continue;seen.add(key);items.push({...hit,x:x+22+column*(barWidth-36)/Math.max(1,part.length),y:row*130+34+line*14});}
   x+=barWidth;
  }
 }
 for(let i=0;i<=row;i++)systems.push({y:i*130});
 return{items,bars,systems,width,height:(row+1)*130};
}
