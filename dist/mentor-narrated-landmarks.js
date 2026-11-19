import {architecturalMaterial,finishArchitecture} from './mentor-architecture-surfaces.js?v=1';
import * as T from './vendor/three/three.module.js';
import {mergeGeometries} from './vendor/three/BufferGeometryUtils.js';
export const landmarkNames=['东方之门','拙政园','留园','虎丘塔','北寺塔','山塘街','盘门'];
export const landmarkLocations=[[105,-150],[-75,-242],[-190,-135],[13,-204],[23,-163],[43,-102],[50,-160]];

// Unnarrated sites are metadata only. This module constructs just the two narrated towers.
export function createSuzhouLandmarks(){
 const group=new T.Group();group.name='narrated-suzhou-towers';const batches=new Map();
 const materials=[architecturalMaterial('brick',0xa79e8c),architecturalMaterial('wood',0x825c45),architecturalMaterial('roof',0x4d5550),architecturalMaterial('stone',0xc5c2b5)];materials.forEach(m=>m.side=T.DoubleSide);
 function put(geo,material,x,y,z,angle=0){geo.rotateY(angle);geo.translate(x,y,z);const flat=geo.index?geo.toNonIndexed():geo;if(flat!==geo)geo.dispose();if(!batches.has(material))batches.set(material,[]);batches.get(material).push(flat);}
 for(const index of [3,4]){
  const [x,z]=landmarkLocations[index],levels=index===3?7:9;
  for(let floor=0;floor<levels;floor++){
   const r=2.5-floor*.16,lean=index===3?floor*.09:0,y=floor*1.45;
   put(new T.CylinderGeometry(r,r,1.25,8),index===3?0:1,x+lean,y+.7,z,Math.PI/8);
   put(new T.CylinderGeometry(r+.34,r+.48,.16,8),index===3?0:2,x+lean,y+1.4,z,Math.PI/8);
   for(let face=0;face<8;face++){
    const angle=face*Math.PI/4,shape=new T.Shape();shape.moveTo(-.22,0);shape.lineTo(.22,0);shape.lineTo(.22,.45);shape.absarc(0,.45,.22,0,Math.PI);shape.closePath();
    put(new T.ShapeGeometry(shape),2,x+lean+Math.sin(angle)*(r+.02),y+.35,z+Math.cos(angle)*(r+.02),angle);
    if(index===4){put(new T.BoxGeometry(r*.8,.055,.07),1,x+Math.sin(angle)*(r+.25),y+.37,z+Math.cos(angle)*(r+.25),angle);for(const d of [-.5,0,.5])put(new T.CylinderGeometry(.035,.035,.45,6),1,x+Math.sin(angle)*(r+.25)+Math.cos(angle)*d,y+.15,z+Math.cos(angle)*(r+.25)-Math.sin(angle)*d);}
   }
   if(index===3)for(let j=0;j<5;j++)put(new T.CylinderGeometry(r+.015,r+.015,.012,8),3,x+lean,y+.18+j*.21,z,Math.PI/8);
  }
  if(index===4){put(new T.ConeGeometry(1.55,1.3,8),2,x,levels*1.45+.4,z);put(new T.CylinderGeometry(.045,.08,1.5,8),1,x,levels*1.45+1.6,z);}
 }
 for(const [index,parts]of batches){const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new T.Mesh(geometry,materials[index]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 finishArchitecture(group);group.userData.narratedLandmarks=['虎丘塔','北寺塔'];return {group};
}
