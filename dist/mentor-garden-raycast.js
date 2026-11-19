import * as T from './vendor/three/three.module.js';

// Raycast nearby instances individually. Three's default instancing raycast
// visits an entire garden batch for each ray, even when the ray is only 4 m long.
const cache=new WeakMap();
export function nearbyGardenSurfaces(root,name,feet,radius=12){
 const result=[];root?.updateWorldMatrix(true,true);
 for(const object of root?.children||[])if(object.visible&&object.name?.startsWith('verified-garden-asset-'+name+'-'))object.traverseVisible(mesh=>{
  if(!mesh.isMesh)return;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();let entry=cache.get(mesh);
  if(!entry||!entry.world.equals(mesh.matrixWorld)||entry.count!==mesh.count){
   const items=[],instance=new T.Matrix4(),count=mesh.isInstancedMesh?mesh.count:1;
   for(let i=0;i<count;i++){
    const matrix=mesh.matrixWorld.clone();if(mesh.isInstancedMesh){mesh.getMatrixAt(i,instance);matrix.multiply(instance);}
    const proxy=new T.Mesh(mesh.geometry,mesh.material);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(matrix);
    items.push({proxy,box:mesh.geometry.boundingBox.clone().applyMatrix4(matrix)});
   }entry={world:mesh.matrixWorld.clone(),count:mesh.count,items};cache.set(mesh,entry);
  }
  for(const item of entry.items)if(item.box.max.y>feet.y+.15&&item.box.distanceToPoint(feet)<radius)result.push(item.proxy);
 });return result;
}
