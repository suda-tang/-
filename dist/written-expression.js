export function writtenExpression(score){
 if(!score)return null;
 const velocities=score.events.flatMap(event=>event.notes.map(note=>Number(note.velocity))).filter(v=>Number.isFinite(v)&&v>0);
 const distinct=new Set(velocities.map(v=>Math.round(v>1?v:v*127)));
 if(distinct.size>=3)return {kind:'midi',count:distinct.size};
 if(score.xml){const doc=new DOMParser().parseFromString(score.xml,'application/xml');const marks=doc.querySelectorAll('direction dynamics > *,direction wedge[type="crescendo"],direction wedge[type="diminuendo"],sound[dynamics],note[dynamics]');if(marks.length)return {kind:'xml',count:marks.length};}
 return null;
}
