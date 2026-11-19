import * as T from './vendor/three/three.module.js';
// A DOM projection of the already-loaded workbench; no second app, media player or model is started.
export function createTowerClassroom({root,parent,camera}){
 const room=new T.Group();room.name='tower-interior-classroom';room.position.z=-6;root.add(room);room.visible=false;
 let aspect=camera.aspect,boardWidth=Math.min(4.4,3.2*aspect),boardHeight=boardWidth/aspect;
 const materials={wall:new T.MeshStandardMaterial({color:0xe4ddca,roughness:1}),wood:new T.MeshStandardMaterial({color:0x80634b,roughness:.8}),metal:new T.MeshStandardMaterial({color:0x444d4a}),board:new T.MeshStandardMaterial({color:0x24463c}),glass:new T.MeshBasicMaterial({color:0xbacfd0})};
 const box=(x,y,z,w,h,d,m)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),materials[m]);o.position.set(x,y,z);o.receiveShadow=true;o.castShadow=true;room.add(o);return o;};
 box(0,.015,-108,6,.10,12,'wood');box(0,3.85,-108,6,.12,12,'wall');box(0,1.95,-114,6,3.9,.15,'wall');
 for(const side of [-1,1]){box(side*3,1.95,-108,.12,3.9,12,'wall');box(side*2.92,.3,-108,.08,.5,12,'wood');
  for(const z of [-105,-108,-111]){box(side*2.9,2.1,z,.035,1.7,1.5,'glass');box(side*2.85,2.1,z,.06,1.8,.06,'wood');box(side*2.85,2.1,z,.06,.06,1.6,'wood');}
 }
 let boardCenter=aspect>1?.5:0;
 const boardFrame=box(boardCenter,1.95,-113.05,boardWidth+.22,boardHeight+.22,.15,'wood');const board=box(boardCenter,1.95,-112.94,boardWidth,boardHeight,.04,'board');
 const tray=box(boardCenter,1.95-boardHeight/2-.12,-112.8,boardWidth+.4,.1,.35,'wood');const originalWidth=boardWidth,originalHeight=boardHeight;
 for(const x of [-1.85,1.85])for(const z of [-104.5,-107,-109.5]){
  box(x,.78,z,1.15,.08,.65,'wood');for(const a of [-.45,.45])for(const b of [-.23,.23])box(x+a,.4,z+b,.045,.72,.045,'metal');
  box(x,.43,z+1, .6,.07,.55,'wood');box(x,.76,z+1.24,.6,.65,.06,'wood');for(const a of [-.24,.24])for(const b of [-.2,.2])box(x+a,.2,z+1+b,.04,.4,.04,'metal');
 }
 box(2.45,.48,-111.3,.8,.96,.6,'wood');
 for(const z of [-105,-110]){box(0,3.72,z,2,.04,.32,'glass');const light=new T.PointLight(0xfff1d4,9,12,2);light.position.set(0,3.3,z);room.add(light);}
 // The vestibule remains a lit, enclosed interior while the teacher returns.
 const vestibuleLight=new T.PointLight(0xffe8c6,5,7,2);vestibuleLight.position.set(0,2.7,-98);room.add(vestibuleLight);
 const layer=document.createElement('div');layer.className='mentor-classroom-page';layer.style.cssText='position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none;display:none';parent.append(layer);
 const frame=document.createElement('iframe');frame.title='钟楼教室黑板上的项目页面';frame.setAttribute('sandbox','allow-same-origin');frame.tabIndex=-1;frame.style.cssText='position:absolute;top:0;left:0;border:0;transform-origin:0 0;background:#f4f1ed;pointer-events:none;';layer.append(frame);
 let prepared=false,disposed=false,preparedAt=0;
 function prepare(){if(disposed)return;if(prepared)return;if(document.documentElement.dataset.workspaceReady!=='true'||!document.querySelector('.workspace'))return;prepared=true;preparedAt=performance.now();
  const copied=[];for(const selector of ['body > .workspace-nav','body > .workspace']){const original=document.querySelector(selector);if(!original)continue;const clone=original.cloneNode(true);const sourceRect=original.getBoundingClientRect(),ownerRect=parent.getBoundingClientRect();clone.style.setProperty('position','absolute','important');clone.style.setProperty('left',sourceRect.left+'px','important');clone.style.setProperty('top',(sourceRect.top-ownerRect.top)+'px','important');clone.style.setProperty('width',sourceRect.width+'px','important');clone.style.setProperty('margin','0','important');const sourceCanvases=original.querySelectorAll('canvas');clone.querySelectorAll('canvas').forEach((c,i)=>{try{const img=document.createElement('img');img.src=sourceCanvases[i].toDataURL();img.style.cssText=c.style.cssText;img.width=c.width;img.height=c.height;c.replaceWith(img);}catch{c.remove();}});clone.querySelectorAll('script,audio,video,iframe').forEach(e=>e.remove());copied.push(clone.outerHTML);}
  const styles=[...document.querySelectorAll('head link[rel=stylesheet],head style')].map(s=>s.outerHTML).join('');
  const classes=document.documentElement.className.split(/\s+/).filter(c=>!/^tour-|booting|home-rendering/.test(c)).join(' ');
  frame.srcdoc=`<!doctype html><html lang="${document.documentElement.lang}" class="${classes}"><head><base href="${location.origin}/">${styles}<style>html,body{margin:0!important;overflow:hidden!important;min-height:100%!important}.workspace,.workspace-nav{visibility:visible!important;opacity:1!important;transform:none!important;animation:none!important}.top,.tour-home-intro,#startup{display:none!important}*{animation-play-state:paused!important;transition:none!important}</style></head><body class="${document.body.className}">${copied.join('')}</body></html>`;
 }
 // Project the four board corners using a full projective transform, including the oblique entry view.
 function matrix(points,w,h){const source=[[0,0],[w,0],[w,h],[0,h]],a=[];for(let i=0;i<4;i++){const [x,y]=source[i],[u,v]=points[i];a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);}for(let i=0;i<8;i++){let p=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;[a[p],a[i]]=[a[i],a[p]];const divisor=a[i][i];if(Math.abs(divisor)<1e-10)return null;for(let j=i;j<9;j++)a[i][j]/=divisor;for(let k=0;k<8;k++)if(k!==i){const f=a[k][i];for(let j=i;j<9;j++)a[k][j]-=f*a[i][j];}}const q=a.map(row=>row[8]);return `matrix3d(${q[0]},${q[3]},0,${q[6]},${q[1]},${q[4]},0,${q[7]},0,0,1,0,${q[2]},${q[5]},0,1)`;}
 function update(show,fill=0){if(Math.abs(aspect-camera.aspect)>.001){aspect=camera.aspect;boardCenter=aspect>1?.5:0;boardFrame.position.x=board.position.x=tray.position.x=boardCenter;boardWidth=Math.min(4.4,3.2*aspect);boardHeight=boardWidth/aspect;boardFrame.scale.set((boardWidth+.22)/(originalWidth+.22),(boardHeight+.22)/(originalHeight+.22),1);board.scale.set(boardWidth/originalWidth,boardHeight/originalHeight,1);tray.scale.x=(boardWidth+.4)/(originalWidth+.4);tray.position.y=1.95-boardHeight/2-.12;}layer.style.display=show?'block':'none';if(!show)return;prepare();const canvas=parent.querySelector('canvas'),rect=canvas?.getBoundingClientRect(),bounds=parent.getBoundingClientRect(),w=rect?.width||parent.clientWidth,h=rect?.height||parent.clientHeight;
  frame.style.width=w+'px';frame.style.height=h+'px';camera.updateMatrixWorld(true);
  const z=-112.90+root.position.z+room.position.z,corners3d=[[boardCenter-boardWidth/2,1.95+boardHeight/2,z],[boardCenter+boardWidth/2,1.95+boardHeight/2,z],[boardCenter+boardWidth/2,1.95-boardHeight/2,z],[boardCenter-boardWidth/2,1.95-boardHeight/2,z]].map(p=>new T.Vector3(...p));
  // Perspective projection flips at/behind the near plane. Never publish a
  // projective DOM transform from those corners (it flashes over the walls).
  if(!prepared||corners3d.some(p=>p.clone().applyMatrix4(camera.matrixWorldInverse).z>=-Math.max(.08,camera.near))){layer.style.display='none';return;}
  const points=corners3d.map(p=>{const v=p.project(camera);return [(v.x+1)*w/2+(rect?.left||bounds.left)-bounds.left,(1-v.y)*h/2+(rect?.top||bounds.top)-bounds.top]});
  if(points.some(p=>p.some(v=>!Number.isFinite(v)))||points.some(p=>Math.abs(p[0])>w*6||Math.abs(p[1])>h*6)){layer.style.display='none';return;}
  const corners=[[0,0],[w,0],[w,h],[0,h]];if(fill>0)for(let i=0;i<4;i++)for(let j=0;j<2;j++)points[i][j]+=(corners[i][j]-points[i][j])*fill;layer.dataset.viewportFill=fill.toFixed(4);const transform=matrix(points,w,h);if(transform)frame.style.transform=transform;
 }
 return {room,prepare,update,get boardCenter(){return boardCenter;},get teacherX(){return boardCenter-boardWidth/2-.48;},get boardZ(){return -112.90+root.position.z+room.position.z;},get boardHeight(){return boardHeight;},get boardWidth(){return boardWidth;},get ready(){return !!frame.contentDocument?.querySelector('.workspace');},dispose(){disposed=true;frame.srcdoc='';layer.remove();}};
}
