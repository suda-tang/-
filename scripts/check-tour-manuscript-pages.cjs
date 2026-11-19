const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/research.html?lang=zh');
 await page.waitForFunction(()=>document.querySelector('#route-count').textContent.includes('44'));
 for(const route of ['education','technology']){
  await page.locator(`[data-direction=${route}]`).click();
  await page.locator('#preview').click();
  const checked=await page.evaluate(async route=>{
   const {createTourCopy}=await import('/tour-copy.js?v=humanizer-zh1');
   const steps=createTourCopy(route),problems=[];
   for(let i=0;i<steps.length;i++){
    const title=document.querySelector('#slide h2').textContent;
    const paragraphs=[...document.querySelectorAll('#slide p')].map(p=>p.textContent).join('\n\n');
    if(title!==steps[i][2]||paragraphs!==steps[i][3])problems.push(steps[i].id);
    if(document.documentElement.scrollWidth>innerWidth+2)problems.push('overflow:'+steps[i].id);
    if(i<steps.length-1)document.querySelector('#next').click();
   }
   return {count:steps.length,problems};
  },route);
  assert.deepEqual(checked.problems,[]);assert.equal(checked.count,44);
  await page.locator('#close').click();
  console.log('PASS',route,'all 44 Chinese pages match new manuscript and fit mobile width');
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
