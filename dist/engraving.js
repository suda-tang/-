import { cleanText } from './library.js';
// A container that is still hidden reports clientWidth 0. Measuring the
// container therefore collapsed a whole score into a 260 px strip whenever the
// engraving happened before the view switched over — which is exactly what
// happens on a fresh import, on the multi-chunk path, and after a rotation
// while the PDF view was on screen. Always measure the scroll area the sheet
// will actually live in, falling back to the viewport.
export function sheetWidth(container){
  const scroll=container?.closest?.('.sheet-scroll')||null;
  const measured=Math.max(scroll?.clientWidth||0,container?.parentElement?.clientWidth||0,Number(container?.clientWidth)||0);
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
  const width=sheetWidth(container);
  sheet.style.width = `${width}px`;
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
    host.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;opacity:0;pointer-events:none`;
    host.append(caption, sheet);
    document.body.append(host);
  }
  let stale = false, failure = null;
  try {
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(sheet, {
      backend: 'svg', autoResize: false, drawTitle: !score.measureOffset,
      drawPartNames: true, drawPartAbbreviations: false,
      newSystemFromXML: false, newPageFromXML: false,
      defaultColorMusic:'#443738', defaultColorLabel:'#736367', defaultColorTitle:'#443738'
    });
    await osmd.load(xmlWithMetadata(score.xml, score.meta));
    osmd.Zoom=width<600?.65:1;
    Object.assign(osmd.EngravingRules,{SheetTitleHeight:2.4,PageTopMargin:1,TitleTopDistance:1,TitleBottomDistance:2});
    if (!host.contains(sheet)) { stale = true; return; }
    osmd.render();
    // Match engraving positions to the same measure-relative onset used by
    // playback/following, including simultaneous notes in both piano staves.
    osmd.GraphicSheet.MeasureList.forEach((staves, measureIndex) => {
      for (const staff of staves) for (const entry of staff?.staffEntries || []) {
        const offset = entry.sourceStaffEntry.Timestamp.RealValue * 4;
        const index = score.events.findIndex(e => e.measure === measureIndex + 1 + (score.measureOffset||0) && Math.abs(e.offset - offset) < 0.0001);
        if (index < 0) continue;
        for (const voice of entry.graphicalVoiceEntries) for (const note of voice.notes) {
          if (note.sourceNote.isRest()) continue;
          const element = note.getSVGGElement?.();
          if (!element) continue;
          element.classList.add('note-event', 'pending');
          element.dataset.index = String(index);
          element.setAttribute('tabindex','0');element.setAttribute('role','button');
          element.setAttribute('aria-label',`从第 ${measureIndex+1+(score.measureOffset||0)} 小节此音播放`);
          const box=element.getBBox();
          const hit=document.createElementNS('http://www.w3.org/2000/svg','rect');
          for(const [key,value] of Object.entries({x:box.x-9,y:box.y-8,width:Math.max(24,box.width+18),height:Math.max(36,box.height+16),rx:6,fill:'transparent',class:'score-hit'}))hit.setAttribute(key,value);
          element.prepend(hit);
        }
      }
    });
    sheet.osmd = osmd;
    const info = [score.meta?.credits, score.meta?.tempo].filter(Boolean).join('　');
    caption.textContent = `${info}`;
  } catch (error) {
    failure = error;
  } finally {
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

function xmlWithMetadata(xml, metadata = {}) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
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
  const serialized=new XMLSerializer().serializeToString(doc);
  return serialized.startsWith('<?xml')?serialized:`<?xml version="1.0" encoding="UTF-8"?>${serialized}`;
}

export async function renderEngraved(container,score){
 const documentXML=new DOMParser().parseFromString(score.xml,'application/xml');
 const measures=documentXML.querySelector('score-partwise > part')?.querySelectorAll(':scope > measure').length||0;
 if(measures<=16)return renderSingleEngraved(container,score);
 container.replaceChildren();const generation={};container.renderGeneration=generation;
 for(let start=0;start<measures;start+=16){
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
