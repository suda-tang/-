import {paintLesson} from './mentor-board-art.js?v=full-font3';
import * as THREE from './vendor/three/three.module.js';
export function createMentorClassroom(scene,{cinematic=false}={}){
 const group=new THREE.Group(),board=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:'#82795f',roughness:.6,metalness:.12});group.add(board);
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=640;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.24,.775),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));screen.position.set(.46,1.16,-.09);board.add(screen);
 for(const [x,y,w,h]of [[.46,1.562,1.3,.034],[.46,.758,1.3,.034],[-.185,1.16,.034,.83],[1.105,1.16,.034,.83]]){const frame=new THREE.Mesh(new THREE.BoxGeometry(w,h,.05),wood);frame.position.set(x,y,-.1);board.add(frame);}
 const ledge=new THREE.Mesh(new THREE.BoxGeometry(1.3,.035,.12),wood);ledge.position.set(.46,.745,-.06);board.add(ledge);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(1.45,64),new THREE.MeshStandardMaterial({color:'#e4e9df',roughness:1,transparent:true,opacity:.75}));floor.rotation.x=-Math.PI/2;floor.position.y=.003;group.add(floor);
 const podium=new THREE.Mesh(new THREE.CylinderGeometry(.3,.34,.025,48),new THREE.MeshStandardMaterial({color:'#d4ded3',roughness:.8}));podium.position.set(-.18,.01,.05);group.add(podium);scene.add(group);if(cinematic){floor.visible=false;podium.visible=false;board.position.x=2.8;}
 const seal=new Image();seal.src='/suda-seal.svg?v=round19';seal.onload=()=>{signature='';draw(state);};
 const font=new FontFace('Mentor Hand','url(/fonts/LXGWWenKai-Regular.ttf)');font.load().then(loaded=>{document.fonts.add(loaded);signature='';draw(state);}).catch(()=>{});
 const visitor=document.querySelector('.tour-home-intro'),visitorName=visitor?.dataset.mentor||'',institution=visitor?.dataset.institution||'';const visitorLogo=new Image();visitorLogo.onerror=()=>{if(!visitorLogo.src.includes('suda-seal.svg'))visitorLogo.src='/suda-seal.svg?v=round19';};visitorLogo.onload=()=>{signature='';draw(state);};if(visitor?.dataset.institutionLogo&&!visitor.dataset.institutionLogo.includes('suda-seal')){visitorLogo.src=visitor.dataset.institutionLogo;}else if(institution){let stopped=false;const loadLogo=async()=>{for(let attempt=0;attempt<25&&!stopped;attempt++){try{const response=await fetch('/api/institution-logo?institution='+encodeURIComponent(institution));const result=await response.json();if(result.url&&result.institution===institution.replace(/\s+/g,'')){visitorLogo.src=result.url;visitor.dataset.logoSource=result.source||'';return;}if(result.status==='unavailable'){visitor.dataset.logoStatus=result.message;visitorLogo.src='/suda-seal.svg?v=round19';return;}}catch{}await new Promise(r=>setTimeout(r,3000));if(!visitor.isConnected)stopped=true;}if(!stopped&&!visitorLogo.naturalWidth)visitorLogo.src='/suda-seal.svg?v=round19';};void loadLogo();}
 let signature='',state={title:'异地合奏',points:['时间码同步','延迟补偿','演奏体验'],progress:0,mode:'writing'};
 function draw(next){state={...state,...next};const tr=t=>document.documentElement.lang==='zh-CN'?t:(window.sudaLanguage?.translate(t)||t),points=state.points.map(tr),title=tr(state.title);const progress=Math.max(0,Math.min(1,state.progress||0)),writing=true,count=Math.floor(progress*points.join('').length),key=[title,document.documentElement.lang,writing,count,state.intro,Number(state.welcomeBlend||0).toFixed(2),state.topic,Math.floor((state.elapsed||0)*20)].join(':');if(key===signature)return;signature=key;ctx.clearRect(0,0,1024,640);
 const background=ctx.createLinearGradient(0,0,1024,640);background.addColorStop(0,writing?'#163e36':'#faf6ed');background.addColorStop(1,writing?'#28554a':'#e6eee3');ctx.fillStyle=background;ctx.fillRect(0,0,1024,640);
 if(state.intro){
  const blend=visitorName?Math.max(0,Math.min(1,state.welcomeBlend||0)):0;
  function identity(welcome,alpha){if(alpha<=0)return;ctx.globalAlpha=alpha;ctx.fillStyle='#f3eedb';ctx.textAlign='center';const logo=welcome&&visitorLogo.naturalWidth?visitorLogo:seal;if(logo?.complete&&logo.naturalWidth){const scale=Math.min(124/logo.naturalWidth,124/logo.naturalHeight);ctx.drawImage(logo,512-logo.naturalWidth*scale/2,160-logo.naturalHeight*scale/2,logo.naturalWidth*scale,logo.naturalHeight*scale);}
   ctx.font='500 48px "Mentor Hand", serif';ctx.fillText(welcome?'欢迎'+visitorName+'老师':'苏州大学',512,293,900);
   ctx.fillText(welcome?(institution||'欢迎莅临'):'冒小瑛教授',512,373,900);
   ctx.font='30px "Mentor Hand",serif';ctx.fillText(welcome?'苏州大学冒小瑛教授':'Soochow University',512,447);
   ctx.fillText(welcome?'Presented by Professor Mao Xiaoying':'Professor Mao Xiaoying',512,502);
   if(!welcome){ctx.font='24px "Mentor Hand", serif';ctx.fillText('唐秋鸣课题介绍',512,563);}
  }
  identity(false,1-blend);identity(true,blend);ctx.globalAlpha=1;
  ctx.textAlign='left';texture.needsUpdate=true;return;
 }
 const activeLogo=visitorLogo.naturalWidth?visitorLogo:seal;if(activeLogo.complete&&activeLogo.naturalWidth){const scale=Math.min(138/activeLogo.naturalWidth,138/activeLogo.naturalHeight);ctx.drawImage(activeLogo,154-activeLogo.naturalWidth*scale/2,134-activeLogo.naturalHeight*scale/2,activeLogo.naturalWidth*scale,activeLogo.naturalHeight*scale);}ctx.fillStyle=writing?'#f2efdc':'#244e40';ctx.font='19px "Mentor Hand", serif';ctx.textAlign='center';ctx.fillText(institution||'苏州大学',154,249,270);ctx.font='29px "Mentor Hand", serif';ctx.fillText(visitorName?visitorName+'老师':'冒小瑛教授',154,291,270);if(institution&&institution!=='苏州大学'&&(activeLogo===seal||visitorLogo.src.includes('suda-seal.svg'))){ctx.font='16px "Mentor Hand", serif';ctx.fillText('苏大校徽',154,215,260);}ctx.textAlign='left';
 paintLesson(ctx,state,tr);
 texture.needsUpdate=true;
 }
 draw({...state,intro:cinematic});return {group,board,draw,get state(){return state;},dispose(){group.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean))m.dispose();});texture.dispose();scene.remove(group);}};
}
