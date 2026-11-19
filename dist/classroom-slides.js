import {resourceId} from './resource-id.js';
import {designClassroomSlide} from './classroom-slide-design.js';
import {classroomGeometry,classroomPalette,classroomTextColor} from './classroom-theme.js';
import {attachActivityMusic,activityMusicScript} from './classroom-music-bridge.js';
import {classroomChart} from './classroom-chart.js';
const element=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n};
const safeColor=(v,fallback='#333333')=>/^(#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|white|black)$/i.test(v||'')?v:fallback;
let mathRenderer;
function renderMath(node,latex){
 if(!document.querySelector('[data-classroom-math-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/vendor/katex/katex.min.css';link.dataset.classroomMathStyle='';document.head.append(link)}
 node.textContent=latex;mathRenderer ||= import('/vendor/katex/katex.mjs');mathRenderer.then(({default:katex})=>katex.render(latex,node,{throwOnError:false,trust:false,output:'htmlAndMathml'})).catch(()=>{});
}
function richText(html){
 const source=new DOMParser().parseFromString(String(html||''),'text/html').body,fragment=document.createDocumentFragment();
 function copy(node,parent){if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return}if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','SVG','IMG'].includes(node.tagName))return;const tag=['P','SPAN','STRONG','B','EM','I','BR','UL','OL','LI','SUP','SUB'].includes(node.tagName)?node.tagName.toLowerCase():'span',out=document.createElement(tag);const style=node.style;for(const key of ['fontSize','fontWeight','fontStyle','textAlign','lineHeight']){const value=style[key];if(value&&/^[\w\d. %+-]+$/.test(value))out.style[key]=value;}if(style.color)out.style.color=safeColor(classroomTextColor(style.color));parent.append(out);for(const child of node.childNodes)copy(child,out)}
 for(const node of source.childNodes)copy(node,fragment);return fragment;
}
export function renderSlide(canvas,options={}){
 canvas=designClassroomSlide(canvas,options);
 const outer=element('div','classroom-slide-viewport'),stage=element('div','classroom-slide-canvas');outer.append(stage);stage.style.width='1000px';stage.style.height='562.5px';
 stage.style.background=classroomPalette.paper;stage.classList.add('classroom-suda-template');
 const templateFrame=element('div','classroom-template-frame'),heading=element('div','classroom-template-brand'),seal=element('img','classroom-template-seal'),names=element('div'),school=element('strong'),english=element('span'),watermark=element('img','classroom-template-watermark'),footer=element('div','classroom-template-footer');
 seal.src=watermark.src='/suda-seal.svg';seal.alt='苏州大学校徽';watermark.alt='';watermark.setAttribute('aria-hidden','true');school.textContent='苏州大学';english.textContent='SOOCHOW UNIVERSITY';names.append(school,english);heading.append(seal,names);footer.textContent=options.page?String(options.page).padStart(2,'0')+(options.total?' / '+String(options.total).padStart(2,'0'):''):'';templateFrame.append(heading,watermark,footer);stage.append(templateFrame);
 if(options.cover)stage.classList.add('classroom-template-cover');
 const content=element('div','classroom-template-content');stage.append(content);
 const creditIds=new Set((canvas.elements||[]).filter(e=>e.type==='image').map(e=>e.id+'-credit'));
 for(const e of (canvas.elements||[]).filter(e=>!creditIds.has(e.id)).slice(0,160)){
  const n=element('div','classroom-ppt-element');n.dataset.elementId=e.id||'';n.dataset.elementType=e.type||'';
  const finite=(v,f)=>Number.isFinite(Number(v))?Number(v):f;
  Object.assign(n.style,{left:finite(e.left,0)+'px',top:finite(e.top,0)+'px',width:Math.max(1,finite(e.width,100))+'px',height:Math.max(1,finite(e.height,60))+'px',transform:`rotate(${finite(e.rotate,0)}deg)`,color:safeColor(classroomTextColor(e.defaultColor)),fontSize:Math.max(10,Math.min(80,finite(e.fontSize,22)))+'px'});
  if(e.type==='text')n.append(richText(e.content||e.text));
  else if(e.type==='code'){const code=element('pre');code.textContent=e.content||'';n.append(code)}
  else if(e.type==='video'&&/^(https:\/\/|\/)/.test(e.src||'')){const video=element('video');video.src=e.src;video.controls=true;video.preload='none';video.playsInline=true;n.append(video)}
  else if(e.type==='shape'){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');const vb=Array.isArray(e.viewBox)?e.viewBox:[100,100];svg.setAttribute('viewBox',`0 0 ${Number(vb[0])||100} ${Number(vb[1])||100}`);svg.setAttribute('preserveAspectRatio','none');if(/^[MLHVCSQTAZ\d\s.,e+\-]+$/i.test(e.path||''))path.setAttribute('d',e.path);else path.setAttribute('d',`M0 0 H${vb[0]} V${vb[1]} H0Z`);path.setAttribute('fill',safeColor(e.fill,'#eee8e0'));svg.append(path);n.append(svg);
  }else if(e.type==='image'&&/^(https:\/\/|data:image\/(png|jpeg|webp|gif);base64,|\/)/.test(e.src||'')){const image=element('img');image.src=e.src;image.alt=e.alt||'';image.loading='eager';image.style.width='100%';image.style.height='100%';image.style.objectFit='contain';image.referrerPolicy='no-referrer';n.append(image);}
  else if(e.type==='line'){const start=e.start||[0,0],end=e.end||[100,0],w=Math.max(1,Math.abs(end[0]-start[0])),h=Math.max(1,Math.abs(end[1]-start[1]));n.style.width=w+'px';n.style.height=h+'px';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS(svg.namespaceURI,'line');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.style.overflow='visible';line.setAttribute('x1',start[0]<=end[0]?0:w);line.setAttribute('x2',start[0]<=end[0]?w:0);line.setAttribute('y1',start[1]<=end[1]?0:h);line.setAttribute('y2',start[1]<=end[1]?h:0);line.setAttribute('stroke',safeColor(classroomTextColor(e.color),'#944f43'));line.setAttribute('stroke-width',Math.max(1,finite(e.width,2)));svg.append(line);n.append(svg);}
  else if(e.type==='chart'){n.append(classroomChart(e));}
  else if(e.type==='table'){const table=element('table');for(const row of e.data||[]){const tr=element('tr');for(const cell of row){const td=element('td');td.append(richText(cell.text||cell.content||''));td.colSpan=Number(cell.colspan)||1;td.rowSpan=Number(cell.rowspan)||1;tr.append(td)}table.append(tr)}n.append(table)}
  else if(e.type==='latex'){renderMath(n,e.latex||'')}
  else continue;
  content.append(n);
 }
 let frame=0,last=0;let logicalWidth=1000,logicalHeight=562.5;
 const fitContent=()=>{
  for(const n of stage.querySelectorAll('[data-element-type=text]')){
   for(let attempt=0;attempt<12&&n.scrollHeight>n.clientHeight+2;attempt++){
    const current=parseFloat(n.style.fontSize)||22;
    n.style.fontSize=Math.max(12,current*.9)+'px';
    for(const child of n.querySelectorAll('[style]'))if(child.style.fontSize){const size=parseFloat(child.style.fontSize);if(Number.isFinite(size))child.style.fontSize=Math.max(12,size*.9)+'px';if(child.style.lineHeight.endsWith('px'))child.style.lineHeight=Math.max(15,parseFloat(child.style.lineHeight)*.9)+'px'}
   }
   if(n.scrollHeight>n.clientHeight+2){const oldHeight=n.offsetHeight,growth=n.scrollHeight-oldHeight,top=parseFloat(n.style.top)||0,left=parseFloat(n.style.left)||0;n.style.height=n.scrollHeight+'px';for(const sibling of stage.querySelectorAll('.classroom-ppt-element')){if(sibling===n||!['text','image','table','chart','latex'].includes(sibling.dataset.elementType))continue;const y=parseFloat(sibling.style.top)||0,x=parseFloat(sibling.style.left)||0;if(y>=top+oldHeight-1&&x<left+n.offsetWidth&&x+sibling.offsetWidth>left)sibling.style.top=(y+growth+8)+'px';}}
  }
  // Include elements outside the model's nominal canvas instead of clipping them.
  let contentHeight=562.5;
  for(const n of stage.querySelectorAll('.classroom-ppt-element')){logicalWidth=Math.max(logicalWidth,(parseFloat(n.style.left)||0)+n.offsetWidth+16);contentHeight=Math.max(contentHeight,(parseFloat(n.style.top)||0)+n.offsetHeight+16)}
  const geometry=classroomGeometry(logicalWidth,contentHeight);content.style.left=geometry.bodyX+'px';content.style.top=geometry.bodyY+'px';content.style.width=logicalWidth+'px';content.style.height=contentHeight+'px';
  stage.style.width=geometry.width+'px';stage.style.height=geometry.height+'px';outer.style.aspectRatio=geometry.width+'/'+geometry.height;
  logicalHeight=geometry.height;
 };
 const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{fitContent();const width=outer.clientWidth;if(!width)return;last=width;const stageWidth=parseFloat(stage.style.width);stage.style.transform=`scale(${width/stageWidth})`;outer.style.height=width*logicalHeight/stageWidth+'px';})};const observer=new ResizeObserver(()=>{if(outer.clientWidth!==last)resize()});observer.observe(outer);resize();

 return {element:outer,dispose(){cancelAnimationFrame(frame);observer.disconnect()}};
}
window.addEventListener('message',event=>{
 if(event.data?.type==='classroom-observation'||event.data?.type==='classroom-action-result'){
  for(const iframe of document.querySelectorAll('.classroom-interactive'))if(iframe.contentWindow===event.source&&iframe.classroomChannel===event.data.channel){iframe.classroomReceive?.(event.data);break}return;
 }
 if(event.data?.type!=='classroom-size')return;
 for(const iframe of document.querySelectorAll('.classroom-interactive'))if(iframe.contentWindow===event.source&&iframe.classroomChannel===event.data.channel){const height=Number(event.data.height);if(Number.isFinite(height)){const next=Math.max(600,Math.min(2400,height));if(iframe.style.height!==next+'px')iframe.style.height=next+'px'}break}
});
export function renderInteractive(content,onObservation=()=>{},musicHost=null){
 const iframe=element('iframe','classroom-interactive');iframe.title='课堂互动活动';iframe.setAttribute('sandbox','allow-scripts');iframe.setAttribute('allow','autoplay');iframe.setAttribute('referrerpolicy','no-referrer');
 const channel='classroom-'+Math.random().toString(36).slice(2);
 if(musicHost)attachActivityMusic(iframe,channel,musicHost);
 iframe.classroomChannel=channel;
 let sequence=0;const pending=new Map();
 iframe.classroomReceive=data=>{if(data.type==='classroom-observation')onObservation(data.value);else{const item=pending.get(data.requestId);if(item){clearTimeout(item.timer);pending.delete(data.requestId);data.error?item.reject(Error(data.error)):item.resolve(data.result)}}};
 iframe.classroomExecute=action=>new Promise((resolve,reject)=>{const requestId=++sequence,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('互动页面没有确认操作，请稍后重试'))},4000);pending.set(requestId,{resolve,reject,timer});iframe.contentWindow.postMessage({type:'classroom-widget-action',channel,requestId,action},'*')});
 iframe.classroomVisibility=visible=>iframe.contentWindow?.postMessage({channel,visible},'*');
 const lifecycle=`<script>(()=>{let visible=true,sequence=0;const frames=new Map(),nativeFrame=requestAnimationFrame.bind(window),nativeCancel=cancelAnimationFrame.bind(window),nativeInterval=setInterval.bind(window);function schedule(id){const item=frames.get(id);if(!item||!visible)return;item.native=nativeFrame(time=>{if(!frames.has(id))return;item.native=null;if(!visible)return;frames.delete(id);item.callback(time)})}window.requestAnimationFrame=callback=>{const id=++sequence;frames.set(id,{callback,native:null});schedule(id);return id};window.cancelAnimationFrame=id=>{const item=frames.get(id);if(item?.native)nativeCancel(item.native);frames.delete(id)};window.setInterval=(callback,delay,...args)=>nativeInterval(()=>{if(visible&&typeof callback==='function')callback(...args)},Math.max(16,Number(delay)||0));addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!==${JSON.stringify(channel)})return;visible=!!event.data.visible;if(visible){for(const id of frames.keys())schedule(id)}else{for(const item of frames.values())if(item.native){nativeCancel(item.native);item.native=null}}})})()<\/script>`;
 const sizing=`<script>(()=>{let timer,lastWidth=innerWidth;function measure(){clearTimeout(timer);timer=setTimeout(()=>{const body=document.body;if(body)parent.postMessage({type:'classroom-size',channel:${JSON.stringify(channel)},height:Math.ceil(Math.max(body.scrollHeight,body.getBoundingClientRect().height))+16},'*')},120)}addEventListener('load',measure);addEventListener('DOMContentLoaded',measure);addEventListener('resize',()=>{if(innerWidth!==lastWidth){lastWidth=innerWidth;measure()}});document.addEventListener('click',measure);document.addEventListener('input',measure);setTimeout(measure,1000)})()<\/script>`;
 // Optional formula decoration must not abort an otherwise self-contained activity.
 const activityHtml=String(content.html||'').replace(/(?<![\w.])renderMathInElement\s*\(document\.body/g,'window.renderMathInElement?.(document.body');
 const bridge=`<script>(()=>{const channel=${JSON.stringify(channel)};let timer;function report(value){const text=JSON.stringify(value);if(text.length<=10000)parent.postMessage({type:'classroom-observation',channel,value},'*')}window.maic={report,state:{}};document.addEventListener('click',event=>{const target=event.target.closest('button,[role=button],input,select');if(target)setTimeout(()=>report({kind:/提交|完成|检查|确认|submit|check/i.test(target.textContent||'')?'submission':'interaction',target:target.id||target.getAttribute('aria-label')||target.textContent?.slice(0,120),value:target.type==='password'?'':target.value,checked:target.checked,state:window.maic.state}),0)});document.addEventListener('change',event=>{const target=event.target;if(target.matches('input,textarea,select')&&target.type!=='password')report({kind:'answer',target:target.id||target.name,value:target.value?.slice(0,3000),checked:target.checked})});addEventListener('message',event=>{if(event.source!==parent||event.data?.channel!==channel||event.data.type!=='classroom-widget-action')return;const {action,requestId}=event.data;try{if(action.type==='widget_setState'){Object.assign(window.maic.state,action.state||{});dispatchEvent(new CustomEvent('maic-state',{detail:window.maic.state}));dispatchEvent(new MessageEvent('message',{data:{type:'SET_WIDGET_STATE',state:window.maic.state}}))}else{const node=document.querySelector(action.target);if(!node)throw Error('活动中没有找到这个区域');if(action.type==='widget_reveal'){node.hidden=false;node.style.display='';node.style.visibility='visible'}else if(action.type==='widget_highlight'){document.querySelectorAll('[data-maic-highlight]').forEach(n=>{n.style.outline='';delete n.dataset.maicHighlight});node.dataset.maicHighlight='';node.style.outline='3px solid #874357'}else if(action.type==='widget_annotation'){const note=document.createElement('p');note.className='maic-annotation';note.textContent=action.content||'';node.after(note)}}parent.postMessage({type:'classroom-action-result',channel,requestId,result:{ok:true}},'*')}catch(error){parent.postMessage({type:'classroom-action-result',channel,requestId,error:error.message},'*')}});addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{const n=document.querySelector('script[data-maic-observation]');if(n)try{report({kind:'state',value:JSON.parse(n.textContent)})}catch{}},250)}).observe(document.body,{subtree:true,childList:true,characterData:true})})})()<\/script>`;
 iframe.srcdoc=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>body{margin:0;font-family:system-ui,sans-serif}*{box-sizing:border-box}</style>${lifecycle}${sizing}${bridge}${musicHost?activityMusicScript(channel):''}${activityHtml}`;
 return iframe;
}
export function classroomActions(root){
 let view=null,elements=[];const board=element('div','classroom-whiteboard');board.hidden=true;root.append(board);
 const redraw=()=>{view?.dispose();view=renderSlide({elements,background:{color:'#f6f0e5'}});board.replaceChildren(view.element)};
 return {snapshot:()=>elements.map(e=>({...e})),dispose(){view?.dispose();board.remove()},apply(action){
  if(action.type?.startsWith('widget_')){const iframe=root.querySelector('.classroom-interactive');if(!iframe)throw Error('当前环节没有互动页面');return iframe.classroomExecute(action)}
  if(action.type==='play_video'){const node=[...root.querySelectorAll('[data-element-id]')].find(n=>n.dataset.elementId===action.elementId),video=node?.querySelector('video');if(!video)throw Error('当前课件中没有对应视频');return new Promise((resolve,reject)=>{const end=()=>{cleanup();resolve()},failed=()=>{cleanup();reject(Error('课堂视频未能播放'))},cancel=()=>{video.pause();cleanup();resolve({cancelled:true})},cleanup=()=>{delete video.dataset.classroomPlaying;video.removeEventListener('ended',end);video.removeEventListener('error',failed);video.removeEventListener('classroom-cancel',cancel)};video.dataset.classroomPlaying='true';video.addEventListener('ended',end,{once:true});video.addEventListener('error',failed,{once:true});video.addEventListener('classroom-cancel',cancel,{once:true});video.play().catch(error=>{cleanup();reject(error)})})}
  if(action.type==='wb_edit_code'){const e=elements.find(e=>e.id===action.elementId);if(!e)throw Error('未找到板书代码');const lines=e.content.split('\n'),at=Math.max(0,Number(action.lineId||1)-1),ids=(action.lineIds||[action.lineId||1]).map(Number).filter(Number.isFinite).sort((a,b)=>b-a);if(action.operation==='delete_lines')for(const id of ids)lines.splice(Math.max(0,id-1),1);else if(action.operation==='replace_lines'){for(const id of ids)lines.splice(Math.max(0,id-1),1);lines.splice(at,0,String(action.content||''))}else lines.splice(at+(action.operation==='insert_after'?1:0),0,String(action.content||''));e.content=lines.join('\n');redraw();return}
  if(action.type==='spotlight'||action.type==='laser'){
   if(action.elementId&&!Array.from(root.querySelectorAll('[data-element-id]')).some(n=>n.dataset.elementId===action.elementId))throw Error('当前课件没有这个标注区域：'+action.elementId);
   root.querySelectorAll('.is-speaking').forEach(n=>n.classList.remove('is-speaking'));
   root.querySelectorAll('.classroom-laser-dot,.classroom-focus-shade').forEach(n=>n.remove());
   root.querySelectorAll('.classroom-selection-frame').forEach(n=>n.remove());
   for(const n of root.querySelectorAll('[data-element-id]'))if(n.dataset.elementId===action.elementId){
    n.classList.add('is-speaking');const stage=n.closest('.classroom-template-content')||n.closest('.classroom-slide-canvas');
    if(stage){const frame=element('div','classroom-selection-frame');frame.dataset.selectedElement=action.elementId;for(const key of ['left','top','width','height','transform'])frame.style[key]=n.style[key];stage.append(frame);if(action.type==='laser'){const dot=element('i','classroom-laser-dot');dot.style.left=(parseFloat(n.style.left)+parseFloat(n.style.width)*.82)+'px';dot.style.top=(parseFloat(n.style.top)+parseFloat(n.style.height)*.65)+'px';stage.append(dot)}else{const shade=element('div','classroom-focus-shade');for(const key of ['left','top','width','height','transform'])shade.style[key]=n.style[key];stage.append(shade)}}
   }
  }
  if(action.type==='wb_open'){board.hidden=false;redraw()}
  if(action.type==='wb_close')board.hidden=true;
  if(action.type==='wb_clear'){elements=[];redraw()}
  if(action.type==='wb_delete'){elements=elements.filter(e=>e.id!==action.elementId);redraw()}
  if(action.type?.startsWith('wb_draw_')){
   const common={id:action.elementId||action.id,left:action.x||0,top:action.y||0,width:action.width||500,height:action.height||90,fontSize:action.fontSize||22};
   let e;if(action.type==='wb_draw_text')e={...common,type:'text',content:action.text||action.content||'',defaultColor:action.color||'#333333'};
   if(action.type==='wb_draw_shape')e={...common,type:'shape',viewBox:[100,100],path:action.shape==='triangle'?'M50 0 L100 100 L0 100Z':action.shape==='circle'?'M50 0 A50 50 0 1 1 49.9 0Z':'M0 0 H100 V100 H0Z',fill:action.fillColor};
   if(action.type==='wb_draw_chart')e={...common,type:'chart',chartType:action.chartType,data:action.data,themeColors:action.themeColors};
   if(action.type==='wb_draw_table')e={...common,type:'table',data:(action.data||[]).map(row=>row.map(text=>({text})))};
   if(action.type==='wb_draw_line')e={...common,type:'line',left:Math.min(action.startX,action.endX),top:Math.min(action.startY,action.endY),start:[0,0],end:[Math.abs(action.endX-action.startX),Math.abs(action.endY-action.startY)],color:action.color,width:action.width||2};
   if(action.type==='wb_draw_latex')e={...common,type:'latex',latex:action.latex||''};
   if(action.type==='wb_draw_code')e={...common,type:'code',content:action.code||''};
   if(e){e.id ||= 'board-'+resourceId();elements=elements.filter(x=>x.id!==e.id);elements.push(e);board.hidden=false;redraw();const added=[...board.querySelectorAll('[data-element-id]')].find(n=>n.dataset.elementId===e.id);if(added)added.classList.add('classroom-board-writing')}
  }
  if(action.type==='discussion'){root.querySelectorAll('.classroom-discussion-prompt').forEach(n=>n.remove());const prompt=element('p','classroom-discussion-prompt');prompt.textContent=action.topic||action.prompt||'分享你的聆听感受';root.append(prompt);return 'pause'}
 }};
}
