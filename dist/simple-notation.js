import { sheetWidth } from './engraving.js';
const DEGREE=['1','2','3','4','5','6','7'];
const NATURAL=[0,2,4,5,7,9,11];
const round=(n,p=3)=>Math.round(n*10**p)/10**p;
function degree(midi){
 const pc=((midi%12)+12)%12;let best=0,d=99;
 for(let i=0;i<NATURAL.length;i++){const delta=Math.abs(pc-NATURAL[i]);if(delta<d){best=i;d=delta;}}
 const accidental=pc===NATURAL[best]?'':pc>NATURAL[best]?'♯':'♭';
 const octave=Math.floor(midi/12)-5; // C4 is the unmarked octave in numbered notation.
 const dots=octave>0?'·'.repeat(Math.min(2,octave)):'';const low=octave<0?'̲'.repeat(Math.min(2,-octave)):'';
 return `${dots}${accidental}${DEGREE[best]}${low}`;
}
function durationClass(duration){if(duration>=3.5)return 'whole';if(duration>=1.75)return 'half';if(duration>=.875)return 'quarter';if(duration>=.4375)return 'eighth';return 'sixteenth';}
function durationText(duration){const unit=durationClass(duration);const exact={whole:'全音符',half:'二分音符',quarter:'四分音符',eighth:'八分音符',sixteenth:'十六分音符'}[unit];const dotted=Math.abs(duration/({whole:4,half:2,quarter:1,eighth:.5,sixteenth:.25}[unit])-1.5)<.13;return `${exact}${dotted?'附点':''}`;}
function keyLabel(score){const key=Number(score.keyFifths);if(!Number.isFinite(key))return '1=C';const names=['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];return `1=${names[Math.max(0,Math.min(14,key+7))]}`;}
// Instrument names arrive in English from the OMR engine and from the
// arrangement models; the sheet is Chinese, so they are translated here.
const INSTRUMENT_LABELS={voice:'人声',vocal:'人声','voice oohs':'人声',melody:'旋律',piano:'钢琴',keyboard:'键盘',violin:'小提琴',viola:'中提琴',cello:'大提琴',contrabass:'低音提琴',flute:'长笛',piccolo:'短笛',clarinet:'单簧管',oboe:'双簧管',bassoon:'大管','french horn':'圆号',trumpet:'小号',trombone:'长号',tuba:'大号','string ensemble 1':'弦乐组','string ensemble':'弦乐组',strings:'弦乐组','orchestral harp':'竖琴',harp:'竖琴',drums:'鼓',percussion:'打击乐',timpani:'定音鼓',guitar:'吉他','acoustic guitar':'吉他',organ:'风琴',soprano:'女高音',alto:'女低音',tenor:'男高音',bass:'男低音'};
function partLabel(name){const text=String(name||'').trim();return INSTRUMENT_LABELS[text.toLowerCase()]||text||'声部';}
// Follow a whole system, rather than alternately chasing notes in each hand.
export function simplePlaybackTarget(container,measure){
 return [...container.querySelectorAll('.simple-system')].find(system=>measure>=Number(system.dataset.startMeasure)&&measure<=Number(system.dataset.endMeasure))||null;
}
function* renderSimpleSteps(container,score){
 // Build the whole sheet off-screen and swap it in one go. Clearing first left
 // the panel blank whenever a rebuild threw or an in-flight staff render kept
 // appending underneath; invalidating renderGeneration also stops that render.
 const wrap=document.createElement('div');wrap.className='simple-sheet';
 const title=document.createElement('div');title.className='simple-title';title.textContent=score.title||'简谱';wrap.append(title);
 const meta=document.createElement('div');meta.className='simple-meta';meta.innerHTML=`<span>${keyLabel(score)}</span><span>${score.timeSignature||'4/4'}</span><span>♩=${score.tempo||80}</span>`;wrap.append(meta);
 const caption=document.createElement('div');caption.className='simple-caption';caption.textContent=`按声部分谱　${score.measures||0} 小节　Numbered notation`;wrap.append(caption);
  // Part labels come from the score, never from a staff number. A single-staff
 // part used to be announced as 右手 because it happened to be staff 1, which
 // mislabelled every vocal and string part in the library.
 const partNames=new Map(),partStaves=new Map();
 if(score.xml&&!score.midiParts?.length){const doc=new DOMParser().parseFromString(score.xml,'application/xml');
  for(const item of doc.querySelectorAll('score-part'))partNames.set(item.id,item.querySelector('part-name')?.textContent?.trim()||item.id);
  for(const part of doc.querySelectorAll('score-partwise > part')){
   const declared=Number(part.querySelector(':scope > measure > attributes > staves')?.textContent||0);
   const used=new Set([...part.querySelectorAll('staff')].map(node=>Number(node.textContent)||1));
   partStaves.set(part.getAttribute('id'),Math.max(declared||0,used.size||1));
  }
 }
 for(const part of score.midiParts||[])partNames.set(part.id,part.name);
 const byMeasure=new Map(),byLaneMeasure=new Map();
 score.events.forEach((event,index)=>{if(!byMeasure.has(event.measure))byMeasure.set(event.measure,[]);byMeasure.get(event.measure).push(event);const voices=new Map();for(const note of event.notes){if(note.percussion)continue;const key=(note.part||'P1')+':'+(Number(note.staff)||1);if(!voices.has(key))voices.set(key,[]);voices.get(key).push(note);}for(const [key,notes]of voices){const bucket=key+':'+event.measure;if(!byLaneMeasure.has(bucket))byLaneMeasure.set(bucket,[]);byLaneMeasure.get(bucket).push({event,index,notes});}});
 const lanes=new Map();score.events.forEach((event,index)=>event.notes.forEach(note=>{if(note.percussion)return;const part=note.part||'P1',staff=Number(note.staff)||1,key=`${part}:${staff}`;if(!lanes.has(key)){const staves=partStaves.get(part)||1,name=partLabel(partNames.get(part)||part);lanes.set(key,{key,part,staff,label:name,hand:staves>1?(staff===1?'右手':'左手'):'',events:[]});}lanes.get(key).events.push({event,index,note});}));
 for(const lane of lanes.values())partStaves.set(lane.part,Math.max(partStaves.get(lane.part)||1,lane.staff));for(const lane of lanes.values())lane.hand=(partStaves.get(lane.part)||1)>1?(lane.staff===1?'右手':'左手'):'';
 const ordered=[...lanes.values()].sort((a,b)=>a.part.localeCompare(b.part)||a.staff-b.staff);const available=sheetWidth(container),perSystem=available<480?1:available<634?2:4,measureCount=Math.max(1,score.measures||1);
 for(let start=1;start<=measureCount;start+=perSystem){const end=Math.min(measureCount,start+perSystem-1),system=document.createElement('section');system.className='simple-system';system.dataset.startMeasure=String(start);system.dataset.endMeasure=String(end);system.style.setProperty('--measures',String(end-start+1));
  const numbers=document.createElement('div');numbers.className='simple-measure-numbers';numbers.append(document.createElement('span'));for(let m=start;m<=end;m++){const n=document.createElement('span');n.textContent=String(m);numbers.append(n);}system.append(numbers);
  for(const lane of ordered){const row=document.createElement('div');row.className='simple-part-row';const label=document.createElement('strong');label.className='simple-part-label';label.innerHTML=`${lane.label}${lane.hand?`<small>${lane.hand}</small>`:''}`;row.append(label);
   for(let measure=start;measure<=end;measure++){const cell=document.createElement('div');cell.className='simple-measure';cell.dataset.measure=String(measure);const measureBeats=Number(String(score.timeSignature||'4/4').split('/')[0])||4,measureEvents=byMeasure.get(measure)||[],measureStart=measureEvents.length?Math.min(...measureEvents.map(event=>event.beat-(Number(event.offset)||0))):(measure-1)*measureBeats,entries=byLaneMeasure.get(lane.key+':'+measure)||[];let cursor=0;
    if(!entries.length){const rest=document.createElement('span');rest.className='simple-rest whole';rest.textContent=`0 ${'—'.repeat(Math.max(0,measureBeats-1))}`;rest.title='全小节休止';cell.append(rest);cursor=measureBeats;}else for(const {event,index,notes} of entries){const offset=Math.max(0,Number.isFinite(Number(event.offset))?Number(event.offset):event.beat-measureStart),gap=offset-cursor;if(gap>.18){const rest=document.createElement('span');rest.className=`simple-rest ${durationClass(gap)}`;rest.textContent=gap>1.5?`0 ${'—'.repeat(Math.max(0,Math.round(gap)-1))}`:'0';rest.title=`休止 ${round(gap)} 拍`;cell.append(rest);}
     const duration=Math.max(.125,...notes.map(note=>Number(note.duration)||event.duration||1)),button=document.createElement('button');button.type='button';button.className=`simple-event note-event pending ${durationClass(duration)}`;button.dataset.index=String(index);button.setAttribute('aria-label',`第 ${measure} 小节第 ${round(offset+1)} 拍，${durationText(duration)}`);button.title=button.getAttribute('aria-label');const pitches=notes.sort((a,b)=>b.midi-a.midi).map(note=>`<span>${degree(note.midi)}</span>`).join('');const extensions=Math.max(0,Math.round(duration)-1);button.innerHTML=`<span class="simple-pitches ${notes.length>1?'simple-chord':''}">${pitches}</span>${extensions?`<b class="simple-prolong">${'—'.repeat(Math.min(3,extensions))}</b>`:''}`;cell.append(button);cursor=Math.max(cursor,offset+duration);}const tail=measureBeats-cursor;if(tail>.18){const rest=document.createElement('span');rest.className=`simple-rest ${durationClass(tail)}`;rest.textContent=tail>1.5?`0 ${'—'.repeat(Math.max(0,Math.round(tail)-1))}`:'0';rest.title=`休止 ${round(tail)} 拍`;cell.append(rest);}
    row.append(cell);
   }system.append(row);
  }wrap.append(system);yield system;
 }
 const legend=document.createElement('div');legend.className='simple-legend';legend.textContent='下划线表示八分、十六分时值　横线表示延长　音符上下点表示音区　0 表示休止';wrap.append(legend);
 container.renderGeneration={};
 container.replaceChildren(wrap);
}

export function renderSimpleNotation(container,score){for(const _ of renderSimpleSteps(container,score)){} }
export async function renderSimpleNotationAsync(container,score){
 const iterator=renderSimpleSteps(container,score);let deadline=performance.now()+8;
 for(const _ of iterator){if(performance.now()>deadline){await new Promise(resolve=>setTimeout(resolve,0));deadline=performance.now()+8;}}
}
