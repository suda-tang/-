const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 const xml='<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'+Array.from({length:20},(_,i)=>`<measure number="${i+1}">${i===0?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}${Array.from({length:4},()=>'<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>').join('')}</measure>`).join('')+'</part></score-partwise>';
 await page.locator('#xml-input').setInputFiles({name:'follow.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
 await page.waitForFunction(()=>document.querySelectorAll('.engraved-sheet svg').length>=2);
 await page.locator('#simple-button').click();
 await page.waitForSelector('.simple-sheet');
 const layout=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,sheet:document.querySelector('.simple-sheet').scrollWidth,systems:document.querySelectorAll('.simple-system').length}));
 assert.ok(layout.document<=layout.width+1);assert.ok(layout.sheet<=layout.width);
 await page.locator('.simple-event').nth(60).evaluate(el=>el.click());
 await page.waitForFunction(()=>document.querySelector('#position').textContent.includes('第 16 小节'),{},{timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#sheet-scroll').scrollTop>400);
 const scroll=await page.locator('#sheet-scroll').evaluate(el=>el.scrollTop);
 await page.locator('#sheet-scroll').scrollIntoViewIfNeeded();
 await page.screenshot({path:'.sites-runtime/mobile-final.png'});
 await page.evaluate(()=>{const loader=document.querySelector('.score-loading-overlay');loader.hidden=false;loader.querySelector('span').textContent='正在排版五线谱';loader.querySelector('small').textContent='68%';loader.querySelector('i').style.width='68%';});
 await page.screenshot({path:'.sites-runtime/progress-final.png'});
 console.log({layout,scroll,errors});assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
