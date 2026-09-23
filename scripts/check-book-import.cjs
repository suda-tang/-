const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1360,height:1000}});await page.goto('http://127.0.0.1:5173/');
 const list=await (await page.request.get('http://127.0.0.1:5173/api/scores')).json();const parts=list.scores.filter(s=>s.title.includes('被遗忘')&&s.title.includes('识别分段'));assert.equal(parts.length,7);
 for(const part of parts){const data=await (await page.request.get(`http://127.0.0.1:5173/api/scores/${part.id}`)).json();const count=await page.evaluate(async xml=>(await import('/score.js')).parseMusicXML(xml).events.length,data.xml);assert.ok(count>0);console.log(part.title,count);}
 const part=parts.find(p=>p.title.includes('2/7'));await page.locator('.library-score').filter({hasText:part.title}).click();await page.locator('.engraved-sheet .note-event').first().waitFor({timeout:60000});await page.locator('.engraved-sheet .note-event').first().click();await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));await page.locator('#play-button').click();console.log('PASS: seven real recognized segments parse, library opening and playback');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
