import * as THREE from './vendor/three/three.module.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';

// MIT WebXR generic-hand assets. Flat XR joints are retargeted in their native
// bind space, so deformation stays in the continuous skinned surface.
const names=['thumb','index-finger','middle-finger','ring-finger','pinky-finger'];
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
function release(root){const geometries=new Set(),materials=new Set(),skeletons=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());skeletons.forEach(s=>s.dispose());root.clear();}
function makeRig(model,side){
 const holder=new THREE.Group();holder.add(model);model.updateMatrixWorld(true);
 const bones=new Map();model.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 const wrist=bones.get('wrist').position.clone(),middle=bones.get('middle-finger-tip').position;
 const forward=middle.clone().sub(wrist).normalize();
 const across=bones.get('index-finger-phalanx-proximal').position.clone().sub(bones.get('pinky-finger-phalanx-proximal').position);across.addScaledVector(forward,-across.dot(forward)).normalize();
 const normal=across.clone().cross(forward).normalize(),sign=side==='L'?1:-1;
 const source=new THREE.Matrix4().makeBasis(across,forward,normal),destination=new THREE.Matrix4().makeBasis(V(sign,0,0),V(0,1,0),V(0,0,sign));
 const rotation=destination.multiply(source.transpose()),inverse=rotation.clone().transpose();holder.quaternion.setFromRotationMatrix(rotation);model.position.sub(wrist);
 const rest=new Map([...bones].map(([name,bone])=>[name,{position:bone.position.clone(),quaternion:bone.quaternion.clone()}]));
 const fingers=names.map((name,i)=>{const chain=(i===0?['phalanx-proximal','phalanx-distal','tip']:['phalanx-proximal','phalanx-intermediate','phalanx-distal','tip']).map(s=>bones.get(name+'-'+s));const lengths=chain.slice(1).map((b,j)=>b.position.distanceTo(chain[j].position));return {chain,lengths,tip:V(),initialized:false};});
 model.traverse(o=>{if(o.isSkinnedMesh){
  // Extend only the existing wrist vertices into a continuous forearm. A
  // separate cylinder produced a visible cut/seam at the wrist.
  const positions=o.geometry.attributes.position,point=V();for(let v=0;v<positions.count;v++){point.fromBufferAttribute(positions,v);const behind=point.clone().sub(wrist).dot(forward);if(behind<-.005){point.addScaledVector(forward,(behind+.005)*5);positions.setXYZ(v,point.x,point.y,point.z);}}positions.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingSphere();
  o.frustumCulled=false;for(const m of [o.material].flat()){m.color.set('#c99478');m.roughness=.67;m.metalness=0;}}});
 return {side,holder,model,bones,rest,wrist,rotation,inverse,fingers,x:0,initialized:false,scale:1};
}
// Solve in the finger's bend plane. The raised proximal joint and downward
// distal phalanx avoid the arbitrary elbow directions of unconstrained FABRIK.
export function solveFinger(base,target,lengths,arch=12){
 const total=lengths.reduce((a,b)=>a+b,0),end=target.clone(),up=V(0,0,1);
 if(base.distanceTo(end)>total-.0001)end.copy(base).add(end.clone().sub(base).setLength(total-.0001));
 const forward=end.clone().sub(base);forward.z=0;if(forward.lengthSq()<1e-8)forward.set(0,1,0);forward.normalize();
 const two=(a,b,goal)=>{const delta=goal.clone().sub(base),distance=Math.max(1e-6,delta.length()),direction=delta.clone().normalize(),projection=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-projection*projection)),bend=up.clone().addScaledVector(direction,-up.dot(direction)).normalize();return base.clone().addScaledVector(direction,projection).addScaledVector(bend,height);};
 if(lengths.length===2){return [base.clone(),two(lengths[0],lengths[1],end),end];}
 let best=null;
 for(let degrees=25;degrees<=100;degrees+=3){
  const angle=degrees*Math.PI/180,p2=end.clone().addScaledVector(forward,-lengths[2]*Math.cos(angle)).addScaledVector(up,lengths[2]*Math.sin(angle)),distance=base.distanceTo(p2);
  if(distance>lengths[0]+lengths[1]-.001||distance<Math.abs(lengths[0]-lengths[1])+.001)continue;
  const p1=two(lengths[0],lengths[1],p2),points=[base.clone(),p1,p2,end.clone()],angles=points.slice(1).map((p,i)=>{const d=p.clone().sub(points[i]);return Math.atan2(d.z,d.dot(forward))*180/Math.PI;});
  const pip=angles[0]-angles[1],dip=angles[1]-angles[2];
  const violation=Math.max(0,-pip)+Math.max(0,pip-105)+Math.max(0,-dip)+Math.max(0,dip-85)+Math.max(0,-angles[0]-10)+Math.max(0,angles[0]-85);
  const cost=violation*100+Math.abs(pip-55)*.2+Math.abs(dip-25)*.3+Math.abs(p1.z-base.z-arch)*.1;
  if(!best||cost<best.cost)best={cost,points};
 }
 if(best)return best.points;
 // Near full extension: keep the surface continuous, without stretching bones.
 const p1=two(lengths[0],lengths[1]+lengths[2],end),p2=p1.clone().lerp(end,lengths[1]/(lengths[1]+lengths[2]));return [base.clone(),p1,p2,end];
}

export function createPianoHands(surface){
 surface.classList.add('has-piano-hands');
 const abort=new AbortController(),renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(1.5,devicePixelRatio||1));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 const canvas=renderer.domElement;canvas.className='piano-hands-canvas';canvas.dataset.model='skinned-webxr';canvas.setAttribute('aria-label','连续蒙皮的三维双手，随钢琴指法演示');surface.append(canvas);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,1,1,0,.1,2000);camera.position.z=600;
 scene.add(new THREE.HemisphereLight(0xffffff,0x66545a,1.65));const light=new THREE.DirectionalLight(0xffecdd,2.1);light.position.set(-150,250,400);scene.add(light);const fill=new THREE.DirectionalLight(0xdce7ff,.8);fill.position.set(250,-100,300);scene.add(fill);
 const hands=[],loader=new GLTFLoader();let state=null,frame=0,last=0,settle=0,disposed=false,visible=true,W=0,H=0;
 const ready=Promise.all(['L','R'].map(async side=>{const response=await fetch('/assets/piano-hands/'+(side==='L'?'left':'right')+'.glb',{signal:abort.signal});if(!response.ok)throw Error('手部模型加载失败');const buffer=await response.arrayBuffer(),asset=await loader.parseAsync(buffer,'');if(disposed){release(asset.scene);return;}const rig=makeRig(asset.scene,side);hands.push(rig);scene.add(rig.holder);})).then(()=>{if(!disposed){canvas.dataset.loaded='true';settle=performance.now()+500;wake();}});
 const visibility=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;if(visible)wake();else{cancelAnimationFrame(frame);frame=0;}},{rootMargin:'80px'});visibility.observe(surface);
 function native(rig,point){return point.clone().sub(rig.holder.position).multiplyScalar(1/rig.scale).applyMatrix4(rig.inverse).add(rig.wrist);}
 function world(rig,point){return point.clone().sub(rig.wrist).applyMatrix4(rig.rotation).multiplyScalar(rig.scale).add(rig.holder.position);}
 function animate(now){frame=0;if(disposed||!visible||document.hidden||!state||hands.length!==2)return;const dt=Math.min(.05,(now-last)/1000||.016);if(now-last<30){frame=requestAnimationFrame(animate);return;}last=now;
  const {geom,width,height,active,next,playing}=state,blend=1-Math.exp(-dt*22);
  if(W!==width||H!==height){W=width;H=height;const extension=64;renderer.setSize(W,H+extension,false);camera.left=0;camera.right=W;camera.top=H;camera.bottom=-extension;camera.updateProjectionMatrix();}
  const white=[...geom.values()].find(k=>!k.black)?.w||20;
  for(const rig of hands){
   const sounding=active.filter(n=>n.hand===rig.side),upcoming=(state.future||next).filter(n=>n.hand===rig.side&&(!playing||!Number.isFinite(n.start)||n.start-(state.beat||0)<.5)),notes=sounding.length?sounding:upcoming,targets=new Map(),used=new Set(),sorted=[...notes].sort((a,b)=>a.midi-b.midi);
   for(const n of sorted){const f=Number(n.finger);if(f>=1&&f<=5&&!used.has(f)){targets.set(f,n);used.add(f);}}
   for(const n of sorted){if([...targets.values()].includes(n))continue;const f=(rig.side==='R'?[1,2,3,4,5]:[5,4,3,2,1]).find(f=>!used.has(f));if(f){targets.set(f,n);used.add(f);}}
   rig.scale=Math.max(180,Math.min(1100,white*34));rig.holder.scale.setScalar(rig.scale);
   const anchors=[...targets].map(([f,n])=>{const key=geom.get(n.midi),rest=rig.rest.get(rig.fingers[f-1].chain[0].name).position;return key?key.x+key.w/2-rest.clone().sub(rig.wrist).applyMatrix4(rig.rotation).x*rig.scale:null;}).filter(x=>x!==null);
   let desired=anchors.length?anchors.reduce((a,b)=>a+b,0)/anchors.length:rig.initialized?rig.x:W*(rig.side==='L'?.33:.67);
   if(sounding.length&&upcoming.length){const future=upcoming.find(n=>Number(n.finger)>=1&&Number(n.finger)<=5),key=future&&geom.get(future.midi);if(key){const f=rig.fingers[Number(future.finger)-1],offset=rig.rest.get(f.chain[0].name).position.clone().sub(rig.wrist).applyMatrix4(rig.rotation).x*rig.scale,advance=key.x+key.w/2-offset-desired,anticipation=Math.max(0,1-Math.max(0,future.start-(state.beat||0))/.5);desired+=Math.max(-white*.35,Math.min(white*.35,advance))*anticipation;}}

   if(!rig.initialized){rig.x=desired;rig.initialized=true;}else rig.x+=(desired-rig.x)*blend;
   const depths=[...targets].map(([f,n])=>{const k=geom.get(n.midi),finger=rig.fingers[f-1];if(!k)return null;const baseForward=rig.rest.get(finger.chain[0].name).position.clone().sub(rig.wrist).applyMatrix4(rig.rotation).y*rig.scale;return H-(k.black?H*.54:H*.78)-baseForward-finger.lengths.reduce((a,b)=>a+b,0)*rig.scale*.6;}).filter(v=>v!==null);
   const desiredY=depths.length?depths.reduce((a,b)=>a+b,0)/depths.length:(rig.y??-H*.3);
   rig.y=rig.y===undefined?desiredY:rig.y+(desiredY-rig.y)*blend;
   rig.holder.position.set(rig.x,rig.y,Math.min(16,white*.8));
   // Bring unused fingers over their next keys while the current fingers hold.
   // Existing contacts keep priority; a preview must never release a held note.
   for(const n of upcoming){const f=Number(n.finger);if(f>=1&&f<=5&&!targets.has(f))targets.set(f,n);}
   for(let i=0;i<5;i++){
    const finger=rig.fingers[i],note=targets.get(i+1),key=note&&geom.get(note.midi),pressed=!!note&&sounding.includes(note)&&playing;
    const base=world(rig,rig.rest.get(finger.chain[0].name).position),restTip=world(rig,rig.rest.get(finger.chain.at(-1).name).position),lengths=finger.lengths.map(l=>l*rig.scale);
    const target=key?V(key.x+key.w/2,H-(key.black?H*.54:H*.78),pressed?1.5+Math.min(4,white*.2)*Math.exp(-Math.max(0,(state.beat||0)-(Number(note.start)||0))*60/(state.bpm||80)/.025):Math.min(6,white*.3)):restTip.clone();
    if(!key){const thumbSign=rig.side==='L'?1:-1;target.x=base.x+(i===0?thumbSign*white*.55:(restTip.x-base.x)*.2);target.y=base.y+lengths.reduce((a,b)=>a+b,0)*.63;target.z=Math.min(6,white*.3);}
    if(!finger.initialized){finger.tip.copy(target);finger.initialized=true;}else finger.tip.lerp(target,pressed?1-Math.exp(-dt*60):blend);
    const points=solveFinger(base,finger.tip,lengths,white*(pressed?.65:.85)).map(p=>native(rig,p));
    for(let j=0;j<finger.chain.length;j++){const bone=finger.chain[j],rest=rig.rest.get(bone.name);bone.position.copy(points[j]);bone.quaternion.copy(rest.quaternion);if(j<finger.chain.length-1){const from=rig.rest.get(finger.chain[j+1].name).position.clone().sub(rest.position).normalize(),to=points[j+1].clone().sub(points[j]).normalize();bone.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));}}
   }
   rig.model.updateMatrixWorld(true);
  }
  renderer.render(scene,camera);canvas.dataset.ready='true';if(state.playing||performance.now()<settle)frame=requestAnimationFrame(animate);
 }
 function wake(){if(!frame&&!disposed&&visible&&!document.hidden&&state&&hands.length===2)frame=requestAnimationFrame(animate);}
 const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else wake();};document.addEventListener('visibilitychange',onVisibility);
 return {ready,inspect(){return hands.map(r=>({side:r.side,wrist:r.bones.get('wrist').getWorldPosition(V()).toArray(),tip:r.fingers[2].chain[3].getWorldPosition(V()).toArray(),target:r.fingers[2].tip.toArray(),bounds:new THREE.Box3().setFromObject(r.model,true).getSize(V()).toArray()}));},update(value){state=value;settle=performance.now()+400;wake();},dispose(){if(disposed)return;disposed=true;abort.abort();cancelAnimationFrame(frame);visibility.disconnect();document.removeEventListener('visibilitychange',onVisibility);hands.forEach(r=>release(r.model));hands.length=0;scene.clear();renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();surface.classList.remove('has-piano-hands');}};
}
