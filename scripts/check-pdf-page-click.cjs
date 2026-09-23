const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

// A click on the original scan must move the measure block to the bar that was
// clicked, on any page. The block used to fall back to page-thirds arithmetic,
// so on the second and third page it landed systems away from the cursor.
const DIGEST=process.env.DIGEST||'3d25b16fa117827b25da914fd907522ab0a0dfc6e7c5a66509137dc02f6145b2';
const TARGETS=[[2,0.3],[2,0.75],[3,0.35],[3,0.8],[4,0.5]];

(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.waitForSelector(`[data-score-id="${DIGEST}"]`,{timeout:40000});
  await page.locator(`[data-score-id="${DIGEST}"]`).click({timeout:40000});
  await page.waitForFunction(()=>document.querySelectorAll('#notation .engraved-sheet svg').length>0,null,{timeout:120000});
  await page.waitForTimeout(1200);
  await page.locator('#original-button').click({timeout:20000});
  await page.waitForFunction(()=>document.querySelectorAll('#pdf-pages .pdf-page').length>0,null,{timeout:120000});

  // Walk every page so each one is rasterised and its geometry request issued.
  const containers=await page.evaluate(()=>document.querySelectorAll('#pdf-pages > *').length);
  for(let index=0;index<containers;index++){
   await page.evaluate(i=>document.querySelectorAll('#pdf-pages > *')[i]?.scrollIntoView({block:'center'}),index);
   await page.waitForTimeout(2400);
  }
  await page.waitForTimeout(3000);

  const results=[];
  for(const [pageNumber,ratio] of TARGETS){
   await page.evaluate(n=>{
    const el=[...document.querySelectorAll('.pdf-page')].find(item=>Number(item.dataset.page)===n);
    el?.scrollIntoView({block:'center'});
   },pageNumber);
   await page.waitForTimeout(900);
   const box=await page.evaluate(n=>{
    const el=[...document.querySelectorAll('.pdf-page')].find(item=>Number(item.dataset.page)===n);
    if(!el)return null;
    const rect=el.getBoundingClientRect();
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
   },pageNumber);
   assert.ok(box,`page ${pageNumber} must be rendered before it can be clicked`);
   const clickX=box.x+box.width*ratio,clickY=box.y+box.height*0.34;
   await page.mouse.click(clickX,clickY);
   await page.waitForTimeout(1800);
   const state=await page.evaluate(()=>({
    notes:[...document.querySelectorAll('#notation .note-event.current')].map(node=>node.dataset.index),
    blocks:[...document.querySelectorAll('.pdf-page')].filter(el=>el.querySelector('.pdf-measure-highlight')?.style.opacity==='1').map(el=>{
     const block=el.querySelector('.pdf-measure-highlight');
     return {page:Number(el.dataset.page),left:parseFloat(block.style.left),width:parseFloat(block.style.width),top:parseFloat(block.style.top),height:parseFloat(block.style.height)};
    }),
   }));
   const block=state.blocks.find(item=>item.page===pageNumber);
   assert.ok(block,`clicking page ${pageNumber} must highlight the bar on that page`);
   const clickedX=ratio*100,clickedY=34;
   assert.ok(clickedX>=block.left-1.5&&clickedX<=block.left+block.width+1.5,
     `the block on page ${pageNumber} must cover the clicked column (clicked ${clickedX}%, block ${block.left}%–${(block.left+block.width).toFixed(1)}%)`);
   assert.ok(block.top<=clickedY+1.5&&block.top+block.height>=clickedY-6,
     `the block on page ${pageNumber} must sit in the system that was clicked (block top ${block.top}%, click ${clickedY}%)`);
   results.push({page:pageNumber,ratio,block:block.left.toFixed(1)+'-'+(block.left+block.width).toFixed(1),top:block.top});
  }
  console.log(results);
  assert.deepEqual(errors.slice(0,3),[]);
  await page.screenshot({path:'.sites-runtime/pdf-page-click.png'});
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
