import * as T from './vendor/three/three.module.js';
import {cameraBlocked} from './mentor-flight-safety.js?v=flow138';
import {nearbyGardenSurfaces} from './mentor-garden-raycast.js?v=1';
const cursors=new WeakMap();

export function chooseSignPlacement(root,camera,stage,angle,index,extras=[]){
 root.updateWorldMatrix(true,true);camera.updateMatrixWorld(true);const meshes=[];
 // Town-wide instancing batches span the whole city, but their buildings have
 // already been excluded from the lecture sites. Do not raycast thousands of
 // distant instances for a sign's two footings.
 for(const o of root.children)if(o.visible&&!/sign|shadow|sampan|landing|suzhou-old-city|verified-garden-asset-/.test(o.name))o.traverseVisible(p=>{if(p.isMesh)meshes.push(p);});
 // A few local instances are enough for a metre-wide physical sign. Avoid
 // asking InstancedMesh.raycast to revisit every tree in a whole garden tile.
 const garden=index===9?'yiyuan':index===1?'zhuozhengyuan':null;
 if(garden)meshes.push(...nearbyGardenSurfaces(root,garden,stage,9));
 for(const o of extras)if(o?.visible)o.traverseVisible(p=>{if(p.isMesh)meshes.push(p);});
 const ray=new T.Raycaster(),axis=new T.Vector3(0,1,0),scale=index===7?1.2:index===8?.4:.42;
 const pairs=index===5?[[3.1,1.7],[3.4,2.6]]:index===8?[[1.15,2.1],[-1.6,1.6],[2.6,1],[-2.7,1]]:[[2.2,1.2],[-2.2,1.2],[2.7,0],[-2.7,0],[1.8,2.4],[-1.8,2.4],[3.2,-1],[-3.2,-1]];
 const viewAngle=Math.atan2(camera.position.x-stage.x,camera.position.z-stage.z);
 const positions=pairs.map(([x,z])=>new T.Vector3(x,0,z).applyAxisAngle(axis,angle).add(stage));
 if(index!==5&&index!==7)for(const [x,z]of [[-.8,1.65],[.8,1.65],[-1,2.4],[1,2.4],[-1.25,1.25],[1.25,1.25],[-1.15,2],[1.15,2],[-1.7,.5],[1.7,.5]])positions.unshift(new T.Vector3(x,0,z).applyAxisAngle(axis,viewAngle).add(stage));
 let cursor=cursors.get(root)||0;cursors.set(root,cursor+3);
 for(let attempt=0;attempt<Math.min(3,positions.length);attempt++){const world=positions[(cursor+attempt)%positions.length],rotation=Math.atan2(camera.position.x-world.x,camera.position.z-world.z);
  const right=new T.Vector3(Math.cos(rotation),0,-Math.sin(rotation)),middle=world.clone().add(new T.Vector3(0,1.43*scale,0));
  const projected=middle.clone().project(camera);if(projected.z< -1||projected.z>1||Math.abs(projected.x)>.78||projected.y<-.45||projected.y>.8)continue;
  let clear=true;
  // Check both footings and the panel span against source triangles, rather
  // than relying on a camera ray that could miss a rock inside the sign.
  for(const side of [-1,1]){const foot=world.clone().addScaledVector(right,side*1.12*scale);foot.y+=2.1*scale;ray.set(foot,new T.Vector3(0,-1,0));ray.far=2.1*scale-.035;if(ray.intersectObjects(meshes,false).length){clear=false;break;}}
  if(!clear)continue;
  for(const y of [1.03,1.81]){const a=world.clone().addScaledVector(right,-1.25*scale);a.y+=y*scale;ray.set(a,right);ray.far=2.5*scale;if(ray.intersectObjects(meshes,false).length){clear=false;break;}}
  if(!clear)continue;
  for(const sx of [-1,0,1]){const p=world.clone().addScaledVector(right,sx*1.4*scale);p.y+=1.2*scale+.35;if(cameraBlocked(p)){clear=false;break;}
   const text=middle.clone().addScaledVector(right,sx*1.05*scale),delta=text.clone().sub(camera.position),distance=delta.length();ray.set(camera.position,delta.normalize());ray.far=distance-.12;if(ray.intersectObjects(meshes,false).length){clear=false;break;}}
  if(clear)return {position:world.sub(root.position),rotation};
 }
 return null;
}
