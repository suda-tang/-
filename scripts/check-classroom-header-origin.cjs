const assert=require('node:assert/strict'),fs=require('fs');const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();fs.mkdirSync('.sites-runtime/classroom-header',{recursive:true});
for(const [device,width,height]of [['desktop',1440,900],['phone',390,844]]){
 await p.setViewportSize({width,height});await p.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>document.documentElement.dataset.workspaceReady==='true',{timeout:60000});await p.locator('.workspace-nav [data-panel=play]').click();await p.waitForFunction(()=>!document.querySelector('.workspace-stage').classList.contains('is-moving'));
 await p.locator('.score-classroom>summary').click();await p.locator('.classroom-expand').waitFor({timeout:30000});await p.locator('.classroom-expand').click();await p.waitForFunction(()=>document.querySelector('.classroom-fullscreen')&&!document.querySelector('.classroom-morphing'));
 const row=await p.locator('.classroom-heading').evaluate(e=>{const r=s=>{const b=e.querySelector(s).getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,cy:b.y+b.height/2};};return {title:r('h3'),ai:r('.classroom-agent-launch'),min:r('.classroom-minimize')};});
 assert.ok(Math.abs(row.title.cy-row.ai.cy)<1);assert.ok(Math.abs(row.ai.cy-row.min.cy)<1);for(const k of ['width','height'])assert.equal(row.ai[k],row.min[k]);assert.equal(row.ai.width,44);console.log('PASS',device,'header alignment',row);
 for(let i=0;i<2;i++){
  await p.locator('.classroom-agent-launch').click();await p.waitForFunction(()=>document.querySelector('.ai-conversation')?.open&&!document.querySelector('.ai-morph-surface'));
  const origin=await p.locator('.classroom-agent-launch').boundingBox();await p.locator('.ai-conversation .ai-close').click();await p.locator('.ai-morph-surface').waitFor({state:'attached'});
  const destination=await p.locator('.ai-morph-surface').evaluate(e=>({x:parseFloat(e.style.left),y:parseFloat(e.style.top),width:parseFloat(e.style.width),height:parseFloat(e.style.height)}));
  for(const k of ['x','y','width','height'])assert.ok(Math.abs(origin[k]-destination[k])<1,device+' return target '+k);
  await p.waitForFunction(()=>!document.querySelector('.ai-conversation')?.open&&!document.querySelector('.ai-morph-surface'));
  assert.equal(await p.locator('.classroom-agent-launch').evaluate(e=>document.activeElement===e),true);console.log('PASS',device,'AI return cycle',i+1,destination);
 }
 await p.screenshot({path:'.sites-runtime/classroom-header/'+device+'.png'});await p.locator('.classroom-minimize').click();await p.waitForFunction(()=>!document.querySelector('.classroom-fullscreen')&&!document.querySelector('.classroom-morphing'));assert.equal(await p.locator('.classroom-expand').count(),1);console.log('PASS',device,'minimize restores inline heading');
}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
