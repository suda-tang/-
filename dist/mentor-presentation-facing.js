import * as T from './vendor/three/three.module.js';
export function createPresentationFacing(){
 let previousYaw=null;
 return {update(actor,board,camera,{transitioning=false,dt=1/60}={}){
  if(!actor?.visible){previousYaw=null;return;}
  const bearing=Math.atan2(camera.position.x-actor.position.x,camera.position.z-actor.position.z);
  const difference=Math.atan2(Math.sin(actor.rotation.y-bearing),Math.cos(actor.rotation.y-bearing));
  const target=transitioning?bearing:bearing+T.MathUtils.clamp(difference,-.65,.65);
  if(previousYaw===null||transitioning)previousYaw=target;
  else{const delta=Math.atan2(Math.sin(target-previousYaw),Math.cos(target-previousYaw));previousYaw+=delta*(1-Math.exp(-Math.min(.15,dt)*5));}
  actor.rotation.y=previousYaw;
  if(board?.visible)board.rotation.y=Math.atan2(camera.position.x-board.position.x,camera.position.z-board.position.z);
 }};
}
