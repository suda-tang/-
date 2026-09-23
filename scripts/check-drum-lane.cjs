const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// The drum part must be a card of its own. It used to be prepended into
// #notation, where it shared the piano sheet's container, so the keyboard score
// and the drum part read as a single score of three or four staves.
const DIGEST=process.env.DIGEST||'b6df197c607e7d7c7fea4a47051333ccc429c0309d50e00e0877307901bb737e';

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForSelector(`[data-score-id="${DIGEST}"]`,{timeout:40000});
  await page.locator(`[data-score-id="${DIGEST}"]`).click({timeout:40000});
  await page.waitForFunction(()=>document.querySelectorAll('#notation .engraved-sheet svg').length>0,null,{timeout:120000});

  // Generate a drum arrangement so there is a drum part to show.
  await page.locator('.unified-arrangement > summary').click({timeout:20000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelectorAll('.saved-arrangements button').length>0,null,{timeout:120000}).catch(()=>{});
  const buttons=await page.locator('.saved-arrangements button').allTextContents();
  const drumButton=page.locator('.saved-arrangements button').filter({hasText:/鼓/}).first();
  if(await drumButton.count())await drumButton.click({timeout:20000});
  else{
   await page.locator('#arrangement-select').selectOption('drums');
   await page.waitForFunction(()=>document.querySelectorAll('#notation .drum-score, #drum-card:not([hidden])').length>0,null,{timeout:600000});
  }
  await page.waitForFunction(()=>{const card=document.querySelector('#drum-card');return card&&!card.hidden&&card.querySelectorAll('.drum-hit').length>0;},null,{timeout:600000});
  await page.waitForTimeout(800);

  const state=await page.evaluate(()=>{
   const card=document.querySelector('#drum-card');
   const notation=document.querySelector('#notation');
   const box=card.getBoundingClientRect(),scoreBox=document.querySelector('.score-card').getBoundingClientRect();
   const lines=new Set([...card.querySelectorAll('.drum-hit')].map(hit=>hit.style.getPropertyValue('--line')));
   return {
    cardHidden:card.hidden,
    hits:card.querySelectorAll('.drum-hit').length,
    lines:[...lines].sort(),
    insideNotation:notation?notation.querySelectorAll('.drum-score, .drum-staff').length:0,
    drumsInNotation:notation?notation.querySelectorAll('.drum-hit').length:0,
    summary:document.querySelector('#drum-summary')?.textContent||'',
    cardTop:Math.round(box.top+window.scrollY),
    scoreBottom:Math.round(scoreBox.bottom+window.scrollY),
    scrollable:card.querySelector('.drum-scroll').scrollWidth>card.querySelector('.drum-scroll').clientWidth,
    engravedStaves:notation?notation.querySelectorAll('.engraved-sheet svg g.staffline').length:0,
   };
  });
  console.log(state);

  assert.equal(state.cardHidden,false,'the drum card must be visible when the score has a drum part');
  assert.ok(state.hits>0,'the drum lane must contain hits');
  assert.equal(state.drumsInNotation,0,'no drum element may live inside the piano sheet container');
  assert.ok(state.cardTop>=state.scoreBottom-2,'the drum card must sit below the score card');
  assert.ok(state.lines.length>=2,'hits must be spread over several staff lines');
  assert.deepEqual(errors.slice(0,3),[]);

  await page.screenshot({path:'.sites-runtime/drum-lane.png'});
  await page.locator('#drum-card').screenshot({path:'.sites-runtime/drum-card.png'}).catch(()=>{});
  await page.evaluate(()=>document.querySelector('#drum-card').scrollIntoView({block:'center'}));
  await page.waitForTimeout(500);
  await page.screenshot({path:'.sites-runtime/drum-card-view.png'});
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
