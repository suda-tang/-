import {waterTownFeatures} from './mentor-water-town-district.js?v=2';
import {addWatersideWillows} from './mentor-waterside-willows.js?v=12';
import {createCanalWater} from './mentor-canal-water.js?v=1';
import {insideGarden,outsideSiteSegments,outsideSiteWaterPolygons} from './mentor-scene-sites.js?v=1';
import {createWaterTownLots} from './mentor-water-town-layout.js?v=8';
import {createGardenNeighborhood} from './mentor-garden-neighborhood.js?v=22';
import {addWaterTownDetails} from './mentor-water-town.js?v=16';
import * as T from './vendor/three/three.module.js';
import {landmarkLocations} from './mentor-narrated-landmarks.js?v=3';
export function buildingHeight(tags){
 const explicit=parseFloat(String(tags.height||'').replace(',','.')),levels=parseFloat(tags['building:levels']);
 if(Number.isFinite(explicit)&&explicit>0&&explicit<300)return {height:explicit*.4,source:'mapped-height'};
 if(Number.isFinite(levels)&&levels>0&&levels<80)return {height:levels*1.2,source:'mapped-levels'};
 return {height:2.4,source:'inferred'};
}
export async function loadOldCity(root,signal,onAsset){
 const features=waterTownFeatures();if(signal.aborted)return;
 const group=new T.Group();group.name='suzhou-old-city';root.add(group);const project=point=>point;const blocks=[],rivers=[],waterPolygons=[];
 let count=0;for(const f of features){if(++count%250===0){await new Promise(r=>setTimeout(r,0));if(signal.aborted)return;}const pts=f.points.map(project);if(f.tags.building){const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),x=Math.min(...xs),z=Math.min(...zs),w=Math.max(...xs)-x,d=Math.max(...zs)-z;const campusOverlap=x<20&&x+w>-20&&z<20&&z+d>-140;const gardenOverlap=(Math.abs(x+w/2+80)<43+w/2&&Math.abs(z+d/2+160)<28+d/2)||(Math.abs(x+w/2+75)<77+w/2&&Math.abs(z+d/2+242)<46+d/2);if(!campusOverlap&&!gardenOverlap&&w>.15&&d>.15)blocks.push([x+w/2,z+d/2,w,d,buildingHeight(f.tags).height,0,pts]);}else if(f.tags.waterway){const width=Math.max(2.2,Math.min(7,Number(f.tags.width||8)*.2));for(let i=1;i<pts.length;i++)for(const [a,b]of outsideSiteSegments(pts[i-1],pts[i],width)){const len=Math.hypot(b[0]-a[0],b[1]-a[1]);rivers.push([(a[0]+b[0])/2,(a[1]+b[1])/2,len,Math.atan2(b[0]-a[0],b[1]-a[1]),width]);}}}

 for(const f of features)if(f.tags.natural==='water'&&f.points.length>3){
  const points=f.points.map(project),shape=new T.Shape(points.map(([x,z])=>new T.Vector2(x,z))),geo=new T.ShapeGeometry(shape),flat=geo.index?geo.toNonIndexed():geo,pos=flat.attributes.position;
  for(let i=0;i<pos.count;i+=3){const xs=[pos.getX(i),pos.getX(i+1),pos.getX(i+2)],zs=[pos.getY(i),pos.getY(i+1),pos.getY(i+2)];
   for(const polygon of outsideSiteWaterPolygons(xs.map((x,j)=>[x,zs[j]])))for(let k=1;k<polygon.length-1;k++)for(const [x,z]of [polygon[0],polygon[k],polygon[k+1]])waterPolygons.push(x,-.012,z);

  }if(flat!==geo)flat.dispose();geo.dispose();
 }
 if(waterPolygons.length){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(waterPolygons,3));geo.computeVertexNormals();group.add(new T.Mesh(geo,new T.MeshStandardMaterial({color:0x637e70,roughness:.4,metalness:.1,side:T.DoubleSide})));}
 // Supplement the surveyed centre with irregular neighbourhoods following nearby waterways.
 // A fixed seed keeps geometry stable while avoiding a rectangular roof lattice.
 let seed=31729;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const cells=new Map(),waterCells=new Map(),cell=8;
 const key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
 const register=b=>{const k=key(b[0],b[1]);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(b);};blocks.forEach(register);
 for(const r of rivers){const [x,z,len,angle,width]=r,dx=Math.sin(angle)*len/2,dz=Math.cos(angle)*len/2;
  for(let i=Math.floor((x-Math.abs(dx)-width-4)/cell);i<=Math.floor((x+Math.abs(dx)+width+4)/cell);i++)for(let j=Math.floor((z-Math.abs(dz)-width-4)/cell);j<=Math.floor((z+Math.abs(dz)+width+4)/cell);j++){const k=`${i},${j}`;if(!waterCells.has(k))waterCells.set(k,[]);waterCells.get(k).push(r);}
 }
 // Footprints are taken from the geographic dataset; no random buildings are scattered into gaps.
 group.userData.heightEvidence={mappedHeight:features.filter(f=>f.tags.building&&buildingHeight(f.tags).source==='mapped-height').length,mappedLevels:features.filter(f=>f.tags.building&&buildingHeight(f.tags).source==='mapped-levels').length};
 group.userData.layoutBasis={buildings:'original-garden-components-on-mapped-and-composed-riverbank-lots',water:'photo-informed-compact-canal-streets',vegetation:'inferred-riverbank',exactReplica:false};
 const dummy=new T.Object3D(),canalWater=createCanalWater();const water=new T.InstancedMesh(new T.BoxGeometry(1,.025,1),canalWater.material,rivers.length);rivers.forEach(([x,z,len,angle,width],i)=>{dummy.position.set(x,-.015,z);dummy.scale.set(width,1,len);dummy.rotation.set(0,angle,0);dummy.updateMatrix();water.setMatrixAt(i,dummy.matrix);});group.add(water);
 const compounds=createWaterTownLots(blocks,rivers);cells.clear();compounds.forEach(register);
 const neighborhood=createGardenNeighborhood(group,compounds,rivers,signal,onAsset);
 group.userData.surveyedDetailedBuildings=compounds.length;
 // Trees follow riverbanks and gaps in neighbourhoods, with three silhouettes and per-tree colours.
 const treeSites=[],activeLandmarkSites=[landmarkLocations[3],landmarkLocations[4],landmarkLocations[5]];
 for(let i=0;i<7000;i++){
  const x=(random()-.5)*820,z=-100+(random()-.5)*700;
  if((x>-28&&x<28&&z>-145&&z<30)||insideGarden(x,z,1.5))continue;
  const edge=Math.max(Math.abs(x)/(335+55*Math.sin(z*.014)),Math.abs(z+100)/(290+45*Math.sin(x*.016)));if(edge>1.12)continue;
  if(activeLandmarkSites.some(([lx,lz])=>Math.abs(x-lx)<13&&z>lz-3&&z<lz+34))continue;
  const cx=Math.floor(x/cell),cz=Math.floor(z/cell);let collision=false;
  for(let a=-1;a<=1&&!collision;a++)for(let b=-1;b<=1&&!collision;b++)for(const house of cells.get(`${cx+a},${cz+b}`)||[])if(Math.abs(house[0]-x)<house[2]/2+1&&Math.abs(house[1]-z)<house[3]/2+1){collision=true;break;}
  if(collision)continue;
  let nearest=Infinity;for(const [rx,rz,len,angle,width]of waterCells.get(key(x,z))||[]){const dx=Math.sin(angle),dz=Math.cos(angle),along=Math.max(-len/2,Math.min(len/2,(x-rx)*dx+(z-rz)*dz));nearest=Math.min(nearest,Math.hypot(x-rx-dx*along,z-rz-dz*along)-width/2);}
  if(nearest<1||nearest>9||random()>.54)continue;
  treeSites.push([x,z,.75+random()*.8,Math.floor(random()*3)]);
 }
 addWatersideWillows(group,treeSites);
 group.userData.trees=treeSites.length;
 await addWaterTownDetails(group,rivers,signal);if(signal.aborted)return;group.userData.features=features.length;group.userData.houses=compounds.length;group.userData.updateView=(camera,now)=>{canalWater.update(now);neighborhood.update(camera,now);};group.userData.disposeDetail=()=>neighborhood.dispose();return group;
}


