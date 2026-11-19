import {architecturalMaterial,finishArchitecture} from './mentor-architecture-surfaces.js?v=1';
import * as T from './vendor/three/three.module.js';
import {mergeGeometries} from './vendor/three/BufferGeometryUtils.js';
// Allen Hall: photographic proportions, grey masonry, red arcade, hipped roof, square four-face clock tower.
export function createAllenHall(){
 const group=new T.Group(),batches=new Map();
 const grey=architecturalMaterial('brick',0x929994),red=architecturalMaterial('brick',0xb4745d),stone=architecturalMaterial('stone',0xe1d7bf),dark=new T.MeshStandardMaterial({color:0x293c42,roughness:.65}),roof=architecturalMaterial('roof',0x828572);
 function add(g,m,x=0,y=0,z=0,rx=0,ry=0){g.rotateX(rx);g.rotateY(ry);g.translate(x,y,z);const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();if(!batches.has(m))batches.set(m,[]);batches.get(m).push(n);}
 const box=(x,y,z,w,h,d,m=grey)=>add(new T.BoxGeometry(w,h,d),m,x,y,z);
 function arch(x,y,z,r,h,m){const s=new T.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,h);s.absarc(0,h,r,0,Math.PI,false);s.closePath();add(new T.ShapeGeometry(s,20),m,x,y,z);const pts=[];for(let i=0;i<=24;i++){const a=i*Math.PI/24;pts.push(new T.Vector3(r*Math.cos(a),h+r*Math.sin(a),0));}add(new T.TubeGeometry(new T.CatmullRomCurve3(pts),24,.09,5,false),red,x,y,z+.02);box(x-r-.045,y+h/2,z,.12,h,.12,red);box(x+r+.045,y+h/2,z,.12,h,.12,red);}
 // Real central passage: split masonry so the final camera can pass through the entrance.
 for(const side of [-1,1]){box(side*7.85,5,-4,13.3,10,8);box(side*4.1,5,0,5.8,10,1.2,grey);}
 box(0,6.8,-4,2.4,6.4,8);box(0,6.8,0,2.4,6.4,1.2);
 // Enclosed vestibule: the open door must not look straight through the town.
 box(-1.2,1.8,-5,.12,3.6,6,grey);box(1.2,1.8,-5,.12,3.6,6,grey);
 box(0,.32,-1.5,2.4,.14,5,stone);box(0,3.5,-1.5,2.4,.15,5,stone);
 for(let floor=0;floor<3;floor++){const y=floor*3.1+.4;if(floor)box(0,y-.15,.6,29,.22,.35,stone);for(let i=-2;i<=2;i++){const x=i*2.5;if(!floor&&!i)continue;arch(x,y,.66,.95,1.65,dark);box(x,y+1.05,.71,.045,2.1,.06,stone);if(floor){box(x,y+.2,.9,2,.12,.18,stone);for(let j=-3;j<=3;j++)box(x+j*.26,y+.55,.91,.045,.68,.045,dark);}}
 for(const side of [-1,1])for(let j=0;j<3;j++){const x=side*(8.2+j*2.4);if(j===1&&floor>0)continue;arch(x,y,.08,.55,1.65,dark);box(x,y+.95,.11,.045,1.9,.04,stone);box(x,y+.9,.11,1.05,.045,.04,stone);}}
 for(const side of [-1,1]){const x=side*10.6,y=6.8;add(new T.CircleGeometry(1.45,48),dark,x,y,.1);add(new T.TorusGeometry(1.48,.1,6,48),stone,x,y,.16);for(let i=0;i<12;i++){const a=i*Math.PI/6;const g=new T.BoxGeometry(.04,2.85,.04);g.rotateZ(a);add(g,stone,x,y,.18);}add(new T.TorusGeometry(.52,.04,5,32),stone,x,y,.19);}
 // Complete the south and side elevations; retain the walk-through central passage.
 for(let floor=0;floor<3;floor++){
  const y=.65+floor*3.05;
  for(const x of [-12,-9.5,-7,-4.5,4.5,7,9.5,12]){
   box(x,y+1,-8.045,1.06,1.92,.06,dark);box(x,y+1,-8.09,.06,1.96,.07,stone);box(x,y+.96,-8.09,1.1,.07,.07,stone);
   for(const side of [-1,1])box(x+side*.60,y+1,-8.075,.12,2.15,.14,red);
   box(x,y-.06,-8.13,1.42,.13,.30,stone);box(x,y+2.1,-8.10,1.43,.15,.18,stone);
  }
  for(const side of [-1,1])for(const z of [-1.7,-4,-6.3]){
   box(side*14.52,y+1,z,.06,1.92,1.05,dark);box(side*14.57,y+1,z,.07,1.95,.06,stone);box(side*14.57,y+.96,z,.07,.06,1.1,stone);
   box(side*14.57,y-.06,z,.25,.12,1.42,stone);box(side*14.57,y+2.1,z,.18,.14,1.42,red);
  }
  if(floor)box(0,y-.25,-8.12,29,.18,.28,stone);
 }
 box(-1.22,1.8,-6.1,.16,3.6,4,grey);box(1.22,1.8,-6.1,.16,3.6,4,grey);box(0,3.6,-6.1,2.6,.17,4,stone);
 for(const x of [-1.35,1.35]){box(x,1.8,-8.12,.23,3.6,.28,red);box(x,.2,-8.16,.43,.4,.4,stone);}box(0,3.52,-8.12,2.9,.22,.3,stone);
 group.userData.completeRearElevation=true;
 // Horizontal brick joints are actual fine geometry, merged into one material draw call.
 for(let i=0;i<54;i++){const y=i*.18+.2;if(y<3.6){for(const side of [-1,1])box(side*7.85,y,.023,13.3,.016,.02,stone);}else box(0,y,.023,29,.016,.02,stone);}
 box(0,10.1,-4,30,.25,8.8,stone);
 const verts=[-15,10.22,.7,15,10.22,.7,12,12.1,-4,-12,12.1,-4,-15,10.22,-8.7,15,10.22,-8.7];const rg=new T.BufferGeometry();rg.setAttribute('position',new T.Float32BufferAttribute(verts,3));rg.setIndex([0,1,2,0,2,3,4,3,2,4,2,5,0,3,4,1,5,2]);rg.computeVertexNormals();rg.setAttribute('uv',new T.Float32BufferAttribute(new Array(12).fill(0),2));add(rg,roof);
 box(0,13.6,-4,3.6,7.2,3.6,grey);for(const y of [10.9,12.3,16.9,17.3])box(0,y,-4,3.95,.18,3.95,stone);
 for(const x of [-1.65,1.65])for(const z of [-5.65,-2.35])box(x,13.8,z,.28,6.6,.28,red);
 for(let i=-1;i<=1;i++)arch(i*.8,11.3,-2.18,.25,.7,dark);
 const face=document.createElement('canvas');face.width=face.height=512;const c=face.getContext('2d');c.fillStyle='#dfd9c4';c.beginPath();c.arc(256,256,246,0,Math.PI*2);c.fill();c.strokeStyle='#59625f';c.lineWidth=14;c.stroke();c.fillStyle='#293d43';c.beginPath();c.arc(256,256,206,0,Math.PI*2);c.fill();c.strokeStyle='#e6e2c9';for(let i=0;i<60;i++){const a=i*Math.PI/30;c.lineWidth=i%5?2:5;c.beginPath();c.moveTo(256+Math.sin(a)*188,256-Math.cos(a)*188);c.lineTo(256+Math.sin(a)*(i%5?180:168),256-Math.cos(a)*(i%5?180:168));c.stroke();}c.fillStyle='#e6e2c9';c.font='48px serif';c.textAlign='center';c.textBaseline='middle';for(const [n,x,y]of [['12',256,112],['3',405,256],['6',256,400],['9',108,256]])c.fillText(n,x,y);c.lineWidth=10;c.beginPath();c.moveTo(256,256);c.lineTo(177,203);c.moveTo(256,256);c.lineTo(358,198);c.stroke();const clockMap=new T.CanvasTexture(face),clockMat=new T.MeshStandardMaterial({map:clockMap,roughness:.7,transparent:true,alphaTest:.1});
 for(let side=0;side<4;side++){const a=side*Math.PI/2;add(new T.PlaneGeometry(2.55,2.55),clockMat,Math.sin(a)*1.83,14.8,-4+Math.cos(a)*1.83,0,a);}
 box(0,18.6,-4,.035,2.5,.035,dark);add(new T.PlaneGeometry(.65,.4),new T.MeshStandardMaterial({color:0xb33931,side:T.DoubleSide}),.34,19.4,-4);
 for(let i=0;i<4;i++)box(0,.06+i*.09,1.8-i*.28,6-i*.3,.12,1.4,stone);
 // Central door opens, leaving a visible recessed vestibule for the teacher.
 const hinges=[];const wood=architecturalMaterial('wood',0x715442);
 for(const side of [-1,1]){
  box(side*1.28,1.95,.75,.22,3.2,.4,stone);box(side*1.28,.55,.78,.38,.32,.48,stone);
  const hinge=new T.Group();hinge.position.set(side*1.12,.4,.67);
  const leaf=new T.Mesh(new T.BoxGeometry(1.1,2.85,.12),wood);leaf.position.set(-side*.55,1.425,0);hinge.add(leaf);
  for(const y of [.55,1.5,2.35]){const panel=new T.Mesh(new T.BoxGeometry(.78,.62,.045),wood);panel.position.set(-side*.55,y,.085);hinge.add(panel);}
  const handle=new T.Mesh(new T.CylinderGeometry(.025,.025,.22,10),stone);handle.position.set(-side*.95,1.35,.17);hinge.add(handle);group.add(hinge);hinges.push({hinge,side});
 }
 box(0,3.42,.78,2.9,.24,.48,stone);box(0,3.65,.77,3.12,.13,.6,red);
 for(const [material,parts]of batches){const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());const mesh=new T.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
 finishArchitecture(group);
 return {group,open(p){for(const {hinge,side}of hinges)hinge.rotation.y=side*p*1.65;}};
}
