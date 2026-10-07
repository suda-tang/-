import * as THREE from './vendor/three/three.module.js';
export function createMentorChibi(model){
 model.updateMatrixWorld(true);
 // Keep the fitted, skinned face, eyes and mouth. Replace the adult clothing
 // and body with a deliberately stylized silhouette rather than stretching jeans.
 model.traverse(mesh=>{if(!mesh.isMesh)return;if(/casualsuit/i.test(mesh.name)){mesh.visible=false;return;}if(mesh.name==='Human'){const geometry=mesh.geometry.clone(),positions=geometry.attributes.position,indices=geometry.index?.array,kept=[],v=new THREE.Vector3();if(indices){const visible=i=>{v.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);return v.y>.98;};for(let i=0;i<indices.length;i+=3)if(visible(indices[i])&&visible(indices[i+1])&&visible(indices[i+2]))kept.push(indices[i],indices[i+1],indices[i+2]);geometry.setIndex(kept);mesh.geometry=geometry;}}
 if(/ponytail/i.test(mesh.name)){const material=mesh.material.clone();material.color.set('#211e25');material.roughness=.8;mesh.material=material;}});
 const body=new THREE.Group(),blue=new THREE.MeshStandardMaterial({color:'#2579b8',roughness:.72}),skin=new THREE.MeshStandardMaterial({color:'#d4a18c',roughness:.85}),shoe=new THREE.MeshStandardMaterial({color:'#28303e',roughness:.5});
 function ellipsoid(x,y,z,sx,sy,sz,material){const m=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);body.add(m);return m;}
 ellipsoid(0,.82,0,.19,.22,.115,blue);const dress=new THREE.Mesh(new THREE.CylinderGeometry(.15,.245,.43,32),blue);dress.position.set(0,.58,0);body.add(dress);
 for(const sign of [-1,1]){ellipsoid(sign*.205,.76,.015,.065,.16,.065,blue);ellipsoid(sign*.24,.55,.045,.05,.07,.05,skin);ellipsoid(sign*.105,.23,0,.058,.17,.06,skin);ellipsoid(sign*.105,.07,.055,.075,.045,.12,shoe);}
 const pearl=new THREE.MeshStandardMaterial({color:'#f9eee3',roughness:.25});for(let i=0;i<9;i++){const a=Math.PI*(.1+i*.1);ellipsoid(Math.cos(a)*.105,.955-Math.sin(a)*.065,.105,.012,.012,.012,pearl);}
 body.scale.x=.82;body.scale.z=.88;return body;
}
