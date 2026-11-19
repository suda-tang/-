const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 fs.mkdirSync('.sites-runtime/workspace-spacing',{recursive:true});const p=await b.newPage();
 for(const [device,width,height]of [['desktop',1440,900],['tablet',1024,768],['phone',390,844],['phone-landscape',844,390]]){
  await p.setViewportSize({width,height});await p.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true',{timeout:60000});
  for(const panel of ['library','play','arrange','tasks']){
   await p.locator('.workspace-nav [data-panel="'+panel+'"]').click();
   const travel=await p.locator('.workspace-stage').evaluate(e=>{const rects=[...e.children].filter(c=>!c.hidden).map(c=>c.getBoundingClientRect()).sort((a,b)=>a.left-b.left);return {moving:e.classList.contains('is-moving'),gaps:rects.slice(1).map((r,i)=>r.left-rects[i].right)};});
   for(const gap of travel.gaps)assert.ok(gap>=19.5,device+' page gutter '+gap);
   await p.waitForFunction(()=>!document.querySelector('.workspace-stage')?.classList.contains('is-moving'),{timeout:30000});
   const result=await p.locator('#workspace-'+panel).evaluate(e=>{const nodes=[...e.children].filter(c=>!c.hidden&&c.getBoundingClientRect().height),rects=nodes.map(c=>c.getBoundingClientRect());return {gaps:rects.slice(1).map((r,i)=>r.top-rects[i].bottom),expected:parseFloat(getComputedStyle(e.parentElement).getPropertyValue('--workspace-section-gap')),display:getComputedStyle(e).display};});
   assert.equal(result.display,'flex');if(result.gaps.some(g=>g<result.expected-.5)){console.log('BAD',device,panel,await p.locator('#workspace-'+panel).evaluate(e=>[...e.children].map(c=>({cls:c.className,position:getComputedStyle(c).position,display:getComputedStyle(c).display,rect:c.getBoundingClientRect().toJSON(),margin:getComputedStyle(c).margin,transform:getComputedStyle(c).transform}))));await p.screenshot({path:'.sites-runtime/workspace-spacing/failure.png'});}for(const gap of result.gaps)assert.ok(gap>=result.expected-.5,device+' section gutter '+gap);
   console.log('PASS',device,panel,JSON.stringify({pageGaps:travel.gaps,sectionGaps:result.gaps}));
   if(panel==='play')await p.screenshot({path:'.sites-runtime/workspace-spacing/'+device+'-play-after.png'});
  }
 }
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
