const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/assets/arrival/garden-tour-rails.json');console.log(await p.evaluate(async()=>{
 const T=await import('/vendor/three/three.module.js'),nav=await import('/mentor-flight-safety.js?v=20'),{computeFlightPoints}=await import('/mentor-flight-plan.js?v=real-transition112'),{loadOldCity}=await import('/mentor-old-city.js?v=52');
 await nav.flightSafetyReady;const abort=new AbortController(),root=new T.Group();root.name='campus-arrival';await loadOldCity(root,abort.signal);await new Promise(r=>setTimeout(r,1500));
 const rails=await fetch('/assets/arrival/garden-tour-rails.json').then(r=>r.json()),world=p=>[p[0],p[1],p[2]+93],a=rails.yiyuan,b=rails.zhuozhengyuan;
 const data={start:world(a.camera.at(-1)),target:world(a.walk.at(-1)),destination:world(b.camera[0]),destinationTarget:world(b.walk[0])};data.target[1]+=1.15;data.destinationTarget[1]+=1.15;
 const points=await computeFlightPoints(data);let hits=0;nav.withWalkingClearance(()=>{for(let i=1;i<points.length;i++)if(!nav.clearCameraSegment(new T.Vector3(...points[i-1]),new T.Vector3(...points[i])))hits++;});
 const startJump=new T.Vector3(...points[0]).distanceTo(new T.Vector3(...data.start)),endJump=new T.Vector3(...points.at(-1)).distanceTo(new T.Vector3(...data.destination));abort.abort();if(hits||startJump>.01||endJump>.01)throw Error(JSON.stringify({hits,startJump,endJump}));return {points:points.length,hits,startJump,endJump,start:data.start,end:data.destination};
 }));}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
