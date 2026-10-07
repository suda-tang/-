import { consolidateMidiStaves } from './midi-notation-layout.js';
import { cleanText } from './library.js';
// OSMD 是 1.1 MB 的脚本，而首屏根本用不到它 —— 只有真正要排版谱面时才需要。
// 它原先在 index.html 里同步加载，光这一个就占了首屏传输量的七成，还阻塞渲染。
// 改成按需：第一次排谱时才插入 script，之后复用 window 上的全局对象。
let osmdLoader = null;
function ensureOsmd() {
  if (globalThis.opensheetmusicdisplay?.OpenSheetMusicDisplay) return Promise.resolve();
  if (!osmdLoader) {
    osmdLoader = new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = '/vendor/opensheetmusicdisplay.min.js';
      tag.onload = () => resolve();
      tag.onerror = () => { osmdLoader = null; reject(Error('乐谱排版引擎加载失败')); };
      document.head.append(tag);
    });
  }
  return osmdLoader;
}
// A container that is still hidden reports clientWidth 0. Measuring the
// container therefore collapsed a whole score into a 260 px strip whenever the
// engraving happened before the view switched over — which is exactly what
// happens on a fresh import, on the multi-chunk path, and after a rotation
// while the PDF view was on screen. Always measure the scroll area the sheet
// will actually live in, falling back to the viewport.
export function sheetWidth(container){
  const scroll=container?.closest?.('.sheet-scroll')||null;
  const measured=scroll?.clientWidth||Number(container?.clientWidth)||container?.parentElement?.clientWidth||0;
  const viewport=Math.max(0,Number(globalThis.innerWidth)||0);
  const available=measured>0?measured:Math.max(280,viewport-(viewport<=800?24:60));
  return Math.max(260,Math.round(available-16));
}
async function renderSingleEngraved(container, score) {
  container.replaceChildren();
  const caption = document.createElement('div');
  caption.className = 'notation-note';
  caption.textContent = '正在排版完整乐谱…';
  const sheet = document.createElement('div');
  sheet.className = 'engraved-sheet';
  const width=sheetWidth(container),onsets=new Map();
  for(const event of score.events||[]){if(event.measure<1+(score.measureOffset||0)||event.measure>16+(score.measureOffset||0))continue;if(!onsets.has(event.measure))onsets.set(event.measure,new Set());onsets.get(event.measure).add(event.offset??event.beat);}
  const denseWidth=Math.max(0,...[...onsets.values()].map(times=>times.size*18+130));
  const layoutWidth=score.midiSource||score.meta?.sourceType==='midi'?width:Math.max(width,denseWidth);
  sheet.style.setProperty('width',`${layoutWidth}px`,'important');
  sheet.style.setProperty('--notation-width',`${layoutWidth}px`);
  container.append(caption, sheet);
  // OSMD measures its host while rendering. When the notation panel is still
  // collapsed — a fresh import, or a re-render triggered while the PDF view is
  // on screen — the host measures 0, OSMD bakes the SVG with width="0" and the
  // score stays blank for good. Render through a laid-out staging host on the
  // body in that case, then hand the nodes back to the real container.
  // A generated arrangement can be loaded while its workspace panel is still
  // transitioning in.  In that moment clientWidth may be non-zero even though
  // the element has no laid-out rectangle, and OSMD then produces an empty SVG.
  // Detect the actual box instead of relying on clientWidth alone.
  const rect = container.getBoundingClientRect?.();
  const staged = container.clientWidth <= 0 || !rect || rect.width <= 1 || rect.height <= 1;
  const host = staged ? document.createElement('div') : container;
  if (staged) {
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${layoutWidth}px;opacity:0;pointer-events:none`;
    host.append(caption, sheet);
    document.body.append(host);
  }
  let stale = false, failure = null;
  await ensureOsmd();
  try {
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(sheet, {
      backend: 'svg', autoResize: false, drawTitle: !score.measureOffset,
      drawPartNames: false, drawPartAbbreviations: false,
      newSystemFromXML: true, newPageFromXML: false,
      defaultColorMusic:'#443738', defaultColorLabel:'#736367', defaultColorTitle:'#443738'
    });
    const engravingXML=xmlWithMetadata(score.xml, {...score.meta,midiSource:score.midiSource||score.meta?.sourceType==='midi'}, width);
    await osmd.load(engravingXML);
    osmd.Zoom=width<600?.52:width<950?.62:.7;
    Object.assign(osmd.EngravingRules,{SheetTitleHeight:2.4,PageTopMargin:1,TitleTopDistance:1,TitleBottomDistance:2,SystemLeftMargin:8,StaffDistance:9,BetweenStaffDistance:9,MinimumDistanceBetweenSystems:10,MinNoteDistance:2.5,MeasureWidthFactor:1.15});
    if (!host.contains(sheet)) { stale = true; return; }
    osmd.render();
    // Match engraving positions to the same measure-relative onset used by
    // playback/following, including simultaneous notes in both piano staves.
    const partDocument=new DOMParser().parseFromString(engravingXML,'application/xml');const staffParts=[...partDocument.querySelectorAll('score-partwise > part')].flatMap(part=>Array(Math.max(1,Number(part.querySelector('staves')?.textContent)||1)).fill(part.id));
    osmd.GraphicSheet.MeasureList.forEach((staves, measureIndex) => {
      for (const [staffIndex,staff] of staves.entries()) for (const entry of staff?.staffEntries || []) {
        const sourceMeasure=partDocument.querySelector('score-partwise > part')?.querySelectorAll(':scope > measure')[measureIndex];
        const measure=(Number(sourceMeasure?.getAttribute('data-source-measure'))||measureIndex+1)+(score.measureOffset||0);
        const offset = entry.sourceStaffEntry.Timestamp.RealValue * 4+Number(sourceMeasure?.getAttribute('data-source-offset')||0);
        let index = score.events.findIndex(e => e.measure === measure && Math.abs(e.offset - offset) < 0.0001);
        if(index<0&&score.midiSource){for(let i=0;i<score.events.length;i++){const e=score.events[i];if(e.measure===measure&&e.offset<=offset+.0625)index=i;}}
        if (index < 0) continue;
        for (const voice of entry.graphicalVoiceEntries) for (const note of voice.notes) {
          if (note.sourceNote.isRest()) continue;
          const element = note.getSVGGElement?.();
          if (!element) continue;
          element.classList.add('note-event', 'pending');
          element.dataset.index = String(index);element.dataset.measure=String(measure);element.dataset.part=staffParts[staffIndex]||'default';
          element.setAttribute('tabindex','0');element.setAttribute('role','button');
          element.setAttribute('aria-label',`从第 ${measure} 小节此音播放`);
          const box=element.getBBox();
          const hit=document.createElementNS('http://www.w3.org/2000/svg','rect');
          for(const [key,value] of Object.entries({x:box.x-9,y:box.y-8,width:Math.max(24,box.width+18),height:Math.max(36,box.height+16),rx:6,fill:'transparent',class:'score-hit'}))hit.setAttribute(key,value);
          element.prepend(hit);
        }
      }
    });
    const definitions=new Map([...partDocument.querySelectorAll('score-part')].map(p=>[p.id,p.querySelector('part-name')?.textContent||'乐器']));
    for(const svg of sheet.querySelectorAll('svg')){
     const rows=[...svg.querySelectorAll('g.staffline')];
     for(const [rowIndex,row] of rows.entries()){
      row.dataset.systemStaves=String(staffParts.length);
      const part=staffParts[rowIndex%staffParts.length]||'default',name=definitions.get(part)||'钢琴',box=row.getBBox();
      const staffLines=[...row.querySelectorAll('path')].map(path=>path.getBBox()).filter(line=>line.width>50&&line.height<1);
      const staffTop=staffLines.length?Math.min(...staffLines.map(line=>line.y)):box.y,staffBottom=staffLines.length?Math.max(...staffLines.map(line=>line.y)):box.y+Math.min(box.height,40);
      const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',String(Math.max(4,box.x-12)));text.setAttribute('y',String((staffTop+staffBottom)/2+4));text.setAttribute('text-anchor','end');text.setAttribute('font-size','11');text.setAttribute('fill','#736367');text.setAttribute('font-family','system-ui, sans-serif');text.setAttribute('class','staff-instrument-label');text.dataset.part=part;text.textContent=name;svg.append(text);
     }
    }
    // SVG playback targets are already annotated. Do not retain the entire
    // engraving graph alongside every rendered chunk on memory-limited phones.
    const info = [score.meta?.credits, score.meta?.tempo].filter(Boolean).join('　');
    caption.textContent = `${info}`;
  } catch (error) {
    failure = error;
  } finally {
    sheet.style.removeProperty('width');
    if (staged) {
      // Never push our stale nodes back into a container a newer render owns.
      if (!stale && !container.querySelector(':scope > .engraved-sheet')) container.append(caption, sheet);
      else { caption.remove(); sheet.remove(); }
      host.remove();
    }
  }
  if (!failure) return;
  const msg = typeof failure === 'object' && failure !== null ? (failure.message || JSON.stringify(failure)) : String(failure);
  console.warn('OSMD render failed:', msg);
  // Never collapse named instrument parts into a synthetic two-staff piano.
  caption.textContent = `乐谱排版失败：${msg}。请切换"原始 PDF"查看原稿。`;
}

function xmlWithMetadata(xml, metadata = {}, width = 900) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if(metadata.midiSource)consolidateMidiStaves(doc,width);
  for(const part of doc.querySelectorAll('score-part')){let name=part.querySelector('part-name');if(!name){name=doc.createElement('part-name');part.prepend(name);}if(!name.textContent.trim())name.textContent=part.querySelector('instrument-name')?.textContent||'钢琴';let abbreviation=part.querySelector('part-abbreviation');if(!abbreviation){abbreviation=doc.createElement('part-abbreviation');name.after(abbreviation);}abbreviation.textContent=name.textContent;}
  // --- Sanitize common OMR output defects that crash OSMD ---
  // Fix zero or non-numeric <divisions> (Audiveris sometimes emits 0 on
  // pages where it could not detect staff spacing).
  for (const div of doc.querySelectorAll('divisions')) {
    const value = Number(div.textContent);
    if (!Number.isFinite(value) || value <= 0) {
      // Inherit from a neighbouring measure, or fall back to 1.
      const part = div.closest('part');
      let inherited = 0;
      if (part) for (const d of part.querySelectorAll('divisions')) {
        const v = Number(d.textContent);
        if (v > 0) { inherited = v; break; }
      }
      div.textContent = String(inherited || 1);
    }
  }
  // Remove empty <part> elements (no measures at all) — OSMD throws an
  // opaque object when it encounters a part-list entry without a body.
  for (const part of doc.querySelectorAll('score-partwise > part')) {
    if (!part.querySelector('measure')) {
      const id = part.getAttribute('id');
      part.remove();
      const def = doc.querySelector(`score-part[id="${id}"]`);
      if (def) def.remove();
    }
  }
  // Clean textual fields only: pitches, rhythm, dynamics and musical symbols
  // are left intact. Do not remove legitimate Chinese lyrics or Italian marks.
  for(const node of doc.querySelectorAll('credit-words,words,creator,work-title,movement-title,lyric text')){
    const text=cleanText(node.textContent);if(text)node.textContent=text;else node.remove();
  }
  metadata={...metadata,title:cleanText(metadata.title),credits:cleanText(metadata.credits)};
  const root = doc.documentElement;
  for(const part of root.querySelectorAll(':scope > part'))if(part.querySelector('unpitched')){
   const definition=[...root.querySelectorAll('score-part')].find(n=>n.id===part.id);
   if(definition?.querySelector('part-name'))definition.querySelector('part-name').textContent='鼓';
   for(const sign of part.querySelectorAll('clef > sign'))sign.textContent='percussion';
  }
  // Keep higher instruments above lower instruments in every generated score.
  // OMR and MIDI imports often retain creation order instead of score order.
  const parts=[...root.querySelectorAll(':scope > part')].map(part=>{const pitches=[...part.querySelectorAll('pitch')].map(p=>{const steps={C:0,D:2,E:4,F:5,G:7,A:9,B:11};return (Number(p.querySelector('octave')?.textContent||4)+1)*12+(steps[p.querySelector('step')?.textContent]??0)+Number(p.querySelector('alter')?.textContent||0);});return {part,count:pitches.length,mean:pitches.length?pitches.reduce((a,b)=>a+b,0)/pitches.length:-Infinity};});
  // Keep higher instruments above lower ones, but never let a fragment decide
  // the order: a stray OMR part holding six notes used to outrank a part with
  // two thousand and print a bass clef above a treble one. Percussion carries no
  // pitch, so it is compared with nothing and printed last.
  const pitched=parts.filter(entry=>entry.count>0),percussion=parts.filter(entry=>entry.count===0);
  const totalNotes=pitched.reduce((sum,entry)=>sum+entry.count,0);
  // The floor is relative: a fixed number of notes would refuse to sort any
  // small score, while a fragment is always a small fraction of the whole.
  const sortable=pitched.length>1&&pitched.every(entry=>entry.count>=Math.max(4,totalNotes*.08));
  const order=sortable?[...pitched].sort((a,b)=>b.mean-a.mean):pitched;
  const arrangement=[...order,...percussion];
  if(parts.length>1&&arrangement.length===parts.length){
   const list=root.querySelector('part-list');
   for(const entry of arrangement){const id=entry.part.getAttribute('id');const definition=list?.querySelector(`score-part[id="${id}"]`);if(definition)list.append(definition);root.append(entry.part);}
  }
  // VexFlow supports 8va/15ma but throws an empty exception for 22ma.
  // Preserve the indication as text rather than changing note pitches.
  for(const shift of doc.querySelectorAll('octave-shift')){
    if(!['8','15'].includes(shift.getAttribute('size')||'8')){
      const words=doc.createElement('words');const size=shift.getAttribute('size');
      words.textContent=shift.getAttribute('type')==='stop'?`${size}ma 结束`:`${size}${shift.getAttribute('type')==='up'?'mb':'ma'}`;shift.replaceWith(words);
    }
  }
  // Imported print-page margins otherwise create large blank areas in the
  // continuous practice view. Keep notation but use screen layout spacing.
  doc.querySelectorAll('page-layout,system-layout').forEach(node=>node.remove());
  let work = Array.from(root.children).find(node => node.localName === 'work');
  if (!work) { work = doc.createElement('work'); root.insertBefore(work, root.firstChild); }
  let title = Array.from(work.children).find(node => node.localName === 'work-title');
  if (!title && metadata.title) { title = doc.createElement('work-title'); work.append(title); }
  // A filename fallback should not erase a meaningful title already present
  // in MusicXML. OCR titles are explicitly marked with ocrTitle.
  if (title && metadata.title && (metadata.ocrTitle || !title.textContent?.trim())) title.textContent = metadata.title;
  if (metadata.credits) {
    let identification = Array.from(root.children).find(node => node.localName === 'identification');
    if (!identification) { identification = doc.createElement('identification'); root.append(identification); }
    const creator = doc.createElement('creator'); creator.setAttribute('type', 'arranger'); creator.textContent = metadata.credits; identification.append(creator);
  }
  // Space notes through the score setting OSMD actually reads, and explicitly
  // wrap narrow screens instead of shrinking a desktop row into the viewport.
  // Auxiliary MIDI voices need timing rests, but drawing every padding rest
  // on the same staff creates stacks of redundant symbols.
  for(const part of root.querySelectorAll(':scope > part')){
   for(const bar of part.querySelectorAll(':scope > measure')){
    const staffNotes=new Map();for(const note of bar.querySelectorAll(':scope > note')){const staff=note.querySelector('staff')?.textContent||'1';if(!staffNotes.has(staff))staffNotes.set(staff,[]);staffNotes.get(staff).push(note);}
    for(const notes of staffNotes.values()){
     const pitched=notes.filter(note=>!note.querySelector('rest'));
     if(!pitched.length)continue;
     const firstVoice=pitched[0].querySelector('voice')?.textContent||'1';
     for(const note of notes)if(note.querySelector('rest')&&((note.querySelector('voice')?.textContent||'1')!==firstVoice||note.querySelector('type')?.textContent==='whole'))note.setAttribute('print-object','no');
    }
   }
   const definition=root.querySelector(`score-part[id="${part.id}"]`),program=Number(definition?.querySelector('midi-program')?.textContent)-1;
   if(program>=32&&program<=39){for(const clef of part.querySelectorAll('clef')){if(clef.querySelector('sign')?.textContent==='G'){clef.querySelector('sign').textContent='F';if(clef.querySelector('line'))clef.querySelector('line').textContent='4';}}}
  }
  root.setAttribute('osmdMeasureWidthFactor','1.15');
  const scoreParts=[...root.querySelectorAll(':scope > part')];
  const maxBars=width<600?2:width<950?3:4;
  for(const part of scoreParts){
   const bars=[...part.querySelectorAll(':scope > measure')];
   bars.forEach((bar,index)=>{
    for(const print of bar.querySelectorAll(':scope > print')){print.removeAttribute('new-system');print.removeAttribute('new-page');}
    if(index&&index%maxBars===0){let print=bar.querySelector(':scope > print');if(!print){print=doc.createElement('print');bar.prepend(print);}print.setAttribute('new-system','yes');}
   });
  }
  const serialized=new XMLSerializer().serializeToString(doc);
  return serialized.startsWith('<?xml')?serialized:`<?xml version="1.0" encoding="UTF-8"?>${serialized}`;
}

export async function renderEngraved(container,score){
 const documentXML=new DOMParser().parseFromString(score.xml,'application/xml');
 const measures=documentXML.querySelector('score-partwise > part')?.querySelectorAll(':scope > measure').length||0;
 if(measures<=16)return renderSingleEngraved(container,score);
 container.replaceChildren();const generation={};container.renderGeneration=generation;
 const mobile=matchMedia('(pointer:coarse)').matches||innerWidth<800;
 for(let start=0;start<measures;start+=16){
  if(start>=16){const placeholder=document.createElement('div');placeholder.className='notation-chunk';placeholder.dataset.lazyMeasure=String(start);placeholder.style.minHeight='850px';placeholder.textContent='正在准备后续谱面…';container.append(placeholder);continue;}
  if(container.renderGeneration!==generation||!container.isConnected)return;
  const doc=documentXML.cloneNode(true);
  for(const part of doc.querySelectorAll('score-partwise > part')){
   const all=[...part.children].filter(n=>n.localName==='measure');const inherited=new Map();
   for(const m of all.slice(0,start))for(const attr of m.querySelectorAll(':scope > attributes > *'))inherited.set(attr.localName+':'+(attr.getAttribute('number')||''),attr.cloneNode(true));
   all.forEach((m,i)=>{if(i<start||i>=start+16)m.remove();});const first=part.querySelector('measure');
   if(first&&start){let attrs=first.querySelector('attributes');if(!attrs){attrs=doc.createElement('attributes');first.prepend(attrs);}for(const [key,attr] of inherited)if(![...attrs.children].some(n=>n.localName+':'+(n.getAttribute('number')||'')===key))attrs.append(attr);}
  }
  const chunk=document.createElement('div');chunk.className='notation-chunk';container.append(chunk);
  await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
  await renderSingleEngraved(chunk,{...score,xml:new XMLSerializer().serializeToString(doc),measureOffset:(score.measureOffset||0)+start});
  score.onRenderProgress?.(Math.min(1,(start+16)/measures));
 }
}

export function activateLazyEngraving(container,score){
 container.lazyEngravingObserver?.disconnect();
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){const chunk=entry.target;if(!entry.isIntersecting||chunk.dataset.loading)continue;observer.unobserve(chunk);chunk.dataset.loading='true';const start=Number(chunk.dataset.lazyMeasure),doc=new DOMParser().parseFromString(score.xml,'application/xml');
 for(const part of doc.querySelectorAll('score-partwise > part')){const all=[...part.children].filter(n=>n.localName==='measure'),inherited=new Map();for(const m of all.slice(0,start))for(const attr of m.querySelectorAll(':scope > attributes > *'))inherited.set(attr.localName+':'+(attr.getAttribute('number')||''),attr.cloneNode(true));all.forEach((m,i)=>{if(i<start||i>=start+16)m.remove();});const first=part.querySelector('measure');if(first){let attrs=first.querySelector('attributes');if(!attrs){attrs=doc.createElement('attributes');first.prepend(attrs);}for(const [key,attr] of inherited)if(![...attrs.children].some(n=>n.localName+':'+(n.getAttribute('number')||'')===key))attrs.append(attr);}}
 void renderSingleEngraved(chunk,{...score,xml:new XMLSerializer().serializeToString(doc),measureOffset:(score.measureOffset||0)+start}).then(()=>{chunk.style.minHeight='';delete chunk.dataset.lazyMeasure;delete chunk.dataset.loading;document.dispatchEvent(new Event('engraving-chunk-ready'));}).catch(()=>{chunk.textContent='此段排版失败，请重新打开曲谱';});
 }},{root:container.closest('.sheet-scroll'),rootMargin:'500px'});container.lazyEngravingObserver=observer;container.querySelectorAll('[data-lazy-measure]').forEach(chunk=>observer.observe(chunk));
}
