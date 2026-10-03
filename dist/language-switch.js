import {dictionary,translateDynamic} from './translations-en.js';
const originals=new WeakMap(),attributes=new WeakMap(),missing=new Set();
const excluded='script,style,textarea,input,[contenteditable],#language-switch,canvas';
let english=false,observer,changing=false,scheduled=false;
const pending=new Set();
export function translate(value){const text=value.trim();return dictionary[text]??translateDynamic(text)??null;}
function textNode(node){
 if(node.parentElement?.closest(excluded))return;
 const previous=originals.get(node),source=previous&&node.data===previous.rendered?previous.source:node.data;
 const translation=english?translate(source):null,rendered=translation===null?source:source.replace(source.trim(),translation);
 if(english&&translation===null&&/[\u3400-\u9fff]/.test(source))missing.add(source.trim());
 originals.set(node,{source,rendered});if(node.data!==rendered)node.data=rendered;
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
 english=locale==='en';document.documentElement.lang=english?'en':'zh-CN';
 try{localStorage.setItem('suda-piano-language',locale);}catch{}
 const button=document.getElementById('language-switch');button.textContent=english?'中文':'English';button.setAttribute('aria-label',english?'Switch to Chinese':'切换为英文');
 paint();document.dispatchEvent(new CustomEvent('languagechange',{detail:{locale}}));
}
async function toggle(){
 if(changing)return;changing=true;const button=document.getElementById('language-switch');button.disabled=true;
 const locale=english?'zh':'en',surfaces=[document.querySelector('.workspace'),document.querySelector('.tour-home-intro')].filter(Boolean),animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 try{
  if(animate)await Promise.all(surfaces.map(el=>el.animate([{transform:'perspective(1600px) rotateY(0deg)',opacity:1},{transform:'perspective(1600px) rotateY(-5deg) translateZ(-22px)',opacity:.3}],{duration:180,easing:'ease-in'}).finished.catch(()=>{})));
  setLanguage(locale);
  if(animate)await Promise.all(surfaces.map(el=>el.animate([{transform:'perspective(1600px) rotateY(5deg) translateZ(-22px)',opacity:.3},{transform:'perspective(1600px) rotateY(0deg)',opacity:1}],{duration:360,easing:'cubic-bezier(.16,1,.3,1)'}).finished.catch(()=>{})));
 }finally{changing=false;button.disabled=false;}
}
function init(){
 const button=document.createElement('button');button.id='language-switch';button.type='button';button.className='language-toggle';button.onclick=toggle;document.querySelector('.top .edition')?.before(button);
 observer=new MutationObserver(records=>{for(const record of records){if(record.type==='childList')for(const node of record.addedNodes)pending.add(node);else pending.add(record.target);}if(scheduled)return;scheduled=true;requestAnimationFrame(()=>paint(false));});
 let locale='zh';try{locale=localStorage.getItem('suda-piano-language')||'zh';}catch{}
 setLanguage(locale);window.sudaLanguage={set:setLanguage,missing:()=>[...missing],refresh:paint};
 Promise.all([fetch('/narration/mentor-script.json').then(r=>r.json()),fetch('/narration/mentor-script.en.json').then(r=>r.json())]).then(([zh,en])=>{for(const chapter of zh){const translated=en.find(item=>item.id===chapter.id);if(translated){dictionary[chapter.text]=translated.text;dictionary[chapter.title]=translated.title;}}paint();}).catch(()=>{});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
