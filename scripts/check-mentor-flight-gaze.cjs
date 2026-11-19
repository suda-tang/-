const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/assets/arrival/garden-models.json');console.log(await p.evaluate(async()=>{
 const T=await import('/vendor/three/three.module.js'),{sampleChapterFlight}=await import('/mentor-chapter-flight.js?v=36');
 const curve=new T.CatmullRomCurve3([[0,2,0],[0,8,-12],[0,8,-30],[0,2,-42]].map(v=>new T.Vector3(...v))),flight={curve,startDirection:new T.Vector3(0,-.05,-1).normalize(),endDirection:new T.Vector3(0,-.10,-1).normalize(),startDistance:6,endDistance:4,startFov:42,endFov:48};let min=0,max=-Infinity,last=null,maxStep=0;
 for(let i=0;i<=1000;i++){const shot=sampleChapterFlight(flight,i/1000),direction=shot.target.clone().sub(shot.position).normalize(),pitch=Math.asin(direction.y);min=Math.min(min,pitch);max=Math.max(max,pitch);if(last!==null)maxStep=Math.max(maxStep,Math.abs(pitch-last));last=pitch;}
 if(min<-.101||max>-.049||maxStep>.001)throw Error(JSON.stringify({min,max,maxStep}));return {pitchMinimum:min,pitchMaximum:max,maximumPitchStep:maxStep,descendingPathDoesNotTiltGaze:true};
 }));}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
