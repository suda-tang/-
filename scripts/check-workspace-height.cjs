const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:1000}});await page.goto('http://127.0.0.1:5173');await page.waitForSelector('#workspace-play');
await page.evaluate(()=>{for(const [id,height] of [['play',300],['library',650]]){const p=document.querySelector('#workspace-'+id);p.replaceChildren();p.style.height=height+'px';}});
await page.locator('[data-panel=play]').click();await page.waitForFunction(()=>!document.querySelector('.workspace-stage').classList.contains('is-moving'));
const transition=async(target)=>page.evaluate(async target=>{const stage=document.querySelector('.workspace-stage'),values=[stage.getBoundingClientRect().height];document.querySelector(`[data-panel="${target}"]`).click();for(let i=0;i<42;i++){await new Promise(requestAnimationFrame);values.push(stage.getBoundingClientRect().height);}return values;},target);
const outbound=await transition('library'),returning=await transition('play');
for(const heights of [outbound,returning]){assert.ok(heights.some(h=>h>320&&h<620),JSON.stringify(heights));assert.ok(Math.max(...heights.map((h,i)=>i?Math.abs(h-heights[i-1]):0))<160,JSON.stringify(heights));}
assert.equal(await page.locator('.cloud-library-notice').count(),0);console.log('PASS: default library and symmetric intermediate height transitions');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
