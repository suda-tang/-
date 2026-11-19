import * as T from './vendor/three/three.module.js';

let field=null,bits=null,terrain=[];const buildings=new Map(),bridges=[],rootZ=93;const extraGroups=new Map(),extraCells=new Map();
const terrainReady=fetch('/assets/arrival/garden-terrain-clearance.json?v=118').then(r=>{if(!r.ok)throw Error('园林地面数据未就绪');return r.json();}).then(data=>terrain=data);
function indexExtras(){extraCells.clear();for(const boxes of extraGroups.values())for(const b of boxes)for(let x=Math.floor(b[0]/8);x<=Math.floor(b[3]/8);x++)for(let z=Math.floor(b[2]/8);z<=Math.floor(b[5]/8);z++){const key=x+','+z;if(!extraCells.has(key))extraCells.set(key,[]);extraCells.get(key).push(b);}}
export function registerSceneObstacles(key,boxes){extraGroups.set(key,boxes);indexExtras();}
export function unregisterSceneObstacles(keys){let changed=false;for(const key of Array.isArray(keys)?keys:[keys])changed=extraGroups.delete(key)||changed;if(changed)indexExtras();}
export function safetySnapshot(){return {buildings:[...buildings],bridges:[...bridges],extras:[...extraGroups]};}
export function restoreSafety(snapshot){buildings.clear();for(const [k,v]of snapshot.buildings)buildings.set(k,v);bridges.splice(0,bridges.length,...snapshot.bridges);extraGroups.clear();for(const [k,v]of snapshot.extras)extraGroups.set(k,v);indexExtras();}

const crownSafetyReady=fetch('/assets/arrival/garden-crown-obstacles.json').then(r=>{if(!r.ok)throw Error('树冠数据未就绪');return r.json();}).then(boxes=>registerSceneObstacles('precomputed-garden-crowns',boxes)).catch(()=>{});
export const flightSafetyReady=(async()=>{try{
 const r=await fetch('/assets/arrival/flight-obstacles.json?v=interior102');if(!r.ok)return false;field=await r.json();let bytes;
 if(typeof DecompressionStream==='function'){const packedUrl=new URL(field.url,self.location.href);packedUrl.pathname+='.gz';const packed=await fetch(packedUrl);if(packed.ok){const data=await packed.arrayBuffer(),a=new Uint8Array(data);bytes=a[0]===31&&a[1]===139?await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():data;}}
 bytes??=await (await fetch(field.url)).arrayBuffer();bits=new Uint8Array(bytes);await Promise.all([crownSafetyReady,terrainReady]);return true;
}catch{return false;}})();

export function registerTownBuildings(rows,catalog){buildings.clear();for(const row of rows){if(!row.matrix)continue;const b=catalog[row.entryIndex]?.bounds;if(!b)continue;const box={x:row.b[0],z:row.b[1],w:b[0]*row.scale/2+.25,d:b[2]*row.scale/2+.25,h:b[1]*row.scale+.25,c:Math.cos(row.angle),s:Math.sin(row.angle)};const r=Math.hypot(box.w,box.d);for(let x=Math.floor((box.x-r)/16);x<=Math.floor((box.x+r)/16);x++)for(let z=Math.floor((box.z-r)/16);z<=Math.floor((box.z+r)/16);z++){const k=x+','+z;if(!buildings.has(k))buildings.set(k,[]);buildings.get(k).push(box);}}}
export function registerCanalBridges(items){bridges.splice(0,bridges.length,...items);}
const stableCoordinate=n=>Math.round(n*1e9)/1e9;
function pointBlocked(point){
 const x=stableCoordinate(point.x),y=stableCoordinate(point.y),z=stableCoordinate(point.z-rootZ);if(y<.4)return true;for(const b of extraCells.get(Math.floor(x/8)+','+Math.floor(z/8))||[])if(x>b[0]&&x<b[3]&&y>b[1]&&y<b[4]&&z>b[2]&&z<b[5])return true;
 for(const b of buildings.get(Math.floor(x/16)+','+Math.floor(z/16))||[]){if(y>b.h)continue;const dx=x-b.x,dz=z-b.z;if(Math.abs(dx*b.c-dz*b.s)<b.w&&Math.abs(dx*b.s+dz*b.c)<b.d)return true;}
 for(const [bx,bz,width,angle]of bridges){const dx=x-bx,dz=z-bz,u=dx*Math.cos(angle)-dz*Math.sin(angle),v=dx*Math.sin(angle)+dz*Math.cos(angle),half=(width+3)/2;if(Math.abs(u)>half+.2||Math.abs(v)>1.12)continue;const top=.18+(1.2+width*.28)*(1-(u/half)**2);if(y>top-.42&&y<top+.14||Math.abs(v)>.64&&y>top-.1&&y<top+.86)return true;}
 // Narrated towers and the clock hall are built procedurally, outside the garden files.
 if((Math.abs(x-13)<3.8&&Math.abs(z+204)<3.8&&y<12)||(Math.abs(x-23)<3.9&&Math.abs(z+163)<3.9&&y<16))return true;
 if(Math.abs(x)<14.6&&z>-108.3&&z<-99.8&&y<12.3&&(Math.abs(x)>1.08||y>3.35))return true;
 if(!bits||!field)return false;const a=[x,y,z].map((v,i)=>Math.floor((v-field.origin[i])/field.cell));if(a.some((v,i)=>v<0||v>=field.shape[i]))return false;const k=(a[0]*field.shape[1]+a[1])*field.shape[2]+a[2];return !!(bits[k>>3]&(1<<(k&7)));
}
// The lens is a volume, not a point. Keep wall/roof clearance on every side.
const defaultLensOffsets=[new T.Vector3(),...[[.45,0,0],[-.45,0,0],[0,.35,0],[0,-.35,0],[0,0,.45],[0,0,-.45]].map(v=>new T.Vector3(...v))],lensPoint=new T.Vector3();
let lensOffsets=defaultLensOffsets;
const walkingLensOffsets=[new T.Vector3(),...[[.20,0,0],[-.20,0,0],[0,.18,0],[0,-.18,0],[0,0,.20],[0,0,-.20]].map(v=>new T.Vector3(...v))];
export function withWalkingClearance(callback){const previous=lensOffsets;lensOffsets=walkingLensOffsets;try{return callback();}finally{lensOffsets=previous;}}
// Apply only during flight planning. Walking and doorway shots retain their own clearance.
export function withFlightClearance(callback){const previous=lensOffsets;const offsets=[new T.Vector3(),new T.Vector3(0,.8,0),new T.Vector3(0,-.8,0)];for(let i=0;i<8;i++)offsets.push(new T.Vector3(Math.cos(i*Math.PI/4)*2.4,0,Math.sin(i*Math.PI/4)*2.4));lensOffsets=offsets;try{return callback();}finally{lensOffsets=previous;}}
export function terrainHeight(point){let floor=0;for(const t of terrain){const row=t.rows[Math.round((point.z-rootZ-t.origin[1])/t.cell)];if(!row)continue;const x=(point.x-t.origin[0])/t.cell;if(x>=row[0]-.5&&x<=row[1]+.5)floor=Math.max(floor,t.floor);}return floor;}
export function cameraBlocked(point){if(point.y<terrainHeight(point)+.7)return true;for(const offset of lensOffsets)if(pointBlocked(lensPoint.copy(point).add(offset)))return true;return false;}
// Visibility is a ray, unlike the camera's physical clearance volume. Applying
// the lens radius at the lecturer's feet incorrectly treats paving as occlusion.
export function clearSightline(a,b){
 if(crossesVoxel(a,b))return false;const steps=Math.max(1,Math.ceil(a.distanceTo(b)/.2)),p=new T.Vector3();
 for(let i=0;i<=steps;i++)if(pointBlocked(p.lerpVectors(a,b,i/steps)))return false;return true;
}
function crossesBox(a,b,box){const dx=a.x-box.x,dz=a.z-rootZ-box.z,ex=b.x-box.x,ez=b.z-rootZ-box.z,lo=[dx*box.c-dz*box.s,a.y,dx*box.s+dz*box.c],hi=[ex*box.c-ez*box.s,b.y,ex*box.s+ez*box.c],bounds=[[-box.w,box.w],[0,box.h],[-box.d,box.d]];let enter=0,leave=1;for(let i=0;i<3;i++){const delta=hi[i]-lo[i];if(Math.abs(delta)<1e-10){if(lo[i]<bounds[i][0]||lo[i]>bounds[i][1])return false;}else{const u=(bounds[i][0]-lo[i])/delta,v=(bounds[i][1]-lo[i])/delta;enter=Math.max(enter,Math.min(u,v));leave=Math.min(leave,Math.max(u,v));if(enter>leave)return false;}}return enter<=leave;}
function crossesVoxel(a,b){if(!bits||!field)return false;const p=[a.x,a.y,a.z-rootZ].map((v,i)=>(stableCoordinate(v)-field.origin[i])/field.cell),end=[b.x,b.y,b.z-rootZ].map((v,i)=>(stableCoordinate(v)-field.origin[i])/field.cell),d=end.map((v,i)=>v-p[i]),cell=p.map(Math.floor),step=d.map(Math.sign),next=d.map((v,i)=>Math.abs(v)<1e-12?Infinity:((v>0?cell[i]+1:cell[i])-p[i])/v),stride=d.map(v=>Math.abs(v)<1e-12?Infinity:Math.abs(1/v));
 const hit=v=>{if(v.some((n,i)=>n<0||n>=field.shape[i]))return false;const k=(v[0]*field.shape[1]+v[1])*field.shape[2]+v[2];return !!(bits[k>>3]&(1<<(k&7)));};let t=0;
 for(let count=0;count<2400&&t<=1;count++){if(hit(cell))return true;const edge=Math.min(...next);if(edge>1)break;const axes=[0,1,2].filter(i=>Math.abs(next[i]-edge)<1e-9);for(let mask=1;mask<1<<axes.length;mask++){const candidate=cell.slice();axes.forEach((axis,i)=>{if(mask&(1<<i))candidate[axis]+=step[axis];});if(hit(candidate))return true;}for(const i of axes){cell[i]+=step[i];next[i]+=stride[i];}t=edge;}return false;}
export function clearCameraSegment(a,b){
 if(lensOffsets.some(offset=>crossesVoxel(a.clone().add(offset),b.clone().add(offset))))return false;const candidates=new Set(),extraCandidates=new Set(),distance=a.distanceTo(b),p=new T.Vector3(),n=Math.max(1,Math.ceil(distance/8));for(let i=0;i<=n;i++){p.lerpVectors(a,b,i/n);const x=Math.floor(p.x/16),z=Math.floor((p.z-rootZ)/16),ex=Math.floor(p.x/8),ez=Math.floor((p.z-rootZ)/8);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){for(const box of buildings.get((x+dx)+','+(z+dz))||[])candidates.add(box);for(const box of extraCells.get((ex+dx)+','+(ez+dz))||[])extraCandidates.add(box);}}
 // Check the entire segment against live crowns and trunks. Endpoint sampling
 // alone missed a narrow box corner, then rejected its spline subdivisions.
 for(const box of extraCandidates)for(const offset of lensOffsets){let enter=0,leave=1,hit=true;for(let axis=0;axis<3;axis++){const start=stableCoordinate((axis===0?a.x:axis===1?a.y:a.z-rootZ)+(axis===0?offset.x:axis===1?offset.y:offset.z)),end=stableCoordinate((axis===0?b.x:axis===1?b.y:b.z-rootZ)+(axis===0?offset.x:axis===1?offset.y:offset.z)),delta=end-start,lo=box[axis]+1e-8,hi=box[axis+3]-1e-8;if(Math.abs(delta)<1e-12){if(start<lo||start>hi){hit=false;break;}}else{const u=(lo-start)/delta,v=(hi-start)/delta;enter=Math.max(enter,Math.min(u,v));leave=Math.min(leave,Math.max(u,v));if(enter>leave){hit=false;break;}}}if(hit)return false;}
 for(const box of candidates)if(crossesBox(a,b,box))return false;
 for(const [x,z,width,angle]of bridges)if(crossesBox(a,b,{x,z,w:(width+3)/2+.2,d:1.15,h:2.2+width*.28,c:Math.cos(angle),s:Math.sin(angle)}))return false;
 const samples=Math.max(1,Math.ceil(distance/.12));for(let i=0;i<=samples;i++)if(cameraBlocked(p.lerpVectors(a,b,i/samples)))return false;return true;
}
export function safeOrbitPosition(target,desired){const length=target.distanceTo(desired),n=Math.max(1,Math.ceil(length/.15)),p=new T.Vector3(),last=target.clone();let enteredFree=false;for(let i=1;i<=n;i++){p.lerpVectors(target,desired,i/n);if(cameraBlocked(p)){if(enteredFree)return last;}else{enteredFree=true;last.copy(p);}}return enteredFree?last:safeCameraPoint(desired);}
export function safeCameraPoint(point){if(!cameraBlocked(point))return point.clone();let best=null,score=Infinity;
 for(let radius=1;radius<=9;radius++)for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++)for(let dy=0;dy<=Math.min(5,radius);dy++){
  if(Math.max(Math.abs(dx),Math.abs(dz),dy)!==radius)continue;const p=point.clone().add(new T.Vector3(dx,dy,dz)),cost=dx*dx+dz*dz+dy*dy*1.6;if(cost<score&&!cameraBlocked(p)){score=cost;best=p;}}
 return best||point.clone();
}
class Heap{constructor(){this.a=[];}push(v){let i=this.a.length;this.a.push(v);while(i){const j=(i-1)>>1;if(this.a[j].f<=v.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=v;}pop(){const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].f<this.a[j].f)j++;if(this.a[j].f>=last.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=last;}return first;}}
function avoidRoute(start,end){
 const cell=.5,origin=new T.Vector3(-259.75,.75,-354.75+rootZ),sizeX=840,sizeY=50,sizeZ=840;
 const xyz=p=>[Math.round((p.x-origin.x)/cell),Math.round((p.y-origin.y)/cell),Math.round((p.z-origin.z)/cell)],point=v=>new T.Vector3(v[0]*cell+origin.x,v[1]*cell+origin.y,v[2]*cell+origin.z),key=v=>(v[0]*sizeY+v[1])*sizeZ+v[2];
 const heap=new Heap(),nodes=new Map(),blocked=new Map();
 const isBlocked=v=>{if(v[0]<0||v[0]>=sizeX||v[1]<0||v[1]>=sizeY||v[2]<0||v[2]>=sizeZ)return true;const k=key(v);if(!blocked.has(k))blocked.set(k,cameraBlocked(point(v)));return blocked.get(k);};
 const snap=p=>{const at=xyz(p),candidates=[];for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++)for(let dz=-3;dz<=3;dz++){const v=[at[0]+dx,at[1]+dy,at[2]+dz];if(!isBlocked(v))candidates.push({v,d:point(v).distanceToSquared(p)});}candidates.sort((a,b)=>a.d-b.d);return candidates.find(c=>clearCameraSegment(p,point(c.v)))?.v;};
 const a=snap(start),b=snap(end);if(!a||!b)return null;const goal=key(b);
 const heuristic=v=>{const dx=Math.abs(v[0]-b[0]),dz=Math.abs(v[2]-b[2]);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz)+Math.abs(v[1]-b[1]);};const first={v:a,k:key(a),g:0,f:heuristic(a),parent:null};nodes.set(first.k,first);heap.push(first);let found=null,count=0;
 while(heap.a.length&&count++<65000){const n=heap.pop();if(n.closed)continue;n.closed=true;if(n.k===goal){found=n;break;}
  for(const delta of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],[0,1,0],[0,-1,0]]){const v=n.v.map((x,i)=>x+delta[i]);if(isBlocked(v))continue;if(delta[0]&&delta[2]&&(isBlocked([v[0],n.v[1],n.v[2]])||isBlocked([n.v[0],n.v[1],v[2]])))continue;const k=key(v),g=n.g+Math.hypot(...delta)+(delta[1]>0?.8:0)+Math.max(0,v[1]-5)*.035,old=nodes.get(k);if(old&&old.g<=g)continue;if(!clearCameraSegment(point(n.v),point(v)))continue;const next={v,k,g,f:g+heuristic(v)*1.6,parent:n};nodes.set(k,next);heap.push(next);}
 }
 if(!found)return null;const raw=[end.clone()];for(let n=found;n;n=n.parent)raw.push(point(n.v));raw.push(start.clone());raw.reverse();
 const simple=[raw[0]];let i=0;while(i<raw.length-1){let j=raw.length-1;while(j>i+1&&!clearCameraSegment(raw[i],raw[j]))j--;simple.push(raw[j]);i=j;}return simple;
}
function roundedRoute(points){const curve=new T.CurvePath();let last=points[0];for(let i=1;i<points.length-1;i++){
 const p=points[i],before=points[i-1],after=points[i+1];let radius=Math.min(1.8,p.distanceTo(before)*.25,p.distanceTo(after)*.25),corner,enter,leave;
 for(let attempt=0;attempt<8;attempt++){enter=p.clone().lerp(before,radius/p.distanceTo(before));leave=p.clone().lerp(after,radius/p.distanceTo(after));corner=new T.QuadraticBezierCurve3(enter,p.clone(),leave);let safe=true,previous=enter;for(let k=1;k<=24;k++){const next=corner.getPoint(k/24);if(!clearCameraSegment(previous,next)){safe=false;break;}previous=next;}if(safe)break;radius*=.5;}
 curve.add(new T.LineCurve3(last,enter));curve.add(corner);last=leave;
 }curve.add(new T.LineCurve3(last,points.at(-1)));curve.updateArcLengths();return curve;}
export function roundedFlightRoute(points){return roundedRoute(points);}
// Keep the exact lecture endpoints. Projecting a narrow but valid walking
// viewpoint onto the larger cruise lens used to invalidate the first segment.
export function endpointFlightRoute(start,end){
 return withWalkingClearance(()=>{
  if(cameraBlocked(start)||cameraBlocked(end))return null;
  if(clearCameraSegment(start,end))return [start.clone(),end.clone()];
  const route=avoidRoute(start,end);
  return route&&route.every((p,i)=>!i||clearCameraSegment(route[i-1],p))?route:null;
 });
}
export function overflightRoute(start,end){
 const ports=(point,toward)=>{
  const heading=Math.atan2(toward.x-point.x,toward.z-point.z),out=[];
  for(const radius of [0,2,4,7])for(const delta of [0,-Math.PI/2,Math.PI/2,Math.PI]){
   if(!radius&&delta)continue;
   const p=point.clone().add(new T.Vector3(Math.sin(heading+delta)*radius,0,Math.cos(heading+delta)*radius));
   if(withWalkingClearance(()=>clearCameraSegment(point,p)))out.push(p);
  }
  return out;
 };
 const from=ports(start,end),to=ports(end,start);
 for(const height of [8,12,18,24,32,48]){
  const y=Math.max(start.y,end.y,height);
  for(const a of from)for(const b of to){
   const up=a.clone().setY(y),down=b.clone().setY(y);
   if(!withWalkingClearance(()=>clearCameraSegment(a,up)&&clearCameraSegment(down,b)))continue;
   if(!withFlightClearance(()=>clearCameraSegment(up,down)))continue;
   const route=[start,a,up,down,b,end].filter((p,i,list)=>!i||p.distanceTo(list[i-1])>.001);
   if(withWalkingClearance(()=>route.every((p,i)=>!i||clearCameraSegment(route[i-1],p))))return route.map(p=>p.clone());
  }
 }
 return null;
}
export function safeFlightCurve(original,start,destination){
 const a=safeCameraPoint(start),b=safeCameraPoint(destination);let previous=original.getPointAt(0),clear=a.distanceTo(start)<.01&&b.distanceTo(destination)<.01;
 if(clear)for(let i=1;i<=240;i++){const p=original.getPointAt(i/240);if(!clearCameraSegment(previous,p)){clear=false;break;}previous=p;}
 if(clear)return original;const route=avoidRoute(a,b);if(route){const rounded=roundedRoute(route);let safe=true,previous=rounded.getPointAt(0);for(let i=1,n=Math.ceil(rounded.getLength()/.08);i<=n;i++){const p=rounded.getPointAt(i/n);if(!clearCameraSegment(previous,p)){safe=false;break;}previous=p;}if(safe)return rounded;const plain=new T.CurvePath();for(let i=1;i<route.length;i++)plain.add(new T.LineCurve3(route[i-1],route[i]));return plain;}
 // A failed plan is reported rather than silently sending the camera through a wall.
 console.warn('飞行路径未找到安全通道，保持当前镜头');return new T.LineCurve3(a,a.clone());
}
