import {registerCanalBridges} from './mentor-flight-safety.js?v=flow138';
import * as T from './vendor/three/three.module.js';
import {mergeGeometries} from './vendor/three/BufferGeometryUtils.js';
import {architecturalMaterial,finishArchitecture} from './mentor-architecture-surfaces.js?v=1';
// Riverbanks follow surveyed channel centre-lines. Bridges and waterside furnishings are illustrative.
export async function addWaterTownDetails(group,rivers,signal){
 const batches=new Map(),stone=architecturalMaterial('stone',0xaaa798),paving=architecturalMaterial('stone',0xb3b0a2),wood=architecturalMaterial('wood',0x554a3c),rail=architecturalMaterial('stone',0xc2bead);
 const put=(geometry,material,x,y,z,angle=0)=>{geometry.rotateY(angle);geometry.translate(x,y,z);if(!batches.has(material))batches.set(material,[]);const flat=geometry.index?geometry.toNonIndexed():geometry;if(flat!==geometry)geometry.dispose();batches.get(material).push(flat);};
 const box=(x,y,z,w,h,d,mat,angle=0)=>put(new T.BoxGeometry(w,h,d),mat,x,y,z,angle);
 const bridges=[];let banks=0,stairs=0,boats=0;
 function bridge(x,z,width,angle){
  const span=width+3,half=span/2,deck=1.65,crown=1.2+width*.28,segments=28;
  const shape=new T.Shape();for(let j=0;j<=segments;j++){const u=-half+j*span/segments,y=.18+crown*(1-(u/half)**2);j?shape.lineTo(u,y):shape.moveTo(u,y);}for(let j=segments;j>=0;j--){const u=-half+j*span/segments;shape.lineTo(u,Math.max(.02,.18+crown*(1-(u/half)**2)-.28));}shape.closePath();
  const vault=new T.ExtrudeGeometry(shape,{depth:deck,bevelEnabled:false});vault.translate(0,0,-deck/2);put(vault,stone,x,0,z,angle);
  const position=(u,v,y,w,h,d,m)=>box(x+Math.cos(angle)*u+Math.sin(angle)*v,y,z-Math.sin(angle)*u+Math.cos(angle)*v,w,h,d,m,angle);
  for(let j=0;j<segments;j++){const u=-half+(j+.5)*span/segments,y=.18+crown*(1-(u/half)**2);position(u,0,y+.025,span/segments+.008,.055,deck,paving);for(const side of [-1,1]){position(u,side*(deck/2+.035),y+.64,span/segments+.015,.10,.13,rail);if(j%3===0)position(u,side*(deck/2+.035),y+.32,.12,.65,.12,rail);}}
  bridges.push([x,z,width,angle]);
 }
 for(let i=0;i<rivers.length;i++){
  if(i%80===0){await new Promise(r=>setTimeout(r,0));if(signal.aborted){for(const parts of batches.values())parts.forEach(g=>g.dispose());for(const m of [stone,paving,wood,rail])m.dispose();return;}}
  const [x,z,length,angle,width]=rivers[i];if(length<.5||width>12||length>160)continue;
  const dx=Math.sin(angle),dz=Math.cos(angle),nx=Math.cos(angle),nz=-Math.sin(angle);
  const place=(u,v,y,w,h,d,m)=>box(x+nx*u+dx*v,y,z+nz*u+dz*v,w,h,d,m,angle);
  for(const side of [-1,1]){
   place(side*(width/2+.12),0,.10,.24,.32,length,stone);
   place(side*(width/2+.22),0,.28,.42,.08,length,rail);
   place(side*(width/2+.85),0,.035,1.05,.07,length,paving);banks++;
  }
  if(length>7&&i%13===0){for(let s=0;s<5;s++)place(width/2+.25-s*.18,0,.20-s*.055,.23,.11,1.05,stone);stairs++;}
  if(length>3&&width>.65&&width<6&&i%9===0&&!bridges.some(b=>Math.hypot(x-b[0],z-b[1])<22))bridge(x,z,width,angle);
  if(length>8&&width>1.2&&width<4&&i%41===0){
   const outline=new T.Shape();outline.moveTo(0,-1.05);outline.quadraticCurveTo(.52,-.6,.43,.65);outline.quadraticCurveTo(0,1.1,-.43,.65);outline.quadraticCurveTo(-.52,-.6,0,-1.05);
   const hull=new T.ExtrudeGeometry(outline,{depth:.16,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,steps:1});hull.rotateX(-Math.PI/2);put(hull,wood,x,.015,z,angle);
   place(0,-.1,.22,.68,.06,1.05,wood);for(const u of [-.3,.3])place(u,0,.36,.045,.5,.045,wood);place(0,0,.64,.78,.09,.85,wood);boats++;
  }
 }
 if(!bridges.some(b=>Math.hypot(b[0]-43,b[1]+116)<12))bridge(43,-116,5,0);
 for(const [material,parts]of batches){if(!parts.length)continue;const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new T.Mesh(geo,material);mesh.name='water-town-'+material.userData.architectural;mesh.receiveShadow=true;group.add(mesh);}
 registerCanalBridges(bridges);finishArchitecture(group);group.userData.waterTown={banks,bridges:bridges.length,stairs,boats};
}
