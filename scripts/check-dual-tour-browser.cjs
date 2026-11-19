const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const width of [390,1360]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/research.html?mentor=测试导师&institution=测试院校&direction=technology&lang=zh');
  await page.waitForFunction(()=>document.querySelector('#route-count').textContent.includes('44'));
  assert.equal(await page.locator('[data-direction=technology]').getAttribute('aria-pressed'),'true');
  await page.locator('#share').click();
  let url=new URL(await page.locator('#share-url').inputValue());
  assert.equal(url.searchParams.get('direction'),'technology');assert.equal(url.searchParams.get('mentor'),'测试导师');
  await page.locator('#preview').click();
  assert.ok((await page.locator('#slide').innerText()).includes('研究背景与系统设计问题'));
  assert.equal(new URL(await page.locator('#live').getAttribute('href')).searchParams.get('chapter'),'opening');
  await page.locator('#close').click();
  await page.locator('[data-direction=education]').click();
  await page.locator('#share-language').selectOption('en');
  await page.locator('#share').click();url=new URL(await page.locator('#share-url').inputValue());
  assert.equal(url.searchParams.get('direction'),'education');assert.equal(url.searchParams.get('lang'),'en');
  await page.locator('#preview').click();assert.ok((await page.locator('#slide').innerText()).includes('Why I started'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  await page.screenshot({path:`audit/dual-tour-${width}.png`,fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS',width,'route selection, personalized links, preview, English and horizontal fit');await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
