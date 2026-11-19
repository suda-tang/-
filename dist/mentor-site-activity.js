import {clearCameraSegment} from './mentor-flight-safety.js?v=flow138';
import * as T from './vendor/three/three.module.js';
import {gardenTours,gardenWalkDistance} from './mentor-garden-tour.js?v=4';

// A single owner of the lecturer's local movement, after the avatar's speech pose.
export function createSiteActivity(root, signal) {
 const boat=new T.Group();boat.name='shantang-lecture-sampan';boat.visible=false;root.add(boat);
 const oar=new T.Group(),wood=new T.MeshStandardMaterial({color:0x71513a,roughness:.94});
 const shaft=new T.Mesh(new T.CylinderGeometry(.018,.024,2.1,8),wood);shaft.position.y=-.8;oar.add(shaft);
 const blade=new T.Mesh(new T.BoxGeometry(.15,.5,.035),wood);blade.position.y=-1.8;oar.add(blade);oar.position.set(.47,1.45,1.5);boat.add(oar);
 let boatingStart=null,shoreState=null,shoreResolve;let attemptAt=-Infinity;let loaded=false,loading=false,disposed=false,lastSample=0,offset=0,targetOffset=0,floor=0,lastTime=0,walkPhase=0,heading=0,headingReady=false,offsetZ=0,targetZ=0,gardenChapter=-1,gardenStart=0,walkingBlend=0;
 const dock=new T.Group();dock.name='shantang-landing-stage';root.add(dock);
 const paving=new T.MeshStandardMaterial({color:0xa9a393,roughness:.94}),rampMaterial=new T.MeshStandardMaterial({color:0x80664c,roughness:.9});
 const landing=new T.Mesh(new T.BoxGeometry(1.2,.18,4.5),paving);landing.position.set(46.3,.02,-100.35);dock.add(landing);
 const ramp=new T.Mesh(new T.BoxGeometry(3.2,.09,.9),rampMaterial);ramp.position.set(44.55,.34,-100.35);ramp.rotation.z=-.17;dock.add(ramp);dock.visible=false;
 const ease=t=>{t=T.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
 function stride(actor,distance,weight=1){for(const l of actor.children[0]?.userData.chibiBody?.userData.walkLimbs||[]){const p=distance/.85*Math.PI*2+(l.sign===1?Math.PI:0);l.mesh.rotation.x=Math.sin(p)*.34*weight;l.knee.rotation.x=Math.max(0,-Math.sin(p))*.2*weight;if(l.foot)l.foot.rotation.x=-Math.max(0,-Math.sin(p))*.10*weight;}}
 let walkingPaths={},pathLengths={};fetch('/assets/arrival/garden-walking-paths.json?v=interior118',{signal}).then(r=>r.json()).then(value=>{walkingPaths=value;for(const [name,path]of Object.entries(value)){const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths.at(-1)+Math.hypot(path[i][0]-path[i-1][0],path[i][2]-path[i-1][2]));pathLengths[name]=lengths;}}).catch(()=>{});
 async function prepareBoat(){
  if(loading||loaded||disposed||performance.now()-attemptAt<5000)return;attemptAt=performance.now();loading=true;
  try{const {GLTFLoader}=await import('./vendor/three/GLTFLoader.js');const r=await fetch('/assets/arrival/sampan/sampan.glb',{signal});if(!r.ok)throw Error('船模型 HTTP '+r.status);const gltf=await new GLTFLoader().parseAsync(await r.arrayBuffer(),location.origin+'/assets/arrival/sampan/');
   if(disposed){disposeObject(gltf.scene);return;}const model=gltf.scene;model.updateMatrixWorld(true);let b=new T.Box3().setFromObject(model),s=b.getSize(new T.Vector3());
   if(s.x>s.z){model.rotation.y=Math.PI/2;model.updateMatrixWorld(true);b.setFromObject(model);s=b.getSize(new T.Vector3());}
   const scale=5.8/Math.max(s.x,s.z);model.scale.multiplyScalar(scale);model.updateMatrixWorld(true);b.setFromObject(model);const c=b.getCenter(new T.Vector3());model.position.sub(new T.Vector3(c.x,b.min.y+.13,c.z));model.updateMatrixWorld(true);const rigging=[];model.traverse(o=>{if(o.isMesh&&new T.Box3().setFromObject(o).max.y>1.3)rigging.push(o);});for(const part of rigging)part.visible=false;boat.add(model);loaded=true;
  }catch(e){if(!disposed)root.userData.boatError=e.message;}finally{loading=false;}
 }
 function update({chapter,actor,stage,angle=0,time,now,moving,viewer}){
  const dt=Math.min(.08,Math.max(.001,lastTime?(now-lastTime)/1000:1/60));lastTime=now;
  boat.visible=loaded&&(chapter===5||!!shoreState);dock.visible=!!shoreState;if(chapter!==5||moving)boatingStart=null;
  actor.userData.siteFloor=stage.y;actor.userData.boating=chapter===5&&!shoreState&&!moving;
  if(chapter===5){void prepareBoat();if(!boat.visible)return {x:0,z:1.65};
   boatingStart??=time;let z=Math.min(6,Math.max(0,time-boatingStart)*.12);const riverX=43-(Math.max(0,z)/33)*2;
   if(shoreState){shoreState.started??=now;shoreState.elapsed=(now-shoreState.started)/1000;shoreState.initialZ??=z;shoreState.initialX??=riverX;z=shoreState.initialZ;dock.position.set(shoreState.initialX-stage.x,0,z);boat.position.set(shoreState.initialX,.035,stage.z-root.position.z+z);boat.rotation.z=0;
    const walk=ease((shoreState.elapsed-2)/4.8),x=3*walk;actor.position.set(boat.position.x+x,actor.position.y,stage.z+1.65+z);actor.rotation.y=Math.PI/2;actor.userData.siteFloor=T.MathUtils.lerp(.655,.11,walk);stride(actor,x,Math.sin(Math.PI*walk));
    if(walk===1&&!shoreState.done){shoreState.done=true;shoreResolve?.();shoreResolve=null;}return {x:boat.position.x-stage.x+x,z:1.65+z};
   }
   boat.position.set(riverX,.035+Math.sin(time*1.15)*.012,stage.z-root.position.z+z);boat.rotation.z=Math.sin(time*.9)*.008;boat.rotation.y=z>0?Math.atan2(-2,33):Math.atan2(1,34);
   actor.position.set(riverX,actor.position.y,stage.z+z+1.65);actor.userData.siteFloor=.62+boat.position.y;actor.rotation.y=.16;
   const phase=time*.85;oar.rotation.set(.22+Math.sin(phase)*.30,0,.30+Math.cos(phase)*.13);
   for(const arm of actor.children[0]?.userData.chibiBody?.userData.arms||[]){arm.pivot.rotation.x=-.5+Math.sin(phase)*.15;arm.pivot.rotation.z=arm.sign*.20;arm.elbow.rotation.x=-.6;}
   return {x:riverX-stage.x,z:z+1.65};
  }
  if((chapter!==1&&chapter!==2)||moving){offset=0;targetOffset=0;offsetZ=targetZ=0;gardenChapter=-1;heading=0;return {x:0,z:0};}
  if(gardenChapter!==chapter){gardenChapter=chapter;gardenStart=time;headingReady=false;offset=offsetZ=targetOffset=targetZ=0;}
  const path=walkingPaths[chapter===1?'yiyuan':'zhuozhengyuan'];
  if(!path?.length){gardenStart=time;return {x:0,z:0};}
  // Walk once through the dry surveyed viewpoints; no repeated out-and-back loop.
  const name=chapter===1?'yiyuan':'zhuozhengyuan',lengths=pathLengths[name];if(!lengths)return {x:0,z:0};const length=lengths.at(-1),elapsed=time-gardenStart,{distance,duration}=gardenWalkDistance(length,elapsed,gardenTours[name]);
  let i=0;while(i<path.length-2&&lengths[i+1]<distance)i++;const t=T.MathUtils.clamp((distance-lengths[i])/Math.max(.0001,lengths[i+1]-lengths[i]),0,1),a=path[i],b=path[i+1];
  const desiredX=T.MathUtils.lerp(a[0],b[0],t)-stage.x,desiredZ=T.MathUtils.lerp(a[2],b[2],t)+root.position.z-stage.z;
  floor=T.MathUtils.lerp(a[1],b[1],t);
  const step=desiredX-offset,stepZ=desiredZ-offsetZ;offset=desiredX;offsetZ=desiredZ;
  const distanceMoved=Math.hypot(step,stepZ);walkPhase+=distanceMoved/.85*Math.PI*2;
  let ahead=i;const aheadDistance=Math.min(length,distance+.55);while(ahead<path.length-2&&lengths[ahead+1]<aheadDistance)ahead++;
  const aheadT=T.MathUtils.clamp((aheadDistance-lengths[ahead])/Math.max(.0001,lengths[ahead+1]-lengths[ahead]),0,1),futureX=T.MathUtils.lerp(path[ahead][0],path[ahead+1][0],aheadT),futureZ=T.MathUtils.lerp(path[ahead][2],path[ahead+1][2],aheadT);
  const walking=distanceMoved>.00001&&distance<length-.001;
  walkingBlend+=((walking?1:0)-walkingBlend)*(1-Math.exp(-dt*5));const desiredHeading=walking?Math.atan2(futureX-stage.x-desiredX,futureZ+root.position.z-stage.z-desiredZ)-angle:viewer?Math.atan2(viewer.x-stage.x-desiredX,viewer.z-stage.z-desiredZ)-angle:heading;
  if(!headingReady){heading=desiredHeading;headingReady=true;}else{const turn=Math.atan2(Math.sin(desiredHeading-heading),Math.cos(desiredHeading-heading))*(1-Math.exp(-dt*(walking?4:1.4))),limit=dt*(walking?1.6:.8);heading+=T.MathUtils.clamp(turn,-limit,limit);}
  actor.position.x=stage.x+offset;actor.position.z=stage.z+offsetZ;actor.userData.siteFloor=floor||stage.y;actor.rotation.set(0,heading,0);stride(actor,walkPhase*.85/(Math.PI*2),walkingBlend);
  root.userData.gardenWalk={name:chapter===1?'yiyuan':'zhuozhengyuan',distance,total:length,duration,progress:length?distance/length:1};return {x:offset,z:offsetZ};

 }
 function disposeObject(g){g.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
 function dispose(){if(disposed)return;disposed=true;boat.removeFromParent();disposeObject(boat);dock.removeFromParent();disposeObject(dock);shoreResolve?.();shoreResolve=null;}
 signal.addEventListener('abort',dispose,{once:true});return {update,prepareBoat,dispose,get ashore(){return !!shoreState?.done;},disembark(){if(shoreState?.done)return Promise.resolve();if(shoreState)return new Promise(resolve=>{const previous=shoreResolve;shoreResolve=()=>{previous?.();resolve();};});shoreState={elapsed:0,done:false};return new Promise(resolve=>shoreResolve=resolve);}};
}
