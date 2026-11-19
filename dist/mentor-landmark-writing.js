import * as T from './vendor/three/three.module.js';
const names=['东方之门','拙政园','留园','虎丘塔','北寺塔','山塘街','盘门','东吴大学老校门','苏州大学林堂','怡园'];
export function createLandmarkWriting(root,camera){
 const controller=new AbortController(),canvas=document.createElement('canvas');canvas.width=1024;canvas.height=224;const context=canvas.getContext('2d'),texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const mesh=new T.Group();mesh.name='landmark-grounded-suzhou-sign';mesh.visible=false;root.add(mesh);
 const grain=document.createElement('canvas');grain.width=512;grain.height=128;const gc=grain.getContext('2d');gc.fillStyle='#483025';gc.fillRect(0,0,512,128);
 for(let y=0;y<128;y++){gc.strokeStyle=`rgba(${y%3?151:24},${y%3?101:17},${y%3?63:12},${.10+.14*Math.abs(Math.sin(y*1.7))})`;gc.beginPath();for(let x=0;x<=512;x+=4){const yy=y+Math.sin(x*.018+y*.12)*1.7+Math.sin(x*.052+y)*.45;x?gc.lineTo(x,yy):gc.moveTo(x,yy);}gc.stroke();}
 const woodMap=new T.CanvasTexture(grain);woodMap.colorSpace=T.SRGBColorSpace;woodMap.wrapS=woodMap.wrapT=T.RepeatWrapping;
 const postMap=woodMap.clone();postMap.center.set(.5,.5);postMap.rotation=Math.PI/2;postMap.needsUpdate=true;
 const wood=new T.MeshStandardMaterial({color:0xd3b28b,map:woodMap,bumpMap:woodMap,bumpScale:.012,roughness:.83}),edge=new T.MeshStandardMaterial({color:0x38291e,roughness:.87}),stone=new T.MeshStandardMaterial({color:0x9c9a8e,roughness:1}),bronze=new T.MeshStandardMaterial({color:0x8c7550,roughness:.63,metalness:.6});
 const postWood=wood.clone();postWood.map=postMap;postWood.bumpMap=postMap;
 const put=(geo,mat,x,y,z)=>{const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;mesh.add(o);return o;};
 for(const x of [-1.12,1.12]){put(new T.BoxGeometry(.34,.16,.38),stone,x,.08,0);put(new T.BoxGeometry(.16,1.92,.16),postWood,x,1.05,0);put(new T.BoxGeometry(.25,.075,.25),edge,x,1.99,0);}
 const panel=new T.Shape();panel.moveTo(-1.23,-.4);panel.lineTo(1.23,-.4);panel.quadraticCurveTo(1.29,-.4,1.29,-.34);panel.lineTo(1.29,.34);panel.quadraticCurveTo(1.29,.4,1.23,.4);panel.lineTo(-1.23,.4);panel.quadraticCurveTo(-1.29,.4,-1.29,.34);panel.lineTo(-1.29,-.34);panel.quadraticCurveTo(-1.29,-.4,-1.23,-.4);
 put(new T.ExtrudeGeometry(panel,{depth:.12,bevelEnabled:true,bevelSegments:3,bevelSize:.025,bevelThickness:.02,curveSegments:12}),wood,0,1.42,-.08);
 for(const x of [-1.21,1.21])for(const y of [1.14,1.70])put(new T.SphereGeometry(.025,8,6),bronze,x,y,.07);
 put(new T.BoxGeometry(2.48,.035,.16),edge,0,1.03,0);put(new T.BoxGeometry(2.48,.035,.16),edge,0,1.81,0);
 const material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});const lettering=put(new T.PlaneGeometry(2.23,.49),material,0,1.43,.067);lettering.castShadow=false;
 // Curved protective coping, fixed to the posts rather than facing the camera.
 const roof=new T.Shape();roof.moveTo(-1.48,0);roof.quadraticCurveTo(-.95,-.10,0,.13);roof.quadraticCurveTo(.95,-.10,1.48,0);roof.lineTo(1.48,.07);roof.quadraticCurveTo(.95,-.035,0,.20);roof.quadraticCurveTo(-.95,-.035,-1.48,.07);roof.closePath();
 put(new T.ExtrudeGeometry(roof,{depth:.38,bevelEnabled:true,bevelSegments:2,bevelSize:.015,bevelThickness:.015,curveSegments:24}),edge,0,1.99,-.19);
 let data=null,active=-1,paths=[],total=0,started=0,last=0,lastDraw=-1,painted=-1,disposed=false,baseY=0,raisedAt=0,retired=false;
 function build(){paths=[];total=0;const text=names[active];if(!text||!data)return;const scale=Math.min(.16,940/(text.length*1024)),advance=1024*scale,left=(1024-advance*text.length)/2;
  [...text].forEach((c,i)=>{for(const median of data[c]?.medians||[]){const p=median.map(([x,y])=>[left+i*advance+x*scale,190-y*scale]);if(p.length<2)continue;const samples=[];for(let j=0;j<p.length-1;j++){const a=p[Math.max(0,j-1)],b=p[j],c=p[j+1],d=p[Math.min(p.length-1,j+2)];for(let k=0;k<8;k++){const t=k/8,t2=t*t,t3=t2*t;samples.push([.5*((2*b[0])+(-a[0]+c[0])*t+(2*a[0]-5*b[0]+4*c[0]-d[0])*t2+(-a[0]+3*b[0]-3*c[0]+d[0])*t3),.5*((2*b[1])+(-a[1]+c[1])*t+(2*a[1]-5*b[1]+4*c[1]-d[1])*t2+(-a[1]+3*b[1]-3*c[1]+d[1])*t3)]);}}samples.push(p.at(-1));const lengths=[0];for(let j=1;j<samples.length;j++)lengths.push(lengths.at(-1)+Math.hypot(samples[j][0]-samples[j-1][0],samples[j][1]-samples[j-1][1]));paths.push({points:samples,lengths,length:lengths.at(-1)});total+=lengths.at(-1);}});
  started=last;lastDraw=-1;painted=-1;context.clearRect(0,0,1024,224);texture.needsUpdate=true;
 }
 fetch('/assets/arrival/landmark-handwriting.json',{signal:controller.signal}).then(r=>r.json()).then(value=>{if(disposed)return;data=value;build();}).catch(()=>{});
 function draw(time){if(!paths.length||time-lastDraw<1/30)return;lastDraw=time;const progress=Math.max(0,Math.min(1,(time-started)/(2.5+names[active].length*.12)));if(progress===painted)return;painted=progress;mesh.userData.writingProgress=progress;
  context.clearRect(0,0,1024,224);context.strokeStyle='#8b2738';context.lineWidth=6.5;context.lineCap='round';context.lineJoin='round';context.shadowColor='transparent';context.shadowBlur=0;context.shadowOffsetY=0;let remaining=total*progress;
  for(const {points,lengths,length}of paths){if(remaining<=0)break;context.beginPath();context.moveTo(...points[0]);for(let j=1;j<points.length;j++){if(lengths[j]<=remaining)context.lineTo(...points[j]);else{const f=Math.max(0,(remaining-lengths[j-1])/(lengths[j]-lengths[j-1]));context.lineTo(points[j-1][0]+(points[j][0]-points[j-1][0])*f,points[j-1][1]+(points[j][1]-points[j-1][1])*f);break;}}context.strokeStyle='#ead8b4';context.lineWidth=6.5;context.stroke();remaining-=length;}
  texture.needsUpdate=true;
 }
 const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10);};
 function update(time){if(disposed||active<0||retired)return;last=time;draw(time);const rise=ease((time-raisedAt)/.9),duration=2.5+names[active].length*.12;
  // The ten-second hold begins after the final stroke, including an asynchronous font arrival.
  const sink=paths.length?ease((time-started-duration-10)/1.6):0;mesh.position.y=baseY-2.65*(1-rise)-2.65*sink;
  mesh.visible=rise>0&&sink<1;mesh.userData.signPhase=sink>0?'retracting':painted===1?'holding':'writing';
  if(sink===1){retired=true;mesh.visible=false;mesh.userData.signPhase='retired';}
 }
 return {mesh,update,show(index,time,restart=false){if(disposed)return;if(restart)active=-1;last=time;if(index!==active){active=index;baseY=mesh.position.y;raisedAt=time;retired=false;const width=index===7?1.2:index===8?.40:.42;mesh.scale.setScalar(width);mesh.userData.landmarkName=names[index];build();}update(time);},hide(){/* Leaving the frustum must not restart or abruptly hide a physical sign. */},get text(){return names[active]||'';},dispose(){disposed=true;controller.abort();mesh.removeFromParent();const geometries=new Set(),materials=new Set();mesh.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean))materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());texture.dispose();woodMap.dispose();postMap.dispose();}};
}
