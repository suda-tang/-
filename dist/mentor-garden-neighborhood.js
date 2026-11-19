import {registerTownBuildings} from './mentor-flight-safety.js?v=flow138';
import * as T from './vendor/three/three.module.js';

// Every house uses an extracted garden building. Only its tessellation changes with distance.
export function createGardenNeighborhood(city, blocks, rivers, signal, onAsset) {
 const group=new T.Group();group.name='original-garden-building-neighborhood';city.add(group);
 const state={catalog:[],assets:new Map(),pending:new Set(),materials:new Map(),stopped:false,last:-Infinity,fades:new Map()};
 const frustum=new T.Frustum(),vp=new T.Matrix4(),dummy=new T.Object3D(),eye=new T.Vector3();
 const rows=blocks.map((b,i)=>({b,i}));
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;const shadowContext=shadowCanvas.getContext('2d'),pixels=shadowContext.createImageData(64,64);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,u=(x-31.5)/31.5,v=(y-31.5)/31.5;pixels.data[i]=23;pixels.data[i+1]=28;pixels.data[i+2]=22;pixels.data[i+3]=Math.round(68*Math.max(0,1-u**6)*Math.max(0,1-v**6));}shadowContext.putImageData(pixels,0,0);
 const shadowTexture=new T.CanvasTexture(shadowCanvas),shadowMaterial=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}),shadowGeometry=new T.PlaneGeometry(1,1).rotateX(-Math.PI/2),shadows=new T.InstancedMesh(shadowGeometry,shadowMaterial,rows.length);shadows.count=0;shadows.frustumCulled=false;group.add(shadows);
 const lanternCanvas=document.createElement('canvas');lanternCanvas.width=128;lanternCanvas.height=64;const lc=lanternCanvas.getContext('2d'),wash=lc.createLinearGradient(0,0,0,64);wash.addColorStop(0,'#782b1e');wash.addColorStop(.45,'#bb4931');wash.addColorStop(1,'#70291d');lc.fillStyle=wash;lc.fillRect(0,0,128,64);lc.strokeStyle='#b88851';lc.lineWidth=.8;for(let x=0;x<128;x+=16){lc.beginPath();lc.moveTo(x,0);lc.lineTo(x,64);lc.stroke();}
 const lanternTexture=new T.CanvasTexture(lanternCanvas);lanternTexture.colorSpace=T.SRGBColorSpace;const lanternMaterial=new T.MeshStandardMaterial({map:lanternTexture,roughness:.85}),lanternGeometry=new T.SphereGeometry(.095,12,8),lanterns=new T.InstancedMesh(lanternGeometry,lanternMaterial,rows.length*2);lanterns.count=0;lanterns.frustumCulled=false;group.add(lanterns);
 function disposeMaterial(m){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}
 async function load(entry,lod){
  const key=entry.id+':'+lod;if(state.stopped||state.pending.has(key)||state.assets.has(key))return;
  state.pending.add(key);
  try{
   const {GLTFLoader}=await import('./vendor/three/GLTFLoader.js');const response=await fetch(entry[lod],{signal});if(!response.ok)throw Error('园林建筑 HTTP '+response.status);
   const model=await new GLTFLoader().parseAsync(await response.text(),new URL('.',new URL(entry[lod],location.href)).href);
   if(state.stopped){model.scene.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean))disposeMaterial(m);});return;}
   const capacity=rows.filter(r=>r.entryIndex===state.catalog.indexOf(entry)).length,meshes=[];
   model.scene.traverse(o=>{if(!o.isMesh)return;
    const material=o.material,key=entry.sourceGarden+':'+material.name;
    let shared=state.materials.get(key);if(!shared){shared=material;shared.metalness=0;shared.roughness=.94;
     shared.onBeforeCompile=shader=>{shader.vertexShader='attribute float instanceReveal; varying float neighborhoodReveal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n neighborhoodReveal=instanceReveal;');shader.fragmentShader='varying float neighborhoodReveal;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n if(neighborhoodReveal<=0.0||fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>neighborhoodReveal)discard;');};
     shared.customProgramCacheKey=()=> 'garden-neighborhood-reveal-v1';state.materials.set(key,shared);
    }else if(shared!==material)disposeMaterial(material);
    const geometry=o.geometry.clone();o.geometry.dispose();geometry.setAttribute('instanceReveal',new T.InstancedBufferAttribute(new Float32Array(Math.max(1,capacity)),1).setUsage(T.DynamicDrawUsage));
    const mesh=new T.InstancedMesh(geometry,shared,Math.max(1,capacity));mesh.count=0;mesh.receiveShadow=true;mesh.castShadow=lod==='near';mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.name=entry.id+'-'+lod;group.add(mesh);meshes.push(mesh);
   });
   state.assets.set(entry.id+':'+lod,meshes);onAsset?.(group);state.last=-Infinity;
  }catch(error){if(!state.stopped)city.userData.gardenBuildingError=error.message;}finally{state.pending.delete(key);}
 }
 fetch('/assets/garden-buildings/catalog.json',{signal,cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('园林建筑目录 HTTP '+r.status);return r.json();}).then(async catalog=>{
  if(state.stopped)return;state.catalog=catalog;
  // River-facing facades, with uniform scaling that keeps each imported roof and window in proportion.
  for(const row of rows){if(row.i%64===0){await new Promise(r=>setTimeout(r,0));if(state.stopped)return;}const [x,z,w,d]=row.b;let nearest=null,best=Infinity;
   for(const r of rivers){const [rx,rz,len,angle]=r,dx=Math.sin(angle),dz=Math.cos(angle),along=T.MathUtils.clamp((x-rx)*dx+(z-rz)*dz,-len/2,len/2),distance=Math.hypot(x-rx-along*dx,z-rz-along*dz);if(distance<best){best=distance;nearest=r;}}
   row.entryIndex=catalog.length===3?(row.i%23===0?2:row.i%4===0?0:1):row.i%catalog.length;let entry=catalog[row.entryIndex];let a=0;
   if(best<35){const [rx,rz,,angle]=nearest,side=(x-rx)*Math.cos(angle)-(z-rz)*Math.sin(angle);a=angle+Math.PI/2+(side>0?Math.PI:0);}
   if(row.b.layoutSource==='shantang-lecture-bank')a=x>-64?-Math.PI/2:Math.PI/2;
   if(row.b.layoutAngle!==undefined)a=row.b.layoutAngle;
   let [bw,,bd]=entry.bounds;const c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a)),fit=()=>row.b.frontage?Math.min(row.b.frontage/bw,row.b.depth/bd):Math.min(w/(bw*c+bd*s),d/(bw*s+bd*c));if(fit()<.8){row.entryIndex=1;entry=catalog[1];[bw,,bd]=entry.bounds;}
   row.scale=Math.min(1.15,fit()*.94);row.angle=a;row.radius=Math.hypot(bw,bd)*row.scale*.6;
   dummy.position.set(x,0,z);dummy.scale.setScalar(row.scale);dummy.rotation.set(0,a,0);dummy.updateMatrix();row.matrix=dummy.matrix.clone();
  }
  registerTownBuildings(rows,catalog);
  // Establish the continuous street front first. Decorative courts and pavilions follow.
  for(const entry of [catalog[1],catalog[0],...catalog.slice(2)].filter(Boolean)){if(state.stopped)break;await load(entry,'far');if(state.assets.has(entry.id+':far'))city.userData.riverStreetReady=true;}
 }).catch(error=>{if(!state.stopped)city.userData.gardenBuildingError=error.message;});
 function advanceFades(now){
  const dirty=new Set();for(const [row,slots]of state.fades){const p=T.MathUtils.clamp((now-row.fadeStart)/480,0,1);row.blend=T.MathUtils.lerp(row.fadeFrom,row.fadeTo,p*p*(3-2*p));for(const {mesh,index,near}of slots){mesh.geometry.attributes.instanceReveal.setX(index,near?row.blend:1-row.blend);dirty.add(mesh);}if(p===1)state.fades.delete(row);}
  for(const mesh of dirty)mesh.geometry.attributes.instanceReveal.needsUpdate=true;
 }
 function update(camera,now){
  if(state.stopped||!city.visible)return;advanceFades(now);
  if(state.stopped||!state.catalog.length||!rows[0]?.matrix||!city.visible||now-state.last<450)return;state.last=now;
  camera.updateMatrixWorld();city.updateWorldMatrix(true,false);vp.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(vp);eye.copy(camera.position);city.worldToLocal(eye);
  const visible=rows.filter(row=>{if(!row.matrix||!state.catalog[row.entryIndex])return false;const [x,z]=row.b;return frustum.intersectsSphere(new T.Sphere(city.localToWorld(new T.Vector3(x,2,z)),row.radius));}).map(row=>({row,distance:Math.hypot(eye.x-row.b[0],eye.z-row.b[1])})).sort((a,b)=>a.distance-b.distance);
  const counts=new Map(),nearLimit=innerWidth<700?8:16;let nearCount=0,shadowCount=0,lanternCount=0;state.fades.clear();
  const emit=(key,row,near,slots)=>{const meshes=state.assets.get(key);if(!meshes)return;const index=counts.get(key)||0;for(const mesh of meshes){mesh.setMatrixAt(index,row.matrix);mesh.geometry.attributes.instanceReveal.setX(index,near?row.blend:1-row.blend);slots.push({mesh,index,near});}counts.set(key,index+1);};
  for(const {row,distance}of visible){const entry=state.catalog[row.entryIndex];let lod='far';
   if(distance<(row.fadeTo===1?67:50)&&eye.y<32&&nearCount<nearLimit){if(state.assets.has(entry.id+':near')){lod='near';nearCount++;}else if(state.pending.size<1)void load(entry,'near');}
   row.blend??=0;const target=lod==='near'?1:0;if(row.fadeTo!==target){row.fadeFrom=row.blend;row.fadeTo=target;row.fadeStart=now;}
   const slots=[];if(row.blend<1||target===0)emit(entry.id+':far',row,false,slots);if(row.blend>0||target===1)emit(entry.id+':near',row,true,slots);if(row.blend!==target)state.fades.set(row,slots);
   if(state.assets.has(entry.id+':far')){const [x,z]=row.b,[w,h,d]=entry.bounds;dummy.position.set(x,.006,z);dummy.rotation.set(0,row.angle,0);dummy.scale.set(w*row.scale*1.16,1,d*row.scale*1.16);dummy.updateMatrix();shadows.setMatrixAt(shadowCount++,dummy.matrix);
    if(row.i%7===0&&distance<90){for(const side of [-1,1]){const lx=side*w*row.scale*.24,lz=d*row.scale*.5+.10;dummy.position.set(x+Math.cos(row.angle)*lx+Math.sin(row.angle)*lz,h*row.scale*.72,z-Math.sin(row.angle)*lx+Math.cos(row.angle)*lz);dummy.rotation.set(0,row.angle,0);dummy.scale.set(1,1.3,1);dummy.updateMatrix();lanterns.setMatrixAt(lanternCount++,dummy.matrix);}}
   }
  }
  shadows.count=shadowCount;shadows.instanceMatrix.needsUpdate=true;lanterns.count=lanternCount;lanterns.instanceMatrix.needsUpdate=true;
  for(const [key,meshes]of state.assets){const count=counts.get(key)||0;for(const mesh of meshes){mesh.count=count;mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.instanceReveal.needsUpdate=true;}}
  city.userData.gardenNeighborhood={buildings:rows.length,visible:visible.length,near:nearCount,loaded:state.assets.size,blending:state.fades.size};
 }
 function dispose(){if(state.stopped)return;state.stopped=true;group.removeFromParent();const geometries=new Set();for(const meshes of state.assets.values())for(const m of meshes)geometries.add(m.geometry);geometries.forEach(g=>g.dispose());state.materials.forEach(disposeMaterial);shadowGeometry.dispose();shadowMaterial.dispose();shadowTexture.dispose();lanternGeometry.dispose();lanternMaterial.dispose();lanternTexture.dispose();state.assets.clear();state.materials.clear();group.clear();}
 signal.addEventListener('abort',dispose,{once:true});return {update,dispose};
}
