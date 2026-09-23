const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:5175');await page.waitForSelector('.workspace-nav');
 await page.locator('[data-panel=arrange]').click();await page.waitForFunction(()=>document.querySelectorAll('.preset-choice').length===7);
 await page.locator('[data-style=custom]').click();assert.equal(await page.locator('[name=arrangement-program]').count(),34);
 assert.equal(await page.locator('#arrangement-select').count(),1);
 await page.locator('[data-panel=library]').click();await page.locator('#autoplay').uncheck({force:true}).catch(()=>{});
 // Pure renderer integration on the actual generated multi-part MusicXML.
 const xml=fs.readFileSync('.sites-runtime/verification/generated.musicxml','utf8');
 const engraving=await page.evaluate(async xml=>{const {parseMusicXML,renderNotation}=await import('/score.js');const s=parseMusicXML(xml);const host=document.querySelector('#notation');host.hidden=false;document.querySelector('#empty-score').hidden=true;await renderNotation(host,s);return {drums:s.events.flatMap(e=>e.notes.filter(n=>n.percussion).map(n=>n.midi)),svg:host.querySelectorAll('svg').length,text:host.textContent};},xml);
 assert.ok(engraving.svg>0);assert.ok(engraving.text.includes('鼓'));assert.ok(engraving.drums.includes(36)&&engraving.drums.includes(38)&&engraving.drums.includes(42));
 assert.ok(!engraving.text.includes('排版失败'));await page.locator('[data-panel=play]').click();
 for(const [name,width,height] of [['desktop',1440,1000],['phone',390,844],['landscape',844,390],['tablet',1024,768]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' horizontal overflow');
  await page.screenshot({path:'.sites-runtime/verification/'+name+'-score.png'});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',styles:7,programs:34,drumPitches:[...new Set(engraving.drums)],viewports:4}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
