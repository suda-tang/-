import * as T from './vendor/three/three.module.js';
export function captureDepartingBoard(board,scene){
 board.updateWorldMatrix(true,true);const copy=board.clone(true),materials=[],textures=[],canvases=[];copy.name='departing-lecture-board';
 copy.position.setFromMatrixPosition(board.matrixWorld);board.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);const base=copy.position.clone();
 copy.traverse(o=>{if(!o.isMesh)return;const clone=m=>{const result=m.clone();materials.push(result);result.transparent=true;result.userData={...result.userData,departureOpacity:m.opacity};if(m.map?.image&&typeof m.map.image.getContext==='function'){const canvas=document.createElement('canvas'),source=m.map.image;canvas.width=source.width;canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);const texture=new T.CanvasTexture(canvas);texture.colorSpace=m.map.colorSpace;result.map=texture;textures.push(texture);canvases.push(canvas);}return result;};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});
 scene.add(copy);let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;copy.removeFromParent();materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());canvases.forEach(c=>{c.width=c.height=0;});};
 return {update(elapsed){if(disposed)return;const p=T.MathUtils.clamp(elapsed/.65,0,1),ease=p*p*p*(p*(p*6-15)+10);copy.position.copy(base);copy.position.y+=3.2*ease;for(const m of materials)m.opacity=m.userData.departureOpacity*(1-ease);if(p===1)dispose();},dispose};
}
