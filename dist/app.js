// The drum staff lives in its own card under the score. It used to be
// prepended into #notation, where it shared the piano sheet's container and
// scroll position and so read as one score with two extra staves.
function drumHits(current){return current?.events?.flatMap((event,index)=>event.notes.filter(note=>note.percussion||note.instrument==='drums').map(note=>({event,index,note})))||[];}
// General MIDI percussion notes grouped by the staff line a drummer writes them on.
const DRUM_LINES={49:0,57:0,51:0,55:0,52:0,42:0,44:0,46:0,50:1,48:1,40:1,38:2,47:2,45:3,43:3,41:3,36:4,35:4};
let drumActiveIndex=null;
function renderDrumLane(current){
 const card=$('drum-card'),staff=$('drum-staff');
 if(!card||!staff)return;
 if(current?.xml?.includes("<unpitched")){card.hidden=true;return;}
 drumActiveIndex=null;
 const hits=drumHits(current);
 staff.replaceChildren();
 if(!hits.length){card.hidden=true;return;}
 const bars=hits.reduce((max,{event})=>Math.max(max,event.measure||1),1);
 if($('drum-summary'))$('drum-summary').textContent=`Drum staff · ${bars} 小节 · ${hits.length} 击 · 左右滑动查看`;
 for(let index=0;index<5;index++)staff.append(document.createElement('i'));
 for(const {event,index,note} of hits){
  const mark=document.createElement('button');mark.type='button';mark.className='drum-hit';mark.dataset.index=String(index);
  // Placed on its own staff line the way a drum part is written: cymbals and
  // hi-hat on top, snare in the middle, toms descending, kick at the bottom.
  mark.style.setProperty('--line',String(DRUM_LINES[note.midi]??2));
  mark.textContent=note.midi>=42?'×':note.midi>=36?'●':'◆';
  mark.title=`第 ${event.measure} 小节 · 第 ${Math.round((event.offset||0)+1)} 拍`;
  mark.setAttribute('aria-label',mark.title);
  mark.onclick=()=>void playFromNote(index);
  staff.append(mark);
 }
 card.hidden=false;
}
function refreshDrumLane(){if(score)renderDrumLane(score);}
// The playhead is only repainted when it moves: this runs inside the playback
// animation frame, and a long drum part holds hundreds of hits.
function syncDrumLane(index){
 const staff=$('drum-staff');
 if(!staff||index===drumActiveIndex)return;
 drumActiveIndex=index;
 let active=null;
 for(const mark of staff.querySelectorAll('.drum-hit')){
  const on=Number(mark.dataset.index)===index;
  mark.classList.toggle('current',on);
  if(on)active=mark;
 }
 active?.scrollIntoView({block:'nearest',inline:'nearest'});
}
import {initArrangements,applyArrangement,ARRANGEMENT_NAMES} from './arrangements.js';
import {titleFromBlocks} from './title-candidates.js';
import {enqueueUploads,reportTask,showTasks} from './task-center.js?v=scan3';
import {INSTRUMENTS} from './instruments.js';
import {preloadPianoSamples} from './piano-samples.js';
import {analyzeHarmony,detectChord} from './harmony.js';
import { parseMusicXML, sampleScore, renderNotation, noteName } from './score.js';
import { renderSimpleNotation } from './simple-notation.js';
import { sheetWidth } from './engraving.js';
import './vendor/typedarray-compat.mjs';
import { PitchListener, Follower, summarize } from './engine.js';
import { ScorePlayer } from './player.js';
import { setupScoreEditing } from './score-editing.js';
import { initLibrary, cleanText } from './library.js';
import { initMediaImport } from './media-import.js';

// PDF.js 5.x uses newer Web APIs that are absent in some embedded Chromium
// builds used on the campus intranet. Install small compatibility fallbacks
// before loading PDF.js so the import cannot fail at module evaluation time.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn, ...args) {
    return Promise.resolve().then(() => fn(...args));
  };
}
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value(index) {
      const numeric = Number(index) || 0;
      const position = numeric < 0 ? this.length + numeric : numeric;
      return this[position];
    },
    configurable: true,
    writable: true
  });
}
// PDF.js also uses URL.parse, which is absent in several Chromium/Edge builds.
if (typeof URL.parse !== 'function') {
  URL.parse = (url, base) => {
    try { return new URL(url, base); } catch { return null; }
  };
}

const $ = id => document.getElementById(id);
for (const href of ['/toast.css', '/liquid.css', '/responsive-fix.css', '/ios.css']) {
 const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.append(link);
}
const refreshLibrary=initLibrary({openPending:openPendingScore,recognizeTitle:recognizeCloudTitle,matchCover:matchScoreCover,openPdf:async file=>{unlockForImport();await uploadPdf(file);},openScore:async (data,onProgress=()=>{})=>{
 const pendingKey=data.id||data.xml;let prepared=parsedScoreCache.get(pendingKey);
 const contentSignature=scoreFingerprintFallback(new TextEncoder().encode(data.xml+JSON.stringify(data.metadata||{})+'|timing-v3'));
 if(prepared?.contentSignature!==contentSignature){prepared=null;for(const key of notationCache.keys())if(key.startsWith(`${pendingKey}:`))notationCache.delete(key);}
 onProgress(38,'解析节奏与声部');setImportProgress(38,'正在解析节奏与声部');if(!prepared){await new Promise(r=>setTimeout(r,0));prepared=applyScoreMetadata(parseMusicXML(data.xml),data.metadata);prepared.serverId=data.id;parsedScoreCache.set(pendingKey,prepared);}
 prepared.contentSignature=contentSignature;prepared.variants=data.variants||null;
 prepared.onRenderProgress=ratio=>{const value=52+Math.round(ratio*32);onProgress(value,'正在排版五线谱');setImportProgress(value,'正在排版五线谱');};
 const width=sheetWidth($('notation')),renderKey=`${pendingKey}${prepared.variants?.active?'@'+prepared.variants.active:''}:engraved:${width}`;
 if(!notationCache.has(renderKey)){const storedMarkup=await readNotationCache(renderKey);if(storedMarkup){const restored=document.createElement('div');restored.innerHTML=storedMarkup;notationCache.set(renderKey,restored);onProgress(86,'载入设备排版缓存');setImportProgress(86,'正在载入设备排版缓存');}}
 if(!notationCache.has(renderKey)){onProgress(52,'排版完整五线谱');setImportProgress(52,'正在排版完整五线谱');const staging=document.createElement('div');staging.style.cssText=`position:fixed;left:-20000px;top:0;width:${width}px;opacity:0;pointer-events:none`;const inner=document.createElement('div');staging.append(inner);document.body.append(staging);try{await renderNotation(inner,prepared);notationCache.set(renderKey,inner.cloneNode(true));void writeNotationCache(renderKey,inner.innerHTML);}finally{staging.remove();}}else{onProgress(86,'载入已缓存排版');setImportProgress(86,'正在载入缓存排版');}
 selectedJob=null;uploadVersion++;cancelPdfLoading();stop();player.stop();sourceFile=null;pdfDocument?.destroy();pdfDocument=null;pdfPageEls=[];storedPdfId=null;storedPdfPages=0;if(nativePdfUrl){URL.revokeObjectURL(nativePdfUrl);nativePdfUrl=null;}$('pdf-pages').replaceChildren();$('original-button').disabled=!data.hasPdf;$('retry-import').hidden=true;importing=false;
 const cacheKey=data.id||data.xml;let parsed=parsedScoreCache.get(cacheKey);if(!parsed){parsed=applyScoreMetadata(parseMusicXML(data.xml),data.metadata);parsed.serverId=data.id;parsedScoreCache.set(cacheKey,parsed);}else applyScoreMetadata(parsed,data.metadata);onProgress(91,'装入演奏位置与控件');await setScore(parsed);$('file-info').textContent=parsed.title;onProgress(100,'载入完成');setImportProgress(100,'已从 SUPERTANG CLOUD云服务进行载入','done');message('已从 SUPERTANG CLOUD云服务进行载入');
 if(data.hasPdf) void loadStoredPdf(data.id);void loadCachedExpression(parsed);
}});
let paintedIndex=-1,paintedScore=null,followUntil=0;
let score=null, follower=null, listener=null, records=[], sourceFile=null, pdfDocument=null, scoreRenderGeneration=0;
let running=false, starting=false, demo=false, demoTimer=null, uploadVersion=0, currentView='notation', notationMode='engraved';
let playbackView=false, importing=false, lastPlaybackIndex=-1, pdfLoading=null, pdfPageEls=[], nativePdfUrl=null, storedPdfId=null, storedPdfPages=0;
const parsedScoreCache=new Map(),notationCache=new Map();
let pdfGeometryFrame=0,pdfPendingIndex=-1,pdfLastScrollPage=0;
// Assigned once the throttled implementation below is declared. A single owner
// keeps page numbering consistent between the cursor and the click handler.
let syncPdfPlayback=()=>{};
let importProgressValue=0, importProgressShown=0, importProgressFrame=0, importProgressClock=0, ocrWorkerPromise=null, metronomeLastBeat=-1;
function cancelPdfLoading(){if(!pdfLoading)return;const task=pdfLoading;pdfLoading=null;void Promise.resolve(task.destroy()).catch(()=>{});}
const player=new ScorePlayer({onUpdate:paintPlayback,onPulse:tickMetronome,onLoad:(done,total)=>{const pct=Math.round(done/Math.max(1,total)*100);$('play-status').textContent=`钢琴音源 ${pct}%`;
 setImportProgress(pct,`正在准备 SUPERTANG CLOUD 钢琴音源 ${done}/${total}`);},onEnd:()=>{controls();$('play-status').textContent='播放完毕，可从头重播。';setImportProgress(100,'钢琴音源已就绪','done');message('播放结束');}});
$('expressive').onchange=event=>{player.expressive=event.target.checked;};
function setNoteState(el,state){el.classList.remove('played','current','pending','correct','wrong');el.classList.add('note-event',state);}
function paintPlayback({beat,index,totalBeats}){
 syncDrumLane(index);
 const percent=Math.min(100,Math.round(beat/totalBeats*100));
 $('progress-label').textContent=`${percent}%`;$('progress-bar').style.width=`${percent}%`;
 $('progress-bar').parentElement.setAttribute('aria-valuenow',String(percent));
 $('position').textContent=`示范播放　第 ${score?.events[index]?.measure??1} 小节`;
 $('play-status').textContent=`${player.playing?'正在播放':'已暂停'}　${tempo()} BPM　第 ${Math.floor(beat)+1} 拍`;
 if($('chord-toggle')?.checked){const event=score?.events[index];const chord=event&&score.harmony?.get(event.measure);$('chord-display').textContent=chord?.name||'—';}
 if(paintedIndex!==index||paintedScore!==score){
  const selector=paintedScore!==score||index<paintedIndex?'.note-event':`.note-event.current,.note-event[data-index="${index}"]`;
  $('notation').querySelectorAll(selector).forEach(el=>{const i=Number(el.dataset.index);setNoteState(el,i<index?'played':i===index?'current':'pending');});paintedIndex=index;paintedScore=score;
 }
 syncPdfPlayback(index,beat);
 if(index!==lastPlaybackIndex&&['notation','simple'].includes(currentView)&&performance.now()>followUntil){lastPlaybackIndex=index;const target=$('notation').querySelector(`[data-index="${index}"]`);if(target){const scroll=$('sheet-scroll'),b=target.getBoundingClientRect(),area=scroll.getBoundingClientRect();if(b.top<area.top+15||b.bottom>area.bottom-25){followUntil=performance.now()+650;scroll.scrollTo({top:Math.max(0,scroll.scrollTop+b.top-area.top-scroll.clientHeight*.25),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}}}
 document.dispatchEvent(new CustomEvent('transport-state',{detail:{playing:player.playing}}));
}
async function getCachedPdfImage(id,pageNumber){
 const holder=document.querySelector(`#pdf-pages [data-page="${pageNumber}"]`);let progress=holder?.querySelector("progress");if(holder&&!progress){progress=document.createElement("progress");progress.max=100;progress.setAttribute("aria-label",`第 ${pageNumber} 页读取进度`);holder.append(progress);}
 const taskId=`pdf-${id}-${pageNumber}`;reportTask(taskId,{label:`原稿第 ${pageNumber} 页`,status:'running',detail:'读取页面',progress:undefined});const url=`/api/scores/${id}/page/${pageNumber}`;let response;
 try{
  const cache=await caches.open('piano-pdf-pages-v1');
  response=await cache.match(url);
  if(!response){response=await fetch(url,{cache:'no-cache'});if(response.ok)void cache.put(url,response.clone()).catch(()=>{});}
 }catch{response=await fetch(url,{cache:'no-cache'});}
 if(!response?.ok)throw Error(`第 ${pageNumber} 页暂时无法读取`);
 let blob;
 if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let received=0;const total=Number(response.headers.get('Content-Length'));while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length;if(progress&&total)progress.value=Math.min(95,received/total*95);}blob=new Blob(chunks,{type:'image/png'});}else blob=await response.blob();
 const blobUrl=URL.createObjectURL(blob),image=new Image();
 image.alt=`琴谱第 ${pageNumber} 页`;image.className='pdf-raster-page';image.decoding='async';image.style.cssText='display:block;width:100%;height:auto;background:#fff';image.src=blobUrl;
 await withTimeout(new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error(`第 ${pageNumber} 页服务端预览失败`));}),20000,`第 ${pageNumber} 页暂时无法读取`);
 reportTask(taskId,{status:'complete',progress:100,detail:'页面已显示'});if(progress)progress.value=100;image.width=image.naturalWidth;image.height=image.naturalHeight;URL.revokeObjectURL(blobUrl);return image;
}
async function loadPdfGeometry(id,pageNumber,rows){
 if(!id||!pageNumber)return;
 try{
  const data=await requestJSON(`/api/scores/${id}/geometry/${pageNumber}?rows=${Math.max(1,rows||1)}`);
  if(score?.serverId!==id&&storedPdfId!==id)return;
  score.pdfSystemBands=score.pdfSystemBands||{};score.pdfSystemBands[pageNumber]=data.bands||[];score.pdfDetectedMeasures=score.pdfDetectedMeasures||{};score.pdfDetectedMeasures[pageNumber]=data.measures||{};if(data.mappingIncomplete){const page=pdfPageEls[pageNumber-1];if(page)page.dataset.mapping='incomplete';}
  if(pdfPageEls.length)syncPdfPlayback(Math.max(0,player.next-1));
 }catch{}
}
async function loadStoredPdf(id){
 if(!id)return;storedPdfId=id;storedPdfPages=0;pdfPageEls=[];$('pdf-pages').replaceChildren();
 try{
  const info=await requestJSON(`/api/scores/${id}/info`);if(storedPdfId!==id)return;storedPdfPages=Math.min(30,Number(info.pages)||0);if(!storedPdfPages)return;
  $('original-button').disabled=false;const lazyPages=new Map();
  const loadPage=async(n,holder)=>{if(holder?.dataset.loading==='1'||holder?.dataset.loaded==='1')return;if(holder)holder.dataset.loading='1';const button=holder?.querySelector('button');if(button){button.disabled=true;button.textContent=`正在读取第 ${n} 页`;}try{const image=await getCachedPdfImage(id,n);if(storedPdfId!==id)return;const page=appendPdfPage(image,n);if(holder){holder.replaceWith(page);observer.unobserve(holder);}void loadPdfGeometry(id,n,score?.pdfPageRows?.[n]||1);syncPdfPlayback(Math.max(0,player.next-1));}catch{if(button){button.disabled=false;button.textContent=`第 ${n} 页预览未完成，点击重试`;}}finally{if(holder)holder.dataset.loading='0';}};
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){const n=lazyPages.get(entry.target);if(n)void loadPage(n,entry.target);}}),{root:$('sheet-scroll'),rootMargin:'900px 0px'});
  for(let n=1;n<=storedPdfPages;n++){
   const holder=document.createElement('div');holder.className='pdf-page-placeholder';holder.dataset.page=String(n);const button=document.createElement('button');button.className='small-button';button.textContent=n===1?'正在读取第 1 页':`准备读取第 ${n} 页`;button.onclick=()=>void loadPage(n,holder);holder.append(button);$('pdf-pages').append(holder);lazyPages.set(holder,n);observer.observe(holder);
  }
  const first=$('pdf-pages').firstElementChild;if(first)void loadPage(1,first);
 }catch(error){$('original-button').disabled=true;message(`原始 PDF 暂时无法读取：${error.message}`,'warning');}
}
function pdfEventPage(event){return Number(event?.pdfPage||event?.page)||1;}
function nearestMeasure(boxes,x){
 let best=boxes[0],gap=Infinity;
 for(const item of boxes){const delta=Math.abs((item.box.left+item.box.right)/2-x);if(delta<gap){gap=delta;best=item;}}
 return best;
}
function pdfRowAtPoint(page,y){
 const bands=score?.pdfSystemBands?.[page];
 if(Array.isArray(bands)&&bands.length){
  const index=bands.findIndex(band=>y>=band.top&&y<=band.bottom);
  if(index>=0)return index+1;
  let best=1,gap=Infinity;bands.forEach((band,i)=>{const delta=Math.abs((band.top+band.bottom)/2-y);if(delta<gap){gap=delta;best=i+1;}});
  return best;
 }
 const rows=Math.max(1,score?.pdfPageRows?.[page]||1);
 return Math.max(1,Math.min(rows,Math.floor(y/Math.max(.1,100/rows))+1));
}
function pdfMeasureRange(page){
 const onPage=[...new Set((score?.events||[]).filter(event=>pdfEventPage(event)===page).map(event=>event.measure))].sort((a,b)=>a-b);
 if(onPage.length)return onPage;
 // MusicXML without page markers: split the score evenly over the rendered
 // pages so later pages still answer with a plausible bar range.
 const total=Math.max(1,score?.measures||1),pages=Math.max(1,pdfPageEls.length||storedPdfPages||1);
 const start=Math.floor((page-1)*total/pages)+1,end=Math.max(start,Math.floor(page*total/pages));
 return Array.from({length:end-start+1},(_,index)=>start+index);
}
// A PDF click must always seek. Resolution order: detected bar lines (exact) →
// MusicXML default-x bounds → proportional layout inside the clicked system.
// How many systems the client believes a page holds, and which bars sit on one
// of them. The click handler, the playback highlight and the fallback layout all
// have to agree, or a click resolves to one bar while the block is drawn at
// another.
function pdfRowCount(page){return Math.max(1,score?.pdfSystemBands?.[page]?.length||score?.pdfPageRows?.[page]||1);}
function pdfRowMeasures(page,row){
 const measures=pdfMeasureRange(page);
 if(!measures.length)return measures;
 const perRow=Math.max(1,Math.ceil(measures.length/pdfRowCount(page)));
 return measures.slice((row-1)*perRow,row*perRow);
}
// A click says where a bar really is. Scanned later pages frequently have no
// detected box at all, and a proportional guess can be a whole system out, so
// the bar the reader pointed at keeps the box they pointed at.
function recordPdfClickBox(page,measure,x,y){
 if(!score)return;
 const rows=pdfRowCount(page);
 const band=score.pdfSystemBands?.[page]?.find?.(item=>y>=item.top&&y<=item.bottom);
 const top=band?band.top:6+Math.floor((y-6)/Math.max(1,88/rows))*(88/rows);
 const bottom=band?band.bottom:Math.min(100,top+88/rows);
 const slice=pdfRowMeasures(page,Math.max(1,Math.ceil((top-6)/Math.max(.1,88/rows))));
 const spread=slice.length?76/slice.length:8;
 score.pdfClickBox=score.pdfClickBox||{};
 score.pdfClickBox[page]=score.pdfClickBox[page]||{};
 score.pdfClickBox[page][measure]={left:Math.max(0,x-spread*.45),right:Math.min(100,x+spread*.45),top,bottom};
}
function pdfMeasureAtPoint(page,x,y){
 const detected=score?.pdfDetectedMeasures?.[page];
 if(detected&&Object.keys(detected).length){
  const boxes=Object.entries(detected).map(([measure,box])=>({measure:Number(measure),box}));
  const hit=boxes.find(item=>x>=item.box.left&&x<=item.box.right&&y>=item.box.top&&y<=item.box.bottom);
  if(hit)return hit.measure;
  let best=null,gap=Infinity;
  for(const item of boxes){const dx=Math.max(item.box.left-x,0,x-item.box.right),dy=Math.max(item.box.top-y,0,y-item.box.bottom),distance=dx*dx+dy*dy;if(distance<gap){gap=distance;best=item;}}
  return best?best.measure:null;
 }
 const row=pdfRowAtPoint(page,y),bounds=score?.pdfMeasureBounds?.[page]?.[row];
 if(bounds&&Object.keys(bounds).length){
  const boxes=Object.entries(bounds).map(([measure,box])=>({measure:Number(measure),box}));
  const hit=boxes.find(item=>x>=item.box.left&&x<=item.box.right);
  if(hit)return hit.measure;
  return nearestMeasure(boxes,x).measure;
 }
 const measures=pdfMeasureRange(page);if(!measures.length)return null;
 const slice=pdfRowMeasures(page,row);
 if(!slice.length)return measures[measures.length-1];
 return slice[Math.max(0,Math.min(slice.length-1,Math.floor(Math.max(0,Math.min(1,x/100))*slice.length)))];
}
function pdfEventIndexAt(page,measure){
 let index=score.events.findIndex(item=>pdfEventPage(item)===page&&item.measure===measure);
 if(index<0)index=score.events.findIndex(item=>item.measure===measure);
 if(index<0){let gap=Infinity;score.events.forEach((item,i)=>{const delta=Math.abs((item.measure||1)-measure);if(delta<gap){gap=delta;index=i;}});}
 return index;
}
function appendPdfPage(canvas,pageNumber){const holder=document.createElement('div');holder.className='pdf-page';holder.dataset.page=String(pageNumber);const highlight=document.createElement('div');highlight.className='pdf-measure-highlight';highlight.style.cssText='position:absolute;top:0;bottom:0;left:0;width:8%;background:rgba(183,132,36,.16);border-left:2px solid rgba(183,132,36,.55);border-right:2px solid rgba(183,132,36,.55);pointer-events:none;opacity:0;transition:left .12s,width .12s,top .12s,height .12s,opacity .18s';highlight.setAttribute('aria-hidden','true');const marker=document.createElement('div');marker.className='pdf-cursor';marker.setAttribute('aria-hidden','true');highlight.append(marker);highlight.style.overflow='hidden';holder.append(canvas,highlight);$('pdf-pages').append(holder);pdfPageEls[pageNumber-1]=holder;return holder;}
function appendNativePdf(bytes){
 if(nativePdfUrl)URL.revokeObjectURL(nativePdfUrl);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));nativePdfUrl=url;
 const frame=document.createElement('iframe');frame.className='pdf-native-fallback';frame.title='原始 PDF 琴谱';frame.src=url;frame.setAttribute('loading','lazy');$('pdf-pages').append(frame);return url;
}
async function playScore(){if(!score||importing)return;stop();demo=false;playbackView=true;lastPlaybackIndex=-1;view(currentView);try{player.setTempo(tempo());await player.play();setImportProgress(100,'钢琴音源已就绪','done');controls();message('正在播放');}catch(error){message(`无法播放：${error.message}`,'error');}}
async function playFromNote(target){
 if(!score||importing||target==null)return;
 const index=Number(typeof target==='number'?target:target.dataset.index);if(!Number.isInteger(index)||!score.events[index])return;
 stop();player.seek(index);playbackView=true;lastPlaybackIndex=-1;
 message('正在加载钢琴音源');await playScore();
}
$('notation').addEventListener('click',event=>{void playFromNote(event.target.closest('[data-index]'));});
$('notation').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const target=event.target.closest('[data-index]');if(target){event.preventDefault();void playFromNote(target);}}});
async function autoplayImported(){if(!$('autoplay').checked)return;if(player.context?.state==='running')await playScore();else{$('play-status').textContent='琴谱已就绪，点击“播放”开始。';message('琴谱已导入。点击“播放”开始，可随时调节速度。');}}
const tempo=()=>Number($('tempo').value)||80;
let noticeTimer=null;
function message(text,type=''){
 const notice=$('notice');if(!notice)return;clearTimeout(noticeTimer);notice.textContent='';
 const copy=document.createElement('span');copy.className='notice-copy';copy.textContent=text;
 const close=document.createElement('button');close.type='button';close.className='notice-close';close.setAttribute('aria-label','关闭提示');close.textContent='×';close.onclick=()=>{clearTimeout(noticeTimer);notice.classList.add('notice-hidden');};
 notice.append(copy,close);notice.className=`notice ${type}`;notice.classList.remove('notice-hidden');
 const persistent=text==='待载入琴谱';if(!persistent)noticeTimer=setTimeout(()=>notice.classList.add('notice-hidden'),type==='error'?12000:type==='warning'?8500:5200);
}
function paintImportProgress(now){const bar=$('import-progress');if(!bar){importProgressFrame=0;return;}const elapsed=Math.min(48,now-(importProgressClock||now));importProgressClock=now;const gap=importProgressValue-importProgressShown;importProgressShown=Math.abs(gap)<.08?importProgressValue:importProgressShown+Math.sign(gap)*Math.min(Math.abs(gap),elapsed*.105);$('import-progress-label').textContent=`${Math.round(importProgressShown)}%`;$('import-progress-bar').style.width=`${importProgressShown}%`;if(Math.abs(importProgressValue-importProgressShown)>.08)importProgressFrame=requestAnimationFrame(paintImportProgress);else importProgressFrame=0;}
function setImportProgress(value,label,mode='active'){reportTask('current-work',{label:'当前操作',detail:label,progress:value,status:mode==='done'?'complete':mode==='failed'?'failed':'running'});const bar=$('import-progress');if(!bar)return;importProgressValue=Math.max(0,Math.min(100,Math.round(value)));bar.hidden=false;bar.className=`import-progress ${mode==='done'?'done':mode==='failed'?'failed':''}`;$('import-progress-status').textContent=label;if(!importProgressFrame)importProgressFrame=requestAnimationFrame(paintImportProgress);}
function hideImportProgress(){const bar=$('import-progress');if(bar)bar.hidden=true;if(importProgressFrame)cancelAnimationFrame(importProgressFrame);importProgressFrame=0;importProgressValue=0;importProgressShown=0;importProgressClock=0;}
function fallbackTitle(filename){return String(filename||'导入的琴谱').replace(/\.pdf$/i,'').replace(/[_ -]\d{4,}$/,'').split(/[「【\[]/)[0].replace(/\s+/g,' ').trim()||'导入的琴谱';}
function parseOcrMetadata(raw,filename){const lines=String(raw||'').split(/\r?\n/).map.map(line=>line.replace(/\s+/g,' ').replace(/[|｜]/g,'').trim()).filter(line=>line.length>=2);const ocrTitle=lines.find(line=>/[\u3400-\u9fff]/.test(line)&&line.length>=4&&!/^(作曲|编曲|改编|演奏|速度|拍号|调性|曲名|作者|词|曲)/.test(line))||'';const title=ocrTitle;const credits=lines.map(line=>{const match=line.match(/^(作曲|编曲|改编|演奏|作者|词|曲)\s*[:：;；]\s*(.+)$/);return match?`${match[1]}：${match[2]}`:''}).filter(Boolean).filter(line=>line!==title).slice(0,4).join('　');const tempo=lines.find(line=>/[Jj]?\s*=\s*\d+|速度|自由地/.test(line))||'';return{title:title.replace(/^[：:、,.，。\s]+|[：:、,.，。\s]+$/g,''),ocrTitle:ocrTitle.replace(/^[：:、,.，。\s]+|[：:、,.，。\s]+$/g,''),credits,tempo,ocrText:lines.slice(0,8).join('　'),source:'OCR'};}
async function ocrFirstPage(canvas,filename){const fallback={title:'',ocrTitle:'',credits:'',tempo:'',ocrText:'',source:'filename'};if(!canvas||!globalThis.Tesseract?.createWorker)return fallback;try{if(!ocrWorkerPromise)ocrWorkerPromise=Tesseract.createWorker('chi_sim',1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr',langPath:'/vendor/ocr/lang-data',gzip:false,logger:info=>{if(info?.status==='recognizing text'&&importProgressValue<94)setImportProgress(40+(info.progress||0)*7,'OCR 识别原谱标题与作者…');}}).then(async worker=>{await worker.setParameters({tessedit_pageseg_mode:'11'});return worker;});const worker=await ocrWorkerPromise;const crop=document.createElement('canvas');let sourceHeight=Math.max(1,Math.floor(canvas.height*.3));const pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,sourceHeight).data;for(let y=Math.floor(canvas.height*.04);y<sourceHeight;y++){let dark=0;for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;if(pixels[i]<160&&pixels[i+1]<160&&pixels[i+2]<160)dark++;}if(dark>canvas.width*.45){sourceHeight=Math.max(1,y-10);break;}}crop.width=Math.min(1800,Math.max(900,canvas.width));crop.height=Math.round(sourceHeight*crop.width/canvas.width);const context=crop.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,crop.width,crop.height);context.drawImage(canvas,0,0,canvas.width,sourceHeight,0,0,crop.width,crop.height);const result=await queueOcr(()=>worker.recognize(crop,{}, {blocks:true,text:true}));const candidates=titleFromBlocks(result?.data,crop.width,crop.height);const verified=await requestJSON('/api/title/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidates)});return {...candidates,...verified};}catch(error){ocrWorkerPromise=null;console.warn('OCR unavailable',error);return fallback;}}
let ocrSerial=Promise.resolve();
function queueOcr(task){const result=ocrSerial.then(task);ocrSerial=result.catch(()=>{});return result;}
async function recognizeCloudTitle(item){
 if(!item?.id||!item.hasPdf)return '';
 const response=await fetch(`/api/scores/${item.id}/page/1`);if(!response.ok)throw Error('原谱首页暂不可用');
 const image=new Image();image.decoding='async';image.src=URL.createObjectURL(await response.blob());
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('原谱首页读取失败'));});
 const canvas=document.createElement('canvas');const width=Math.min(1800,image.naturalWidth||1600);canvas.width=width;canvas.height=Math.round((image.naturalHeight||2200)*width/(image.naturalWidth||1600));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(image.src);
 const metadata=await ocrFirstPage(canvas,item.title);const title=cleanText(metadata.ocrTitle||'');if(!title)throw Error('未读到原谱标题');
 await requestJSON(`/api/scores/${item.id}/metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...metadata,ocrTitle:title,titleVersion:'4'})});return {title,cover:await matchScoreCover(title,item.id)};
}
const coverRequests=new Map();
async function matchScoreCover(title,digest=''){
 const query=cleanText(title);if(!query)return '';
 const key=`${digest}:${query}`;
 if(!coverRequests.has(key))coverRequests.set(key,requestJSON(`/api/cover?title=${encodeURIComponent(query)}${digest?`&digest=${encodeURIComponent(digest)}`:''}`).then(data=>data.artwork||'').catch(()=>''));
 return coverRequests.get(key);
}
function tickMetronome(pulse,when){
 const toggle=$('metronome');if(!toggle?.checked||!player.playing||!player.context)return;
 const context=player.context,osc=context.createOscillator(),gain=context.createGain(),now=when;
 const voice={oscillator:osc,gain,level:.23,startTime:now};player.voices.add(voice);
 osc.onended=()=>{osc.disconnect();gain.disconnect();player.voices.delete(voice);};
 osc.type='triangle';osc.frequency.setValueAtTime(pulse%4===0?1320:880,now);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime((pulse%4===0?.32:.23)*Number($('metronome-volume')?.value||.8),now+.003);gain.gain.exponentialRampToValueAtTime(.0001,now+.075);osc.connect(gain);gain.connect(context.destination);osc.start(now);osc.stop(now+.09);
}
function scoreFingerprint(bytes){return crypto?.subtle?crypto.subtle.digest('SHA-256',bytes).then(hash=>`sha256-${Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')}`).catch(()=>scoreFingerprintFallback(bytes)):Promise.resolve(scoreFingerprintFallback(bytes));}
function scoreFingerprintFallback(bytes){let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);return`fnv-${(hash>>>0).toString(16)}-${bytes.length}`;}
function openScoreCache(){if(!('indexedDB'in window))return Promise.resolve(null);return new Promise((resolve,reject)=>{const request=indexedDB.open('piano-lab-score-cache',2);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('scores'))request.result.createObjectStore('scores');if(!request.result.objectStoreNames.contains('notation'))request.result.createObjectStore('notation');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function readScoreCache(key){try{const db=await openScoreCache();if(!db)return null;return await new Promise((resolve,reject)=>{const request=db.transaction('scores').objectStore('scores').get(key);request.onsuccess=()=>resolve(request.result?.version===2?request.result:null);request.onerror=()=>reject(request.error);});}catch{return null;}}
async function writeScoreCache(key,value){try{const db=await openScoreCache();if(!db)return;await new Promise((resolve,reject)=>{const request=db.transaction('scores','readwrite').objectStore('scores').put({...value,version:2},key);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});}catch{} }
async function readNotationCache(key){try{const db=await openScoreCache();if(!db)return '';const signature=parsedScoreCache.get(key.split(':')[0])?.contentSignature;return await new Promise((resolve,reject)=>{const request=db.transaction('notation').objectStore('notation').get(key);request.onsuccess=()=>resolve(request.result?.version===2&&request.result.signature===signature?request.result.html:'');request.onerror=()=>reject(request.error);});}catch{return '';}}
async function writeNotationCache(key,html){try{const db=await openScoreCache();if(!db||!html)return;const signature=parsedScoreCache.get(key.split(':')[0])?.contentSignature;await new Promise((resolve,reject)=>{const request=db.transaction('notation','readwrite').objectStore('notation').put({version:2,signature,html,savedAt:Date.now()},key);request.onsuccess=resolve;request.onerror=()=>reject(request.error);});}catch{} }
function applyScoreMetadata(parsed,metadata){parsed.meta=Object.fromEntries(Object.entries(metadata||{}).map(([key,value])=>[key,cleanText(value)]));const ocrTitle=parsed.meta.ocrTitle;const userTitle=parsed.meta.titleSource==='user'?parsed.meta.userTitle:'';const storedTitle=parsed.meta.titleSource==='filename'?parsed.meta.title:'';const candidate=ocrTitle||userTitle||storedTitle;if(candidate)parsed.title=candidate;else if(/\.pdf$|[_ -]\d{4,}$/i.test(String(parsed.title||'')))parsed.title='未命名琴谱';parsed.title=cleanText(parsed.title)||'未命名琴谱';return parsed;}
function decoratePdfCoordinates(score){
 if(!score?.xml)return score;
 try{
  const doc=new DOMParser().parseFromString(score.xml,'application/xml');
  score.pdfPageWidth=Number(doc.querySelector('page-layout page-width')?.textContent)||1000;
  const events=new Map(score.events.map(event=>[`${event.measure}:${Number(event.offset||0).toFixed(4)}`,event]));
  score.pdfPageRows={};score.pdfMeasureBounds={};
  for(const part of [...doc.querySelectorAll('score-partwise > part')].sort((a,b)=>b.querySelectorAll('measure').length-a.querySelectorAll('measure').length||b.querySelectorAll('note[default-x]').length-a.querySelectorAll('note[default-x]').length)){
   let divisions=1,measureNo=0,page=1,row=1,systemX=0;const rowMeasures=new Map();
   const finishRow=()=>{
    for(const [key,measures] of rowMeasures){const ordered=[...measures.entries()].sort((a,b)=>a[1].min-b[1].min);if(!ordered.length)continue;const bounds={};
     for(let i=0;i<ordered.length;i++){const [measure,position]=ordered[i],previous=ordered[i-1]?.[1],next=ordered[i+1]?.[1];const span=Math.max(18,position.max-position.min);const left=previous?(previous.max+position.min)/2:position.min-span*.45;const right=next?(position.max+next.min)/2:position.max+span*.45;(score.pdfMeasureBounds[key.split(':')[0]]??={})[key.split(':')[1]]??={};bounds[measure]={left,right};}
     const [pageKey,rowKey]=key.split(':');score.pdfMeasureBounds[pageKey][rowKey]=bounds;
    }
    rowMeasures.clear();
   };
   for(const measure of Array.from(part.children).filter(node=>node.localName==='measure')){
    measureNo++;const print=Array.from(measure.children).find(node=>node.localName==='print');
    if(print?.getAttribute('new-page')==='yes'){finishRow();page++;row=1;systemX=0;}
    else if(print?.getAttribute('new-system')==='yes'){finishRow();row++;systemX=0;}
    score.pdfPageRows[page]=Math.max(score.pdfPageRows[page]||1,row);const rowKey=`${page}:${row}`;let divisionsInMeasure=divisions,cursor=0,lastStart=0;const position={min:Infinity,max:-Infinity};
    for(const item of measure.children){
     const kind=item.localName;if(kind==='attributes')divisionsInMeasure=Number(item.querySelector('divisions')?.textContent)||divisions;
     if(kind==='backup')cursor-=Number(item.querySelector('duration')?.textContent||0)/divisionsInMeasure;
     if(kind==='forward')cursor+=Number(item.querySelector('duration')?.textContent||0)/divisionsInMeasure;
     if(kind!=='note')continue;const duration=Number(item.querySelector('duration')?.textContent||0)/divisionsInMeasure;const startBeat=item.querySelector('chord')?lastStart:cursor;
     if(!item.querySelector('chord')){lastStart=startBeat;cursor+=duration;}
     if(!item.querySelector('rest')&&!item.querySelector('grace')&&item.hasAttribute('default-x')&&Number.isFinite(Number(item.getAttribute('default-x')))){
      const event=events.get(`${measureNo}:${Number(startBeat).toFixed(4)}`),x=systemX+Number(item.getAttribute('default-x'));position.min=Math.min(position.min,x);position.max=Math.max(position.max,x);
      if(event){if(event.pdfX===undefined)event.pdfX=x;event.pdfRow=row;event.pdfPage=page;}
     }
    }
    divisions=divisionsInMeasure;const measures=rowMeasures.get(rowKey)||new Map();if(Number.isFinite(position.min))measures.set(measureNo,position);rowMeasures.set(rowKey,measures);systemX+=Number(measure.getAttribute('width'))||0;
   }
   finishRow();break;
  }
 }catch(error){console.warn('PDF coordinate metadata unavailable',error);}
 return score;
}
// Warm the browser HTTP cache as soon as the page is idle. AudioContext decode still waits for a user gesture, but later playback avoids the network round-trip.
const warmPiano=()=>void preloadPianoSamples();
if('requestIdleCallback' in window)requestIdleCallback(warmPiano,{timeout:1800});else setTimeout(warmPiano,1200);
function controls(){ $('start-button').disabled=!score||running||starting||importing; $('start-button').hidden=running; $('stop-button').hidden=!running; $('reset-button').disabled=!score; $('tempo').disabled=running; $('tempo-up').disabled=running; $('tempo-down').disabled=running; $('demo-button').disabled=running||starting||importing; $('export-button').disabled=!records.length;$('play-button').disabled=!score||starting||importing;$('play-button').textContent=player.playing?'暂停播放':player.beat>0&&player.beat<player.totalBeats?'继续播放':'自动演奏';$('play-reset').disabled=!score||importing; }
function view(type){currentView=type; $('notation').hidden=!['notation','simple'].includes(type)||!score; $('pdf-pages').hidden=type!=='pdf'; $('empty-score').hidden=!!score||type==='pdf'; $('simple-button').disabled=!score||importing; for(const [id,on] of [['notation-button',type==='notation'],['simple-button',type==='simple'],['original-button',type==='pdf']]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}}
function recognizedTempo(next){const parsed=Number(next?.tempo);if(Number.isFinite(parsed)&&parsed>=30&&parsed<=240)return Math.round(parsed);const raw=String(next?.meta?.tempo||'');const match=raw.match(/(?:[Jj♩]|每分钟)?\s*[=:：]?\s*(\d{2,3})\s*(?:BPM|拍)?/i);const value=Number(match?.[1]);return value>=30&&value<=240?Math.round(value):null;}
async function setScore(next,isSample=false){
 const generation=++scoreRenderGeneration;$('notation').renderGeneration={};next.harmony=analyzeHarmony(next);stop();score=next;player.load(next);
 const detectedTempo=recognizedTempo(next),targetTempo=detectedTempo||80;$('tempo').value=String(targetTempo);player.setTempo(targetTempo);playbackView=false;records=[];follower=new Follower(next.events,tempo());
 const credits=next.meta?.credits?`　${next.meta.credits}`:'',tempoLabel=detectedTempo?`　原谱 ${detectedTempo} BPM`:'';$('score-title').textContent=next.title;$('score-subtitle').textContent=`${next.events.length} 组起音　${next.measures} 小节${next.meta?.segmentCount?`　识别分段 ${next.meta.segmentIndex}/${next.meta.segmentCount}`:''}${tempoLabel}${credits}　${isSample?'示例谱':''}`;paintedIndex=-1;paintedScore=null;
 const renderKey=`${next.serverId||next.arrangementKey||next.title}${next.variants?.active?'@'+next.variants.active:''}:${notationMode}:${sheetWidth($('notation'))}`;const cachedNotation=notationCache.get(renderKey);
 if(cachedNotation){$('notation').replaceChildren(...[...cachedNotation.childNodes].map(node=>node.cloneNode(true)));notationCache.delete(renderKey);notationCache.set(renderKey,cachedNotation);}
 else{const modeAtStart=notationMode,staging=document.createElement('div');if(modeAtStart==='simple')renderSimpleNotation(staging,next);else await renderNotation(staging,next);if(generation!==scoreRenderGeneration||score!==next||modeAtStart!==notationMode)return;$('notation').replaceChildren(...[...staging.childNodes].map(node=>node.cloneNode(true)));notationCache.set(renderKey,staging.cloneNode(true));while(notationCache.size>4)notationCache.delete(notationCache.keys().next().value);}
 // Arrangements are often opened while the workspace transition is still
 // settling. If OSMD returned only its temporary caption, give it one laid
 // out frame and render once more so the first open never requires a manual
 // simple-notation toggle to reveal the score.
 if(notationMode==='engraved'&&score===next&&!$('notation').querySelector('svg')){
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(generation===scoreRenderGeneration&&score===next){$('notation').replaceChildren();await renderNotation($('notation'),next);}
 }
 if(generation!==scoreRenderGeneration||score!==next)return;$('tempo-detail').textContent=detectedTempo?`原谱标记速度　${detectedTempo} BPM`:`目标 ${tempo()} BPM`;$('play-status').textContent='琴谱已就绪';view(notationMode==='simple'?'simple':'notation');refreshDrumLane();syncExpressionControls({applied:false});refresh();controls();
}
function refresh(){ const summary=summarize(records,tempo()); $('accuracy').textContent=summary.accuracy??'—';$('rhythm').textContent=summary.rhythm??'—';$('current-tempo').textContent=summary.bpm??'—';$('accuracy-detail').textContent=records.length?`匹配 ${summary.matched}　漏音 ${summary.missed}　额外音 ${summary.extra}`:'等待演奏数据';$('rhythm-detail').textContent=summary.rhythm===null?'至少需要 3 个起音':`相对速度归一化后的起音一致性`; $('tempo-detail').textContent=summary.bpm===null?`目标 ${tempo()} BPM`:`目标 ${tempo()} BPM　${summary.bpm-tempo()>=0?'+':''}${summary.bpm-tempo()} BPM`; const done=follower?.index||0;const percent=score?Math.round(done/score.events.length*100):0;$('progress-label').textContent=`${percent}%`;$('progress-bar').style.width=`${percent}%`;$('progress-bar').parentElement.setAttribute('aria-valuenow',String(percent));$('position').textContent=score?(done>=score.events.length?'本段练习完成':`第 ${score.events[done].measure} 小节　${done} / ${score.events.length} 组`):'尚未开始';$('export-button').disabled=!records.length;
 $('events').replaceChildren();if(!records.length){const p=document.createElement('p');p.className='empty-events';p.textContent='暂无记录';$('events').append(p);}for(const row of records.slice(-40).reverse()){const div=document.createElement('div');div.className='event-row'; const cols=[row.type==='extra'?'额外起音':`第 ${row.measure} 小节`,`${row.expected.map(noteName).join('　')||'—'} → ${row.heard.map(noteName).join('　')||'未检测到'}`,row.type==='correct'?'音符匹配':row.type==='missed'?'疑似漏弹':row.type==='extra'?'额外起音':'音符有误',row.offsetMs==null?'—':`${row.offsetMs>0?'+':''}${Math.round(row.offsetMs)} ms`];cols.forEach((text,i)=>{const el=document.createElement('span');el.textContent=text;if(i===2)el.className=`badge ${row.type==='correct'?'':'wrong'}`;if(i===3)el.className='time';div.append(el);});$('events').append(div);}
 $('notation').querySelectorAll('.note-event').forEach(el=>{const index=Number(el.dataset.index);const result=[...records].reverse().find(r=>r.index===index&&r.type!=='extra');setNoteState(el,result?(result.type==='correct'?'correct':'wrong'):index===done?'current':'pending');}); }
function accept(pitches,time){if($('chord-toggle')?.checked)$('chord-display').textContent=detectChord(pitches)?.name||'—';if(!running||!follower)return;const result=follower.consume(pitches,time);records.push(...result.map(r=>({...r,source:demo?'simulation':'microphone'})));refresh();const target=$('notation').querySelector(`[data-index="${follower.index}"]`);if(target&&['notation','simple'].includes(currentView)){const scroll=$('sheet-scroll'),box=target.getBoundingClientRect(),area=scroll.getBoundingClientRect();if(box.top<area.top+55||box.bottom>area.bottom-55)scroll.scrollTo({top:Math.max(0,scroll.scrollTop+box.top-area.top-scroll.clientHeight*.32),behavior:'smooth'});}if(follower.index>=score.events.length){stop();message(demo?'试听结束。':'本段练习完成。可导出起音记录，与教师标注对照。',demo?'demo':'');}}
function stop(){document.dispatchEvent(new CustomEvent('transport-state',{detail:{playing:false}}));player.pause();metronomeLastBeat=-1; running=false;starting=false;clearInterval(demoTimer);demoTimer=null;listener?.stop();listener=null;$('mic-label').textContent='麦克风未开启';$('mic-level').textContent='0%';$('level-bar').style.width='0%';controls();}
function reset(){stop();player.rewind();playbackView=false;demo=false;records=[];follower=score?new Follower(score.events,tempo()):null;refresh();$('sheet-scroll').scrollTop=0;message('已回到开头。开启麦克风后，从第一个音开始演奏。');}
function sample(){uploadVersion++;cancelPdfLoading();hideImportProgress();importing=false;sourceFile=null;pdfDocument?.destroy();pdfDocument=null;pdfPageEls=[];if(nativePdfUrl){URL.revokeObjectURL(nativePdfUrl);nativePdfUrl=null;}$('pdf-pages').replaceChildren();$('original-button').disabled=true;void setScore(sampleScore(),true).catch(error=>message(`示例谱排版失败：${error.message}`,'error'));$('file-info').textContent='当前：C 大调短句　内置教学示例';message('示例谱已载入');}
$('sample-button').onclick=sample;$('reset-button').onclick=reset;$('stop-button').onclick=()=>{const wasDemo=demo;stop();follower?.pause();message(wasDemo?'试听已暂停。':'练习已暂停。再次开始后，从标记位置继续。',wasDemo?'demo':'');};
$('start-button').onclick=async()=>{if(!score||starting||running)return;if(demo||follower.index>=score.events.length)reset();starting=true;controls();const request=uploadVersion;try{const local=new PitchListener();listener=local;await local.start((notes,t)=>accept(notes,t),({level,pitches})=>{$('mic-level').textContent=`${level}%`;$('level-bar').style.width=`${level}%`;$('heard').textContent=pitches.length?`检测到：${pitches.map(noteName).join('　')}`:'正在聆听…';},()=>Number($('sensitivity').value));if(request!==uploadVersion||listener!==local){local.stop();return;}running=true;starting=false;demo=false;follower.pause();$('mic-label').textContent='麦克风已开启';message('正在聆听。请从金色标记处开始；评分为实验性估计。');controls();}catch(error){stop();message(error.name==='NotAllowedError'?'麦克风未获授权。请在浏览器地址栏允许麦克风，再重试。':error.name==='NotFoundError'?'没有找到麦克风，请连接设备后重试。':`麦克风无法开启：${error.message}`,'error');}};
$('demo-button').onclick=()=>{if(!score){message('请先选择一首琴谱，再开始试听。','warning');return;}reset();demo=true;running=true;controls();$('mic-label').textContent='试听　未使用麦克风';message(`正在试听《${score.title}》。`,'demo');const sourceScore=score;let index=0;const bpm=tempo();const start=performance.now()/1000;demoTimer=setInterval(()=>{if(sourceScore!==score){clearInterval(demoTimer);demoTimer=null;return;}const elapsed=performance.now()/1000-start;while(index<sourceScore.events.length&&sourceScore.events[index].beat*60/bpm<=elapsed+.03){const event=sourceScore.events[index];const notes=event.pitches.map((pitch,n)=>index%29===11&&n===0?pitch+1:pitch);accept(notes,start+event.beat*60/bpm);index++;}if(index>=sourceScore.events.length&&!demoTimer)return;},30);};
function setTempo(value){if(running)return;$('tempo').value=String(Math.max(30,Math.min(240,Math.round(Number(value)||80))));player.setTempo(tempo());if(score&&records.length===0)follower=new Follower(score.events,tempo());else if(follower)follower.bpm=tempo();refresh();if(playbackView)paintPlayback({beat:player.beat,index:Math.max(0,player.next-1),totalBeats:player.totalBeats});}$('tempo').onchange=e=>setTempo(e.target.value);$('tempo-down').onclick=()=>setTempo(tempo()-5);$('tempo-up').onclick=()=>setTempo(tempo()+5);$('sensitivity').oninput=()=>$('sensitivity-value').textContent=['很低','较低','标准','较高','很高'][Number($('sensitivity').value)-1];
$('play-button').onclick=()=>{if(player.playing){player.pause();controls();$('play-status').textContent=`播放已暂停　${tempo()} BPM`;}else playScore();};
$('play-reset').onclick=()=>{player.rewind();metronomeLastBeat=-1;playbackView=false;refresh();controls();$('play-status').textContent='已回到开头，点击“自动演奏”开始。';};
$('start-button').addEventListener('click',()=>{player.pause();playbackView=false;refresh();controls();},true);
async function setNotationMode(mode){notationMode=mode;if(!score){view(mode==='simple'?'simple':'notation');return;}const position=player.beat,wasPlaying=player.playing;player.pause();const key=`${score.serverId||score.title}${score.variants?.active?'@'+score.variants.active:''}:${notationMode}:${sheetWidth($('notation'))}`,cached=notationCache.get(key);if(cached)$('notation').replaceChildren(...[...cached.childNodes].map(node=>node.cloneNode(true)));else{const modeAtStart=notationMode,target=score;if(modeAtStart==='simple')renderSimpleNotation($('notation'),score);else await renderNotation($('notation'),score);if(score===target&&modeAtStart===notationMode)notationCache.set(key,$('notation').cloneNode(true));}view(mode==='simple'?'simple':'notation');refreshDrumLane();player.restorePosition(position,wasPlaying);refresh();}
$('notation-button').onclick=()=>void setNotationMode('engraved');$('simple-button').onclick=()=>void setNotationMode('simple');$('original-button').onclick=()=>{pdfLastScrollPage=0;view('pdf');syncPdfPlayback(Math.max(0,player.next-1));};$('empty-upload').onclick=()=>$('pdf-input').click();$('drop-zone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('pdf-input').click();}};
async function health(){
 try{
  const data=await requestJSON('/api/health');
  $('service-state').textContent=data.omr?'识谱引擎已配置，可以开始识别 PDF。':'识谱服务未准备完成：缺少 Audiveris。PDF 可以打开预览，暂时不能生成音符或自动演奏。';
  if(!data.omr&&!sourceFile&&!score&&!importing)message('当前可预览 PDF；自动识谱服务尚未配置，上传后暂不能自动演奏。','warning');
  return {...data,connected:true};
 }catch(error){
  $('service-state').textContent=`无法连接识谱服务：${error.message}`;
  if(!sourceFile&&!score&&!importing)message('暂时无法连接识谱服务。PDF 仍可在浏览器中预览。','warning');
  return {omr:false,connected:false};
 }
}health();
async function requestJSON(url,options={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{
  const response=await fetch(url,{...options,signal:options.signal||controller.signal});
  if(!response.headers.get('content-type')?.includes('application/json'))throw Error('识谱服务未正确响应，请检查服务是否仍在运行');
  const data=await response.json();if(!response.ok)throw Error(data.error||`请求失败（${response.status}）`);return data;
 }catch(error){if(error?.name==='AbortError')throw Error('识谱服务请求超时，请确认本机服务仍在运行。');throw error;}
 finally{clearTimeout(timer);}
}
function withTimeout(promise,ms,message,onTimeout){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{try{onTimeout?.();}finally{reject(Error(message));}},ms);
  Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
 });
}
async function openPdf(pdfjs,bytes,version){
 const options={cMapUrl:'/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/standard_fonts/',wasmUrl:'/vendor/wasm/'};
 const attempt=async disableWorker=>{
  if(version!==uploadVersion)throw Error('读取已取消');
  // Each attempt needs its own buffer: a real worker transfers/detaches it.
  const task=pdfjs.getDocument({...options,data:bytes.slice()});pdfLoading=task;
  let rejectPassword;
  const passwordError=new Promise((_,reject)=>{rejectPassword=reject;});
  task.onPassword=()=>{rejectPassword(new Error('PDF 已加密，请先解除密码后重新导入'));void Promise.resolve(task.destroy()).catch(()=>{});};
  task.onProgress=({loaded,total})=>{if(version!==uploadVersion)return;const suffix=total?` ${Math.round(loaded/total*100)}%`:'';message(`正在读取 PDF…${disableWorker?' 兼容模式':''}${suffix}`);};
  try{return await withTimeout(Promise.race([task.promise,passwordError]),disableWorker?45000:20000,disableWorker?'PDF 解析超过 45 秒，可能是文件损坏或结构不兼容。请重新导出 PDF 后重试。':'PDF 解析器响应超时，正在切换兼容读取模式…',()=>void Promise.resolve(task.destroy()).catch(()=>{}));}
  catch(error){void Promise.resolve(task.destroy()).catch(()=>{});throw error;}
 };
 try{return await attempt(false);}
 catch(error){
  if(version!==uploadVersion||error.message==='PDF 已加密，请先解除密码后重新导入')throw error;
  message('PDF 解析器响应较慢，正在切换兼容读取模式…','warning');
  // PDF.js 5.x no longer exposes a disableWorker option. Loading its worker
  // module on the main thread installs pdfjsWorker, which makes the library
  // use its loopback/fake-worker path when module workers are blocked.
  await withTimeout(import('/vendor/pdf-worker-compat.mjs'),15000,'PDF 兼容解析器加载超过 15 秒，请刷新页面后重试。');
  return await attempt(true);
 }
}
async function uploadPdf(file){
 if(!file)return;
 if(file.size>20*1024*1024)return message('文件超过 20 MB，请压缩 PDF 或分段上传。','error');
 const version=++uploadVersion;cancelPdfLoading();stop();player.stop();playbackView=false;importing=true;
 demo=false;score=null;records=[];follower=null;sourceFile=file;
 $('notation').replaceChildren();$('pdf-pages').replaceChildren();pdfPageEls=[];if(nativePdfUrl){URL.revokeObjectURL(nativePdfUrl);nativePdfUrl=null;}$('original-button').disabled=true;
 $('score-title').textContent='正在识别原谱标题…';$('score-subtitle').textContent='正在读取 PDF…';$('file-info').textContent='PDF 已上传，标题等待 OCR';
 $('play-status').textContent='等待琴谱识别完成…';$('retry-import').hidden=true;view('pdf');refresh();controls();
 setImportProgress(2,'正在读取 PDF 文件');message('正在读取 PDF…');let phase='preview';
 try{
  message('正在读取 PDF… 读取文件内容');setImportProgress(5,'正在读取 PDF 文件');
  const bytes=new Uint8Array(await withTimeout(file.arrayBuffer(),15000,'读取 PDF 文件超过 15 秒，请重新选择文件。'));if(version!==uploadVersion)return;
  if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))throw Error('文件不是有效的 PDF，请重新选择');
  const savedScore=await requestJSON('/api/scores',{method:'POST',headers:{'Content-Type':'application/pdf','X-Score-Name':encodeURIComponent(file.name)},body:file});document.body.dataset.currentScoreId=savedScore.id;void refreshLibrary();
  let serverPdfPages=0;const serverPdfId=savedScore.id;try{const info=await requestJSON(`/api/scores/${serverPdfId}/info`);serverPdfPages=Math.min(30,Number(info.pages)||0);}catch{}
  const fingerprint=scoreFingerprint(bytes);message('正在读取 PDF… 加载解析器');setImportProgress(9,'正在加载 PDF 解析器');
  const pdfjs=await withTimeout(import('/vendor/pdf.mjs'),15000,'PDF 解析器加载超过 15 秒，请刷新页面后重试。');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf-worker-compat.mjs';
  let pdf;
  try{pdf=await openPdf(pdfjs,bytes,version);}
  catch(error){
   // Browser PDF viewers handle scans with unusual transparency, masks and
   // embedded fonts that PDF.js may reject. Keep the original available while
   // OMR continues in the background.
   appendNativePdf(bytes);pdf={numPages:1,destroy(){}};
   $('original-button').disabled=false;message('PDF.js 无法解析部分图形，已切换浏览器原生 PDF 预览。','warning');
  }
  if(version!==uploadVersion){pdf.destroy();return;}
  pdfDocument?.destroy();pdfDocument=pdf;
  const pageCount=serverPdfPages||Math.min(pdf.numPages,30);setImportProgress(16,`PDF 已读取，共 ${pdf.numPages||pageCount} 页`);$('original-button').disabled=false;$('score-subtitle').textContent=`${pdf.numPages||pageCount} 页　原始 PDF${(pdf.numPages||pageCount)>30?'（预览前 30 页）':''}`;
  let firstCanvas=null;
  const mobilePreview=matchMedia('(max-width:800px)').matches;
  const lazyPages=new Map();
  const previewObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
   if(entry.isIntersecting){const n=lazyPages.get(entry.target);if(n)void loadDeferred(n,entry.target);}
  }),{root:$('sheet-scroll'),rootMargin:'900px 0px'});
  async function renderServerPreview(n){return getCachedPdfImage(serverPdfId,n);}
  async function renderPdfJsPreview(n){
   const page=await withTimeout(pdf.getPage(n),15000,`第 ${n} 页暂时无法读取`);
   if(version!==uploadVersion)return null;
   const initial=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:Math.min(1.5,(mobilePreview?1000:1600)/Math.max(initial.width,initial.height))});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.setAttribute('aria-label',`琴谱第 ${n} 页`);
   const task=page.render({canvasContext:canvas.getContext('2d'),viewport});
   try{await withTimeout(task.promise,20000,`第 ${n} 页预览较慢，可稍后重试`,()=>task.cancel());}
   catch(error){task.cancel();await task.promise.catch(()=>{});canvas.width=canvas.height=0;throw error;}
   finally{page.cleanup();}
   return version===uploadVersion?canvas:null;
  }
  async function renderPreview(n){if(serverPdfId&&serverPdfPages){try{return await renderServerPreview(n);}catch{}}return renderPdfJsPreview(n);}
  async function loadDeferred(n,holder){
   if(holder.dataset.loading==='1'||holder.dataset.loaded==='1')return;holder.dataset.loading='1';
   const button=holder.querySelector('button');if(button){button.disabled=true;button.textContent=`正在读取第 ${n} 页`;}
   try{const canvas=await renderPreview(n);if(canvas){const page=appendPdfPage(canvas,n);holder.replaceWith(page);previewObserver.unobserve(holder);syncPdfPlayback(Math.max(0,player.next-1));}}
   catch{if(button){button.disabled=false;button.textContent=`第 ${n} 页预览未完成，点击重试`;}}
   finally{holder.dataset.loading='0';}
  }
  function deferredPage(n){
   const holder=document.createElement('div');holder.style.cssText='padding:18px;text-align:center';
   holder.dataset.page=String(n);const button=document.createElement('button');button.className='small-button';button.textContent=`准备读取第 ${n} 页`;
   button.onclick=()=>loadDeferred(n,holder);
   holder.append(button);$('pdf-pages').append(holder);
   lazyPages.set(holder,n);previewObserver.observe(holder);
  }
  for(let n=1;n<=pageCount;n++){
   // Only the cover is needed for OCR. Other pages are rendered on demand,
   // so a large scan cannot block recognition or exhaust phone memory.
   if(n>1){deferredPage(n);continue;}
   message(`正在读取 PDF… 渲染第 ${n} / ${Math.min(pdf.numPages,30)} 页`);
   setImportProgress(16+(n/pageCount)*24,`正在渲染第 ${n} / ${pageCount} 页`);
   try{const canvas=await renderPreview(n);if(version!==uploadVersion)return;if(canvas){firstCanvas=canvas;appendPdfPage(canvas,n);}}
   catch{if(version!==uploadVersion)return;deferredPage(n);message('首页预览未完成，继续识谱。原谱可稍后重试预览。','warning');}
  }
  const cacheKey=await fingerprint;let cached=await readScoreCache(cacheKey);
  if(savedScore.id){try{const remote=await requestJSON(`/api/scores/${savedScore.id}`);if(remote.xml)cached=remote;}catch{}}
  if(cached?.xml){
   const fileBase=file.name.replace(/\.pdf$/i,'');
   const cachedMeta={...(cached.metadata||{})};
   // Never promote the uploaded filename into the visible score title. The
   // library will keep the item in its OCR queue until a cover title exists.
   if(/\.pdf$|[_ -]\d{4,}$/i.test(String(cachedMeta.title||'')))cachedMeta.title='';
   cachedMeta.source=cachedMeta.source||'cache';
   const parsed=applyScoreMetadata(parseMusicXML(cached.xml,fileBase),cachedMeta);
   parsed.serverId=savedScore.id;
   void writeScoreCache(cacheKey,{...cached,metadata:cachedMeta});
   setImportProgress(100,'已从本机缓存载入，跳过重新识谱','done');importing=false;await setScore(parsed);void loadPdfGeometry(savedScore.id,1,parsed.pdfPageRows?.[1]||1);message('已载入历史琴谱');await autoplayImported();return;
  }
  const service=await health();if(version!==uploadVersion)return;
  if(!service.omr){
   $('score-subtitle').textContent=`${pdf.numPages} 页　PDF 已载入　等待识谱服务`;
   $('play-status').textContent='PDF 已载入；生成音符后才可自动演奏。';
   $('retry-import').textContent='检查识谱服务';$('retry-import').hidden=false;
   setImportProgress(100,'PDF 预览完成，等待识谱服务','done');message(service.connected?'PDF 已载入并可预览。自动识谱暂不可用：服务器缺少 Audiveris 引擎，无法生成音符或自动演奏；这不是 PDF 上传失败。':'PDF 已载入并可预览，但暂时无法连接识谱服务。服务恢复后点击“检查识谱服务”继续。','warning');
   return;
  }
  // OCR runs in the browser so a slow worker must never hold up the OMR result.
  // Keep the filename as a useful title fallback when OCR is unavailable.
  const metadataPromise=withTimeout(ocrFirstPage(firstCanvas,file.name),15000,'OCR 识别超过 15 秒，标题稍后重试。').catch(error=>{console.warn(error);return{title:'',ocrTitle:'',credits:'',tempo:'',ocrText:'',source:'filename'};});
  phase='recognize';$('retry-import').textContent='重新识谱';
  setImportProgress(45,'正在提交识谱任务');message('PDF 已导入，正在识别音符与节奏…');
  const data=await requestJSON('/api/recognize',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file});
  // The PDF is already saved and previewable. Poll OMR in the background so
  // the user can browse pages and leave the tab open while recognition runs.
  importing=false;controls();message('PDF 已上传，识谱在后台进行中，可继续浏览原始 PDF。');
  void (async()=>{
   try{
    const started=performance.now();let job=data,partialRevision=0;
    if(job.status==='complete'&&!job.xml)job=await requestJSON(`/api/jobs/${data.id}`);
    while(['running','queued'].includes(job.status)){
     await new Promise(r=>setTimeout(r,1500));if(version!==uploadVersion)return;
     if(performance.now()-started>930000)throw Error('等待识谱超过 15 分钟，请按单首曲目拆分 PDF 后重试');
     job=await requestJSON(`/api/jobs/${data.id}`);if(version!==uploadVersion)return;
     if(job.partialXml&&job.revision>partialRevision){partialRevision=job.revision;try{const partial=parseMusicXML(job.partialXml,'正在识别原谱标题');score=partial;await renderNotation($('notation'),partial);$('notation').classList.add('streaming-score');view('notation');}catch(error){console.warn('Partial score pending',error);}}
     const elapsed=performance.now()-started;const label=job.stage||'后台识别音符与节奏';setImportProgress(46+Math.min(100,job.progress||0)*.46,`${label}，已等待 ${Math.floor(elapsed/1000)} 秒`);message(label);
    }
    if(version!==uploadVersion)return;if(job.status!=='complete')throw Error(job.error||'未识别出可用音符');
    setImportProgress(94,'识谱完成，正在同步原谱标题与作者');const metadata=job.metadata?.title?job.metadata:await metadataPromise;const parsed=applyScoreMetadata(parseMusicXML(job.xml,file.name.replace(/\.pdf$/i,'')),metadata);parsed.serverId=savedScore.id;await writeScoreCache(cacheKey,{xml:job.xml,metadata});if(data.id&&metadata?.source==='OCR')void requestJSON(`/api/jobs/${data.id}/metadata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(metadata)}).catch(()=>{});await setScore(parsed);void loadPdfGeometry(savedScore.id,1,parsed.pdfPageRows?.[1]||1);
    setImportProgress(100,'识谱、OCR 和电子谱排版完成','done');message('后台识谱完成，已生成可播放电子谱');await autoplayImported();
   }catch(error){if(version!==uploadVersion)return;const explanation=error.message||'后台识谱失败';message(`PDF 已载入，但音符识别失败：${explanation}`,'error');setImportProgress(importProgressValue,`后台处理失败：${explanation}`,'failed');$('retry-import').textContent='重新识谱';$('retry-import').hidden=false;$('play-status').textContent='尚未生成可播放音符。';}
   finally{void refreshLibrary();if(version===uploadVersion){importing=false;controls();}}
  })();
  return;
 }catch(error){
  if(version!==uploadVersion)return;
  const explanation=error.name==='PasswordException'?'PDF 已加密，请上传解除密码后的琴谱。':error.message;
  message(phase==='preview'?`PDF 读取失败：${explanation}`:`PDF 已载入，但音符识别失败：${explanation}`,'error');
  $('score-subtitle').textContent=$('pdf-pages').children.length?'原稿 PDF 可切换查看　自动识谱未完成':'PDF 未能读取';
  setImportProgress(importProgressValue,`处理失败：${explanation}`,'failed');$('play-status').textContent='尚未生成可播放音符。';$('retry-import').textContent=phase==='preview'?'重新读取 PDF':'重新识谱';$('retry-import').hidden=false;
 }finally{void refreshLibrary();if(version===uploadVersion){pdfLoading=null;importing=false;controls();}}
}
function unlockForImport(){if($('autoplay').checked)void player.unlock().catch(()=>{});}
initMediaImport(async()=>{void refreshLibrary();showTasks();});
$('pdf-input').onchange=e=>{unlockForImport();enqueueUploads([...e.target.files],uploadedQueuedScore);e.target.value='';};
$('numbered-input').onchange=e=>{unlockForImport();enqueueUploads([...e.target.files].map(file=>{try{Object.defineProperty(file,'name',{value:`简谱·${file.name}`,configurable:true});}catch{}return file;}),uploadedQueuedScore);e.target.value='';};
$('numbered-zone').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('numbered-input').click();}};
for(const event of ['dragenter','dragover'])$('drop-zone').addEventListener(event,e=>{e.preventDefault();$('drop-zone').classList.add('dragging');});
$('drop-zone').ondragleave=()=>$('drop-zone').classList.remove('dragging');
$('drop-zone').ondrop=e=>{e.preventDefault();$('drop-zone').classList.remove('dragging');unlockForImport();enqueueUploads([...e.dataTransfer.files],uploadedQueuedScore);};
$('retry-import').onclick=()=>{unlockForImport();uploadPdf(sourceFile);};
$('xml-input').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 if(file.size>10*1024*1024)return message('MusicXML 文件不能超过 10 MB。','error');
 unlockForImport();const version=++uploadVersion;cancelPdfLoading();stop();importing=true;controls();message('正在读取 MusicXML');
 try{let xml;
  if(/\.mxl$/i.test(file.name)){const data=await requestJSON('/api/unpack',{method:'POST',body:file});xml=data.xml;}else xml=await file.text();
  if(version!==uploadVersion)return;
  const parsed=parseMusicXML(xml,file.name);importing=false;await setScore(parsed);
  $('retry-import').hidden=true;message('已载入 MusicXML，可自动演奏和调速。');await autoplayImported();
 }catch(error){if(version===uploadVersion)message(`MusicXML 无法读取：${error.message}`,'error');}
 finally{if(version===uploadVersion){importing=false;controls();}}
};
$('alt-recognize').onclick=async()=>{const digest=score?.serverId||score?.sourceDigest;if(!digest)return message('请先打开需要重新识谱的 PDF。','warning');const button=$('alt-recognize');button.disabled=true;try{const result=await requestJSON(`/api/scores/${digest}/recognize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:'alternative',force:true})});message('已使用替代模型重新识谱，任务已加入队列。');reportTask(`alt-${result.id}`,{label:`${score.title} · 替代模型识谱`,jobId:result.id,status:result.status,progress:0,detail:'替代模型正在处理当前 PDF'});void (async()=>{try{let job=await requestJSON(`/api/jobs/${result.id}`);while(job&&['queued','running'].includes(job.status)){await new Promise(resolve=>setTimeout(resolve,2500));job=await requestJSON(`/api/jobs/${result.id}`);}if(job&&job.status==='complete'){message('替代模型识谱完成，已生成可切换的谱面。');await refreshVariantSwitch();}else if(job&&job.status==='failed')message(`替代模型识谱失败：${job.error||'未知原因'}`,'error');}catch{}})();}catch(error){message(`替代模型识谱失败：${error.message}`,'error');}finally{button.disabled=false;}};
$('export-button').onclick=()=>{const header=['source','measure','event_index','score_beat','expected_midi','heard_midi','result','onset_seconds','offset_ms','target_bpm'];const rows=records.map(r=>[r.source,r.measure,r.index,r.beat,r.expected.join(' '),r.heard.join(' '),r.type,r.time,r.offsetMs??'',tempo()]);const csv='\ufeff'+[header,...rows].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`琴伴-${demo?'模拟':'练习'}-${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('pagehide',stop);
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'get_piano_practice_state',description:'读取当前钢琴练习进度与练习评分，不开启麦克风。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:input=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw Error('不接受参数');return{title:score?.title??null,running,simulation:demo,completed:follower?.index??0,total:score?.events.length??0,metrics:summarize(records,tempo())};}});}catch{}}
setupScoreEditing({getScore:()=>score,onRename:()=>{stop();player.pause();$('score-title').textContent=score.title;$('file-info').textContent=score.title;const key=score.serverId||score.title;notationCache.delete(key);renderNotation($('notation'),score);notationCache.set(key,$('notation').cloneNode(true));document.dispatchEvent(new CustomEvent('score-renamed',{detail:{id:score.serverId,title:score.title}}));void refreshLibrary();},message});
// Add coordinate metadata before any later user action parses a score.
const rawSetScore=setScore;setScore=async(next,isSample=false)=>{next.pdfSystemBands=next.pdfSystemBands||{};next.__pdfOverlayGeometry={};next.pdfClickBox={};pdfLastScrollPage=0;const result=await rawSetScore(decoratePdfCoordinates(next),isSample);refreshVariantSwitch();return result;};
// 同一份 PDF 被识谱两次后（标准 / 精细）保留了两版结果，这里给出切换按钮。
async function refreshVariantSwitch(){const button=$('variant-switch');if(!button)return;const id=score?.serverId;if(!id){button.hidden=true;return;}try{const info=await requestJSON(`/api/scores/${id}/variants`);if(score?.serverId!==id)return;const available=(info&&info.available)||[];if(available.length<2){button.hidden=true;if(score)score.variants=null;return;}score.variants={active:info.active,available};const current=available.find(item=>item.id===info.active),other=available.find(item=>item.id!==info.active)||available[0];button.hidden=false;button.disabled=false;button.textContent=`切换为${other.name}`;button.title=`当前：${current?current.name:'—'}　点击切换到：${other.name}`;}catch{button.hidden=true;}}
if($('variant-switch'))$('variant-switch').onclick=async()=>{const button=$('variant-switch'),current=score;if(!current?.serverId||!current.variants)return;const other=(current.variants.available||[]).find(item=>item.id!==current.variants.active);if(!other)return;button.disabled=true;try{const data=await requestJSON(`/api/scores/${current.serverId}/variant`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variant:other.id})});if(score!==current)return;const parsed=applyScoreMetadata(parseMusicXML(data.xml),data.metadata);parsed.serverId=current.serverId;parsed.variants=data.variants||{active:other.id,available:current.variants.available};message(`已切换为${other.name}`);await setScore(parsed);}catch(error){message(`切换谱面失败：${error.message}`,'error');}finally{button.disabled=false;}};
function pdfOverlayGeometry(event,page,row){
 const key=`${page}:${row}`;score.__pdfOverlayGeometry=score.__pdfOverlayGeometry||{};
 if(score.__pdfOverlayGeometry[key])return score.__pdfOverlayGeometry[key];
 const rowEvents=score.events.filter(item=>pdfEventPage(item)===page&&(item.pdfRow||1)===row&&Number.isFinite(item.pdfX));
 if(!rowEvents.length)return null;
 const bounds=score.pdfMeasureBounds?.[page]?.[row]||{};
 const points=[...rowEvents.map(item=>item.pdfX),...Object.values(bounds).flatMap(box=>[box.left,box.right])].filter(Number.isFinite);
 const minX=Math.min(...points),maxX=Math.max(...points),mapX=value=>12+(value-minX)/Math.max(1,maxX-minX)*76;
 const starts=Object.entries(bounds).map(([measure,box])=>[Number(measure),box.left]).sort((a,b)=>a[1]-b[1]);
 const geometry={mapX,minX,maxX,starts,bounds};score.__pdfOverlayGeometry[key]=geometry;return geometry;
}
function applyPdfPlayback(index,beat=player.beat){
 const event=score?.events[index];if(!event||!pdfPageEls.length)return;
 const page=Math.max(1,Math.min(pdfPageEls.length,pdfEventPage(event)));
 const target=pdfPageEls[page-1];if(!target)return;
 const row=event.pdfRow||1,rows=Math.max(1,score.pdfPageRows?.[page]||1),band=score.pdfSystemBands?.[page]?.[row-1];
 const detected=score.pdfDetectedMeasures?.[page]?.[event.measure]||score.pdfClickBox?.[page]?.[event.measure];
 // A page carries margin above the first system and below the last one; without
 // a detected band the systems share what is left evenly.
 const fallbackTop=6+(row-1)*(88/rows);
 const fallbackBottom=6+row*(88/rows);
 const top=detected?.top??band?.top??fallbackTop;
 const bottom=detected?.bottom??band?.bottom??fallbackBottom;
 const height=Math.max(.1,bottom-top),geometry=pdfOverlayGeometry(event,page,row);
 let cursorX=12+((event.measure-1)/Math.max(1,score.measures||1))*76,left=cursorX-3,right=cursorX+7;
 // Before any geometry arrives the block is placed proportionally inside the
 // bars printed in THIS system. Laying the page's whole bar range on one line
 // put a third-system bar at the top of the page.
 const rowSlice=pdfRowMeasures(page,row);
 if(rowSlice.length){
  const slot=Math.max(0,rowSlice.indexOf(event.measure)),spread=76/rowSlice.length;
  cursorX=12+(slot+.5)*spread;left=cursorX-spread*.45;right=cursorX+spread*.45;
 }
 if(geometry){
  const measureBox=geometry.bounds[event.measure];
  if(measureBox){
   left=geometry.mapX(measureBox.left);right=geometry.mapX(measureBox.right);
   const eventX=Number.isFinite(event.pdfX)?geometry.mapX(event.pdfX):left;
   const rowEvents=score.events.filter(item=>pdfEventPage(item)===page&&(item.pdfRow||1)===row).sort((a,b)=>a.beat-b.beat);
   const currentIndex=rowEvents.findIndex(item=>item===event),next=rowEvents.slice(currentIndex+1).find(item=>item.measure===event.measure&&Number.isFinite(item.pdfX));
   const beatSpan=Math.max(.12,next?next.beat-event.beat:event.duration||1),ratio=Math.max(0,Math.min(1,(Number(beat)-event.beat)/beatSpan));
   const nextX=next?geometry.mapX(next.pdfX):geometry.mapX(measureBox.right);cursorX=eventX+(nextX-eventX)*ratio;
  }else{
   cursorX=Number.isFinite(event.pdfX)?geometry.mapX(event.pdfX):cursorX;
   const current=geometry.starts.findIndex(([measure])=>measure===event.measure);if(current>=0){const leftX=geometry.starts[current][1],step=(geometry.maxX-geometry.minX)/Math.max(1,geometry.starts.length),rightX=geometry.starts[current+1]?.[1]??leftX+step;left=geometry.mapX(leftX);right=Math.max(left+5,geometry.mapX(rightX));}
  }
 }
 let blockLeft=left,blockRight=right;
 if(detected){
  blockLeft=detected.left;blockRight=detected.right;
  const measureEvents=score.events.filter(e=>e.measure===event.measure);
  const first=measureEvents[0],last=measureEvents[measureEvents.length-1];
  const start=first.beat-(first.offset||0),nextMeasure=score.events.find(e=>e.measure>event.measure);
  const end=nextMeasure?nextMeasure.beat-(nextMeasure.offset||0):last.beat+last.duration;
  cursorX=blockLeft+(blockRight-blockLeft)*Math.max(0,Math.min(1,(beat-start)/Math.max(.01,end-start)));
 }
 // Geometry may still be loading on a later PDF page. Keep a proportional
 // measure block visible so clicks always seek and give immediate feedback.
 cursorX=Math.max(blockLeft+.15,Math.min(blockRight-.15,cursorX));
 pdfPageEls.forEach((pageEl,pageIndex)=>{pageEl.classList.toggle('pdf-page-current',pageIndex===page-1);const block=pageEl.querySelector('.pdf-measure-highlight'),marker=pageEl.querySelector('.pdf-cursor');if(pageIndex!==page-1){if(block)block.style.opacity='0';if(marker)marker.style.opacity='0';}});
 const marker=target.querySelector('.pdf-cursor'),block=target.querySelector('.pdf-measure-highlight');
 if(marker){marker.style.left=`clamp(0px, ${(cursorX-blockLeft)/(blockRight-blockLeft)*100}%, calc(100% - 2px))`;marker.style.top="0";marker.style.height="100%";marker.style.bottom='auto';marker.style.opacity='1';}
 if(block){block.style.left=`${blockLeft}%`;block.style.width=`${Math.max(.1,blockRight-blockLeft)}%`;block.style.top=`${top}%`;block.style.height=`${height}%`;block.style.bottom='auto';block.style.opacity='1';}
 if(currentView==='pdf'){
  if(performance.now()<followUntil)return;
  const followKey=`${page}:${row}`,area=$('sheet-scroll'),pageBox=target.getBoundingClientRect(),areaBox=area.getBoundingClientRect(),rowTop=pageBox.top+pageBox.height*top/100,rowBottom=pageBox.top+pageBox.height*bottom/100,margin=Math.max(45,area.clientHeight*.16);
  if(followKey!==pdfLastScrollPage&&(rowTop<areaBox.top+margin||rowBottom>areaBox.bottom-margin)){
   const desired=Math.max(0,area.scrollTop+(rowTop+rowBottom)/2-areaBox.top-area.clientHeight/2);if(typeof area.scrollTo==='function')area.scrollTo({top:desired,behavior:'smooth'});else area.scrollTop=desired;pdfLastScrollPage=followKey;
  }else if(followKey!==pdfLastScrollPage)pdfLastScrollPage=followKey;
 }
}
syncPdfPlayback=(index,beat=player.beat)=>{if(score?.generated)return;pdfPendingIndex={index,beat};if(pdfGeometryFrame)return;pdfGeometryFrame=requestAnimationFrame(()=>{pdfGeometryFrame=0;const pending=pdfPendingIndex;pdfPendingIndex=null;if(pending)applyPdfPlayback(pending.index,pending.beat);});};
// One handler owns every PDF click. Three competing listeners used to be bound
// here (one per page element plus two on document); a capture-phase listener
// stopped propagation before the others ran, so which bar a click seeked to
// depended on load order instead of on the bar lines actually printed.
document.addEventListener('click',event=>{
 const page=event.target.closest?.('.pdf-page');
 if(!page||!score||score.generated)return;
 const rect=page.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 const pageNumber=Number(page.dataset.page)||1;
 const x=Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100));
 const y=Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100));
 const measure=pdfMeasureAtPoint(pageNumber,x,y);
 if(measure==null)return;
 const index=pdfEventIndexAt(pageNumber,measure);
 if(index<0)return;
 recordPdfClickBox(pageNumber,measure,x,y);
 event.preventDefault();event.stopImmediatePropagation();
 void playFromNote(index);
},true);

const toneSelect=$('instrument-select');for(const [id,label] of INSTRUMENTS){const option=document.createElement('option');option.value=id;option.textContent=label;toneSelect.append(option);}
toneSelect.onchange=()=>{player.setInstrument(toneSelect.value);controls();$('play-status').textContent='音源已选择，播放时加载';};
let arrangementRequest=0;

$('chord-toggle').onchange=()=>{$('chord-display').hidden=!$('chord-toggle').checked;};


// One control owns performance expression. The sidebar used to show a
// "使用演奏模型" checkbox AND a "生成力度曲线" button that overlapped, and the
// button stayed on screen after generating. The button now exists only while
// there is nothing applied, and the single label carries the state.
let expressionAvailable=false,expressionLabel=document.querySelector('.expression-control');
function syncExpressionControls({available=expressionAvailable,applied=!!player.modelPerformance&&player.modelPerformance.source===player.originalScore}={}){
 expressionAvailable=available;
 const button=$('render-expression');
 if(button){button.hidden=applied||!available;button.disabled=!available;button.textContent='生成模型演奏表情';}
 if($('expression-state'))$('expression-state').textContent=applied?'已应用 Pianist Transformer 演奏表情':available?'尚未生成，可点上方按钮生成':'演奏模型尚未就绪';
 if(expressionLabel&&expressionLabel.lastChild)expressionLabel.lastChild.textContent=applied?' 演奏表情':' 自然演奏';
}
requestJSON('/api/performance').then(data=>syncExpressionControls({available:!!data.available})).catch(()=>{expressionAvailable=false;if($('expression-state'))$('expression-state').textContent='演奏模型服务暂不可用';});
$('render-expression').onclick=async()=>{if(!score)return message('请先打开琴谱','warning');const original=score;const button=$('render-expression');button.disabled=true;try{let task=await requestJSON('/api/performance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:score.serverId,bpm:tempo(),events:score.events.map(e=>({beat:e.beat,notes:e.notes.map(n=>({midi:n.midi,duration:n.duration}))}))})});while(['queued','running'].includes(task.status)){setImportProgress(task.progress||0,task.status==='queued'?'力度处理排队中':'生成力度曲线');await new Promise(r=>setTimeout(r,1800));task=await requestJSON(`/api/performance/${task.id}`);}if(task.status!=='complete')throw Error(task.error||'生成失败');if(score!==original){message('演奏结果已缓存，重新打开原曲后可载入');return;}player.setModelPerformance(task.result);syncExpressionControls({available:true,applied:true});setImportProgress(100,'力度处理已就绪','done');}catch(error){message(error.message,'error');}finally{button.disabled=false;}};

// Rotating a phone swaps the usable width, and both the staff and the numbered
// notation cache their column count per width. The old listener compared only
// window.innerWidth with a 24 px dead zone and never listened for
// orientationchange, so a rotation during a slow viewport update was dropped
// and the previous layout stayed cached. Any width change now re-renders.
let resizeRenderTimer=0,lastViewportWidth=0;
const viewportWidth=()=>Math.round(globalThis.visualViewport?.width||window.innerWidth||0);
function relayoutNotation(force){
 if(!score)return;
 const width=viewportWidth();
 if(width&&!force&&Math.abs(width-lastViewportWidth)<16)return;
 if(width)lastViewportWidth=width;
 clearTimeout(resizeRenderTimer);
 resizeRenderTimer=setTimeout(()=>{resizeRenderTimer=0;void setNotationMode(notationMode);},160);
}
window.addEventListener('resize',()=>relayoutNotation(false),{passive:true});
window.addEventListener('orientationchange',()=>{lastViewportWidth=0;relayoutNotation(true);},{passive:true});
if(globalThis.visualViewport)globalThis.visualViewport.addEventListener('resize',()=>relayoutNotation(false),{passive:true});
lastViewportWidth=viewportWidth();
let selectedJob=null,selectedJobRevision=0,streamBusy=false;
async function uploadedQueuedScore(item){void refreshLibrary();if(!score&&!selectedJob)await openPendingScore(item);}
async function openPendingScore(item){
 stop();player.stop();uploadVersion++;cancelPdfLoading();selectedJob=item.jobId;selectedJobRevision=0;score=null;importing=true;sourceFile=null;records=[];$('notation').replaceChildren();$('score-title').textContent='正在校对标题';$('score-subtitle').textContent='任务已进入识谱队列';view('pdf');controls();await loadStoredPdf(item.id||item.digest);showTasks();
 if(!selectedJob){const response=await requestJSON(`/api/scores/${item.id||item.digest}/recognize`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});selectedJob=response.id;}
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function openFromTaskCenter(item){
 const libraryPanel=document.querySelector('[data-panel="library"]');
 if(libraryPanel&&document.body.dataset.workspace!=='library'){libraryPanel.click();await wait(560);}
 let card=document.querySelector(`[data-score-id="${item.digest}"]`);
 for(let attempt=0;!card&&attempt<8;attempt++){await wait(250);card=document.querySelector(`[data-score-id="${item.digest}"]`);}
 if(card){card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest',inline:'center'});await wait(620);}
 if(item.kind==='arrangement'&&item.status==='complete'){await openGeneratedArrangement(item);return;}
 if(card){card.click();return;}
 await openPendingScore({...item,id:item.digest});
}
document.addEventListener('task-open-score',event=>{void openFromTaskCenter(event.detail);});
document.addEventListener('cloud-jobs-update',async()=>{
 if(!selectedJob||streamBusy)return;streamBusy=true;const id=selectedJob,version=uploadVersion;
 try{const job=await requestJSON(`/api/jobs/${id}`);if(version!==uploadVersion)return;
  if(job.partialXml&&job.revision>selectedJobRevision){
   const next=parseMusicXML(job.partialXml,'正在识别');next.serverId=job.digest;score=next;view('notation');
   const pages=job.partialPages||[job.partialXml];let offset=0;
   for(let i=0;i<pages.length;i++){
    const pageDoc=new DOMParser().parseFromString(pages[i],'application/xml');const count=pageDoc.querySelector('score-partwise > part')?.querySelectorAll(':scope > measure').length||0;
    if(i>=selectedJobRevision){
     reportTask('engraving',{label:'电子谱绘制',detail:`绘制第 ${i+1} 页`,status:'running',progress:i/pages.length*100});
     const chunk=document.createElement('div');chunk.className='stream-page';$('notation').append(chunk);
     await renderNotation(chunk,{...next,xml:pages[i],measureOffset:offset});if(version!==uploadVersion)return;
     chunk.classList.add('ink-reveal');
    }
    offset+=count;
   }
   selectedJobRevision=pages.length;reportTask('engraving',{status:'complete',progress:100,detail:`已显示 ${pages.length} 页`});
  }
  if(job.status==='complete'){selectedJob=null;importing=false;const parsed=applyScoreMetadata(parseMusicXML(job.xml),job.metadata);parsed.serverId=job.digest;await setScore(parsed);reportTask('engraving',{label:'电子谱绘制',status:'complete',progress:100,detail:'识谱完成'});void refreshLibrary();await autoplayImported();}
  else if(job.status==='failed'){selectedJob=null;importing=false;message(job.error||'识谱失败','error');controls();}
 }catch(error){message(error.message,'error');}finally{streamBusy=false;}
});

async function loadCachedExpression(current){if(!current.serverId)return;try{const data=await requestJSON(`/api/scores/${current.serverId}/performance`);if(score===current&&data.status==='complete'){player.setModelPerformance(data.result);syncExpressionControls({available:true,applied:true});}}catch{}}
let expressionCachePoll=0;
document.addEventListener('cloud-jobs-update',()=>{if(score&&performance.now()-expressionCachePoll>8000){expressionCachePoll=performance.now();void loadCachedExpression(score);}});

async function openGeneratedArrangement(task){const playPanel=document.querySelector('[data-panel="play"]');if(playPanel&&document.body.dataset.workspace!=='play'){playPanel.click();await wait(560);}notationMode='engraved';$('notation').hidden=false;
 try{const result=typeof task.result==='string'?JSON.parse(task.result):task.result;if(!result?.key)throw Error('总谱尚未保存');reportTask('open-arrangement',{label:'载入改编总谱',status:'running',progress:10});const data=await requestJSON(`/api/arrangements/${result.key}`);await new Promise(resolve=>requestAnimationFrame(resolve));const next=applyArrangement(parseMusicXML(data.xml),data);next.sourceDigest=task.digest;const params=data.params||result.params||{};const styleName=ARRANGEMENT_NAMES[params.style]||'改编总谱';const arrangementName=params.drums&&params.style&&params.style!=='original'?`${styleName} · 鼓伴奏`:params.drums?'鼓伴奏':styleName;next.arrangementKey=data.key||result.key;next.title=`${data.title||next.title} · ${arrangementName}`;next.meta={...next.meta,title:next.title,arrangementName};player.setArrangement('original');await setScore(next);$('original-button').disabled=true;reportTask('open-arrangement',{status:'complete',progress:100,detail:`${arrangementName}已就绪`});}catch(error){reportTask('open-arrangement',{status:'failed',detail:error.message});message(error.message,'error');}
}
initArrangements({getScore:()=>score,request:requestJSON,message,open:openGeneratedArrangement});

$("sheet-scroll").addEventListener("wheel",()=>{followUntil=performance.now()+2500;},{passive:true});
$("sheet-scroll").addEventListener("touchstart",()=>{followUntil=performance.now()+2500;},{passive:true});
void import("./workspace.js");
