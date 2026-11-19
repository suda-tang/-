import {minimumLectureFov,keepLectureDistance} from './mentor-shot-framing.js?v=132';
import {createPresentationFacing} from './mentor-presentation-facing.js?v=131';
import {captureDeparturePose} from './mentor-departure-pose.js?v=flow133';
import {chooseSignPlacement} from './mentor-sign-placement.js?v=6';
import {captureDepartingBoard} from './mentor-board-transition.js?v=132';
import {safeCameraPoint,safeFlightCurve,safeOrbitPosition,unregisterSceneObstacles,withWalkingClearance} from './mentor-flight-safety.js?v=flow138';
import {gardenView} from './mentor-garden-view.js?v=9';
import {gardenTours,gardenToursReady,sampleGardenTour} from './mentor-garden-tour.js?v=4';
import {gardenStations} from './mentor-garden-stations.js?v=12';
import {createChapterFlight,sampleChapterFlight,prepareChapterFlight,releaseFlightPlanner,chapterFlightDuration,warmFlightPlanner} from './mentor-chapter-flight.js?v=flow138';
import {createSiteActivity} from './mentor-site-activity.js?v=flow133';
import {createGardenAssetStream} from './mentor-garden-asset-stream.js?v=flow137';
import {createLandmarkWriting} from './mentor-landmark-writing.js?v=14';
import {createAtmosphericClouds} from './mentor-clouds.js?v=2';
import {createTowerClassroom} from './mentor-tower-classroom.js?v=9';
import {loadOldCity} from './mentor-old-city.js?v=52';
import {createCityMusic} from './mentor-city-music.js?v=8';
import {createSuzhouLandmarks,landmarkNames,landmarkLocations} from './mentor-narrated-landmarks.js?v=3';
import * as T from './vendor/three/three.module.js';
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
function release(group){if(!group)return;const obstacles=[];group.traverse(o=>{if(o.userData.willows)obstacles.push(o.uuid);});unregisterSceneObstacles(obstacles);const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});group.removeFromParent();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());group.clear();}
export function createArrival(parent){
 let api;
 let scene,camera,controls,classroom,root,spaceRoot,region,avenue,gate,tower,dead=false,last=0,time=0,travel=0,reveal=0,requested=false,voiceReady=false,settled=false,callback,onGreeting,greeted=false,resolveFinish,home,path,focusPath,landReady=false,gateReady=false,towerReady=false;
 let lectureYaw=0,departureBoard=null,departurePose=null,gardenFeet=null;let gardenCamera=null,gardenLook=null,gardenViewAt=-Infinity,gardenPose=null;let departingBoat=false,boatBoardElapsed=0;let stationCameraOffset=new T.Vector3(),waitingFlight=null,gardenApproach=null;let exitState=null,resolveExit,lastActor=null,landmarks,landmarkAngle=0,landmarkTarget=0,portal=null,chapter=0,contactShadow,stageOffset=new T.Vector3(),stageTransition=null,lastChapter=-1,campusPath=null,campusStart=0,campusAim=null,interior=null,campusBridge=null,bridgeStart=0,bridgeAim=null;const lastFlightPosition=new T.Vector3();
 let pointer=null,yaw=0,pitch=0,zoom=1,pinchDistance=0,pinchZoom=1;const pointers=new Map();
 const cityMusic=createCityMusic(),cloudPass=createAtmosphericClouds(),presentationFacing=createPresentationFacing();let marker=null,markerKey=null,writing=null,labelAttemptAt=-Infinity;
 let siteActivity=null;let gardenAssets=null;let gateOpening=false,gateOpenElapsed=0;let gardenShotStarted=0;let cityMusicStarted=false;let lessonFocus=0,focusBlend=0,activeLabel=-1,cityBuilt=false;
 const clearance={active:{value:0},stage:{value:new T.Vector3()},eye:{value:new T.Vector3()}};
 // Keep architecture intact. Lecture stations are selected on surveyed model surfaces,
 // rather than removing arbitrary fragments between the camera and the lecturer.
 function clearTeachingSightline(group){group.userData.teachingArchitectureIntact=true;}

 const abort=new AbortController(),R=6371000,sky=new T.Color('#b9ccd0'),night=new T.Color('#101926'),position=new T.Vector3(),target=new T.Vector3(),leafColor=0x9ca494;
 const label=document.createElement('div');label.className='mentor-flight-label';label.style.cssText='position:absolute;top:0;left:0;z-index:3;width:max-content;max-width:calc(100% - 32px);box-sizing:border-box;white-space:nowrap;color:white;text-shadow:0 2px 12px #0005;background:#17332b96;padding:6px 10px;border-radius:8px;backdrop-filter:blur(8px);font:500 clamp(16px,2vw,25px) serif;letter-spacing:.12em;pointer-events:none';parent.append(label);
 const waitPanel=document.createElement('div');waitPanel.style.cssText='position:absolute;left:50%;bottom:12%;transform:translateX(-50%);width:min(320px,80%);padding:16px 20px;border-radius:22px;background:#ffffff70;backdrop-filter:blur(20px);color:#483d48;z-index:5';waitPanel.innerHTML='<div>正在加载讲解内容</div><progress max=100 style="width:100%;margin-top:10px"></progress>';waitPanel.hidden=true;parent.append(waitPanel);
 const cloud={style:{opacity:0,transform:''},remove(){cloudPass.dispose();}};

 function placeLabel(index){
  label.style.opacity='0';if(!writing||exitState||index<0)return;
  camera.updateMatrixWorld(true);const lecture=settled&&!stageTransition,key=index+':'+(lecture?'lecture':'arrival');
  if(markerKey===key){writing.show(index,time);return;}
  const [x,z]=index===7?[0,-5]:index===8?[0,-100]:index===9?[-80,-160]:landmarkLocations[index];
  const base=lecture?stageOffset.clone():new T.Vector3(x,0,z).add(root.position);
  const near=index===7?16:index===8?10:9;
  if(camera.position.distanceTo(base)>near||time-labelAttemptAt<.5)return;labelAttemptAt=time;
  const placement=chooseSignPlacement(root,camera,base,lecture?stageAngle():0,index,[classroom.group,lastActor]);
  if(!placement)return;
  markerKey=key;writing.mesh.position.copy(placement.position);writing.mesh.rotation.set(0,placement.rotation,0);
  writing.show(index,time,true);label.textContent=writing.text;parent.dataset.landmarkLabel=writing.text;
 }

 function prefetchChapter(index){if(settled)warmFlightPlanner();const name=index===1?'yiyuan':index===2?'zhuozhengyuan':null;gardenAssets?.prefetch(name,name?gardenStations[name]:null);if(index===5)void siteActivity?.prepareBoat();}
 function stageAngle(){return lastChapter===1?(gardenStations.yiyuan[3]||0)*Math.PI/2:lastChapter===2?(gardenStations.zhuozhengyuan[3]||0)*Math.PI/2:lectureYaw;}
 function applyView(){if(exitState)return;const gardenRail=settled&&!stageTransition&&(lastChapter===1||lastChapter===2);if(gardenRail&&Math.abs(yaw)+Math.abs(pitch)+Math.abs(zoom-1)<.001){camera.lookAt(controls.target);parent.dataset.viewYaw=parent.dataset.viewPitch='0.000';return;}if(stageTransition||!settled){const direction=camera.position.clone().sub(controls.target),look=new T.Spherical().setFromVector3(direction);look.theta+=yaw;look.phi=Math.max(.15,Math.min(Math.PI-.15,look.phi+pitch));controls.target.copy(camera.position).sub(new T.Vector3().setFromSpherical(look));camera.lookAt(controls.target);return;}const previous=camera.position.clone(),offset=camera.position.clone().sub(controls.target);const spherical=new T.Spherical().setFromVector3(offset);spherical.theta+=yaw;spherical.phi=Math.max(.15,Math.min(Math.PI-.15,spherical.phi+pitch));spherical.radius=Math.max(3.4,spherical.radius*zoom);camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(spherical));if(!stageTransition&&settled&&camera.position.y<40&&((lastChapter!==1&&lastChapter!==2)||Math.abs(yaw)+Math.abs(pitch)+Math.abs(zoom-1)>.001)){const shift=new T.Vector3(0,0,93-root.position.z);camera.position.copy(keepLectureDistance(previous.clone().add(shift),camera.position.clone().add(shift),controls.target.clone().add(shift),safeOrbitPosition).sub(shift));}camera.lookAt(controls.target);parent.dataset.viewYaw=yaw.toFixed(3);parent.dataset.viewPitch=pitch.toFixed(3);}
 document.addEventListener('mentor-lesson',e=>{const d=e.detail||{};lessonFocus=d.speaking&&d.progress>.35&&d.lessonPosition<.96?1:0;},{signal:abort.signal});
 parent.addEventListener('pointerdown',e=>{if(!e.target.closest('canvas')||exitState)return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});pointer={id:e.pointerId,x:e.clientX,y:e.clientY};e.target.setPointerCapture?.(e.pointerId);if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);pinchZoom=zoom;}},{passive:false,signal:abort.signal});
 parent.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0&&distance>0)zoom=Math.max(.55,Math.min(2,pinchZoom*pinchDistance/distance));parent.dataset.viewZoom=zoom.toFixed(3);return;}if(pointer?.id!==e.pointerId)return;yaw+=(e.clientX-pointer.x)*.004;pitch=Math.max(-.5,Math.min(.5,pitch+(e.clientY-pointer.y)*.003));pointer.x=e.clientX;pointer.y=e.clientY;},{passive:false,signal:abort.signal});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])parent.addEventListener(event,e=>{pointers.delete(e.pointerId);pinchDistance=0;const entry=[...pointers.entries()][0];pointer=entry?{id:entry[0],...entry[1]}:null;},{signal:abort.signal});
 for(const event of ['gesturestart','gesturechange'])parent.addEventListener(event,e=>{if(e.target.closest('canvas'))e.preventDefault();},{passive:false,signal:abort.signal});
 parent.addEventListener('wheel',e=>{if(!e.target.closest('canvas')||exitState)return;e.preventDefault();zoom=Math.max(.7,Math.min(1.6,zoom*Math.exp(e.deltaY*.001)));},{passive:false,signal:abort.signal});

 function protectLocalCurve(curve){const shift=new T.Vector3(0,0,93-root.position.z),adapted={getPointAt:t=>curve.getPointAt(t).add(shift),getTangentAt:t=>curve.getTangentAt(t)};const safe=safeFlightCurve(adapted,curve.getPointAt(0).add(shift),curve.getPointAt(1).add(shift));return {getPoint:t=>safe.getPointAt(t).sub(shift),getTangent:t=>safe.getTangentAt(t)};}
 function routes(){if(!home)return;path=new T.CatmullRomCurve3([[0,65,80],[0,20,35],[0,2.7,3],[0,2.7,-15],[1.5,5,-50],[0,5,-76],[home.x,home.y,home.z-93]].map(v=>new T.Vector3(...v)),false,'centripetal');focusPath=new T.CatmullRomCurve3([[0,0,-5],[0,1,-5],[0,1.5,-15],[0,2,-50],[0,8,-100],[0,5,-100],[.48,.87,-93]].map(v=>new T.Vector3(...v)));}
 function loadCampusBuilding(kind,attempt=0){
  if(dead||(kind==='tower'?towerReady:gateReady))return;
  const file=kind==='tower'?'mentor-allen-hall.js?v=7':'mentor-dongwu-gate.js?v=vector6';
  let retryTimer=setTimeout(()=>loadCampusBuilding(kind,attempt+1),8000);
  import('./'+file+'&attempt='+attempt).then(module=>{
   clearTimeout(retryTimer);if(dead||(kind==='tower'?towerReady:gateReady))return;
   const asset=kind==='tower'?module.createAllenHall():module.createDongwuGate();
   asset.group.position.z=kind==='tower'?-100:-5;asset.group.visible=kind!=='tower';root.add(asset.group);
   if(kind==='tower'){tower=asset;towerReady=true;}else{gate=asset;gateReady=true;}
   delete parent.dataset[kind+'LoadError'];
  }).catch(error=>{clearTimeout(retryTimer);if(dead)return;parent.dataset[kind+'LoadError']=error.message;setTimeout(()=>loadCampusBuilding(kind,attempt+1),Math.min(4000,500*(attempt+1)));});
 }
 function attach(context){({scene,camera,controls,classroom}=context);home=context.home.clone();home.x=.72;routes();root=new T.Group();root.name='campus-arrival';scene.add(root);loadCampusBuilding('tower');loadCampusBuilding('gate');gardenAssets=createGardenAssetStream(root,abort.signal,clearTeachingSightline);siteActivity=createSiteActivity(root,abort.signal);writing=createLandmarkWriting(root,camera);marker=writing.mesh;spaceRoot=new T.Group();root.add(spaceRoot);controls.enabled=false;classroom.group.visible=false;const canvas=parent.querySelector('canvas');if(canvas)canvas.style.touchAction='none';
  for(const x of [-.16,1.08]){const rope=new T.Mesh(new T.CylinderGeometry(.006,.006,18,5),new T.MeshStandardMaterial({color:0x9c8b6d}));rope.position.set(x,10.55,-.1);classroom.board.add(rope);}
  interior=createTowerClassroom({root,parent,camera});
  camera.far=80000000;camera.updateProjectionMatrix();
  const earth=new T.Mesh(new T.SphereGeometry(R-25000,80,48),new T.MeshStandardMaterial({color:0x557c8c,roughness:1}));earth.position.y=-R;spaceRoot.add(earth);
  const lat=31.30*Math.PI/180,lon=120.64*Math.PI/180,rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(Math.cos(lat)*Math.cos(lon),Math.sin(lat),-Math.cos(lat)*Math.sin(lon)),new T.Vector3(0,1,0));
  // Small vector coastline payload; triangulate a few rings per task to avoid blocking the first frame.
  void fetch('/assets/arrival/land.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('地图轮廓未载入');return r.json();}).then(async rings=>{const vertices=[];for(let i=0;i<rings.length;i++){if(dead||!spaceRoot)return;const ring=rings[i],s=new T.Shape(ring.map(([x,y])=>new T.Vector2(x,y))),g=new T.ShapeGeometry(s),flat=g.index?g.toNonIndexed():g,ps=flat.attributes.position,v=new T.Vector3();function emit(a,b,c,depth=0){const d=[(a[0]-b[0])**2+(a[1]-b[1])**2,(b[0]-c[0])**2+(b[1]-c[1])**2,(c[0]-a[0])**2+(c[1]-a[1])**2],m=Math.max(...d);if(m>16&&depth<12){if(d[0]===m){const q=[(a[0]+b[0])/2,(a[1]+b[1])/2];emit(a,q,c,depth+1);emit(q,b,c,depth+1);}else if(d[1]===m){const q=[(b[0]+c[0])/2,(b[1]+c[1])/2];emit(a,b,q,depth+1);emit(a,q,c,depth+1);}else{const q=[(c[0]+a[0])/2,(c[1]+a[1])/2];emit(a,b,q,depth+1);emit(q,b,c,depth+1);}return;}for(const [x,y]of [a,b,c]){const lo=x*Math.PI/180,la=y*Math.PI/180;v.set(Math.cos(la)*Math.cos(lo),Math.sin(la),-Math.cos(la)*Math.sin(lo)).multiplyScalar(R-.2).applyQuaternion(rotation);vertices.push(v.x,v.y-R,v.z);}}for(let k=0;k<ps.count;k+=3)emit([ps.getX(k),ps.getY(k)],[ps.getX(k+1),ps.getY(k+1)],[ps.getX(k+2),ps.getY(k+2)]);if(flat!==g)flat.dispose();g.dispose();if(i%8===0)await new Promise(r=>setTimeout(r,0));}if(dead||!spaceRoot)return;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();spaceRoot.add(new T.Mesh(geo,new T.MeshStandardMaterial({color:leafColor,roughness:1,side:T.DoubleSide})));landReady=true;}).catch(()=>{label.textContent='正在准备校园场景';});
  // Administrative boundaries share the globe projection, so the descent keeps one coordinate system.
  const project=(lng,lat,height)=>{const lo=lng*Math.PI/180,la=lat*Math.PI/180;return new T.Vector3(Math.cos(la)*Math.cos(lo),Math.sin(la),-Math.cos(la)*Math.sin(lo)).multiplyScalar(R+height).applyQuaternion(rotation).add(new T.Vector3(0,-R,0));};
  for(const [file,color,height]of [['china',0xf4dfaa,400],['suzhou',0xffd175,25]])void fetch('/assets/arrival/'+file+'.json',{signal:abort.signal}).then(r=>r.json()).then(items=>{if(dead||!spaceRoot)return;const points=[];for(const item of items)for(const ring of item.rings)for(let i=1;i<ring.length;i++){points.push(...project(...ring[i-1],height).toArray(),...project(...ring[i],height).toArray());}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));spaceRoot.add(new T.LineSegments(g,new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.85})));}).catch(()=>{});
  region=new T.Group();root.add(region);const ground=new T.Mesh(new T.PlaneGeometry(32000,32000),new T.MeshStandardMaterial({color:leafColor,roughness:1}));ground.receiveShadow=true;ground.rotation.x=-Math.PI/2;ground.position.y=-.05;region.add(ground);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const sc=shadowCanvas.getContext('2d'),sg=sc.createRadialGradient(32,32,2,32,32,31);sg.addColorStop(0,'rgba(20,25,20,.38)');sg.addColorStop(1,'rgba(20,25,20,0)');sc.fillStyle=sg;sc.fillRect(0,0,64,64);contactShadow=new T.Mesh(new T.PlaneGeometry(.65,.42),new T.MeshBasicMaterial({map:new T.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contactShadow.rotation.x=-Math.PI/2;root.add(contactShadow);
  landmarks=createSuzhouLandmarks();landmarks.group.position.z=0;root.add(landmarks.group);clearTeachingSightline(landmarks.group);void loadOldCity(root,abort.signal,clearTeachingSightline).then(group=>{if(!dead&&group){clearTeachingSightline(group);cityBuilt=true;}}).catch(()=>{});
  const cityGround=new T.Mesh(new T.PlaneGeometry(1800,1800),new T.MeshStandardMaterial({color:0x9ca494,roughness:1}));cityGround.receiveShadow=true;cityGround.rotation.x=-Math.PI/2;cityGround.position.set(0,-.045,-93);root.add(cityGround);
  avenue=new T.Group();root.add(avenue);const lawn=new T.Mesh(new T.PlaneGeometry(150,220),new T.MeshStandardMaterial({color:leafColor,roughness:1}));lawn.receiveShadow=true;lawn.rotation.x=-Math.PI/2;lawn.position.set(0,-.04,-65);avenue.add(lawn);
  const crowns=new T.InstancedMesh(new T.IcosahedronGeometry(1,2),new T.MeshStandardMaterial({color:0x586e51,roughness:1}),84),trunks=new T.InstancedMesh(new T.CylinderGeometry(.12,.2,5,6),new T.MeshStandardMaterial({color:0x786d5a}),28),dummy=new T.Object3D();for(let i=0;i<28;i++){const x=(i%2?1:-1)*8,z=-10-Math.floor(i/2)*6;dummy.position.set(x,2.5,z);dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);for(let j=0;j<3;j++){dummy.position.set(x+Math.sin(i+j),5.5+j*.6,z+Math.cos(i+j));dummy.scale.set(2.1,2.5,2.1);dummy.updateMatrix();crowns.setMatrixAt(i*3+j,dummy.matrix);}}avenue.add(crowns,trunks);clearTeachingSightline(avenue);
  // Module fetches run during flight; no photo or satellite-texture downloads are required.

 }
 async function depart(){
  if(dead||!settled||!lastActor)return;
  // Ending in a garden or on the river must use the same safe campus route,
  // never a straight walk through intervening buildings.
  const deadline=performance.now()+45000;let retries=0;
  while(!dead&&(stageTransition||departingBoat||(lastChapter!==0&&lastChapter!==6))){
   if(stageTransition?.error){if(retries++<1)api.retryChapter(6);else throw Error('返回校园的通道暂未准备好');}
   if(!stageTransition&&!departingBoat)api.setChapter(6);
   if(performance.now()>deadline)throw Error('返回校园的资源尚未就绪');
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(dead)return;releaseFlightPlanner();controls.enabled=false;interior.prepare();
  exitState={elapsed:0,actor:lastActor.position.clone(),yaw:lastActor.rotation.y,camera:camera.position.clone(),target:controls.target.clone(),boardY:classroom.board.position.y,boardX:classroom.board.position.x,boardYaw:classroom.group.rotation.y,stage:classroom.group.position.clone(),walkDuration:Math.max(6,Math.min(28,lastActor.position.distanceTo(new T.Vector3(0,.39,-8))/1.5))};
  parent.dataset.flightPhase='returning';
  return new Promise(r=>resolveExit=r);
 }
 function groundActor(actor,dt=1/60){
  if(!actor?.visible)return;
  const rig=actor.children[0],feet=rig?.userData.groundingFeet||[],limbs=rig?.userData.chibiBody?.userData.walkLimbs||[];if(!limbs.length&&!feet.length)return;
  actor.updateMatrixWorld(true);let bottom=Infinity;for(const foot of feet)bottom=Math.min(bottom,foot.bone.getWorldPosition(new T.Vector3()).y-foot.soleOffset);for(const l of limbs){const b=new T.Box3().setFromObject(l.foot);bottom=Math.min(bottom,b.min.y);}
  const worldZ=actor.position.z-root.position.z,localZ=worldZ+100;let floor=actor.userData.siteFloor??-.015;
  if(Math.abs(actor.position.x)<2.6){
   floor+=.12*(1-smooth((localZ-2.32)/.25));
   for(const edge of [2.04,1.76,1.48])floor+=.09*(1-smooth((localZ-edge)/.25));
   if(localZ<-7)floor=.065;
  }
  const previous=actor.userData.groundHeight??floor,prior=actor.userData.lastGroundPosition;
  const relocated=!prior||Math.hypot(actor.position.x-prior[0],actor.position.z-prior[1])>2||Math.abs(previous-floor)>.22;
  if(!relocated)floor=previous+(floor-previous)*(1-Math.exp(-Math.max(.001,dt)*18));actor.userData.groundHeight=floor;actor.userData.lastGroundPosition=[actor.position.x,actor.position.z];
  if(Number.isFinite(bottom))actor.position.y+=floor-bottom;
  if(contactShadow){contactShadow.visible=actor.visible;contactShadow.position.set(actor.position.x,floor+.003,actor.position.z-root.position.z);}

 }
 function exitFrame(dt,actor,reduced){
  const e=exitState;e.elapsed+=dt*(reduced?12:1);const t=e.elapsed,entryTime=t-(3.4+e.walkDuration);
  const lift=smooth(t/1.2),wave=smooth((t-1.25)/.4)*(1-smooth((t-2.8)/.5)),walk=smooth((t-3.4)/e.walkDuration);
  classroom.group.visible=lift<1;classroom.group.position.copy(e.stage);classroom.group.rotation.y=e.boardYaw;classroom.board.position.set(e.boardX,e.boardY+3.2*lift,0);
  actor.visible=true;if(contactShadow)contactShadow.visible=true;
  actor.position.lerpVectors(e.actor,new T.Vector3(0,.39,-8),walk);actor.rotation.set(0,e.yaw+(Math.PI-e.yaw)*smooth((t-3)/.6),0);
  const body=actor.children[0]?.userData.chibiBody;
  let stride=Math.sin(Math.PI*walk),phase=walk*32;
  if(entryTime>=0){const city=root.getObjectByName('suzhou-old-city');if(city)city.visible=false;if(landmarks)landmarks.group.visible=false;if(avenue)avenue.visible=false;const enter=smooth(entryTime/9),side=interior.teacherX;
   actor.position.set(side*smooth((enter-.4)/.6),0,-8+(interior.boardZ+1.7+8)*enter);actor.rotation.y=Math.PI*(1-smooth((enter-.65)/.35));
   stride=Math.sin(Math.PI*enter);phase=enter*72;
   if(enter===1){actor.rotation.y=.16+Math.sin(t*.6)*.06;actor.children[0]?.userData.updatePortrait?.(t,true,.08+.05*Math.sin(t*4)**2,'slides',0,{elapsed:t,viewerYaw:0,boardSide:1});}
  }
  for(const limb of body?.userData.walkLimbs||[]){const a=phase+(limb.sign===1?Math.PI:0);limb.mesh.rotation.x=Math.sin(a)*.34*stride;limb.knee.rotation.x=Math.max(0,-Math.sin(a))*.3*stride;limb.foot.rotation.x=0;}
  for(const arm of body?.userData.arms||[]){const teaching=entryTime>9&&arm.sign===1;arm.pivot.rotation.set(Math.sin(phase+arm.sign)*.12*stride,0,teaching?1.12+Math.sin(t*1.5)*.09:arm.sign*.12+(arm.sign===1?wave*2:0));arm.elbow.rotation.set(0,0,teaching?.32+Math.sin(t*1.8)*.07:arm.sign===1?wave*(.2+Math.sin(t*7)*.2):0);}
  groundActor(actor,dt);tower?.open(1);
  const ready=new T.Vector3(0,1.65,3.8),outsideAim=new T.Vector3(0,1.65,-10);
  camera.position.lerpVectors(e.camera,ready,smooth(t/(3.4+e.walkDuration)));target.lerpVectors(e.target,outsideAim,smooth(t/(3.4+e.walkDuration)));
  const enterCamera=smooth((entryTime-1)/8),zoomIn=smooth((entryTime-11.4)/4.5);
  if(entryTime>=0){camera.position.lerpVectors(ready,new T.Vector3(0,1.65,-18),enterCamera);target.lerpVectors(outsideAim,new T.Vector3(interior.boardCenter,1.95,interior.boardZ),enterCamera);}
  camera.fov=35+17*enterCamera*(1-zoomIn);
  if(zoomIn>0){const distance=interior.boardHeight/(2*Math.tan(35*Math.PI/360));camera.position.lerpVectors(new T.Vector3(0,1.65,-18),new T.Vector3(interior.boardCenter,1.95,interior.boardZ+distance),zoomIn);target.set(interior.boardCenter,1.95,interior.boardZ);}
  camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);controls.target.copy(target);
  interior.room.visible=true;interior.update(camera.position.z<-16.2,smooth((zoomIn-.72)/.28));
  const owner=parent.closest('.mentor-cinematic');if(owner)owner.style.opacity='1';
  parent.dataset.flightPhase=zoomIn?'classroom-screen-zoom':entryTime>9?'classroom-teaching':entryTime>=0?'classroom-entry':walk?'returning':wave?'farewell':'board-lift';
  parent.dataset.classroomPage=interior.ready?'ready':'preparing';
  if(entryTime>=16){parent.dataset.flightPhase='complete';const done=resolveExit;resolveExit=null;done?.();}
  return true;
 }

 function update(now,actor){if(dead||!root)return false;const dt=last?Math.min((now-last)/1000,.15):0;last=now;if(document.hidden)return !settled;const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;time+=dt;writing?.update(time);const cityVisibleReady=cityBuilt&&root.getObjectByName('suzhou-old-city')?.userData.riverStreetReady;cityMusicStarted ||= Number(cloud.style.opacity)>.02;const greetingDelay=reduced?.1:3.8;const fade=reveal?1-smooth(((now-reveal)/1000-Math.max(0,greetingDelay-2.8))/2.4):1;cityMusic.update(cityMusicStarted&&!exitState?(greeted||settled?1:fade):0,dt);
  if(actor)lastActor=actor;if(interior&&!exitState)interior.room.visible=!!tower?.group.visible;
  if(exitState){if(marker)marker.visible=false;clearance.active.value=0;return exitFrame(dt,actor,reduced);}
  if(settled){
    if(departingBoat){boatBoardElapsed+=dt;departureBoard?.update(boatBoardElapsed);}
   cloud.style.opacity='0';
   const city=root.getObjectByName('suzhou-old-city');if(city)city.visible=lastChapter>=0&&lastChapter<=6;if(landmarks)landmarks.group.visible=lastChapter>=0&&lastChapter<=6;
   classroom.group.visible=true;
   let boardLift=0,flight=0,altitude=0,travelState='stationary';
   if(stageTransition){
    const tr=stageTransition;const landingSlow=tr.landingReady&&!tr.landingReady()&&tr.elapsed>tr.duration*.7;tr.elapsed+=dt*(reduced?20:1)*(landingSlow?.18:1);if(landingSlow)tr.elapsed=Math.min(tr.elapsed,tr.duration-.03);if(tr.sceneReady&&!tr.sceneReady()&&tr.elapsed>0)tr.elapsed=0;if(tr.ready&&!tr.ready()&&tr.elapsed>.65+tr.duration*.80){tr.elapsed=.65+tr.duration*.80;tr.holding=(tr.holding||0)+dt;}
    departureBoard?.update(tr.elapsed);const raw=clamp(tr.elapsed/tr.duration);flight=raw*raw*raw*(raw*(raw*6-15)+10);
    boardLift=1-smooth((tr.elapsed-tr.duration+.45)/.45);
    stageOffset.lerpVectors(tr.from,tr.to,flight);
    altitude=Math.sin(Math.PI*flight)**2*Math.min(3,1+tr.from.distanceTo(tr.to)*.012);
    travelState=tr.elapsed<=0?'preparing':tr.elapsed<.65?'raising':tr.elapsed>=tr.duration-.45?'lowering':'flying';
    if(tr.elapsed>=tr.duration){stageTransition=null;departurePose?.dispose();departurePose=null;gardenShotStarted=now;}
   }
   // Keep the lecturer on the ground at either destination, never carried through the sky.
   const inFlight=flight>0&&flight<1;
   const stagePosition=stageTransition?(flight<.5?stageTransition.from:stageTransition.to):stageOffset;
   classroom.group.position.copy(stagePosition);classroom.group.rotation.y=stageAngle();classroom.board.position.set(.85,3.2*boardLift,0);
   // The board travels separately: never expose its new pose for one frame
   // while the camera is still departing or waiting for a route.
   classroom.group.visible=!departingBoat&&(!stageTransition||travelState==='lowering');
   actor.visible=!stageTransition||flight>.985;
   actor.position.x+=stagePosition.x;actor.position.z=stagePosition.z;
   if(contactShadow)contactShadow.visible=actor.visible;
   const sway=0;
   focusBlend+=((stageTransition?0:lessonFocus)-focusBlend)*(1-Math.exp(-dt*1.6));
   const focus=focusBlend*((lastChapter===1||lastChapter===2)?.35:1);
   camera.fov=T.MathUtils.lerp(camera.fov,inFlight?58:(camera.aspect<.8?42:35),1-Math.exp(-dt*2));camera.updateProjectionMatrix();
   const close=Math.max(4.8,1.5/(2*Math.tan(35*Math.PI/360)*camera.aspect)),distance=T.MathUtils.lerp(home.z,close,focus);
   camera.position.set(T.MathUtils.lerp(home.x,1.31,focus)+stageOffset.x+Math.sin(time*.13)*(camera.aspect<.8?.20:.78)*sway*(1-focus*.85),T.MathUtils.lerp(home.y,1.16,focus)+stageOffset.y+altitude+Math.sin(time*.11)*.30*sway*(1-focus*.85),distance+stageOffset.z+altitude*.35);
   controls.target.set(T.MathUtils.lerp(home.x,1.31,focus)+stageOffset.x,T.MathUtils.lerp(.87,1.16,focus)+stageOffset.y+altitude*.12,stageOffset.z-.09*focus);
   const activity=siteActivity?.update({chapter:lastChapter,actor,stage:stagePosition,angle:stageAngle(),time,now,moving:!!stageTransition,viewer:gardenCamera||camera.position})||{x:0,z:0};const axis=new T.Vector3(0,1,0),rotation=stageAngle();
   camera.position.sub(stageOffset).applyAxisAngle(axis,rotation).add(stageOffset);controls.target.sub(stageOffset).applyAxisAngle(axis,rotation).add(stageOffset);
   classroom.group.position.x+=activity.x;classroom.group.position.z+=activity.z;camera.position.x+=activity.x;camera.position.z+=activity.z;controls.target.x+=activity.x;controls.target.z+=activity.z;actor.rotation.y+=rotation;if(stageTransition){actor.rotation.y=flight<.5?stageTransition.fromYaw:rotation;if(flight<.035){actor.position.copy(stageTransition.fromActor);}}camera.position.addScaledVector(stationCameraOffset,1-focus);
   const gardenName=lastChapter===1?'yiyuan':lastChapter===2?'zhuozhengyuan':null;gardenAssets?.focus(gardenName,gardenName?(stageTransition?[stageTransition.to.x,stageTransition.to.y,stageTransition.to.z-root.position.z]:[actor.position.x,stagePosition.y,actor.position.z-root.position.z]):null);
   if(gardenName&&!stageTransition){
    const feet=new T.Vector3(actor.position.x,actor.userData.siteFloor??stagePosition.y,actor.position.z);
    if(!gardenCamera){gardenCamera=camera.position.clone();gardenLook=controls.target.clone();gardenViewAt=-Infinity;gardenFeet=null;}
    const rail=gardenTours[gardenName];
    if(rail){
     const shot=sampleGardenTour(rail,root.userData.gardenWalk?.distance||0);gardenCamera.copy(shot.camera).add(root.position);
     gardenLook.lerp(feet.clone().add(new T.Vector3(0,1.15,0)),1-Math.exp(-dt*4));
     root.userData.gardenCameraMode='continuous-rail';
    }else{
    const delta=gardenFeet?feet.clone().sub(gardenFeet):new T.Vector3();gardenFeet=feet.clone();
    const translated=gardenCamera.clone().add(delta);
    if(now-gardenViewAt>1800&&(!gardenPose?.route||gardenPose.routeDistance>=gardenPose.route.getLength()-.05)){gardenPose=gardenView(gardenName,feet,0,root,gardenCamera,gardenPose?.position.clone().add(delta)||translated);gardenViewAt=now;}
    else if(gardenPose?.position&&!gardenPose.route)gardenPose.position.add(delta);
    let candidate;
    if(gardenPose?.route){const length=gardenPose.route.getLength();gardenPose.routeDistance=Math.min(length,gardenPose.routeDistance+dt*2.2);candidate=gardenPose.route.getPointAt(gardenPose.routeDistance/Math.max(.001,length));}
    else candidate=gardenCamera.clone().lerp(gardenPose.position,1-Math.exp(-dt*.7));
    gardenCamera.copy(safeOrbitPosition(gardenCamera,candidate));gardenLook.lerp(feet.clone().add(new T.Vector3(0,1.15,0)),1-Math.exp(-dt*2.5));
    }
    camera.position.copy(gardenCamera);controls.target.copy(gardenLook);
    const boardAngle=Math.atan2(camera.position.x-feet.x,camera.position.z-feet.z);
    classroom.group.rotation.y=boardAngle;
    scene.fog=new T.Fog(sky,220,650);parent.dataset.gardenShot='walking';camera.fov=minimumLectureFov(camera.position.distanceTo(feet.clone().add(new T.Vector3(0,1.05,0))),camera.aspect,camera.aspect<.8?52:48);camera.updateProjectionMatrix();
   }
   if(lastChapter===5&&!stageTransition){camera.position.set(stagePosition.x+activity.x+1.3,3.2,stagePosition.z+activity.z+10).add(stationCameraOffset);controls.target.set(stagePosition.x+.72+activity.x,1.05,stagePosition.z+activity.z-.7);camera.fov=44;camera.updateProjectionMatrix();}
   if(stageTransition?.cameraFlight){const shot=sampleChapterFlight(stageTransition.cameraFlight,clamp(stageTransition.elapsed/stageTransition.duration));camera.position.copy(shot.position);controls.target.copy(shot.target);camera.fov=shot.fov;camera.up.set(Math.sin(shot.bank),Math.cos(shot.bank),0);camera.updateProjectionMatrix();}else {camera.up.set(0,1,0);if(stageTransition){camera.position.copy(stageTransition.fromCamera);controls.target.copy(stageTransition.fromTarget);}}
   camera.lookAt(controls.target);controls.enabled=false;
   label.textContent=lastChapter===1?'怡园':lastChapter===0||lastChapter===6?'苏州大学林堂':landmarkNames[[8,9,1,3,4,5,8][Math.max(0,lastChapter)]];label.style.opacity='0';parent.dataset.landmark=label.textContent;parent.dataset.boardTravel=departingBoat?'disembarking':travelState;parent.dataset.boatState=siteActivity?.ashore?'ashore':departingBoat?'disembarking':lastChapter===5?'boating':'none';
   clearance.stage.value.set(actor.position.x,0,actor.position.z);groundActor(actor,dt);applyView();if(!departingBoat)presentationFacing.update(actor,classroom.group,camera,{transitioning:!!stageTransition,dt});gardenAssets?.updateSightline(actor,camera,!!gardenName&&!stageTransition);clearance.active.value=!inFlight&&camera.position.distanceTo(actor.position)<12?1:0;clearance.eye.value.copy(camera.position);parent.dataset.lectureShot=JSON.stringify({chapter:lastChapter,distance:camera.position.distanceTo(actor.position),fov:camera.fov,boardVisible:classroom.group.visible,transitioning:!!stageTransition,departingBoat});if(actor.visible){departurePose?.dispose();departurePose=null;}else departurePose?.update(camera);if(!inFlight)placeLabel([8,9,1,3,4,5,8][Math.max(0,lastChapter)]);return true;
  }
  if(actor)actor.visible=false;classroom.group.visible=false;
  if(time<13&&!reduced){activeLabel=-1;const p=time/13,q=smooth(p*p)+.18*(p-1)*p**8,h=Math.exp(Math.log(18000000)*(1-q)+Math.log(65)*q),az=1.35*(1-p);position.set(Math.sin(az)*h*.7,h,Math.cos(az)*h*.95+18);target.set(0,-R*clamp((h-2000000)/16000000)*.7,-5);cloud.style.opacity=String(smooth((Math.log(3000000)-Math.log(h))/Math.log(3000000/18000))*(cityVisibleReady?1-smooth((180-h)/115):1));cloud.style.transform=`scale(${1+(time-9)*.35}) translateX(${Math.sin(time)*3}%)`;label.textContent='';label.style.opacity='0';const air=smooth(1-Math.log(Math.max(1,h)/1000)/Math.log(120));scene.background=new T.Color().lerpColors(night,sky,air);scene.fog=new T.Fog(sky,Math.max(120,h*5),Math.max(400,h*18));}
  else{
   const cloudTarget=!cityVisibleReady&&!campusPath&&time<40?1:0;cloud.style.opacity=String(Number(cloud.style.opacity)+(cloudTarget-Number(cloud.style.opacity))*(1-Math.exp(-dt*3)));if(gateOpening)cloud.style.opacity='0';cloud.style.transform=`scale(${2+travel*.3})`;const ready=!!lastActor&&gateReady&&towerReady;parent.dataset.arrivalReadiness=JSON.stringify({voice:voiceReady,actor:!!lastActor,gate:gateReady,tower:towerReady});waitPanel.hidden=ready||travel<7;waitPanel.querySelector('progress').value=[voiceReady,!!lastActor,gateReady,towerReady,classroom.ready!==false].filter(Boolean).length*20;travel+=dt*(reduced?20:1);let p=.35;
   const cityDuration=56;
   if(!ready&&!campusPath&&travel<7){
    const q=smooth(travel/7);position.lerpVectors(new T.Vector3(0,65,98),new T.Vector3(0,9,30),q);target.lerp(new T.Vector3(0,2,-5),Math.min(1,dt*4));
    if(gate)gate.group.visible=true;if(tower)tower.group.visible=true;parent.dataset.route='gate-approach';activeLabel=7;
   }else if(!ready&&!campusPath){
    const flightSites=[[-80,-160],landmarkLocations[1],landmarkLocations[3],landmarkLocations[4],landmarkLocations[5]];const q=((travel-7)%cityDuration)/cityDuration,step=q*flightSites.length,index=Math.floor(step),blend=smooth(step-index);const a=flightSites[index],b=flightSites[(index+1)%flightSites.length];
    const center=new T.Vector3(a[0]+(b[0]-a[0])*blend,0,a[1]+(b[1]-a[1])*blend);
    if(!waitingFlight||waitingFlight.index!==index){const shift=new T.Vector3(0,0,93-root.position.z),end=new T.Vector3(b[0]+9,7,b[1]+24).add(shift),aim=new T.Vector3(b[0],5,b[1]).add(shift);waitingFlight={index,shift,shot:createChapterFlight({position:position.clone().add(shift),fov:camera.fov},target.clone().add(shift),end,aim,50)};}
    const waitingShot=sampleChapterFlight(waitingFlight.shot,step-index);position.copy(waitingShot.position).sub(waitingFlight.shift);target.copy(waitingShot.target).sub(waitingFlight.shift);
    activeLabel=[9,1,3,4,5][index];label.textContent=activeLabel===9?'怡园':landmarkNames[activeLabel];parent.dataset.route='city';
    if(gate)gate.group.visible=true;if(tower)tower.group.visible=true;
   }else{
    if(!campusPath){campusStart=travel;campusAim=target.clone();let entry=position.clone();const end=new T.Vector3(home.x,home.y,home.z-93);if(entry.z<25||Math.abs(entry.x)>15){const direction=entry.clone().sub(lastFlightPosition);if(direction.lengthSq()<.0001)camera.getWorldDirection(direction);direction.normalize();campusBridge=new T.CubicBezierCurve3(entry.clone(),entry.clone().addScaledVector(direction,18),new T.Vector3(0,8,55),new T.Vector3(0,2.65,30));campusBridge=protectLocalCurve(campusBridge);bridgeStart=travel;bridgeAim=target.clone();campusStart=travel+4.5;entry=new T.Vector3(0,2.65,30);campusAim=new T.Vector3(0,2.65,0);}
     // One analytic, monotone flight. No spline overshoot and no behind-camera waypoints.
     campusPath={entry,getPoint(q){const z=entry.z+(end.z-entry.z)*q,x=entry.x*(1-smooth(q/.38))+end.x*smooth((q-.78)/.22);
      const approach=Math.sin(Math.PI*.5*clamp((entry.z-z)/Math.max(1,entry.z-20)));
      const y=z>20?entry.y+(2.65-entry.y)*approach:z>-38?2.65:2.65+(end.y-2.65)*smooth((-38-z)/(-38-end.z));
      return new T.Vector3(x,y,z);
     }};
    }
    let q=0;const returning=campusBridge&&travel<campusStart;
    if(returning){const raw=clamp((travel-bridgeStart)/4.5),t=raw;position.copy(campusBridge.getPoint(t));const look=position.clone().addScaledVector(campusBridge.getTangent(t),20);look.lerp(new T.Vector3(0,2.65,0),smooth((t-.8)/.2));target.lerpVectors(bridgeAim,look,smooth(t/.2));}
    else{
    q=clamp((travel-campusStart)/21);position.copy(campusPath.getPoint(q));
    // Establish a level, straight view before reaching the gate, and retain it through the arch.
    const aim=new T.Vector3(0,position.y,position.z-30);
    aim.lerp(new T.Vector3(home.x,.87,-93),smooth((-38-position.z)/45));
    const headingBlend=campusPath.entry.z>30?smooth((campusPath.entry.z-position.z)/Math.max(1,campusPath.entry.z-30)):smooth(q/.15);
    target.lerpVectors(campusAim,aim,headingBlend);
    }
    if(gate)gate.group.visible=true;if(tower)tower.group.visible=true;if(!returning&&Math.abs(position.x)<10&&position.z<55)gateOpening=true;if(gateOpening)gateOpenElapsed+=dt*(reduced?20:1);const gateAmount=smooth(gateOpenElapsed/5);gate?.open(gateAmount);parent.dataset.gateOpen=gateAmount.toFixed(4);if(gateOpening)cloud.style.opacity='0';p=.4+.6*q;
    label.textContent=q<.6?'东吴大学老校门':'苏州大学　林堂';parent.dataset.route=returning?'campus-return':'campus';activeLabel=q<.6?7:8;
   }
   scene.background=sky;scene.fog=new T.Fog(sky,85,180);
   if(p>.22&&spaceRoot){release(spaceRoot);spaceRoot=null;parent.dataset.spaceReleased='true';}
   // The gate stays in the scene: a visitor may turn around after passing through it.
   if(p>.7&&region){release(region);region=null;parent.dataset.regionReleased='true';}
   if(p===1&&ready&&requested&&!reveal){reveal=now;callback?.();}
   if(reveal){cloud.style.opacity='0';const seconds=(now-reveal)/1000,walk=smooth((seconds-(reduced?0:1))/(reduced?.3:6.4)),wave=smooth((seconds-1.25)/.5)*(1-smooth((seconds-6.8)/.6));tower?.open(smooth(seconds));if(!greeted&&seconds>(reduced?.3:7.4)){greeted=true;onGreeting?.();}if(actor){actor.visible=true;actor.position.set(-.38*walk,0,-99+6*walk);actor.rotation.set(0,0,0);const body=actor.children[0]?.userData.chibiBody;for(const limb of body?.userData.walkLimbs||[])limb.mesh.rotation.x=Math.sin(walk*20+(limb.sign===1?Math.PI:0))*.3*(1-walk);for(const arm of body?.userData.arms||[])if(arm.sign===1){arm.pivot.rotation.z=wave*2.15;arm.elbow.rotation.z=wave*(.2+Math.sin(seconds*6)*.22);}}
    classroom.group.visible=seconds>1;classroom.group.position.z=-93;classroom.board.position.x=.85;classroom.board.position.y=4*(1-smooth((seconds-1)/6.4));label.style.opacity=String(1-smooth(seconds/2));
    if(seconds>(reduced?.5:7.4)){settled=true;root.position.z=93;classroom.group.position.z=0;if(actor)actor.position.z=0;position.z+=93;target.z+=93;controls.target.set(home.x,.87,0);controls.enabled=true;label.style.opacity='0';parent.dataset.flightPhase='lecture';resolveFinish?.();}
   }
  }
  lastFlightPosition.copy(position);groundActor(actor,dt);camera.position.copy(position);camera.up.set(0,1,0);camera.lookAt(target);camera.near=Math.max(.025,Math.min(1000,position.y*.0001));camera.far=spaceRoot?80000000:6000;camera.updateProjectionMatrix();controls.target.copy(target);applyView();if(!settled)placeLabel(activeLabel);if(!settled)parent.dataset.flightPhase=reveal?'greeting':travel?'campus':'descent';parent.dataset.flightTime=time.toFixed(2);if(typeof window.__mentorFlightProbe==='function')window.__mentorFlightProbe({x:camera.position.x,y:camera.position.y,z:camera.position.z,phase:parent.dataset.flightPhase,route:parent.dataset.route,directionY:camera.getWorldDirection(new T.Vector3()).y,directionX:camera.getWorldDirection(new T.Vector3()).x,at:now});return true;
 }
 function dispose(){if(dead)return;dead=true;departureBoard?.dispose();departurePose?.dispose();releaseFlightPlanner();gardenAssets?.dispose();waitPanel.remove();writing?.dispose();interior?.dispose();cityMusic.dispose();abort.abort();cloud.remove();label.remove();release(root);root=null;spaceRoot=null;resolveFinish?.();resolveExit?.();}
 return api={attach,update,depart,prepareDeparture(){interior?.prepare();},get waving(){const t=reveal?(last-reveal)/1000:0;return !!exitState&&(exitState.elapsed>1.25&&exitState.elapsed<3.2)||!!reveal&&!settled&&t>1.25&&t<7.4;},get transitioning(){return !!stageTransition||departingBoat;},prefetchChapter,chapterReady(index){return settled&&!dead&&!stageTransition&&!departingBoat&&lastChapter===index;},get transitionError(){return stageTransition?.error||null;},get sceneProgress(){const name=lastChapter===1?'yiyuan':lastChapter===2?'zhuozhengyuan':null;return name?gardenAssets?.progress(name):null;},retryChapter(index){if(!stageTransition?.error)return;const failed=stageTransition;releaseFlightPlanner();departurePose?.dispose();departurePose=null;departureBoard?.dispose();departureBoard=null;stageOffset.copy(failed.from);lastChapter=failed.fromChapter;stageTransition=null;if(lastActor){lastActor.position.copy(failed.fromActor);lastActor.rotation.y=failed.fromYaw;lastActor.visible=true;}delete root.userData.flightError;delete parent.dataset.flightError;this.setChapter(index);},setChapter(index,ready){if(departingBoat||stageTransition)return;if(lastChapter===5&&index!==5&&!siteActivity.ashore){departureBoard?.dispose();departureBoard=classroom.group.visible?captureDepartingBoard(classroom.board,scene):null;classroom.group.visible=false;boatBoardElapsed=0;departingBoat=true;siteActivity.disembark().then(()=>{departingBoat=false;if(!dead)this.setChapter(index,ready);});return;}if(index!==lastChapter)prefetchChapter(index+1);if(index===0&&lastChapter<0){lastChapter=0;return;}if(index===lastChapter||exitState||!settled)return;departureBoard?.dispose();departureBoard=classroom.group.visible?captureDepartingBoard(classroom.board,scene):null;departurePose?.dispose();departurePose=null;if(lastActor?.visible){departurePose=captureDeparturePose(lastActor,contactShadow,scene);lastActor.visible=false;}const previousChapter=lastChapter,fromYaw=lastActor?.rotation.y||0,fromActor=lastActor?.position.clone()||new T.Vector3();if((lastChapter===1||lastChapter===2)&&lastActor){stageOffset.x=lastActor.position.x;stageOffset.z=lastActor.position.z;}const incoming=Math.atan2(controls.target.x-camera.position.x,controls.target.z-camera.position.z),towardBoat=Math.atan2(Math.sin(Math.PI-incoming),Math.cos(Math.PI-incoming));lectureYaw=index===3||index===4?incoming+towardBoat/(index===3?3:2)-Math.PI:0;lastChapter=index;if(index===1||index===2)gardenAssets?.focus(index===1?'yiyuan':'zhuozhengyuan',gardenStations[index===1?'yiyuan':'zhuozhengyuan']);if(index===5)void siteActivity?.prepareBoat();if(siteActivity.ashore&&lastActor){stageOffset.copy(lastActor.position);stageOffset.y=lastActor.userData.siteFloor||0;}const sceneIndex=[8,9,1,3,4,5,8][index];const [x,z]=sceneIndex===8?[0,-101]:sceneIndex===9?[-80,-168]:sceneIndex===1?[-75,-250]:landmarkLocations[sceneIndex];const station=index===1?gardenStations.yiyuan:index===2?gardenStations.zhuozhengyuan:null;const to=station?new T.Vector3(station[0],station[1],station[2]+root.position.z):new T.Vector3(x,0,z+93+(sceneIndex===5?0:8));const endTarget=to.clone().add(new T.Vector3(home.x,.87,0)),endCamera=to.clone().add(home);let endFov=camera.aspect<.8?42:35;if(index===3||index===4){const direction=new T.Vector3(Math.sin(lectureYaw+Math.PI),0,Math.cos(lectureYaw+Math.PI));to.set(x,0,z+93).addScaledVector(direction,-8);endTarget.copy(to).add(new T.Vector3(home.x,.87,0));endCamera.copy(to).add(home);}
 if(station||index===3||index===4){const axis=new T.Vector3(0,1,0),angle=stageAngle();endTarget.sub(to).applyAxisAngle(axis,angle).add(to);endCamera.sub(to).applyAxisAngle(axis,angle).add(to);}

 if(station){const name=index===1?'yiyuan':'zhuozhengyuan',rail=gardenTours[name],view=rail?{position:new T.Vector3(...rail.camera[0]).add(root.position),target:to.clone().add(new T.Vector3(0,1.15,0))}:gardenView(name,to,0,root);endCamera.copy(view.position);endTarget.copy(view.target);endFov=camera.aspect<.8?52:48;}
 if(index===5){endCamera.set(to.x+1.3,3.2,to.z+11.65);endTarget.set(to.x+.72,1.05,to.z+.95);endFov=44;}
 const baseline=index===5?to.clone().add(new T.Vector3(1.3,3.2,11.65)):to.clone().add(home.clone().applyAxisAngle(new T.Vector3(0,1,0),stageAngle()));
 const baselineAim=index===5?to.clone().add(new T.Vector3(.72,1.05,.95)):to.clone().add(new T.Vector3(home.x,.87,0).applyAxisAngle(new T.Vector3(0,1,0),stageAngle()));
 stationCameraOffset.copy(safeCameraPoint(safeOrbitPosition(baselineAim,baseline))).sub(baseline);
 if(!station)endCamera.add(stationCameraOffset);endCamera.copy(station?withWalkingClearance(()=>safeCameraPoint(endCamera)):safeCameraPoint(endCamera));gardenCamera=endCamera.clone();gardenLook=endTarget.clone();gardenViewAt=-Infinity;gardenFeet=null;
 gardenApproach=null;
 const fromCamera=camera.position.clone(),fromTarget=controls.target.clone();yaw=pitch=0;zoom=1;
 const tr={createdAt:performance.now(),fromChapter:previousChapter,ready,sceneReady:()=>!!tr.cameraFlight,landingReady:()=>!station||gardenAssets.groundReady(index===1?'yiyuan':'zhuozhengyuan'),fromCamera,fromTarget,cameraFlight:null,fromYaw,fromActor,from:stageOffset.clone(),to,elapsed:0,duration:8};stageTransition=tr;
 (async()=>{if(dead||stageTransition!==tr)throw Error('导览已结束');if(station){await gardenToursReady;const name=index===1?'yiyuan':'zhuozhengyuan',rail=gardenTours[name];if(rail){endCamera.fromArray(rail.camera[0]).add(root.position);endTarget.copy(to).add(new T.Vector3(0,1.15,0));}else{const landing=gardenView(name,to,0,root);endCamera.copy(landing.position);endTarget.copy(landing.target);}}let lastError;for(const lift of [0,1,2]){if(dead||stageTransition!==tr)throw Error('导览已结束');try{const desired=endCamera.clone().add(new T.Vector3(0,lift,0)),destination=station?withWalkingClearance(()=>safeCameraPoint(desired)):safeCameraPoint(desired),shot=await prepareChapterFlight({position:fromCamera,fov:camera.fov},fromTarget,destination,endTarget,endFov);gardenCamera=destination.clone();gardenLook=endTarget.clone();delete parent.dataset.flightRecovery;return shot;}catch(error){lastError=error;parent.dataset.flightRecovery='正在调整园林观看位置';}}throw lastError;})().then(shot=>{if(dead||stageTransition!==tr)return;tr.cameraFlight=shot;tr.duration=chapterFlightDuration(shot);}).catch(error=>{if(dead||stageTransition!==tr)return;tr.error=error.message;root.userData.flightError=error.message;parent.dataset.flightError=error.message;});},prepare(){voiceReady=true;parent.dataset.voiceReady='true';},renderClouds(renderer){gardenAssets?.setRenderer(renderer);gardenAssets?.travel(stageTransition?clamp(stageTransition.elapsed/stageTransition.duration):1);if(root)parent.dataset.gardenAssets=root.children.filter(o=>o.name?.startsWith('verified-garden-asset')).map(o=>o.name).join(',');if(lastActor&&time>6)void gardenAssets?.update(camera,performance.now());if(camera?.position.y<20000)root?.getObjectByName('suzhou-old-city')?.userData.updateView?.(camera,performance.now());parent.dataset.cloudOpacity=Number(cloud.style.opacity).toFixed(4);cloudPass.render(renderer,Number(cloud.style.opacity),time);},get exiting(){return !!exitState;},setHome(v){home=v.clone();home.x=.72;routes();},get active(){return !settled&&!dead;},finish(fn,greeting){onGreeting=greeting;if(dead)return Promise.resolve();requested=true;callback=fn;return new Promise(r=>resolveFinish=r);},dispose};
}
