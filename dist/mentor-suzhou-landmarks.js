import {architecturalMaterial,finishArchitecture} from './mentor-architecture-surfaces.js?v=1';
import * as T from './vendor/three/three.module.js';
import {mergeGeometries,mergeVertices} from './vendor/three/BufferGeometryUtils.js';
export const landmarkNames=['东方之门','拙政园','留园','虎丘塔','北寺塔','山塘街','盘门'];
export const landmarkLocations=[[105,-150],[-75,-242],[-190,-135],[-158,-195],[-141,-124],[-64,-108],[50,-160]];
export function createSuzhouLandmarks(){
 const group=new T.Group(),batches=new Map();
 const mats=[architecturalMaterial('plaster',0xf2ecdf),architecturalMaterial('roof',0x555e5a),architecturalMaterial('wood',0x98634d),new T.MeshStandardMaterial({color:0x89b8c7,roughness:.23,metalness:.18,side:T.DoubleSide}),architecturalMaterial('plaster',0x7d8777),architecturalMaterial('stone',0xc5c2b5),architecturalMaterial('brick',0xa79e8c),architecturalMaterial('plaster',0xaaa99f)];mats.forEach(m=>m.side=T.DoubleSide);
 function put(g,m,x,y,z,ry=0){g.rotateY(ry);g.translate(x,y,z);const a=g.index?g.toNonIndexed():g;if(a!==g)g.dispose();if(!batches.has(m))batches.set(m,[]);batches.get(m).push(a);}
 const box=(x,y,z,w,h,d,m=0)=>put(new T.BoxGeometry(w,h,d),m,x,y,z);
 function pavilion(x,z,size=1){
  for(const a of [-1,1])for(const b of [-1,1]){box(x+a*size,1.3,z+b*size,.13,2.6,.13,2);box(x+a*size,.15,z+b*size,.23,.3,.23,5);}
  const verts=[],idx=[];for(let j=0;j<=12;j++){const u=j/12;for(let i=0;i<=12;i++){const v=i/12,X=(u*2-1)*size*1.65,Z=(v*2-1)*size*1.65;verts.push(X,2.65+.75*(1-Math.max(Math.abs(2*u-1),Math.abs(2*v-1)))+.2*Math.pow(Math.abs(2*u-1)*Math.abs(2*v-1),3),Z);if(j<12&&i<12){const k=j*13+i;idx.push(k,k+13,k+1,k+1,k+13,k+14);}}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();g.setAttribute('uv',new T.Float32BufferAttribute(new Array(169*2).fill(0),2));put(g,1,x,0,z);box(x,.12,z,size*2.8,.24,size*2.8,5);
  for(let k=-5;k<=5;k++){box(x+k*size*.22,2.55,z,size*.035,.08,size*2.4,1);}box(x,3.4,z,size*.18,.12,size*1.4,1);
 }
 function weatheredRock(radius,seed){const g=new T.IcosahedronGeometry(radius,4),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),k=.85+.14*Math.sin(x*7+y*4+seed)+.12*Math.cos(z*8-y*5);p.setXYZ(i,x*k+.12*Math.sin(y*6),y*(1.25+.16*Math.cos(z*7)),z*k);}g.deleteAttribute('normal');g.deleteAttribute('uv');const smooth=mergeVertices(g,1e-5);g.dispose();smooth.computeVertexNormals();smooth.setAttribute('uv',new T.Float32BufferAttribute(new Array(smooth.attributes.position.count*2).fill(0),2));return smooth;}
 function house(x,z,w=3){box(x,1.2,z,w,2.4,2);put(new T.ConeGeometry(w*.8,1,4),1,x,2.9,z,Math.PI/4);for(const a of [-1,1])box(x+a*w*.25,1.35,z+1.02,.55,.8,.05,1);}
 for(const n of [3,4,5]){
  const [x,z]=landmarkLocations[n];
  // Ground is shared with the city; no separate coloured square under each landmark.
  if(n===0){
   const outline=new T.Shape();outline.moveTo(-5,0);outline.lineTo(-5,15);outline.bezierCurveTo(-5,23,5,23,5,15);outline.lineTo(5,0);outline.lineTo(2,0);outline.lineTo(2,14);outline.bezierCurveTo(2,18,-2,18,-2,14);outline.lineTo(-2,0);outline.closePath();
   put(new T.ExtrudeGeometry(outline,{depth:3.6,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.18,bevelThickness:.18,curveSegments:48}),3,x,0,z-1.8);
   for(const side of [-1,1]){for(let k=0;k<52;k++)box(x+side*3.5,k*.29+.3,z+1.99,2.9,.025,.025,0);for(let k=0;k<11;k++)box(x+side*3.5+(k-5)*.24,7.5,z+2,.025,14.7,.025,0);}
   box(x,.16,z,15,.32,8,5);box(x,-.01,z+8,18,.04,6,3);
  }
  // The two gardens and all residential buildings use the extracted original assets.
  if(n===2){box(x-2,-.01,z,4,.05,5,3);for(let i=0;i<6;i++)put(weatheredRock(.65+(i%3)*.22,i),7,x-3+Math.sin(i),.6+i*.08,z+2+Math.cos(i));}
  if(n===3||n===4){const levels=n===3?7:9;for(let k=0;k<levels;k++){const r=2.5-k*.16,lean=n===3?k*.09:0,y=k*1.45;
   put(new T.CylinderGeometry(r,r,1.25,8),n===3?6:2,x+lean,y+.7,z,Math.PI/8);
   put(new T.CylinderGeometry(r+.34,r+.48,.16,8),n===3?6:1,x+lean,y+1.4,z,Math.PI/8);
   for(let j=0;j<8;j++){const a=j*Math.PI/4;const sh=new T.Shape();sh.moveTo(-.22,0);sh.lineTo(.22,0);sh.lineTo(.22,.45);sh.absarc(0,.45,.22,0,Math.PI);sh.closePath();put(new T.ShapeGeometry(sh),1,x+lean+Math.sin(a)*(r+.02),y+.35,z+Math.cos(a)*(r+.02),a);
    if(n===4){put(new T.BoxGeometry(r*.8,.055,.07),2,x+Math.sin(a)*(r+.25),y+.37,z+Math.cos(a)*(r+.25),a);for(const d of [-.5,0,.5]){put(new T.CylinderGeometry(.035,.035,.45,6),2,x+Math.sin(a)*(r+.25)+Math.cos(a)*d,y+.15,z+Math.cos(a)*(r+.25)-Math.sin(a)*d);}}
   }
   if(n===3)for(let j=0;j<5;j++)put(new T.CylinderGeometry(r+.015,r+.015,.012,8),5,x+lean,y+.18+j*.21,z,Math.PI/8);
  }if(n===4){put(new T.ConeGeometry(1.55,1.3,8),1,x,levels*1.45+.4,z);put(new T.CylinderGeometry(.045,.08,1.5,8),2,x,levels*1.45+1.6,z);}}
  // Shantang's canal, bridge and banks are built together by the water-town district.
  if(n===6){
   const wall=new T.Shape();wall.moveTo(-8,0);wall.lineTo(8,0);wall.lineTo(8,4.3);wall.lineTo(-8,4.3);wall.closePath();
   for(const gx of [-3.5,3.5]){const h=new T.Path();h.moveTo(gx-1,-.01);h.lineTo(gx-1,1.5);h.absarc(gx,1.5,1,Math.PI,0,true);h.lineTo(gx+1,-.01);h.closePath();wall.holes.push(h);}put(new T.ExtrudeGeometry(wall,{depth:3,bevelEnabled:false,curveSegments:24}),6,x,0,z-1.5);
   for(let k=-8;k<=8;k++)box(x+k,4.55,z,.55,.5,3,6);
   for(let k=0;k<18;k++)box(x,k*.23+.12,z+1.52,16,.018,.02,5);
   box(x-3.5,-.03,z+4,2.2,.04,13,3);pavilion(x,z,1.4);
  }

 }
 for(const [m,parts]of batches){const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());group.add(new T.Mesh(geo,mats[m]));}
 group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});finishArchitecture(group);
 return {group};
}
