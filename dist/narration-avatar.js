import {boardFocus} from './mentor-camera-cues.js?v=1';
import {createMentorClassroom} from './mentor-classroom.js?v=logo-match26';
import {createPortraitMentor} from './mentor-portrait-model.js?v=cinematic16';
import * as THREE from './vendor/three/three.module.js';
import {OrbitControls} from './vendor/three/OrbitControls.js';
export function attachNarrationAvatar(host,audio,{embedded=false,cinematic=false}={}){
 const section=document.createElement('section');section.className='narration-avatar avatar-3d '+(embedded?'avatar-embedded':'avatar-floating');
 const stage=document.createElement('div');stage.className='avatar-3d-stage';stage.setAttribute('aria-label','全身三维人物，可拖动旋转');
 const status=document.createElement('p');status.className='avatar-3d-status';status.textContent='正在加载全身模型';
 const title=document.createElement('p');title.className='avatar-label';title.textContent='导师讲解';
 const note=document.createElement('small');note.textContent='三维示意形象，照片参考形象';
 const tools=document.createElement('div');tools.className='avatar-3d-tools';
 const buttons=['正面','背面','复位','放大查看','面部近景','收起形象'].map(text=>{const b=document.createElement('button');b.type='button';b.textContent=text;tools.append(b);return b;});
 const toggle=document.createElement('button');toggle.type='button';toggle.className='avatar-menu-toggle';toggle.textContent='形象设置';toggle.setAttribute('aria-expanded','false');onToggle();function onToggle(){toggle.onclick=()=>{const open=section.classList.toggle('avatar-tools-open');toggle.setAttribute('aria-expanded',String(open));};}
 section.append(stage,status,title,note,toggle,tools);(embedded?host:document.body).append(section);
 let mouthEnvelope=null,envelopeVersion=0;async function loadEnvelope(){const version=++envelopeVersion;mouthEnvelope=null;try{const url=new URL(audio.currentSrc||audio.src,location.href);url.pathname=url.pathname.replace(/\.(m4a|wav|mp3)$/i,'.mouth.json');const response=await fetch(url);if(response.ok&&version===envelopeVersion)mouthEnvelope=await response.json();}catch{}}
 let character,welcomeStart=0,walkPhase=0,walkBlend=0,walkSpeed=0,walkDirection=1,sceneStart=0,lastMotionTime=0,previousX=-1.8,cameraHome=null,boardZoom=0,manualCameraUntil=0,departureFrom=0,departureStart=0,arrivalStart=0,renderer,controls,observer,model,faceTexture,frame=0,disposed=false,context,source,analyser,levels,mouth=0;
 const abort=new AbortController(),listeners=[],bones=new Map(),meshes=[];
 const on=(target,event,fn)=>{target.addEventListener(event,fn);listeners.push(()=>target.removeEventListener(event,fn));};
 on(audio,'loadstart',loadEnvelope);void loadEnvelope();
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,100);const classroom=embedded?createMentorClassroom(scene,{cinematic}):null;let lessonState={progress:0,mode:'writing'};on(document,'mentor-lesson',event=>{lessonState=event.detail;classroom?.draw({...lessonState,intro:!welcomeStart||performance.now()-welcomeStart<1500||(!lessonState.speaking&&!(lessonState.elapsed>0))});section.dataset.teaching=lessonState.mode;});
 on(document,'mentor-departure',()=>{departureFrom=character?.position.x||0;departureStart=performance.now();});
 scene.add(new THREE.HemisphereLight(0xfffaf3,0x807487,1.5));
 const key=new THREE.DirectionalLight(0xfff3e5,1.9);key.position.set(3,4,4);scene.add(key);
 const rim=new THREE.DirectionalLight(0xd8e3ff,2);rim.position.set(-3,3,-2);scene.add(rim);
 function view(back=false){if(!controls)return;controls.target.set(.22,.86,0);camera.position.set(.22,1.07,back?-3.8:3.8);controls.update();}
 function resize(){if(!renderer||disposed)return;const r=stage.getBoundingClientRect();if(r.width<1||r.height<1)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);if(cinematic){const distance=Math.max(3.5,2.8/(2*Math.tan(35*Math.PI/360)*camera.aspect));controls.target.set(.48,.87,0);camera.position.set(.48,1.1,distance);controls.update();cameraHome=camera.position.clone();}}
 const placeholder=document.createComment('avatar home');section.before(placeholder);
 let previousFocus;
 function expand(){const expanded=section.classList.toggle('avatar-3d-expanded');if(expanded){previousFocus=document.activeElement;document.body.append(section);}else{placeholder.after(section);previousFocus?.focus();}buttons[3].textContent=expanded?'收起':'放大查看';buttons[3].setAttribute('aria-expanded',String(expanded));resize();}
 on(buttons[0],'click',()=>view());on(buttons[1],'click',()=>view(true));on(buttons[2],'click',()=>view());on(buttons[3],'click',expand);
 on(buttons[4],'click',()=>{if(controls){const head=bones.get('Head')?.bone;const pos=head?head.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,1.4,0);controls.target.copy(pos);camera.position.copy(pos).add(new THREE.Vector3(0,.05,.85));controls.update();}});
 on(buttons[5],'click',()=>{const collapsed=section.classList.toggle('avatar-collapsed');buttons[5].textContent=collapsed?'展开形象':'收起形象';resize();});
 on(document,'keydown',e=>{if(e.key==='Escape'&&section.classList.contains('avatar-3d-expanded'))expand();});
 function beginAudio(){if(disposed||cinematic)return;try{if(!context){context=new (window.AudioContext||window.webkitAudioContext)();source=context.createMediaElementSource(audio);analyser=context.createAnalyser();analyser.fftSize=512;levels=new Uint8Array(analyser.fftSize);source.connect(analyser);analyser.connect(context.destination);}void context.resume().catch(()=>{});}catch{}}
 on(audio,'play',beginAudio);
 function animate(time){
  if(disposed)return;frame=requestAnimationFrame(animate);if(document.hidden||!section.getBoundingClientRect().width)return;
  const speaking=(!audio.paused&&!audio.ended&&audio.readyState>=2)||(cinematic&&lessonState.speaking===true);
  let energy=0;if(speaking&&mouthEnvelope){energy=(mouthEnvelope.values[Math.floor(audio.currentTime*mouthEnvelope.fps)]||0)*.65;}else if(speaking&&analyser&&context?.state==='running'){analyser.getByteTimeDomainData(levels);let sum=0;for(const sample of levels)sum+=((sample-128)/128)**2;energy=Math.min(.65,Math.sqrt(sum/levels.length)*3.5);}else if(speaking){energy=.12+.10*Math.sin(time*.016)**2;}mouth+=(energy-mouth)*.28;
  // Amplitude-driven jaw motion, not phoneme-level lip synchronization.
  const blinkCycle=time/1000%7.3;
  const blink=Math.max(0,1-Math.abs(blinkCycle-3.8)/.12,1-Math.abs(blinkCycle-6.7)/.095);
  for(const mesh of meshes){const map=mesh.morphTargetDictionary;for(const [name,value] of [['jawOpen',mouth],['eyeBlinkLeft',blink],['eyeBlinkRight',blink]])if(map[name]!==undefined)mesh.morphTargetInfluences[map[name]]=value;}
  const t=time/1000;model?.userData.updatePortrait?.(t,speaking,mouth,lessonState.mode,blink,{elapsed:lessonState.elapsed??audio.currentTime,viewerYaw:Math.atan2(camera.position.x,camera.position.z),boardSide:character?.position.x>.6?-1:1});if(model?.userData.expressionState){section.dataset.mouth=mouth.toFixed(3);section.dataset.attention=model.userData.expressionState.attention;section.dataset.headYaw=model.userData.expressionState.headYaw.toFixed(4);section.dataset.gazeY=model.userData.expressionState.gazeY.toFixed(4)};const hair=model?.userData.chibiBody?.userData.hair;if(hair&&model.userData.chibiBody.userData.headBone){hair.position.copy(model.userData.chibiBody.worldToLocal(model.userData.chibiBody.userData.headBone.getWorldPosition(new THREE.Vector3()))).add(model.userData.chibiBody.userData.hairOffset);hair.quaternion.copy(model.userData.chibiBody.userData.headBone.getWorldQuaternion(new THREE.Quaternion())).multiply(model.userData.chibiBody.userData.hairRest.clone().invert());}for(const [name,{bone,rotation}] of bones){if(!model?.userData.updatePortrait)bone.quaternion.copy(rotation);if(name==='Head'&&!model?.userData.updatePortrait){bone.rotateZ(speaking?Math.sin(t*.9)*.018:0);if(speaking&&lessonState.mode==='writing')bone.rotateY(.09+Math.sin(t*.35)*.025);}if(name==='Spine2')bone.rotateX(Math.sin(t*1.2)*.005);}
  const arms=model?.userData.chibiBody?.userData.arms||[];for(const {pivot,elbow,sign}of arms){const writing=speaking&&model?.userData.expressionState?.attention==='board'&&sign===(character?.position.x>.6?-1:1),pointing=speaking&&model?.userData.expressionState?.attention==='slides'&&sign===(character?.position.x>.6?-1:1);pivot.rotation.z+=( (writing?sign*(1.63+Math.sin(t*2.1)*.06):pointing?sign*1.25:sign*.09)-pivot.rotation.z)*.08;pivot.rotation.x+=((writing?.15-Math.min(2,Math.floor((lessonState.progress||0)*3))*.12:pointing?-.2:0)-pivot.rotation.x)*.08;elbow.rotation.x+=((writing?.12+Math.sin(t*3)*.025:pointing?-.35:0)-elbow.rotation.x)*.08;elbow.rotation.z+=( (writing?sign*(1.1+Math.sin(t*4)*.065):0)-elbow.rotation.z)*.08;}if(cinematic&&character){
   const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,elapsed=(time-arrivalStart)/1000,entry=Math.min(1,elapsed/5.2);
   const smooth=n=>n*n*(3-2*n),left=-.38,right=1.44;
   let x=-1.8+(left+1.8)*smooth(Math.max(0,entry));
   if(entry===1){const lesson=Number.isFinite(audio.currentTime)?audio.currentTime:(lessonState.elapsed||0),cycle=lesson%48;
    if(cycle<9)x=left;
    else if(cycle<24)x=left+(right-left)*smooth((cycle-9)/15);
    else if(cycle<33)x=right;
    else x=right+(left-right)*smooth((cycle-33)/15);
   }
   if(departureStart){const d=Math.min(1,(time-departureStart)/2400);x=departureFrom+(-1.8-departureFrom)*smooth(d);character.visible=d<1;}
   
   const dt=Math.min(.5,Math.max(.001,(time-lastMotionTime)/1000));
   if(lastMotionTime&&!reduced&&!departureStart)x=previousX+Math.max(-.45*dt,Math.min(.45*dt,x-previousX));
   const speed=lastMotionTime?Math.abs(x-previousX)/dt:0,moving=!reduced&&speed>.006;
   if(!welcomeStart&&entry===1&&Math.abs(x-left)<.03)welcomeStart=time;if(classroom?.state.intro){const blend=welcomeStart?Math.min(1,(time-welcomeStart)/700):0;classroom.draw({welcomeBlend:blend});section.dataset.boardIdentity=blend>=1?'visitor':blend>0?'transition':'host';}
   const blend=1-Math.exp(-dt*8);walkSpeed+=(speed-walkSpeed)*blend;walkBlend+=((moving?Math.min(1,walkSpeed/.10):0)-walkBlend)*blend;if(moving&&Math.abs(x-previousX)>.00001)walkDirection=x>previousX?1:-1;const stride=walkBlend,direction=walkDirection;walkPhase+=walkSpeed*dt/.64*2*Math.PI;const phase=walkPhase;
   character.position.set(x,Math.sin(phase*2)*.003*stride,0);
   character.rotation.y+=((moving?direction*1.05:x>.6?-.10:.10)-character.rotation.y)*(1-Math.exp(-dt*3));
   character.rotation.z=Math.sin(phase)*.004*stride;
   for(const limb of model?.userData.chibiBody?.userData.walkLimbs||[]){const angle=phase+(limb.sign===1?Math.PI:0);limb.mesh.rotation.x=Math.sin(angle)*.48*stride;if(limb.knee)limb.knee.rotation.x=Math.max(0,-Math.sin(angle))*.48*stride;if(limb.foot)limb.foot.rotation.x=-Math.max(0,-Math.sin(angle))*.2*stride;}
   if(moving)for(const arm of arms){const boardArm=speaking&&arm.sign===(x>.6?-1:1);if(boardArm){arm.pivot.rotation.z+=((arm.sign*.95)-arm.pivot.rotation.z)*.1;arm.pivot.rotation.x=-.12;arm.elbow.rotation.z+=((arm.sign*.55)-arm.elbow.rotation.z)*.1;}else{arm.pivot.rotation.x=-Math.sin(phase+(arm.sign===1?Math.PI:0))*.18*stride;arm.pivot.rotation.z=arm.sign*.09;arm.elbow.rotation.z=0;}}
   if(cameraHome&&!reduced&&time>manualCameraUntil){
    const intro=Math.min(1,Math.max(0,(time-sceneStart)/8000)),angle=(1-smooth(intro))*Math.PI/4;
    const focus=entry===1&&!classroom?.state.intro?boardFocus(lessonState.topic,audio.currentTime,audio.duration):0;
    boardZoom+=(focus-boardZoom)*(1-Math.exp(-dt*3));
    const near=Math.max(1.65,1.5/(2*Math.tan(35*Math.PI/360)*camera.aspect)),distance=cameraHome.z*(1-boardZoom)+near*boardZoom,drift=intro*(1-boardZoom*.82);
    controls.target.set(.48-.02*boardZoom,.87+.29*boardZoom,0);
    camera.position.set(cameraHome.x*(1-boardZoom)+.46*boardZoom+Math.sin(angle)*distance+Math.sin(elapsed*.35)*distance*.28*drift,cameraHome.y*(1-boardZoom)+1.16*boardZoom+Math.sin(elapsed*.29)*distance*.18*drift,Math.cos(angle)*distance+Math.sin(elapsed*.21)*distance*.035*drift);
    section.dataset.boardZoom=boardZoom.toFixed(3);section.dataset.cameraDistance=distance.toFixed(3);
    section.dataset.cameraAngle=(angle*180/Math.PI).toFixed(2);section.dataset.cameraY=camera.position.y.toFixed(3);
   }
   section.dataset.entrance=entry===1?'arrived':'walking';section.dataset.walking=String(moving);section.dataset.teacherX=x.toFixed(3);section.dataset.side=x>.6?'right':'left';section.dataset.lessonElapsed=String(lessonState.elapsed||0);section.dataset.stride=(moving?Math.sin(phase)*stride:0).toFixed(3);
   previousX=x;lastMotionTime=time;
  }
  if(cinematic&&classroom){const b=Math.min(1,Math.max(0,(time-sceneStart)/4200));classroom.board.position.x=2.8*(1-b*b*(3-2*b));}
  if(classroom&&!classroom.state.intro&&!audio.paused&&Number.isFinite(audio.duration)&&audio.duration>0)classroom.draw({elapsed:audio.currentTime,lessonPosition:Math.min(1,audio.currentTime/audio.duration),speaking:true});
  controls.update();if(classroom)section.dataset.boardIntro=String(!!classroom.state.intro);if(cinematic&&character){const point=character.localToWorld(new THREE.Vector3(0,.92,.25)).project(camera),r=stage.getBoundingClientRect(),owner=section.closest('.mentor-cinematic'),bounds=owner?.getBoundingClientRect();if(owner&&bounds){owner.style.setProperty('--mentor-unlock-x',Math.max(130,Math.min(bounds.width-130,r.left-bounds.left+(point.x+1)*r.width/2))+'px');owner.style.setProperty('--mentor-unlock-y',r.top-bounds.top+(1-point.y)*r.height/2+'px');}}renderer.render(scene,camera);
 }
 function disposeTree(root){root.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});}
 async function init(){try{
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  stage.append(renderer.domElement);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.enablePan=false;controls.minDistance=.4;controls.maxDistance=12;controls.minPolarAngle=.18;controls.maxPolarAngle=Math.PI-.18;
  controls.addEventListener('start',()=>{manualCameraUntil=performance.now()+12000;});controls.addEventListener('end',()=>{cameraHome=camera.position.clone();manualCameraUntil=performance.now()+12000;});
  controls.addEventListener('change',()=>{section.dataset.azimuth=controls.getAzimuthalAngle().toFixed(4);});
  observer=new ResizeObserver(resize);observer.observe(stage);view();resize();sceneStart=performance.now();if(cinematic&&cameraHome){camera.position.set(cameraHome.x+cameraHome.z*Math.sin(Math.PI/4),cameraHome.y,cameraHome.z*Math.cos(Math.PI/4));controls.update();}frame=requestAnimationFrame(animate);
  model=await createPortraitMentor(abort.signal,message=>{if(!disposed)status.textContent=message;});
  if(disposed){disposeTree(model);return;}
  section.dataset.identity='portrait-surface-v2';title.textContent='冒小瑛教授';note.textContent='授权数字形象';
  const head=model.getObjectByName('Head');if(head)bones.set('Head',{bone:head,rotation:head.quaternion.clone()});
  character=new THREE.Group();character.position.x=cinematic?-1.8:-.32;arrivalStart=performance.now();character.add(model);scene.add(character);model.updateMatrixWorld(true);section.dataset.ready='true';status.textContent='拖动旋转';
 }catch(e){if(!disposed){status.textContent='全身模型加载失败，请刷新重试';section.dataset.error=e.message;}}}
 void init();
 return ()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer?.disconnect();listeners.forEach(f=>f());controls?.dispose();if(model){disposeTree(model);}faceTexture?.dispose();renderer?.dispose();classroom?.dispose();if(context){source?.disconnect();analyser?.disconnect();void context.close();}section.remove();placeholder.remove();};
}

