import {registerSceneObstacles} from './mentor-flight-safety.js?v=flow138';
import * as T from './vendor/three/three.module.js';
import {mergeGeometries} from './vendor/three/BufferGeometryUtils.js';

// Shared willow silhouettes: real leaf surfaces and pendant boughs, not spherical tree crowns.
export function addWatersideWillows(group,sites,{absoluteScale=false}={}){
 const dummy=new T.Object3D(),color=new T.Color(),bark=new T.MeshStandardMaterial({color:0x655b47,roughness:1}),leaves=new T.MeshStandardMaterial({color:0xffffff,roughness:.93,side:T.DoubleSide});
 for(let type=0;type<3;type++){
  const chosen=sites.filter((s,i)=>i%3===type);if(!chosen.length)continue;
  const branches=[],positions=[],uv=[];
  const main=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(.08,.9,0),new T.Vector3(-.04,1.9,.10),new T.Vector3(.18,2.8,0)]);
  branches.push(new T.TubeGeometry(main,9,.085,6,false));
  for(let b=0;b<9;b++){
   const angle=b*Math.PI*2/9+type*.33,reach=1.1+.24*Math.sin(b*1.7+type),cx=Math.cos(angle),cz=Math.sin(angle);
   const crown=new T.Vector3(cx*reach,2.8+.28*Math.sin(b+type),cz*reach),start=new T.Vector3(.04,1.75+b*.065,.03);
   branches.push(new T.TubeGeometry(new T.CatmullRomCurve3([start,start.clone().lerp(crown,.6).add(new T.Vector3(0,.34,0)),crown]),5,.025,4,false));
   for(let strand=0;strand<5;strand++){
    const a=angle+(strand-2)*.15,drop=1.0+.85*(.5+.5*Math.sin(b*2.3+strand+type)),end=crown.clone().add(new T.Vector3(Math.cos(a)*.35,-drop,Math.sin(a)*.35));
    for(let k=0;k<9;k++){
     const t=(k+.3)/9,p=crown.clone().lerp(end,t);p.x+=Math.cos(a)*Math.sin(t*Math.PI)*.22;p.z+=Math.sin(a)*Math.sin(t*Math.PI)*.22;
     const sign=k%2?1:-1,rad=a+sign*.55,side=new T.Vector3(-Math.sin(rad)*.037,0,Math.cos(rad)*.037),tip=p.clone().add(new T.Vector3(Math.cos(rad)*.055,-.19,Math.sin(rad)*.055)),mid=p.clone().lerp(tip,.5),ridge=mid.clone().add(new T.Vector3(0,.012,0));
     const left=mid.clone().add(side),right=mid.clone().sub(side);
     for(const triangle of [[p,left,ridge],[left,tip,ridge],[tip,right,ridge],[right,p,ridge]])for(const v of triangle){positions.push(v.x,v.y,v.z);uv.push(v.x,v.y);}
    }
   }
  }
  const branchGeo=mergeGeometries(branches);branches.forEach(g=>g.dispose());const leafGeo=new T.BufferGeometry();leafGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));leafGeo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));leafGeo.computeVertexNormals();
  const trunkMesh=new T.InstancedMesh(branchGeo,bark,chosen.length),leafMesh=new T.InstancedMesh(leafGeo,leaves,chosen.length);
  trunkMesh.name='waterside-willow-trunks-'+type;leafMesh.name='waterside-willow-leaves-'+type;
  chosen.forEach(([x,z,h,,y=0],i)=>{const scale=absoluteScale?h:.86+h*.23;dummy.position.set(x,y,z);dummy.scale.setScalar(scale);dummy.rotation.set(0,i*2.399+type,0);dummy.updateMatrix();trunkMesh.setMatrixAt(i,dummy.matrix);leafMesh.setMatrixAt(i,dummy.matrix);leafMesh.setColorAt(i,color.setHSL(.235+type*.012,.35,.29+(i%5)*.018));});
  trunkMesh.receiveShadow=true;leafMesh.receiveShadow=true;group.add(trunkMesh,leafMesh);
 }
 // Register the actual replacement crown envelope, including its parent transform.
 let arrival=group;while(arrival.parent&&arrival.name!=='campus-arrival')arrival=arrival.parent;
 group.updateWorldMatrix(true,false);const local=new T.Matrix4().copy(arrival.matrixWorld).invert().multiply(group.matrixWorld),boxes=[];
 for(const [x,z,h,,y=0]of sites){const scale=absoluteScale?h:.86+h*.23;const b=new T.Box3(new T.Vector3(x-1.8*scale,y+1.6*scale,z-1.8*scale),new T.Vector3(x+1.8*scale,y+3.3*scale,z+1.8*scale)).applyMatrix4(local);boxes.push([...b.min.toArray(),...b.max.toArray()]);const trunk=new T.Box3(new T.Vector3(x-.19*scale,y,z-.19*scale),new T.Vector3(x+.19*scale,y+2.4*scale,z+.19*scale)).applyMatrix4(local);boxes.push([...trunk.min.toArray(),...trunk.max.toArray()]);}
 registerSceneObstacles(group.uuid,boxes);group.userData.willows=sites.length;
}
