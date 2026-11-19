const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/assets/arrival/garden-walking-paths.json');
 console.log(await page.evaluate(async()=>{
  const T=await import('/vendor/three/three.module.js'),{captureDeparturePose}=await import('/mentor-departure-pose.js?v=1');
  const scene=new T.Scene(),actor=new T.Group(),body=new T.Mesh(new T.BoxGeometry(1,2,1),new T.MeshBasicMaterial());body.position.y=1;actor.add(body);scene.add(actor);actor.userData.body=body;body.userData.owner=actor;
  const pose=captureDeparturePose(actor,null,scene),camera=new T.PerspectiveCamera(48,1,.1,100);camera.position.set(0,1,8);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);pose.update(camera);
  if(scene.children.length!==2||actor.userData.body!==body||body.userData.owner!==actor)throw Error('Visible teacher snapshot or source references lost');
  actor.position.x=20;camera.lookAt(0,1,0);camera.updateMatrixWorld(true);pose.update(camera);if(scene.children.length!==2)throw Error('Departing teacher removed inside frustum');
  camera.lookAt(20,1,8);camera.updateMatrixWorld(true);pose.update(camera);if(scene.children.length!==1)throw Error('Departing teacher retained after leaving frustum');pose.dispose();
  const paths=await(await fetch('/assets/arrival/garden-walking-paths.json')).json(),rows=[];
  for(const [name,path]of Object.entries(paths)){const level=name==='yiyuan'?1:1.65;let length=0,maxStep=0;for(let i=0;i<path.length;i++){if(path[i][1]<level-.16)throw Error(name+' route crosses lower pond surface');if(i){const step=Math.hypot(path[i][0]-path[i-1][0],path[i][2]-path[i-1][2]);maxStep=Math.max(maxStep,step);length+=step;}}if(maxStep>.251)throw Error(name+' route teleports');rows.push({name,length,maxStep});}
  return {departure:'remains until out of view',dryWalking:rows};
 }));
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exit(1)});
