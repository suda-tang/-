const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/assets/arrival/garden-models.json');console.log(await p.evaluate(async()=>{
 const T=await import('/vendor/three/three.module.js'),{chooseSignPlacement}=await import('/mentor-sign-placement.js?v=local-query114'),{flightSafetyReady}=await import('/mentor-flight-safety.js?v=20');await flightSafetyReady;
 const root=new T.Group(),tile=new T.Group(),camera=new T.PerspectiveCamera(52,390/844,.1,2000);root.position.z=93;tile.name='verified-garden-asset-yiyuan-test';root.add(tile);
 const mesh=new T.InstancedMesh(new T.BoxGeometry(.4,2,.4),new T.MeshBasicMaterial(),10000),m=new T.Matrix4();for(let i=0;i<mesh.count;i++){m.makeTranslation(100+i%100,1,-160-Math.floor(i/100));mesh.setMatrixAt(i,m);}tile.add(mesh);
 let wholeBatchRaycasts=0;mesh.raycast=()=>wholeBatchRaycasts++;const stage=new T.Vector3(1000,1,1000);camera.position.set(1000,2.8,1007);camera.lookAt(stage.clone().add(new T.Vector3(0,1,0)));camera.updateMatrixWorld(true);
 const first=performance.now();let placement=chooseSignPlacement(root,camera,stage,0,9);const buildMs=performance.now()-first,start=performance.now();for(let i=0;i<20;i++)placement=chooseSignPlacement(root,camera,stage,0,9)||placement;const repeatMs=(performance.now()-start)/20;
 if(wholeBatchRaycasts)throw Error('Distant instances were raycast');if(!placement)throw Error('Valid local sign position lost');
 const obstruction=new T.Mesh(new T.BoxGeometry(20,1.5,20),new T.MeshBasicMaterial());obstruction.position.set(1000,.75,907);tile.add(obstruction);for(let i=0;i<20;i++)if(chooseSignPlacement(root,camera,stage,0,9))throw Error('Local obstruction ignored');
 return {wholeBatchRaycasts,buildMs,repeatMs,localObstacleRespected:true,placement:placement.position.toArray()};
 }));}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
