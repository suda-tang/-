import * as T from './vendor/three/three.module.js';
import {mergeGeometries} from './vendor/three/BufferGeometryUtils.js';
import {architecturalMaterial,finishArchitecture} from './mentor-architecture-surfaces.js?v=1';
// Detail is additive: the city silhouette stays stable while camera-visible masonry is streamed.
export function createCityDetailStream(city,blocks,signal){
 const size=24,cells=new Map(),live=new Map(),frustum=new T.Frustum(),matrix=new T.Matrix4(),eye=new T.Vector3(),lastEye=new T.Vector3(),direction=new T.Vector3(),materials={plaster:architecturalMaterial('plaster',0xdedbcf),wood:architecturalMaterial('wood',0x635043),stone:architecturalMaterial('stone',0xbcb5a2),tile:architecturalMaterial('roof',0x666963)},dummy=new T.Object3D();
 const sharedTile=new T.CylinderGeometry(1,1,1,12,1,false,0,Math.PI);sharedTile.rotateX(Math.PI/2);sharedTile.userData.cityShared=true;
 // Four reusable timber facade assemblies: slatted shutters, lattice, panelled doors and fanlight.
 const facadeParts=[];
 for(let variant=0;variant<4;variant++){
  const parts=[],piece=(x,y,w,h,depth=.05)=>{const g=new T.BoxGeometry(w,h,depth);g.translate(x,y,0);parts.push(g);};
  for(const side of [-1,1]){piece(side*.5,0,.065,1.12,.10);piece(0,side*.54,1.1,.065,.10);}
  if(variant===0){for(let k=-4;k<=4;k++)piece(k*.105,0,.035,.98);for(const y of [-.3,0,.3])piece(0,y,1,.025);}
  if(variant===1){for(let k=-3;k<=3;k++){piece(k*.14,0,.023,1);piece(0,k*.14,1,.023);}}
  if(variant===2){piece(0,0,.035,1,.09);for(const x of [-.25,.25])for(const y of [-.3,0,.3]){piece(x,y-.11,.39,.035,.08);piece(x,y+.11,.39,.035,.08);piece(x-.18,y,.03,.22,.08);piece(x+.18,y,.03,.22,.08);}}
  if(variant===3){for(let k=-3;k<=3;k++){const g=new T.BoxGeometry(.022,.72,.05);g.rotateZ(Math.PI/4);g.translate(k*.14,0,0);parts.push(g);}piece(0,-.24,1,.04);}
  const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());geo.userData.cityShared=true;facadeParts.push(geo);
 }
 let desired=new Set();let stopped=false,lastScan=-Infinity,generation=0,pending=false;const stats={loaded:0,created:0,released:0,pending:0};city.userData.detailStream=stats;
 blocks.forEach((b,i)=>{const key=Math.floor(b[0]/size)+','+Math.floor(b[1]/size);if(!cells.has(key))cells.set(key,[]);cells.get(key).push({b,i});});
 function release(chunk){chunk.group.removeFromParent();chunk.group.traverse(o=>(!o.geometry?.userData.cityShared)&&o.geometry?.dispose());stats.released++;}
 async function build(key,items,token){
  const group=new T.Group();group.name='visible-water-town-detail-'+key;const batches=new Map();let tiles=[];const facadeInstances=[[],[],[],[]];
  const put=(geo,kind,x,y,z,angle)=>{geo.rotateY(angle);geo.translate(x,y,z);const g=geo.index?geo.toNonIndexed():geo;if(g!==geo)geo.dispose();if(!batches.has(kind))batches.set(kind,[]);batches.get(kind).push(g);};
  const ordered=items.filter(({b:[x,z,w,d,h]})=>frustum.intersectsSphere(new T.Sphere(city.localToWorld(new T.Vector3(x,h/2,z)),Math.hypot(w,d,h)/2))).sort((a,b)=>Math.hypot(a.b[0]-eye.x,a.b[1]-eye.z)-Math.hypot(b.b[0]-eye.x,b.b[1]-eye.z)).slice(0,12);
  for(let n=0;n<ordered.length;n++){
   const {b:[x,z,w,d,h,angle=0],i}=ordered[n];if(w<.6||d<.6||w>20||d>20)continue;
   const box=(lx,y,lz,bw,bh,bd,kind)=>put(new T.BoxGeometry(bw,bh,bd),kind,x+Math.cos(angle)*lx+Math.sin(angle)*lz,y,z-Math.sin(angle)*lx+Math.cos(angle)*lz,angle);
   for(const face of [0,1,2,3]){const a=angle+face*Math.PI/2,span=face%2?d:w,depth=face%2?w:d;for(const side of [-1,1]){const xx=side*span*.28,zz=depth/2+.10;facadeInstances[(i+face)%2].push([x+Math.cos(a)*xx+Math.sin(a)*zz,h*.62,z-Math.sin(a)*xx+Math.cos(a)*zz,a,Math.min(.65,span*.24),Math.min(.72,h*.30)]);}if(face===0||face===2)facadeInstances[2+i%2].push([x+Math.sin(a)*(depth/2+.1),h*.28,z+Math.cos(a)*(depth/2+.1),a,Math.min(.62,span*.30),h*.54]);}
   // Window reveals, slender lattice bars, sill, door frame and eave brackets on both elevations.
   for(const side of [-1,1]){
    const front=side*(d/2+.045);
    for(const wx of [-w*.28,w*.28]){
     const ww=Math.min(.58,w*.24),wh=Math.min(.65,h*.29),y=h*.62;
     for(const sign of [-1,1]){box(wx+sign*ww/2,y,front,.055,wh+.09,.075,'wood');box(wx,y+sign*wh/2,front,ww+.08,.055,.075,'wood');}
     for(let k=-2;k<=2;k++)box(wx+k*ww/6,y,front,.018,wh,.035,'wood');box(wx,y,front,ww,.022,.04,'wood');box(wx,y-wh/2-.045,front+.015*side,ww+.15,.07,.16,'stone');
    }
    for(const sign of [-1,1])box(sign*Math.min(.24,w*.13),h*.27,front,.065,h*.54,.08,'wood');box(0,h*.55,front,Math.min(.62,w*.4),.075,.14,'wood');
    const count=Math.max(2,Math.floor(w/.45));for(let k=0;k<count;k++)box(-w/2+(k+.5)*w/count,h-.08,side*d*.53,.06,.18,.23,'wood');
   }
   // Side elevations receive timber lattices and stone plinths, not blank end walls.
   for(const side of [-1,1]){
    box(side*(w/2+.025),.12,0,.08,.24,d,'stone');
    for(const zz of [-d*.25,d*.25]){
     const wh=Math.min(.62,h*.3),ww=Math.min(.55,d*.23),yy=h*.6;
     for(const sign of [-1,1]){box(side*(w/2+.05),yy+sign*wh/2,zz,.09,.055,ww+.08,'wood');box(side*(w/2+.05),yy,zz+sign*ww/2,.09,wh,.055,'wood');}
     for(let k=-1;k<=1;k++)box(side*(w/2+.06),yy,zz+k*ww/4,.055,wh,.018,'wood');
    }
   }
   // Garden hall frontage: slender columns, continuous sill and timber lintel beneath the tiled eaves.
   const columns=Math.max(2,Math.min(6,Math.round(w/.8)));
   for(const side of [-1,1]){
    box(0,.08,side*(d/2+.14),w+.18,.16,.46,'stone');
    box(0,h-.17,side*(d/2+.13),w+.12,.14,.14,'wood');
    for(let k=0;k<=columns;k++){const xx=-w*.47+k*w*.94/columns;box(xx,h*.47,side*(d/2+.13),.065,h*.88,.065,'wood');box(xx,.19,side*(d/2+.13),.13,.19,.13,'stone');}
   }
   if(i%4===0&&w>1.8){
    const wall=new T.Shape();wall.moveTo(-w/2,0);wall.lineTo(w/2,0);wall.lineTo(w/2,1.05);wall.lineTo(-w/2,1.05);wall.closePath();
    const opening=new T.Path();opening.absarc(0,.51,.43,0,Math.PI*2,true);wall.holes.push(opening);
    put(new T.ExtrudeGeometry(wall,{depth:.10,bevelEnabled:false,curveSegments:32}),'plaster',x+Math.sin(angle)*(d/2+.62),0,z+Math.cos(angle)*(d/2+.62),angle);
    box(0,1.08,d/2+.67,w+.1,.09,.22,'tile');
   }
   // Individual curved tile courses, matching the three original roof profiles and ridge height.
   const rh=.45+(i%5)*.09,across=Math.min(24,Math.max(4,Math.ceil(w/.18))),along=Math.min(32,Math.max(4,Math.ceil(d/.23)));
   for(let a=0;a<=across;a++)for(let r=0;r<along;r++){
    const lx=-w*.55+a*w*1.1/across,lz=-d*.55+(r+.5)*d*1.1/along,type=i%3;
    const rise=type===2?(1-(lz/d+.55)/1.1)*.75:type===1?Math.max(0,Math.min(1-Math.abs(lx)/(w*.56),1-(Math.abs(lz)/d-.28)/.28)):Math.max(0,1-Math.abs(lx)/(w*.56));
    tiles.push([x+Math.cos(angle)*lx+Math.sin(angle)*lz,h+rh*rise+.018,z-Math.sin(angle)*lx+Math.cos(angle)*lz,angle,w*1.1/across,d*1.1/along]);
   }
   if(n%2===1)await new Promise(resolve=>setTimeout(resolve,0));if(stopped||token!==generation||signal.aborted){for(const parts of batches.values())parts.forEach(g=>g.dispose());return null;}
  }
  for(const [kind,parts]of batches){const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(geometry)group.add(new T.Mesh(geometry,materials[kind]));}
  for(let v=0;v<4;v++){const items=facadeInstances[v];if(!items.length)continue;const mesh=new T.InstancedMesh(facadeParts[v],materials.wood,items.length);items.forEach(([x,y,z,a,w,h],i)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,a,0);dummy.scale.set(w,h,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.name='reusable-timber-facade-'+v;group.add(mesh);}
  if(tiles.length){const geo=sharedTile;const mesh=new T.InstancedMesh(geo,materials.tile,tiles.length);tiles.forEach(([x,y,z,angle,w,d],i)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(w*.48,w*.25,d*1.08);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.name='individual-curved-roof-tiles';group.add(mesh);}
  finishArchitecture({traverse(fn){group.children.filter(o=>!o.geometry?.userData.cityShared).forEach(fn);}});group.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=false;}});return group;
 }
 function update(camera,now=performance.now()){
  if(stopped||signal.aborted||!city.visible||now-lastScan<300)return;lastScan=now;camera.updateMatrixWorld();city.updateWorldMatrix(true,false);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);eye.copy(camera.position);city.worldToLocal(eye);direction.copy(eye).sub(lastEye).clampLength(0,15);lastEye.copy(eye);const wanted=[];
  for(const [key,items]of cells){const [cx,cz]=key.split(',').map(Number),center=new T.Vector3((cx+.5)*size,1.5,(cz+.5)*size),world=city.localToWorld(center.clone()),dist=eye.distanceTo(center);if(dist>95||camera.position.y-city.position.y>65)continue;if(!frustum.intersectsSphere(new T.Sphere(world,size*.8)))continue;wanted.push({key,items,dist});}
  wanted.sort((a,b)=>a.dist-b.dist);const keep=new Set(wanted.slice(0,10).map(c=>c.key));desired=keep;for(const [key,chunk]of live){if(keep.has(key))chunk.seen=now;if(!keep.has(key)&&(now-chunk.seen>3500||live.size>12)){release(chunk);live.delete(key);}}
  stats.loaded=live.size;if(pending)return;const next=wanted.slice(0,10).find(c=>!live.has(c.key));if(!next)return;pending=true;stats.pending=1;const token=generation;void build(next.key,next.items,token).then(group=>{if(!group)return;if(stopped||token!==generation||!desired.has(next.key)){release({group});return;}city.add(group);live.set(next.key,{group,seen:now});stats.created++;stats.loaded=live.size;}).finally(()=>{pending=false;stats.pending=0;});
 }
 function dispose(){if(stopped)return;stopped=true;generation++;for(const chunk of live.values())release(chunk);live.clear();sharedTile.dispose();facadeParts.forEach(g=>g.dispose());for(const m of Object.values(materials))m.dispose();stats.loaded=0;}
 signal.addEventListener('abort',dispose,{once:true});return {update,dispose};
}
