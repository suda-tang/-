import * as T from './vendor/three/three.module.js';

// Freeze only transforms. Geometry and materials stay shared with the live avatar.
export function captureDeparturePose(actor,shadow,scene){
 if(!actor?.visible)return null;const data=[];actor.updateWorldMatrix(true,true);
 actor.traverse(o=>{data.push([o,o.userData]);o.userData={};});let copy;
 try{copy=actor.clone(true);}finally{for(const [o,value]of data)o.userData=value;}
 // Skinned characters need their own bone references in the frozen pose.
 const nodes=new Map();function pair(a,b){nodes.set(a,b);for(let i=0;i<a.children.length;i++)pair(a.children[i],b.children[i]);}pair(actor,copy);
 actor.traverse(source=>{if(!source.isSkinnedMesh)return;const target=nodes.get(source);target.skeleton=source.skeleton.clone();target.skeleton.bones=source.skeleton.bones.map(b=>nodes.get(b)||b);target.bindMatrix.copy(source.bindMatrix);target.bindMatrixInverse.copy(source.bindMatrixInverse);});
 actor.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);copy.name='mentor-departure-pose';copy.visible=true;scene.add(copy);copy.updateMatrixWorld(true);
 let shade;if(shadow?.visible){shade=new T.Mesh(shadow.geometry,shadow.material);shadow.updateWorldMatrix(true,false);shadow.matrixWorld.decompose(shade.position,shade.quaternion,shade.scale);scene.add(shade);}
 const bounds=new T.Box3().setFromObject(copy),frustum=new T.Frustum(),matrix=new T.Matrix4();let removed=false;
 function remove(){if(removed)return;removed=true;copy.removeFromParent();shade?.removeFromParent();copy.clear();}
 return {copy,update(camera){if(removed)return false;camera.updateMatrixWorld(true);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);if(!frustum.intersectsBox(bounds)){remove();return false;}return true;},dispose:remove};
}
