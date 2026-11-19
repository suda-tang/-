// All bounds are in the arrival root's local coordinates.
export const gardenBounds=[[-123,-37,-188,-132],[-153,3,-289,-195]];
const waterExclusions=[[-23,23,-140,24],...gardenBounds];
export function insideGarden(x,z,padding=0){return gardenBounds.some(([a,b,c,d])=>x>a-padding&&x<b+padding&&z>c-padding&&z<d+padding);}

// Clip only the part crossing a reserved site; do not delete the rest of a long canal.
export function outsideSiteSegments(a,b,width=0){
 const dx=b[0]-a[0],dz=b[1]-a[1];let ranges=[[0,1]];
 for(const box of waterExclusions){let lo=0,hi=1,hit=true;const p=width/2;
  for(const [start,delta,min,max]of [[a[0],dx,box[0]-p,box[1]+p],[a[1],dz,box[2]-p,box[3]+p]]){
   if(Math.abs(delta)<1e-10){if(start<min||start>max){hit=false;break;}}
   else{const t0=(min-start)/delta,t1=(max-start)/delta;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>=hi){hit=false;break;}}
  }
  if(!hit)continue;
  ranges=ranges.flatMap(([u,v])=>v<=lo||u>=hi?[[u,v]]:[...(u<lo?[[u,Math.min(v,lo)]]:[]),...(v>hi?[[Math.max(u,hi),v]]:[])]);
 }
 return ranges.filter(([u,v])=>(v-u)*Math.hypot(dx,dz)>.04).map(([u,v])=>[[a[0]+dx*u,a[1]+dz*u],[a[0]+dx*v,a[1]+dz*v]]);
}

function clipHalfPlane(points,axis,value,greater){
 const out=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],inside=greater?a[axis]>=value:a[axis]<=value,next=greater?b[axis]>=value:b[axis]<=value;if(inside)out.push(a);if(inside!==next){const t=(value-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}
 return out;
}
export function outsideSiteWaterPolygons(points){
 let pieces=[points];for(const [a,b,c,d]of waterExclusions){const next=[];for(const polygon of pieces){let inside=polygon;for(const [axis,value,greater]of [[0,a,true],[0,b,false],[1,c,true],[1,d,false]]){if(inside.length<3)break;const outside=clipHalfPlane(inside,axis,value,!greater);if(outside.length>=3)next.push(outside);inside=clipHalfPlane(inside,axis,value,greater);}}pieces=next;}
 return pieces;
}
