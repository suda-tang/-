const fs=require('fs');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('console',m=>console.log(m.text()));for(let attempt=0;attempt<5;attempt++){try{await page.goto('http://127.0.0.1:5173/assets/arrival/garden-walking-corridors.json');break;}catch(error){if(attempt===4)throw error;await new Promise(r=>setTimeout(r,2000));}}
 const data=await page.evaluate(async()=>{
  const T=await import('/vendor/three/three.module.js'),navigation=await import('/mentor-flight-safety.js?v=19'),{nearbyGardenSurfaces}=await import('/mentor-garden-raycast.js?v=1'),{createGardenAssetStream}=await import('/mentor-garden-asset-stream.js?v=26');
  const nav={...navigation,cameraBlocked:p=>navigation.withWalkingClearance(()=>navigation.cameraBlocked(p)),clearCameraSegment:(a,b)=>navigation.withWalkingClearance(()=>navigation.clearCameraSegment(a,b))};await nav.flightSafetyReady;
  const scene=new T.Scene(),root=new T.Group();root.name='campus-arrival';root.position.z=93;scene.add(root);const abort=new AbortController(),stream=createGardenAssetStream(root,abort.signal),camera=new T.PerspectiveCamera(52,390/844,.025,700),paths=await(await fetch('/assets/arrival/garden-walking-corridors.json')).json(),result={};
  for(const [name,corridor]of Object.entries(paths)){
   stream.focus(name,corridor[0]);camera.position.set(corridor[0][0],corridor[0][1]+2,corridor[0][2]+98);camera.lookAt(corridor[0][0],corridor[0][1]+1,corridor[0][2]+93);
   for(let i=0;i<12;i++){await stream.update(camera,performance.now()+i*1000);await new Promise(r=>setTimeout(r,60));}
   const path=corridor.slice(0,-41),raw=[],sourceSets=[],ray=new T.Raycaster(),alphaCache=new WeakMap();let previous=null,blocked=0,activeRoute=null,activeDistance=0;
   const feetAt=i=>new T.Vector3(corridor[i][0],corridor[i][1],corridor[i][2]+93);
   function opaque(hit){const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;if(!m)return true;if(m.opacity<.2)return false;const map=m.map;if(!map||!hit.uv||(!m.transparent&&!m.alphaTest))return true;
    let data=alphaCache.get(map);if(!data){const image=map.image,c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);data={pixels:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};alphaCache.set(map,data);}
    const uv=map.transformUv(hit.uv.clone()),x=Math.min(data.width-1,Math.max(0,Math.floor(uv.x*data.width))),y=Math.min(data.height-1,Math.max(0,Math.floor(uv.y*data.height))),alpha=data.pixels[(y*data.width+x)*4+3]/255*m.opacity;return alpha>=Math.max(.25,m.alphaTest||0);
   }
   function visible(position,feet,meshes){for(const y of [1.05,1.5]){const target=feet.clone().add(new T.Vector3(0,y,0));ray.set(position,target.clone().sub(position).normalize());ray.far=position.distanceTo(target)-.2;if(ray.intersectObjects(meshes,false).some(opaque))return false;}return true;}
   for(let i=0;i<path.length;i++){
    const feet=feetAt(i),meshes=nearbyGardenSurfaces(root,name,feet),candidates=[];sourceSets.push(meshes);
    const advances=name==='zhuozhengyuan'?[-40,-30,-22,40,22]:[40,30,22,48];
    for(const advance of advances){const j=Math.max(0,Math.min(corridor.length-1,i+advance)),p=feetAt(j),dir=feetAt(Math.min(corridor.length-1,j+1)).sub(feetAt(Math.max(0,j-1)));dir.y=0;dir.normalize();if(i+advance<0)p.addScaledVector(dir,(i+advance)*.08);const right=new T.Vector3(dir.z,0,-dir.x);
     for(const side of [0,.35,-.35,.7,-.7,1.4,-1.4,2.2,-2.2,3.2,-3.2])for(const h of [1.55,1.2,1,1.9,2.4,2.9]){const position=p.clone().addScaledVector(right,side);position.y+=h;if((i===0?navigation:nav).cameraBlocked(position))continue;
      candidates.push({position,score:(previous?position.distanceToSquared(previous):0)+Math.abs(side)*2+Math.abs(advance-(name==='zhuozhengyuan'?-40:40))*.025+Math.abs(h-1.55)*.7});
     }
    }
    candidates.sort((a,b)=>a.score-b.score);let selected=null;
    if(activeRoute){activeDistance=Math.min(activeRoute.getLength(),activeDistance+.16);const p=activeRoute.getPointAt(activeDistance/Math.max(.001,activeRoute.getLength()));if(!previous||nav.clearCameraSegment(previous,p))selected=p;else activeRoute=null;if(activeDistance>=activeRoute?.getLength()-.001)activeRoute=null;}
    if(!selected)for(const c of candidates)if((!previous||nav.clearCameraSegment(previous,c.position))&&visible(c.position,feet,meshes)){selected=c.position;break;}
    if(!selected&&previous){let tried=0;for(const c of candidates){if(!visible(c.position,feet,meshes))continue;if(++tried>2)break;const route=navigation.withWalkingClearance(()=>navigation.safeFlightCurve(new T.LineCurve3(previous,c.position),previous,c.position));if(route.getLength()>14||route.getPointAt(1).distanceTo(c.position)>.1)continue;let level=true;for(let k=0;k<=40;k++){const p=route.getPointAt(k/40);if(p.y>feet.y+3.3||p.y<feet.y+.8)level=false;}if(!level)continue;activeRoute=route;activeDistance=Math.min(.16,route.getLength());selected=route.getPointAt(activeDistance/Math.max(.001,route.getLength()));break;}}
    if(!selected){blocked++;selected=previous?.clone()||candidates[0]?.position;if(!selected)throw Error(name+' no initial camera');}
    raw.push(selected);previous=selected;if(i%40===0)console.log(name,'camera',i,'/',path.length,'blocked',blocked,'options',candidates.length,'position',selected.toArray());
   }
   // Correct a brief occluded pose using a nearby clear pose before smoothing.
   // This brings the camera around a tree slightly earlier in the choreography.
   const initiallyClear=[];
   for(let i=1;i<raw.length-1;i++)if(!(initiallyClear[i]=visible(raw[i],feetAt(i),sourceSets[i]))){
    let fixed=false;for(const offset of [2,-2,4,-4,8,-8,12,-12]){const j=Math.max(0,Math.min(raw.length-1,i+offset));for(const blend of [.5,1]){const p=raw[i].clone().lerp(raw[j],blend);if(nav.clearCameraSegment(raw[i-1],p)&&nav.clearCameraSegment(p,raw[i+1])&&visible(p,feetAt(i),sourceSets[i])){raw[i]=p;fixed=true;initiallyClear[i]=true;break;}}if(fixed)break;}
   }
   for(let pass=0;pass<8;pass++)for(let i=1;i<raw.length-1;i++){
    const p=raw[i-1].clone().addScaledVector(raw[i],2).add(raw[i+1]).multiplyScalar(.25);
    if(nav.clearCameraSegment(raw[i-1],p)&&nav.clearCameraSegment(p,raw[i+1])&&(p.distanceToSquared(raw[i])<.0001||!initiallyClear[i]||visible(p,feetAt(i),sourceSets[i])))raw[i]=p;
   }
   const tangents=raw.map((p,i)=>raw[Math.min(raw.length-1,i+1)].clone().sub(raw[Math.max(0,i-1)]).multiplyScalar(i===0||i===raw.length-1?1:.5));
   function at(i,t){const a=raw[i],b=raw[i+1],u=t*t,v=u*t;return a.clone().multiplyScalar(2*v-3*u+1).addScaledVector(tangents[i],v-2*u+t).addScaledVector(b,-2*v+3*u).addScaledVector(tangents[i+1],v-u);}
   for(let pass=0;pass<12;pass++)for(let i=0;i<raw.length-1;i++){
    let prior=raw[i],safe=true;for(let k=1;k<=12;k++){const p=at(i,k/12);if(!nav.clearCameraSegment(prior,p)){safe=false;break;}prior=p;}
    if(!safe){tangents[i].set(0,0,0);tangents[i+1].set(0,0,0);}
   }
   let hits=0,hidden=0;for(let i=0;i<raw.length-1;i++){let prior=raw[i];for(let k=1;k<=12;k++){const p=at(i,k/12);if(!nav.clearCameraSegment(prior,p))hits++;prior=p;}if(i%6===0&&!visible(raw[i],feetAt(i),nearbyGardenSurfaces(root,name,feetAt(i))))hidden++;}
   if(hits){const bad=[];for(let i=0;i<raw.length-1;i++)if(!nav.clearCameraSegment(raw[i],raw[i+1]))bad.push({i,a:raw[i].toArray(),b:raw[i+1].toArray(),blocked:[nav.cameraBlocked(raw[i]),nav.cameraBlocked(raw[i+1])]});console.log('collision details',JSON.stringify(bad));throw Error(name+' camera spline collision count '+hits);}
   result[name]={walk:path,camera:raw.map(p=>[p.x,p.y,p.z-93].map(v=>+v.toFixed(9))),tangents:tangents.map(p=>p.toArray().map(v=>+v.toFixed(9)))};
   console.log(name,'complete',{samples:path.length,blocked,hiddenChecks:hidden});
  }abort.abort();return result;
 });
 require('./orient-garden-frontal.cjs').orient(data);require('./retime-garden-rails.cjs').retime(data);fs.writeFileSync('dist/assets/arrival/garden-tour-rails.json',JSON.stringify(data));fs.writeFileSync('dist/assets/arrival/garden-walking-paths.json',JSON.stringify(Object.fromEntries(Object.entries(data).map(([n,v])=>[n,v.walk]))));fs.writeFileSync('dist/mentor-garden-stations.js','export const gardenStations='+JSON.stringify(Object.fromEntries(Object.entries(data).map(([n,r])=>[n,[...r.walk[0],0]])))+';\n');console.log('Garden camera rails written');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
