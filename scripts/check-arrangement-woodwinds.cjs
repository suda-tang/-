const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// The client falls back to a hard-coded preset list when
// /api/arrangement-capabilities is unavailable, and tells the reader to restart
// the local service. That message appeared for the woodwind quartet because the
// running server still had the previous code, so this check reads the endpoint
// from inside the page, drives the preset picker, and opens the result.
const DIGEST=process.env.DIGEST||'b6df197c607e7d7c7fea4a47051333ccc429c0309d50e00e0877307901bb737e';
const STYLE=process.env.STYLE||'woodwinds';
const EXPECTED=(process.env.EXPECTED||'短笛,双簧管,单簧管,巴松').split(',');

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));

  // The page has to exist before a relative fetch can resolve.
  await page.goto('http://127.0.0.1:5173');
  const capabilities=await page.evaluate(async()=>{
   const response=await fetch('/api/arrangement-capabilities');
   return {ok:response.ok,status:response.status,body:response.ok?await response.json():null};
  }).catch(error=>({ok:false,status:0,error:error.message}));
  console.log('capabilities', capabilities.status, (capabilities.body?.styles||[]).map(style=>style.name));
  assert.ok(capabilities.ok,'the arrangement capabilities endpoint must answer');
  const styles=(capabilities.body.styles||[]).map(style=>style.name);
  assert.ok(styles.includes('木管四重奏'),'the preset list must already contain the woodwind quartet');

  // The workspace shows one panel at a time; the score library lives behind the
  // 曲库 tab, so the card is attached but has no box until that tab is opened.
  const tabs=page.locator('.workspace-nav button');
  if(await tabs.count())await page.locator('.workspace-nav button[data-panel="library"]').click({timeout:20000}).catch(()=>{});
  // The library is a horizontal strip that reloads itself, so the card can also
  // be momentarily absent mid-reload.
  await page.waitForFunction(()=>document.querySelectorAll('[data-score-id]').length>0,null,{timeout:60000});
  const card=page.locator(`[data-score-id="${DIGEST}"]`);
  await card.waitFor({state:'attached',timeout:60000});
  await card.scrollIntoViewIfNeeded();
  await card.click({timeout:40000});
  await page.waitForFunction(()=>document.querySelectorAll('#notation .engraved-sheet svg').length>0,null,{timeout:120000});

  if(await page.locator('.workspace-nav button[data-panel="arrange"]').count())await page.locator('.workspace-nav button[data-panel="arrange"]').click({timeout:20000});
  await page.waitForSelector('.arrangement-presets .preset-choice',{timeout:30000});
  const status=await page.locator('.arrangement-status').textContent();
  console.log('status note:', status);
  assert.ok(!/重启/.test(status),'the panel must not ask for a service restart any more');
  const presets=await page.locator('.arrangement-presets .preset-choice').allTextContents();
  console.log('presets', presets);
  assert.ok(presets.includes('木管四重奏'),'the woodwind preset must be offered');

  // Reuse a saved result when one exists; otherwise generate. The saved list is
  // inside collapsed <details>, so open every one of them first.
  await page.evaluate(()=>{document.querySelectorAll('details').forEach(node=>{if(node.querySelector('.saved-arrangements button'))node.open=true;});});
  await page.locator('.unified-arrangement > summary').click({timeout:20000}).catch(()=>{});
  await page.evaluate(()=>{document.querySelectorAll('details').forEach(node=>{node.open=true;});});
  await page.waitForTimeout(400);
  const saved=page.locator('.saved-arrangements button').filter({hasText:'木管'}).first();
  if(await saved.count()){
   console.log('opening the saved woodwind score');
   await saved.click({timeout:30000});
  }else{
   console.log('generating a woodwind score');
   await page.locator('.arrangement-presets .preset-choice',{hasText:'木管四重奏'}).click({timeout:20000});
   await page.locator('#generate-arrangement').click({timeout:20000});
  }

  // Waiting on the title also proves the style name is right: the suffix used to
  // fall through to 鼓伴奏 for any preset the title code did not know.
  try{
   await page.waitForFunction(()=>/木管四重奏/.test(document.querySelector('#score-title')?.textContent||''),null,{timeout:420000});
  }catch(error){
   const state=await page.evaluate(()=>({
    title:document.querySelector('#score-title')?.textContent||'',
    status:document.querySelector('.arrangement-status')?.textContent||'',
    saved:[...document.querySelectorAll('.saved-arrangements button')].map(node=>node.textContent),
    notice:document.querySelector('#notice')?.textContent||'',
   }));
   console.log('title wait failed:',JSON.stringify(state));
   throw error;
  }
  await page.waitForTimeout(2500);
  const loaded=await page.evaluate(()=>({
   title:document.querySelector('#score-title')?.textContent||'',
   parts:[...document.querySelectorAll('#notation .engraved-sheet svg text')].map(node=>node.textContent.trim()).filter(Boolean),
   staves:document.querySelectorAll('#notation .engraved-sheet svg g.staffline').length,
   drumCard:document.querySelector('#drum-card')?.hidden===false,
  }));
  const labels=[...new Set(loaded.parts)];
  console.log({title:loaded.title,staves:loaded.staves,labels:labels.slice(0,14)});
  for(const name of EXPECTED)assert.ok(labels.some(label=>label.includes(name)),`the loaded score must contain the ${name} part`);
  assert.ok(loaded.title.includes('木管四重奏'),`the score title must name the preset (got "${loaded.title}")`);
  assert.ok(!/鼓伴奏/.test(loaded.title),'the presets must not be labelled as a drum accompaniment');
  assert.deepEqual(errors.slice(0,3),[]);
  await page.screenshot({path:`.sites-runtime/arrangement-${STYLE}.png`});
  console.log('woodwind quartet OK');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
