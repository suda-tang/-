const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// Parts arrive from the arrangement models in creation order (low instrument
// first), so the client has to re-order them. A drum part has no <pitch> and
// must stay at the bottom.
const STEPS=['C','C','D','E','E','F','F','G','A','A','B','B'];
function pitchedPart(id,name,midi,measures){
 const body=Array.from({length:measures},(_,i)=>{const p=midi+(i%4);
  return `<measure number="${i+1}">${i===0?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}`+
   Array.from({length:4},()=>`<note><pitch><step>${STEPS[p%12]}</step><octave>${Math.floor(p/12)-1}</octave></pitch><duration>1</duration><type>quarter</type></note>`).join('')+'</measure>';}).join('');
 return `<part id="${id}">${body}</part>`;
}
function drumPart(id,measures){
 const body=Array.from({length:measures},(_,i)=>`<measure number="${i+1}">`+
  Array.from({length:4},()=>'<note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>1</duration><type>quarter</type><instrument id="P3-drum-36"/></note>').join('')+'</measure>').join('');
 return body;
}
const NAMES=['Cello','Piccolo','Piano','Drums'];
const XML=`<?xml version="1.0"?><score-partwise version="4.0"><part-list>`+
 `<score-part id="P1"><part-name>Cello</part-name></score-part>`+
 `<score-part id="P2"><part-name>Piccolo</part-name></score-part>`+
 `<score-part id="P3"><part-name>Piano</part-name></score-part>`+
 `<score-part id="P4"><part-name>Drums</part-name><score-instrument id="P4-drum-36"><instrument-name>Bass Drum 1</instrument-name></score-instrument><midi-instrument id="P4-drum-36"><midi-channel>10</midi-channel><midi-unpitched>37</midi-unpitched></midi-instrument></score-part>`+
 `</part-list>`+
 pitchedPart('P1','Cello',48,4)+pitchedPart('P2','Piccolo',84,4)+pitchedPart('P3','Piano',60,4)+`<part id="P4">${drumPart('P4',4)}</part>`+
 `</score-partwise>`;

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#xml-input').setInputFiles({name:'order.musicxml',mimeType:'application/xml',buffer:Buffer.from(XML)});
  await page.waitForFunction(()=>document.querySelectorAll('#notation .engraved-sheet svg').length>0,null,{timeout:60000});
  await page.waitForTimeout(2000);
  const order=await page.evaluate(names=>{
   const seen=new Map();
   for(const text of document.querySelectorAll('#notation .engraved-sheet svg text')){
    const value=text.textContent.trim();if(!names.includes(value)||seen.has(value))continue;
    const box=text.getBoundingClientRect();if(!box.height&&!box.width)continue;
    seen.set(value,Math.round(box.top));
   }
   return [...seen.entries()].sort((a,b)=>a[1]-b[1]).map(([name])=>name);
  },NAMES);
  console.log({order,errors});
  assert.deepEqual(order,['Piccolo','Piano','Cello','Drums'],'higher instruments must sit above lower ones, drums last');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'.sites-runtime/part-order.png'});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
