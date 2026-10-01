const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert'),{pathToFileURL}=require('url');
(async()=>{
 const root=path.resolve('application/2027申请材料');
 const mentors=JSON.parse(fs.readFileSync(path.join(root,'优先联系名单.json'),'utf8'));
 const tours=JSON.parse(fs.readFileSync('dist/mentor-research.json','utf8'));
 assert.ok(mentors.length>=19);assert.equal(tours.length,mentors.length);
 for(const m of mentors){const t=tours.find(t=>t.names.includes(m.name));assert(t);assert(t.question.includes(m.question));assert.equal(new URL(m.demo).searchParams.get('mentor'),m.name);}
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'申请材料总览.html')).href);
  await page.locator('input').first().fill('蒋存梅');await page.waitForTimeout(300);
  assert((await page.locator('body').innerText()).includes('蒋存梅'));
  const missing=await page.locator('a').evaluateAll(as=>as.map(a=>a.getAttribute('href')).filter(x=>x&&!/^(https?:|#)/.test(x)));
  for(const relative of missing)assert(fs.existsSync(path.resolve(root,decodeURIComponent(relative))),relative);
  assert.deepEqual(errors,[]);
  console.log('PASS:',mentors.length,'tour/letter mappings, local material links, overview JavaScript');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
