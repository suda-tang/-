import {fetchMentorResource} from './mentor-resource-progress.js?v=flow135';
import * as T from './vendor/three/three.module.js';
import {GLTFLoader} from './vendor/three/GLTFLoader.js';

// Quaternius Animated Women, CC0. The original continuous skin and skeleton
// replace the separate procedural head, hair, neck and limb pieces.
export async function createRiggedTeacher(signal,progress=()=>{}){
 progress('正在载入教师形象');
 const bytes=await fetchMentorResource('/narration/models/teacher-cc0/woman-casual.glb',{signal});
 const gltf=await new GLTFLoader().parseAsync(bytes,'');
 if(signal?.aborted)throw new DOMException('数字人已退出','AbortError');
 const model=new T.Group(),body=gltf.scene;model.name='rigged-cartoon-teacher';model.add(body);
 body.updateMatrixWorld(true);const box=new T.Box3().setFromObject(body),scale=1.62/(box.max.y-box.min.y);
 body.scale.multiplyScalar(scale);body.position.y=-box.min.y*scale;model.updateMatrixWorld(true);
 const palette={Shirt:'#497b95',Skin:'#d7ad94',Pants:'#343d4b',Shoes:'#272e38',Socks:'#343d4b',HairBase:'#292629',Hair:'#322c30',Eyes:'#30292b'};
 let eyes;
 body.traverse(o=>{if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
  o.material=o.material.clone();if(palette[o.material.name])o.material.color.set(palette[o.material.name]);o.material.roughness=.72;
  if(o.material.name==='Eyes')eyes=o;
 });
 const controlled=['Head','UpperArmR','LowerArmR','UpperArmL','LowerArmL'].map(n=>body.getObjectByName(n)).filter(Boolean).map(bone=>({bone,rotation:bone.quaternion.clone()}));
 for(const side of ['L','R']){const arm=body.getObjectByName('UpperArm'+side),forearm=body.getObjectByName('LowerArm'+side),hand=body.getObjectByName('Palm'+side);if(arm)arm.scale.y*=.86;if(forearm)forearm.scale.y*=1.02;if(hand)hand.scale.y/= .86*1.02;}
 const headRest=body.getObjectByName('Head')?.quaternion.clone(),mixer=new T.AnimationMixer(body),actions={};
 for(const clip of gltf.animations.filter(c=>/Female_(Idle|Walk|Standing)$/.test(c.name))){
  const copy=clip.clone();copy.tracks=copy.tracks.filter(t=>!/^(Bone|HumanArmature|RootNode)\.position$/.test(t.name)&&t.name!=='Head.quaternion');
  actions[clip.name.endsWith('_Walk')?'walk':clip.name.endsWith('_Idle')?'idle':'standing']=mixer.clipAction(copy);
 }
 let active=actions.idle||actions.standing;active?.play();mixer.update(0);model.updateMatrixWorld(true);
 const head=body.getObjectByName('Head'),upper=body.getObjectByName('UpperArmR'),lower=body.getObjectByName('LowerArmR'),palm=body.getObjectByName('PalmR');
 const restingFloor=new T.Box3().setFromObject(model).min.y;
 model.userData.groundingFeet=['FootL','FootR'].map(n=>body.getObjectByName(n)).filter(Boolean).map(bone=>({bone,soleOffset:bone.getWorldPosition(new T.Vector3()).y-restingFloor}));
 body.userData.arms=[];body.userData.walkLimbs=[];model.userData.chibiBody=body;
 if(eyes){const p=eyes.geometry.attributes.position,closed=new Float32Array(p.array),bounds=new T.Box3().setFromBufferAttribute(p),center=(bounds.min.y+bounds.max.y)/2;
  for(let i=0;i<p.count;i++)closed[i*3+1]=center+(p.getY(i)-center)*.06;
  eyes.geometry.morphAttributes.position=[new T.Float32BufferAttribute(closed,3)];eyes.updateMorphTargets();
 }
 // Small teaching accessories attach to the head bone, never to world space.
 const face=new T.Group(),wire=new T.MeshStandardMaterial({color:'#41373b',roughness:.6});
 for(const sign of [-1,1]){const points=Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*2;return new T.Vector3(sign*.036+Math.cos(a)*.033,Math.sin(a)*.022,0)});face.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),32,.0016,5,false),wire));}
 const bridge=new T.Mesh(new T.CylinderGeometry(.0015,.0015,.014,6),wire);bridge.rotation.z=Math.PI/2;face.add(bridge);
 face.position.set(0,(4.292-box.min.y)*scale,.405*scale);model.add(face);model.updateMatrixWorld(true);head?.attach(face);
 const mouth=new T.Mesh(new T.SphereGeometry(1,16,8),new T.MeshStandardMaterial({color:'#8b5350',roughness:.8}));
 mouth.position.set(0,(4.055-box.min.y)*scale,.468*scale);mouth.scale.set(.015,.0025,.001);model.add(mouth);model.updateMatrixWorld(true);head?.attach(mouth);const mouthScale=mouth.scale.clone();
 const previous=new T.Vector3(),world=new T.Vector3(),parentRotation=new T.Quaternion(),goal=new T.Quaternion();let last=0,hasPosition=false,walking=false,disposed=false;
 function aim(bone,child,direction,weight){if(!bone||!child)return;bone.parent.getWorldQuaternion(parentRotation);const local=direction.clone().applyQuaternion(parentRotation.invert()).normalize();goal.setFromUnitVectors(child.position.clone().normalize(),local);bone.quaternion.slerp(goal,weight);bone.updateWorldMatrix(false,true);}
 model.userData.updatePortrait=(time,speaking,energy,mode,blink=0,interaction={})=>{
  if(disposed)return;const dt=Math.min(.08,Math.max(.001,last?time-last:1/60));last=time;
  model.getWorldPosition(world);const distance=hasPosition?world.distanceTo(previous):0,speed=distance/dt;previous.copy(world);hasPosition=true;
  const next=speed>.055&&speed<3.5&&model.parent?.visible!==false;
  if(next!==walking){walking=next;const action=walking?actions.walk:(actions.idle||actions.standing);if(action&&action!==active){action.reset().play();active?.crossFadeTo(action,.22,false);active=action;}}
  if(actions.walk)actions.walk.timeScale=Math.max(.65,Math.min(1.1,speed/.8));for(const {bone,rotation}of controlled)bone.quaternion.copy(rotation);mixer.update(dt);model.updateMatrixWorld(true);
  const attention=interaction.waving?'visitor':speaking&&mode==='writing'?'board':'visitor';
  if(head){head.quaternion.copy(headRest);head.rotateY(attention==='board'?(interaction.boardSide||1)*.16:Math.max(-.12,Math.min(.12,interaction.viewerYaw||0)));head.rotateX(speaking?Math.sin(time*.75)*.012:0);}
  if(interaction.waving){aim(upper,lower,new T.Vector3(-.5,.68,.26),.92);aim(lower,palm,new T.Vector3(Math.sin(time*5)*.28,.85,.18),.95);}
  else if(interaction.boating){for(const side of ['R','L']){const a=body.getObjectByName('UpperArm'+side),b=body.getObjectByName('LowerArm'+side),hand=body.getObjectByName('Palm'+side);aim(a,b,new T.Vector3(side==='R'?-.15:.15,-.55,.55),.85);aim(b,hand,new T.Vector3(.12+Math.sin(time*.85)*.12,.18,.75),.9);}}
  else if(speaking&&!walking&&Math.floor(time/5)%3===0){aim(upper,lower,new T.Vector3(-.55,-.05,.6),.5);aim(lower,palm,new T.Vector3(-.35,.22,.7),.6);}
  if(eyes?.morphTargetInfluences)eyes.morphTargetInfluences[0]=blink;
  mouth.scale.copy(mouthScale);mouth.scale.y*=1+(speaking?Math.min(1,energy*3)*2.4:0);
  model.userData.expressionState={attention,headYaw:head?.rotation.y||0,headPitch:0,gazeY:0,blink,emphasis:energy};
 };
 model.userData.cartoonOnly=true;model.userData.portraitReport={source:'Quaternius Animated Women, CC0',photographicTextures:false,rigged:true};
 model.userData.dispose=()=>{if(disposed)return;disposed=true;mixer.stopAllAction();mixer.uncacheRoot(body);};
 progress('教师形象已就绪');return model;
}
