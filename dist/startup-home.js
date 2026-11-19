// Build the actual workspace DOM early. Its controllers attach to these nodes later.
(()=>{
 window.revealBrandLanguage=button=>{
  if(!button.closest('.brand-language-group')||button.dataset.brandEntrance)return;
  button.dataset.brandEntrance='waiting';button.inert=true;
  requestAnimationFrame(async()=>{
   const caption=document.querySelector('.brand-signature+span');
   const animations=caption?.getAnimations()||[];
   await Promise.allSettled(animations.map(animation=>animation.finished));
   if(!button.isConnected)return;
   button.dataset.brandEntrance='entering';button.inert=false;
  });
 };

 if(new URLSearchParams(location.search).get('tour')==='1')return;
 const reveal=()=>{
  const root=document.documentElement;if(root.dataset.workspaceReady==='true'||document.querySelector('.workspace-stage'))return;
  const aside=document.querySelector('.setup');if(!aside)return;
  document.body.classList.add('studio');document.body.dataset.workspace='library';
  const nav=document.createElement('nav');nav.className='workspace-nav';nav.dataset.homeNavigation='true';nav.setAttribute('aria-label','工作区');
  const lens=document.createElement('span');lens.className='nav-lens';lens.setAttribute('aria-hidden','true');nav.append(lens);
  const stage=document.createElement('div');stage.className='workspace-stage';
  for(const [id,label]of [['library','曲库'],['play','演奏'],['arrange','改编'],['tasks','任务']]){
   const page=document.createElement('div');page.className='workspace-panel';page.id='workspace-'+id;page.hidden=id!=='library';stage.append(page);
   const button=document.createElement('button');button.textContent=label;button.dataset.panel=id;button.setAttribute('aria-controls',page.id);button.setAttribute('aria-pressed',String(id==='library'));button.disabled=true;nav.append(button);
  }
  const dock=document.createElement('div');dock.className='ai-navigation-dock';const ai=document.createElement('button');ai.id='workspace-ai';ai.dataset.pendingController='true';ai.disabled=true;ai.type='button';ai.innerHTML='<span>AI</span>';ai.setAttribute('aria-label','打开 SUPERTANG AI');dock.append(nav,ai);document.querySelector('.top').after(dock);aside.append(stage);
  const brand=document.querySelector('.top .brand');if(brand&&!document.querySelector('#language-switch')){const group=brand.closest('.brand-language-group')||document.createElement('div');group.className='brand-language-group';const language=document.createElement('div');language.id='language-switch';language.className='language-toggle language-dial';const trigger=document.createElement('button');trigger.id='language-trigger';trigger.type='button';trigger.disabled=true;trigger.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg><span>语言</span>';language.append(trigger);if(!group.isConnected)brand.before(group);if(brand.parentElement!==group)group.append(brand);group.append(language);window.revealBrandLanguage(language);}

  let panel=document.querySelector('.score-library');
  if(!panel){panel=document.createElement('section');panel.className='score-library setup-section';panel.dataset.homeLibrary='true';
   const heading=document.createElement('h3');heading.innerHTML='<span class=library-title-wide>SUPERTANG 云端曲库</span><span class=library-title-compact>云曲库</span>';const list=document.createElement('div');list.className='library-list';list.setAttribute('aria-busy','true');
   const skeleton=document.createElement('div');skeleton.className='library-skeleton';skeleton.setAttribute('role','status');skeleton.innerHTML='<div class="skeleton-cover" aria-hidden="true"></div><span>正在读取云曲库</span>';list.append(skeleton);panel.append(heading,list);
  }
  stage.firstChild.append(panel);
  root.dataset.homeVisible='true';root.classList.add('home-rendering');const loader=document.querySelector('#startup');if(loader){loader.hidePopover?.();loader.inert=true;}performance.mark('homepage-shell-visible');
  requestAnimationFrame(()=>{const first=nav.querySelector('button');if(first){lens.style.width=first.offsetWidth+'px';lens.style.transform=`translateX(${first.offsetLeft-5}px)`;}});
 };
 window.prepareHomepageShell=reveal;
 Promise.resolve(window.homeStylesReady).then(()=>requestAnimationFrame(reveal));
 window.addEventListener('workspace-ready',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
 const root=document.documentElement,stage=document.querySelector('.workspace-stage');const before=stage?.getBoundingClientRect().height;
 root.classList.remove('home-rendering');
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const after=stage?.getBoundingClientRect().height;if(stage&&before&&after&&Math.abs(before-after)>1)stage.animate([{height:before+'px'},{height:after+'px'}],{duration:360,easing:'cubic-bezier(.22,.65,.3,1)'});
  for(const node of document.querySelectorAll('.workspace>.practice,#workspace-library>.score-import,#workspace-library>.service-controls'))node.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'cubic-bezier(.22,.65,.3,1)'});
 }
})),{once:true});
})();
