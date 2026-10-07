import {animateLanguageNames} from './language-hello.js?v=1';
import {dictionary,translateDynamic} from './translations-en.js';
import {extraDictionary} from './translations-extra.js';
Object.assign(dictionary,extraDictionary,{'更多曲谱':'More scores','刷新曲谱':'Refresh scores'});
const originals=new WeakMap(),attributes=new WeakMap(),missing=new Set();
const excluded='script,style,textarea,input,[contenteditable],#language-switch,#language-menu,#language-wheel,canvas';
const languages=[['zh','中文','zh-CN'],['en','English','en'],['fr','Français','fr'],['de','Deutsch','de'],['es','Español','es'],['ja','日本語','ja'],['ko','한국어','ko'],['zh-Hant','繁體中文','zh-Hant'],['yue','粵語','yue-Hant'],['pt','Português','pt']];
const localeMaps=new Map();let currentLocale='zh';
Object.assign(dictionary,{'正在等待云端曲谱响应':'Waiting for the cloud score','已读取曲谱缓存':'Score cache loaded','解析音符与声部':'Reading notes and parts','正在下载电子谱':'Downloading score','装入演奏位置与控件':'Preparing playback controls','载入完成':'Ready','读取本地预载缓存':'Reading cached score','下一节':'Next chapter','授权数字讲解':'Authorized digital presenter','拖动旋转 · 面部为近似重建':'Drag to rotate; approximate facial reconstruction','暂无琴谱':'No scores yet','音轨工作区':'Tracks','时间轴缩放':'Timeline zoom','乐器 / 声部':'Instruments / parts','静音':'Mute','独奏':'Solo','跟随播放':'Follow playback','缩放':'Zoom','当前谱面':'Current score','手写板书':'Handwritten board','演示幻灯片':'Slides','进入功能演示 ↗':'Explore the workspace ↗','完整讲稿':'Full transcript','下一节':'Next chapter','照片参考':'Photo reference','三维课堂':'3D classroom'});
let english=false,observer,changing=false,scheduled=false;
const pending=new Set();
export function translate(value){const text=value.trim();const download=text.match(/^正在下载电子谱[:：]\s*(.+)$/);const en=dictionary[text]??(download?'Downloading score: '+download[1]:translateDynamic(text))??null;if(en===null||currentLocale==='en')return en;const map=localeMaps.get(currentLocale)||{};if(map[en])return map[en];if(download)return (map['Downloading score']||'Downloading score')+': '+download[1];const numbers=en.match(/\d+(?:\.\d+)?/g)||[];let i=0;const template=en.replace(/\d+(?:\.\d+)?/g,'{n}');return map[template]?.replace(/\{n\}/g,()=>numbers[i++]??'')??en;}
function textNode(node){
 if(node.parentElement?.closest(excluded))return;
 const previous=originals.get(node),source=previous&&node.data===previous.rendered?previous.source:node.data;
 const translation=english?translate(source):null,rendered=translation===null?source:source.replace(source.trim(),translation);
 if(english&&translation===null&&/[\u3400-\u9fff]/.test(source))missing.add(source.trim());
 const compact=node.parentElement?.tagName==='TITLE'||node.parentElement?.matches('#startup strong');const finalText=compact&&['zh','zh-Hant','yue'].includes(currentLocale)?rendered.replace(/\s+/g,''):rendered;
 originals.set(node,{source,rendered:finalText});if(node.data!==finalText)node.data=finalText;
}
function attr(element,name){
 let records=attributes.get(element);if(!records){records={};attributes.set(element,records);}
 const current=element.getAttribute(name);if(current===null)return;
 const previous=records[name],source=previous&&current===previous.rendered?previous.source:current;
 const rendered=english?(translate(source)??source):source;
 records[name]={source,rendered};if(current!==rendered)element.setAttribute(name,rendered);
}
function translateTree(root){
 if(root.nodeType===Node.TEXT_NODE){textNode(root);return;}
 if(root.nodeType!==Node.ELEMENT_NODE)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode())textNode(node);
 [root,...root.querySelectorAll('[aria-label],[title],[placeholder],[alt]')].forEach(element=>{if(!element.closest('script,style,#language-switch,[contenteditable]'))for(const name of ['aria-label','title','placeholder','alt'])attr(element,name);});
}
function paint(full=true){
 scheduled=false;observer?.disconnect();
 if(full)translateTree(document.documentElement);else for(const root of pending)if(root.isConnected)translateTree(root);
 pending.clear();
 observer?.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});
}
function setLanguage(locale){
 currentLocale=languages.some(l=>l[0]===locale)?locale:'zh';english=currentLocale!=='zh';document.documentElement.lang=languages.find(l=>l[0]===currentLocale)[2];
 try{localStorage.setItem('suda-piano-language',locale);}catch{}
 const button=document.getElementById('language-switch');button.dataset.locale=currentLocale;const label={zh:'语言',en:'Language',fr:'Langue',de:'Sprache',es:'Idioma',ja:'言語',ko:'언어','zh-Hant':'語言',yue:'語言',pt:'Idioma'}[currentLocale];if(window.resetLanguageHello)window.resetLanguageHello(currentLocale);else document.querySelector('#language-trigger span').textContent=label;document.querySelector('#language-trigger').title=languages.find(l=>l[0]===currentLocale)[1];document.querySelector('#language-trigger').setAttribute('aria-label','语言 / Language');window.syncLanguageDial?.();button.setAttribute('aria-label','Language / 语言');document.querySelectorAll('#language-menu button').forEach(option=>option.setAttribute('aria-checked',String(option.dataset.locale===currentLocale)));
 paint();if(changing&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const nodes=document.querySelectorAll('.view-buttons button,.workspace-nav button,.heading h2,.section-label,.technical summary,.top-title');for(const node of nodes)node.animate([{opacity:.25,filter:'blur(2px)',clipPath:'inset(0 100% 0 0)'},{opacity:1,filter:'blur(0px)',clipPath:'inset(0)'}],{duration:440,easing:'cubic-bezier(.22,1,.36,1)'});}
 document.dispatchEvent(new CustomEvent('languagechange',{detail:{locale}}));paint();
}
async function toggle(locale){
 if(changing)return;changing=true;const button=document.getElementById('language-switch');button.disabled=true;
 document.querySelector('#language-menu')?.hidePopover?.();
 const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 try{
  if(locale!=='zh'&&locale!=='en'&&!localeMaps.has(locale)){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);try{const response=await fetch('/locales/'+locale+'.json?v=cantonese11',{signal:controller.signal});if(!response.ok)throw Error('Language file unavailable');localeMaps.set(locale,await response.json());}finally{clearTimeout(timeout);}}
  setLanguage(locale);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 }finally{changing=false;button.disabled=false;}
}
function init(){


 const button=document.createElement('div');button.id='language-switch';button.className='language-toggle language-dial';button.setAttribute('aria-label','Language / 语言');
 const trigger=document.createElement('button');trigger.id='language-trigger';trigger.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg><span>语言</span>';trigger.type='button';trigger.setAttribute('aria-label','Language / 语言');button.append(trigger);const wheel=document.createElement('dialog');wheel.id='language-wheel';const rail=document.createElement('div');rail.className='language-dial-rail';rail.setAttribute('role','group');rail.setAttribute('aria-label','Language');wheel.append(rail);document.body.append(wheel);let closing=false;async function dismissWheel(){if(!wheel.open||closing||changing)return;closing=true;clearTimeout(settleTimer);wheel.classList.add('is-leaving');await new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion:reduce)').matches?0:700));wheel.close();wheel.classList.remove('is-leaving');closing=false;}trigger.onclick=()=>{if(closing)return;wheel.showModal();requestAnimationFrame(center);};wheel.addEventListener('click',e=>{if(e.target===wheel)void dismissWheel();});wheel.addEventListener('cancel',e=>{e.preventDefault();void dismissWheel();});
 window.resetLanguageHello=animateLanguageNames(trigger,wheel,languages);
 let settleTimer,moving=false;
 const choices=languages.map(([id,label])=>{const choice=document.createElement('button');choice.type='button';choice.textContent=label;choice.dataset.locale=id;choice.onclick=()=>void toggle(id).then(()=>dismissWheel()).catch(error=>{button.title=error.message;});rail.append(choice);return choice;});
 function center(){const active=choices.find(c=>c.dataset.locale===currentLocale);if(active)rail.scrollTo({top:active.offsetTop-(rail.clientHeight-active.offsetHeight)/2,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}
 window.syncLanguageDial=()=>{for(const c of choices)c.setAttribute('aria-pressed',String(c.dataset.locale===currentLocale));moving=true;center();setTimeout(()=>moving=false,450);};
 rail.addEventListener('scroll',()=>{const midpoint=rail.scrollTop+rail.clientHeight/2;for(const c of choices){const distance=Math.abs(c.offsetTop+c.offsetHeight/2-midpoint);c.classList.toggle('is-centered',distance<22);c.style.filter=`blur(${Math.min(2.3,distance/45)}px)`;c.style.opacity=String(Math.max(.3,1-distance/105));}button.classList.add('is-turning');clearTimeout(settleTimer);settleTimer=setTimeout(()=>{button.classList.remove('is-turning');if(moving||changing||closing||!wheel.open)return;const nearest=choices.reduce((best,c)=>Math.abs(c.offsetTop+c.offsetHeight/2-midpoint)<Math.abs(best.offsetTop+best.offsetHeight/2-midpoint)?c:best);if(nearest.dataset.locale!==currentLocale)void toggle(nearest.dataset.locale).then(()=>dismissWheel()).catch(()=>center());},180);},{passive:true});
 let drag=null;rail.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')drag={x:e.clientY,left:rail.scrollTop};});window.addEventListener('pointermove',e=>{if(drag&&Math.abs(e.clientY-drag.x)>3){rail.scrollTop=drag.left+drag.x-e.clientY;}});window.addEventListener('pointerup',()=>drag=null);
 rail.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=languages.findIndex(l=>l[0]===currentLocale);void toggle(languages[(i+(e.key==='ArrowRight'?1:-1)+languages.length)%languages.length][0]);});
 const anchor=document.querySelector('.top .brand');if(anchor){const group=document.createElement('div');group.className='brand-language-group';anchor.before(group);group.append(anchor,button);}else{const header=document.querySelector('main>header,body>header');if(header){header.classList.add('language-page-header');header.append(button);}else document.body.prepend(button);}
 requestAnimationFrame(center);

 observer=new MutationObserver(records=>{for(const record of records){if(record.type==='childList')for(const node of record.addedNodes)pending.add(node);else pending.add(record.target);}if(scheduled)return;scheduled=true;requestAnimationFrame(()=>paint(false));});
 let locale='zh';try{locale=localStorage.getItem('suda-piano-language')||'zh';}catch{}
 const linkLocale=new URLSearchParams(location.search).get('lang');if(languages.some(l=>l[0]===linkLocale))locale=linkLocale;
 setLanguage('zh');if(locale!=='zh')void toggle(locale).catch(()=>{});window.sudaLanguage={set:toggle,missing:()=>[...missing],refresh:paint,translate,getLocale:()=>currentLocale,languages:languages.map(l=>l[0])};
 Promise.all([fetch('/narration/mentor-script.json').then(r=>r.json()),fetch('/narration/mentor-script.en.json').then(r=>r.json())]).then(([zh,en])=>{for(const chapter of zh){const translated=en.find(item=>item.id===chapter.id);if(translated){dictionary[chapter.text]=translated.text;dictionary[chapter.title]=translated.title;}}paint();}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
