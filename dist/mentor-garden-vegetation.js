import * as T from './vendor/three/three.module.js';
import {addWatersideWillows} from './mentor-waterside-willows.js?v=12';

// These source components are flat, double-faced tree cut-outs. Their grey reverse
// faces cannot be repaired by tinting the front material alone.
export function repairGardenVegetation(object,garden){
 const groups=new Set(),sites=[],inverse=new T.Matrix4();object.updateWorldMatrix(true,true);inverse.copy(object.matrixWorld).invert();
 object.traverse(o=>{if(!o.isMesh)return;const mats=[o.material].flat();if(garden==='yiyuan'&&mats.some(m=>m?.name==='yiyuan-material-55')){o.visible=false;o.userData.replacedFlatTree=true;}const leaf=mats.some(m=>m?.name===(garden==='zhuozhengyuan'?'zhuozhengyuan-material-146':'yiyuan-material-56'));if(!leaf)return;
  const parent=o.parent,parts=parent?.children||[];
  if(parts.length&&parts.every(p=>p.isMesh)&&parts.every(p=>[p.material].flat().every(m=>{const n=Number(m.name.split('-').at(-1));return garden==='zhuozhengyuan'?n>=143&&n<=150:n===55||n===56;})))groups.add(parent);else groups.add(o);
 });
 for(const group of groups){const parts=group.isMesh?[group]:group.children,count=Math.max(...parts.map(p=>p.isInstancedMesh?p.count:1));
  for(let i=0;i<count;i++){const box=new T.Box3();for(const p of parts){p.geometry.computeBoundingBox();const matrix=inverse.clone().multiply(p.matrixWorld);if(p.isInstancedMesh){if(i>=p.count)continue;const instance=new T.Matrix4();p.getMatrixAt(i,instance);matrix.multiply(instance);}box.union(p.geometry.boundingBox.clone().applyMatrix4(matrix));}
   const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());if(size.y>1&&size.y<20)sites.push([center.x,center.z,Math.min(3.5,size.y/3.15),0,box.min.y]);
  }group.visible=false;group.userData.replacedFlatTree=true;
 }
 if(sites.length){const trees=new T.Group();trees.name='garden-replacement-living-trees';object.add(trees);addWatersideWillows(trees,sites,{absoluteScale:true});}
 object.userData.replacedGreyTrees=sites.length;
}
