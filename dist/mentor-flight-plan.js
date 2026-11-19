import * as T from './vendor/three/three.module.js';
import {flightSafetyReady,safeCameraPoint,safeFlightCurve,clearCameraSegment,cameraBlocked,roundedFlightRoute,withFlightClearance,withWalkingClearance,endpointFlightRoute,overflightRoute} from './mentor-flight-safety.js?v=flow138';
// A lecture viewpoint can be inside a garden walkway. Leave that viewpoint
// locally, then keep the wider lens clearance for the whole travelling shot.
function cruisePort(point,toward){
 const heading=toward.clone().sub(point).setY(0).normalize(),candidates=[];
 for(const rise of [0,2,4,6,8])for(const distance of [0,2,4,6])for(const side of [0,-1,1]){
  if(!distance&&side)continue;const p=point.clone().addScaledVector(heading,distance).add(new T.Vector3(-heading.z*side*2,rise,heading.x*side*2));
  if(withFlightClearance(()=>cameraBlocked(p)))continue;
  if(!withWalkingClearance(()=>clearCameraSegment(point,p)))continue;
  candidates.push({point:p,cost:p.distanceTo(point)+rise*.25+Math.abs(side)*.5});
 }
 candidates.sort((a,b)=>a.cost-b.cost);return candidates[0]?.point;
}
export async function computeFlightPoints(data){
 if(!await flightSafetyReady)throw Error('园林避障数据未能连接，请重试');
  const start=new T.Vector3(...data.start),end=new T.Vector3(...data.destination);
  const clockDeparture=Math.abs(start.x)<16&&start.z>-4&&start.z<24;
  // Ask for the shortest safe corridor once. Forced retreat/climb/approach
  // anchors created several unnecessary turns around every garden.
  const departure=cruisePort(start,end),arrival=cruisePort(end,start);
  const anchors=departure&&arrival?[start,departure,arrival,end]:clockDeparture?[start,safeCameraPoint(new T.Vector3(-21,4.2,-6)),end]:[start,end],points=[],junctions=[start];
  for(let i=1;i<anchors.length;i++){
   if(anchors[i-1].distanceTo(anchors[i])<.001)continue;
   const original=new T.LineCurve3(anchors[i-1],anchors[i]),plan=()=>safeFlightCurve(original,anchors[i-1],anchors[i]);let curve;if(departure&&arrival&&i!==2){const route=endpointFlightRoute(anchors[i-1],anchors[i]);if(route){curve=new T.CurvePath();for(let j=1;j<route.length;j++)curve.add(new T.LineCurve3(route[j-1],route[j]));}}if(!curve)curve=departure&&arrival&&i===2?withFlightClearance(plan):plan();
   // Wide cruise clearance can isolate a valid garden walking viewpoint.
   // Retry with the normal lens, then the same swept lens used on that path.
   const matches=()=>curve.getPointAt(0).distanceTo(anchors[i-1])<.01&&curve.getPointAt(1).distanceTo(anchors[i])<.01;
   const cruise=departure&&arrival&&i===2;
    if(!matches()&&!cruise)curve=plan();
   if(!matches()&&!cruise)curve=withWalkingClearance(plan);
   if(!matches()){
    // A route endpoint inside a garden walkway must not be moved to a roof or
    // rejected simply because the cruising lens is wider than that walkway.
    const escape=overflightRoute(start,end)||endpointFlightRoute(start,end);
    if(escape){const safe=roundedFlightRoute(escape),sampled=[];let prior=safe.getPointAt(0),valid=true;
     for(let k=0,n=Math.max(2,Math.ceil(safe.getLength()/.12));k<=n;k++){const p=safe.getPointAt(k/n);if(!withWalkingClearance(()=>clearCameraSegment(prior,p))){valid=false;break;}sampled.push(p.toArray());prior=p;}
     if(valid)return sampled;
     const raw=[];for(let j=1;j<escape.length;j++){const n=Math.max(1,Math.ceil(escape[j-1].distanceTo(escape[j])/.12));for(let k=j>1?1:0;k<=n;k++)raw.push(escape[j-1].clone().lerp(escape[j],k/n).toArray());}return raw;
    }
    throw Error('转场起点被场景遮挡，正在调整出发机位');
   }
   for(const part of curve.curves||[curve]){if(part.isLineCurve3||part.type==='LineCurve3')junctions.push(part.getPointAt(1));else for(let j=1;j<=6;j++)junctions.push(part.getPointAt(j/6));}
   const count=Math.max(2,Math.ceil(curve.getLength()/.12));
   for(let k=points.length?1:0;k<=count;k++)points.push(curve.getPointAt(k/count).toArray());
  }
  const rounded=roundedFlightRoute(junctions.filter((p,i)=>!i||p.distanceTo(junctions[i-1])>.001));let previous=rounded.getPointAt(0),valid=true;const smooth=[];
  for(let i=0,n=Math.max(2,Math.ceil(rounded.getLength()/.12));i<=n;i++){const p=rounded.getPointAt(i/n),nearLanding=Math.min(p.distanceTo(start),p.distanceTo(end))<3,check=()=>clearCameraSegment(previous,p);if(!(nearLanding?withWalkingClearance(check):withFlightClearance(check))){valid=false;break;}smooth.push(p.toArray());previous=p;}
 return valid?smooth:points;
}
