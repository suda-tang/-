import {computeFlightPoints} from './mentor-flight-plan.js?v=flow138';
import {safeFlightCurve,safetySnapshot,clearCameraSegment,withWalkingClearance} from './mentor-flight-safety.js?v=flow138';
import * as T from './vendor/three/three.module.js';

export function chapterFlightDuration(flight){
 const a=Math.atan2(flight.startDirection.x,flight.startDirection.z),b=Math.atan2(flight.endDirection.x,flight.endDirection.z),turn=Math.abs(Math.atan2(Math.sin(b-a),Math.cos(b-a)));
 return Math.max(5.5,Math.min(12,Math.max(flight.curve.getLength()/15+1.5,turn*1.875/.52)));
}

export function createChapterFlight(camera, target, destination, destinationTarget, endFov) {
 const start=camera.position.clone(),length=start.distanceTo(destination),forward=target.clone().sub(start).normalize();
 const delta=destination.clone().sub(start),side=new T.Vector3(-delta.z,0,delta.x).normalize();
 const height=Math.min(3.2,Math.max(.8,length*.018));
 const lead=start.clone().addScaledVector(forward,Math.min(2.5,length*.035));lead.y+=height*.34;
 const middle=start.clone().lerp(destination,.52).addScaledVector(side,Math.min(3,length*.035));middle.y=Math.max(start.y,destination.y)+height;
 const approach=destination.clone().lerp(middle,.17);
 const curve=new T.CatmullRomCurve3([start,lead,middle,approach,destination.clone()],false,'centripetal');
 curve.arcLengthDivisions=160;curve.updateArcLengths();
 const safeCurve=safeFlightCurve(curve,start,destination);return {curve:safeCurve,startTarget:target.clone(),endTarget:destinationTarget.clone(),startFov:camera.fov,endFov,startDirection:target.clone().sub(safeCurve.getPointAt(0)).normalize(),endDirection:destinationTarget.clone().sub(safeCurve.getPointAt(1)).normalize(),startDistance:target.distanceTo(start),endDistance:destinationTarget.distanceTo(safeCurve.getPointAt(1))};
}

export function sampleChapterFlight(flight, progress) {
 const p=T.MathUtils.clamp(progress,0,1),ramp=.16,integral=u=>u*u*u-.5*u*u*u*u;
 const ease=p<ramp?ramp/(1-ramp)*integral(p/ramp):p>1-ramp?1-ramp/(1-ramp)*integral((1-p)/ramp):(p-ramp*.5)/(1-ramp),position=flight.curve.getPointAt(ease);
 const smooth=x=>{x=T.MathUtils.clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
 // A stable tracking shot: path detours must not swing the visitor's head.
 const from=flight.startDirection,to=flight.endDirection,blend=smooth(p);
 const a=Math.atan2(from.x,from.z),b=Math.atan2(to.x,to.z),heading=a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*blend;
 // Height clearance belongs to the flight path, not the gaze. Following its
 // descending tangent made every landing look like a sudden nod at the ground.
 const startPitch=Math.asin(T.MathUtils.clamp(flight.startDirection.y,-1,1)),endPitch=Math.asin(T.MathUtils.clamp(flight.endDirection.y,-1,1));
 const pitch=T.MathUtils.lerp(startPitch,endPitch,smooth(p)),direction=new T.Vector3(Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),Math.cos(heading)*Math.cos(pitch));
 const look=position.clone().addScaledVector(direction,T.MathUtils.lerp(flight.startDistance,flight.endDistance,ease));
 const fov=T.MathUtils.lerp(flight.startFov,flight.endFov,ease)+Math.sin(Math.PI*p)**2*1.5;
 return {position,target:look,fov,bank:0};
}

let activeFlight=null,sequence=0,plannerWorker=null;const pendingPlans=new Map();
function retireWorker(){const worker=plannerWorker;plannerWorker=null;if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();}}
function workerReady(){
 if(plannerWorker)return plannerWorker;
 const worker=new Worker(new URL('./mentor-flight-worker.js?v=flow138',import.meta.url),{type:'module'});plannerWorker=worker;
 worker.onmessage=({data})=>{const job=pendingPlans.get(data.id);if(!job)return;data.error?job.recover():job.finish(null,data.points);};
 const fail=()=>{if(plannerWorker!==worker)return;retireWorker();for(const job of [...pendingPlans.values()])void job.recover();};
 worker.onerror=event=>{event.preventDefault();fail();};worker.onmessageerror=fail;return worker;
}
export function warmFlightPlanner(){try{workerReady();}catch{/* A browser without module workers uses the validated local planner. */}}

class SampledFlightCurve extends T.Curve{
 constructor(points){super();this.points=points.map(p=>new T.Vector3(...p));this.lengths=[0];for(let i=1;i<this.points.length;i++)this.lengths.push(this.lengths[i-1]+this.points[i].distanceTo(this.points[i-1]));}
 getLength(){return this.lengths.at(-1);}
 getPoint(t,target=new T.Vector3()){return this.getPointAt(t,target);}
 getPointAt(t,target=new T.Vector3()){const d=T.MathUtils.clamp(t,0,1)*this.getLength();let lo=1,hi=this.lengths.length-1;while(lo<hi){const m=(lo+hi)>>1;if(this.lengths[m]<d)lo=m+1;else hi=m;}const a=this.points[lo-1],b=this.points[lo];return target.copy(a).lerp(b,(d-this.lengths[lo-1])/Math.max(.000001,this.lengths[lo]-this.lengths[lo-1]));}
 getTangentAt(t){const a=this.getPointAt(Math.max(0,t-.001)),b=this.getPointAt(Math.min(1,t+.001));return b.sub(a).normalize();}
}
export async function prepareChapterFlight(camera,target,destination,destinationTarget,endFov){
 if(activeFlight){activeFlight.cancel();retireWorker();}const id=++sequence,start=camera.position.clone(),data={id,start:start.toArray(),target:target.toArray(),destination:destination.toArray(),destinationTarget:destinationTarget.toArray(),snapshot:safetySnapshot()};let usedFallback=false;
 const points=await new Promise((resolve,reject)=>{
  let done=false,recovering=false,timer;const task={cancel:()=>finish(Error('转场已更换'))};activeFlight=task;
  function finish(error,points){if(done)return;done=true;clearTimeout(timer);pendingPlans.delete(id);if(activeFlight===task)activeFlight=null;error?reject(error):resolve(points);}
  async function recover(){if(done||recovering)return;recovering=true;usedFallback=true;clearTimeout(timer);pendingPlans.delete(id);retireWorker();await new Promise(r=>typeof requestIdleCallback==='function'?requestIdleCallback(r,{timeout:300}):setTimeout(r,0));if(done)return;try{finish(null,await computeFlightPoints(data));}catch(error){finish(error);}}
  timer=setTimeout(recover,8000);
  pendingPlans.set(id,{finish,recover});try{workerReady().postMessage(data);}catch{void recover();}
 });
 // Assets can finish loading while the worker plans. Check its result against
 // the current scene obstacles rather than accepting an outdated snapshot.
 if(!withWalkingClearance(()=>points.every((p,i)=>!i||clearCameraSegment(new T.Vector3(...points[i-1]),new T.Vector3(...p)))))throw Error('场景已更新，正在重新规划避障路线');
 const curve=new SampledFlightCurve(points);return {curve,usedFallback,startTarget:target.clone(),endTarget:destinationTarget.clone(),startFov:camera.fov,endFov,startDirection:target.clone().sub(start).normalize(),endDirection:destinationTarget.clone().sub(curve.getPointAt(1)).normalize(),startDistance:target.distanceTo(start),endDistance:destinationTarget.distanceTo(curve.getPointAt(1))};
}
export function releaseFlightPlanner(){activeFlight?.cancel();activeFlight=null;pendingPlans.clear();retireWorker();}
