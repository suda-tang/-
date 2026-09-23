const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// A hidden container reports clientWidth 0, and the score used to be laid out
// at 260 px whenever the engraving ran before the view switched over — which
// is what happens with 自动播放 turned off, and after rotating while the PDF
// view is on screen. Both notations must measure the scroll area instead.
const MEASURES=20;
const XML='<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+
 Array.from({length:MEASURES},(_,i)=>`<measure number="${i+1}">`+(i===0?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
  Array.from({length:4},()=>'<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>').join('')+'</measure>').join('')+
 '</part></score-partwise>';

const declared=page=>page.evaluate(()=>[...document.querySelectorAll('#notation .engraved-sheet')].map(sheet=>Math.round(parseFloat(sheet.style.width))));

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173');
  // 自动播放 off: nothing may unhide the sheet container mid-render.
  await page.evaluate(()=>{document.querySelector('#autoplay').checked=false;});
  await page.locator('#xml-input').setInputFiles({name:'width.musicxml',mimeType:'application/xml',buffer:Buffer.from(XML)});
  await page.waitForFunction(()=>document.querySelectorAll('#notation .engraved-sheet').length>=2);

  const desktop=await declared(page);
  const available=await page.evaluate(()=>document.querySelector('#sheet-scroll').clientWidth);
  console.log({desktop,available});
  assert.ok(desktop.length>=2,'both chunks must be laid out');
  for(const width of desktop)assert.ok(Math.abs(width-(available-16))<=2,`engraved width ${width} must match the scroll area ${available}`);

  // Numbered notation must not fall back to the two-measure mobile column count.
  await page.locator('#simple-button').click();
  await page.waitForSelector('.simple-sheet');
  const columns=await page.evaluate(()=>({systems:document.querySelectorAll('.simple-system').length,first:document.querySelector('.simple-system').style.getPropertyValue('--measures')}));
  console.log({columns});
  assert.equal(columns.first,'4','a wide viewport keeps four measures per system');
  assert.equal(columns.systems,Math.ceil(MEASURES/4));

  // Simulated rotation: the layout has to be rebuilt for the new width.
  await page.locator('#notation-button').click();
  await page.waitForFunction(()=>document.querySelector('#notation').hidden===false&&document.querySelectorAll('#notation .engraved-sheet').length>0);
  await page.setViewportSize({width:640,height:900});
  await page.waitForFunction(previous=>{
   const sheets=[...document.querySelectorAll('#notation .engraved-sheet')];
   return sheets.length>0&&sheets.every(sheet=>Math.round(parseFloat(sheet.style.width))<previous);
  },desktop[0],{timeout:20000});
  const rotated=await page.evaluate(()=>({
   widths:[...document.querySelectorAll('#notation .engraved-sheet')].map(sheet=>Math.round(parseFloat(sheet.style.width))),
   available:document.querySelector('#sheet-scroll').clientWidth,
  }));
  console.log({rotated});
  for(const width of rotated.widths)assert.ok(Math.abs(width-(rotated.available-16))<=2,`rotated width ${width} must match ${rotated.available}`);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'.sites-runtime/notation-width.png'});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
