import * as T from './vendor/three/three.module.js';
import {nearbyGardenSurfaces} from './mentor-garden-raycast.js?v=1';
import {cameraBlocked,clearCameraSegment,clearSightline,roundedFlightRoute} from './mentor-flight-safety.js?v=flow138';

function levelDetour(start,end){
 const cell=.5,gx=Math.round((end.x-start.x)/cell),gz=Math.round((end.z-start.z)/cell),began=performance.now();
 const point=(x,z)=>new T.Vector3(start.x+x*cell,T.MathUtils.lerp(start.y,end.y,Math.min(1,Math.hypot(x,z)/Math.max(1,Math.hypot(gx,gz)))),start.z+z*cell);
 const first={x:0,z:0,g:0,f:0,parent:null},open=[first],nodes=new Map([['0,0',first]]);let found=null;
 while(open.length&&nodes.size<1200&&performance.now()-began<25){
  let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;
  const n=open.splice(best,1)[0];if(n.closed)continue;n.closed=true;if(n.x===gx&&n.z===gz){found=n;break;}
  const from=point(n.x,n.z);
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const x=n.x+dx,z=n.z+dz,key=x+','+z,g=n.g+1;
   if(Math.abs(x)>32||Math.abs(z)>32||nodes.get(key)?.g<=g)continue;const to=point(x,z);if(cameraBlocked(to)||!clearCameraSegment(from,to))continue;
   const next={x,z,g,f:g+1.3*(Math.abs(gx-x)+Math.abs(gz-z)),parent:n};nodes.set(key,next);open.push(next);
  }
 }
 if(!found)return null;const points=[end.clone()];if(!clearCameraSegment(point(found.x,found.z),end))return null;
 for(let n=found;n;n=n.parent)points.push(point(n.x,n.z));points.push(start.clone());points.reverse();
 const simple=[points[0]];let i=0;while(i<points.length-1){let j=points.length-1;while(j>i+1&&!clearCameraSegment(points[i],points[j]))j--;simple.push(points[j]);i=j;}
 return roundedFlightRoute(simple.filter((p,i)=>!i||p.distanceTo(simple[i-1])>.001));
}

// A walking-height camera. Retain the same side of the path while it remains
// clear; there is no time-based orbit or periodic camera-angle reselection.
function solveGardenView(name,feet,phase=0,root=null,previous=null,desired=null){
 const center=new T.Vector3(name==='yiyuan'?-84:-75,feet.y,name==='yiyuan'?-153+93:-245+93),outward=feet.clone().sub(center);outward.y=0;
 const preferred=previous?Math.atan2(previous.x-feet.x,previous.z-feet.z):outward.length()>2?Math.atan2(outward.x,outward.z):Math.PI*.65;
 const aim=feet.clone().add(new T.Vector3(0,1.15,0)),ray=new T.Raycaster(),direction=new T.Vector3();let meshes=null,triangleChecks=0;
 function clear(position){if(cameraBlocked(position))return false;{
  const right=new T.Vector3().crossVectors(aim.clone().sub(position),new T.Vector3(0,1,0)).normalize();
  // The offline triangle voxel field and live tree crowns answer the broad
  // sightline tests. Limit full source-triangle confirmation to two center rays.
  for(const [side,height]of [[0,0],[-.35,.2],[.35,.2],[0,-.35]]){const sample=aim.clone().addScaledVector(right,side);sample.y+=height;if(!clearSightline(position,sample))return false;}
  if(triangleChecks<2){triangleChecks++;meshes??=nearbyGardenSurfaces(root,name,feet);if(meshes.length){ray.set(position,direction.copy(aim).sub(position).normalize());ray.far=position.distanceTo(aim)-.3;if(ray.intersectObjects(meshes,false).length)return false;}}
 }return true;}
 if(desired&&desired.distanceTo(aim)>2.3&&desired.distanceTo(aim)<7&&(!previous||clearCameraSegment(previous,desired))&&clear(desired))return {position:desired.clone(),target:aim,angle:preferred};
 const candidates=[];
 for(let i=0;i<24;i++){const turn=(i%2?1:-1)*Math.ceil(i/2)*Math.PI/12,angle=preferred+turn;
  for(const radius of [4.8,3.6,2.6])for(const height of [1.55,1.95,2.35]){
   const position=feet.clone().add(new T.Vector3(Math.sin(angle)*radius,height,Math.cos(angle)*radius));if(cameraBlocked(position))continue;
   const toward=center.clone().sub(feet).normalize(),view=aim.clone().sub(position).normalize();
   candidates.push({position,target:aim,angle,quality:radius+view.dot(toward)*1.5-Math.abs(turn)*(previous?5:1)-(previous?position.distanceTo(previous)*.6:0)});
  }
 }
 candidates.sort((a,b)=>b.quality-a.quality);
 const detours=[];
 // Bound expensive source-triangle tests. Dense instanced foliage must not turn
 // a framing adjustment into hundreds of synchronous ray casts.
 let checked=0;
 for(const candidate of candidates){
  if(++checked>12)break;
  if(clear(candidate.position)){if(!previous||clearCameraSegment(previous,candidate.position))return candidate;if(detours.length<2)detours.push(candidate);}
 }
 // A tree can separate two otherwise clear views. Follow a short, level path
 // around it instead of freezing the lens against its trunk or jumping sides.
 if(previous)for(const candidate of detours){
  const curve=levelDetour(previous,candidate.position);
  if(!curve||curve.getLength()>18||curve.getPointAt(1).distanceTo(candidate.position)>.1)continue;
  let safe=true,prior=previous;for(let i=1;i<=80;i++){const p=curve.getPointAt(i/80);if(p.y>feet.y+3.2||p.y<feet.y+1||!clearCameraSegment(prior,p)){safe=false;break;}prior=p;}
  if(safe)return {...candidate,route:curve,routeDistance:0};
 }
 if(previous)return {position:previous.clone(),target:aim,angle:preferred};
 const free=candidates.find(c=>!cameraBlocked(c.position));return free||{position:feet.clone().add(new T.Vector3(0,1.95,3)),target:aim,angle:0};
}
export function gardenView(name,feet,phase=0,root=null,previous=null,desired=null){
 const started=performance.now();try{return solveGardenView(name,feet,phase,root,previous,desired);}
 finally{if(root)root.userData.gardenViewMs=performance.now()-started;}
}
