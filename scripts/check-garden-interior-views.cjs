const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1100,height:800}});page.on('pageerror',e=>console.error(e));
 await page.goto('http://127.0.0.1:5173/assets/arrival/garden-walking-paths.json');
 await page.evaluate(async()=>{
  const T=await import('/vendor/three/three.module.js'),{createGardenAssetStream}=await import('/mentor-garden-asset-stream.js?v=29'),{gardenView}=await import('/mentor-garden-view.js?v=9'),nav=await import('/mentor-flight-safety.js?v=20');await nav.flightSafetyReady;
  document.body.replaceChildren();document.body.style.margin='0';const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1100,800);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0xb9ccd0);scene.add(new T.HemisphereLight(0xffffff,0x71806a,2));const sun=new T.DirectionalLight(0xffefda,2);sun.position.set(20,40,20);scene.add(sun);
  const root=new T.Group();root.position.z=93;scene.add(root);const camera=new T.PerspectiveCamera(48,1100/800,.05,800),abort=new AbortController(),stream=createGardenAssetStream(root,abort.signal),paths=await(await fetch('/assets/arrival/garden-walking-paths.json')).json();stream.setRenderer(renderer);
  const marker=new T.Mesh(new T.CapsuleGeometry(.22,.9,4,8),new T.MeshStandardMaterial({color:0xb33665}));scene.add(marker);
  window.fixture={T,root,camera,renderer,scene,stream,paths,marker,gardenView,nav};
 });
 for(const name of ['yiyuan','zhuozhengyuan'])for(const fraction of [0,.25,.5,.75]){
  console.log(name,fraction,await page.evaluate(async({name,fraction})=>{const f=window.fixture,p=f.paths[name][Math.round((f.paths[name].length-1)*fraction)],feet=new f.T.Vector3(p[0],p[1],p[2]+93),v=f.gardenView(name,feet,fraction*120);f.camera.position.copy(v.position);f.camera.lookAt(v.target);f.marker.position.copy(feet).add(new f.T.Vector3(0,.7,0));f.stream.focus(name,p);for(let i=0;i<14;i++){await f.stream.update(f.camera,performance.now()+i*300);await new Promise(r=>setTimeout(r,50));}f.root.updateMatrixWorld(true);f.renderer.render(f.scene,f.camera);return {feet:feet.toArray(),camera:f.camera.position.toArray(),blocked:f.nav.cameraBlocked(f.camera.position),tiles:f.root.userData.gardenAssetStats,error:f.root.userData.gardenAssetError}}, {name,fraction}));
  await page.screenshot({path:'.sites-runtime/garden-model-research/'+name+'-interior-'+fraction+'.png'});
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
