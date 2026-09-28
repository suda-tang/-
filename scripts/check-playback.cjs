const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1360,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // 工作区分「曲库 / 演奏 / 改编 / 任务」四个面板，同一时刻只有一个可见：
 // 导入类控件（#pdf-input / #xml-input / #sample-button）在「曲库」，
 // 播放类控件（#play-button / #tempo / #progress-label）在「演奏」。
 // 面板没切过去时里面的元素被隐藏，Playwright 会判定 not visible。
 const panel=async id=>{await page.click(`.workspace-nav button[data-panel="${id}"]`);await page.waitForFunction(i=>document.body.dataset.workspace===i,id);};
 await page.route('**/api/health',r=>r.fulfill({json:{omr:false}}));
 // Keep prior server-library fixtures from bypassing the mocked OMR path.
 // 只拦 GET（缓存读取）；POST 的上传与提交识谱必须放行，否则整条链路走不通。
 await page.route('**/api/scores/*',r=>r.request().method()==='GET'?r.fulfill({status:404,json:{error:'No cached fixture'}}):r.continue());
 try{
 await page.goto('http://192.168.2.6:5173/');
 // 示例谱等按钮被 workspace.js 搬进了默认折叠的 <details class="technical">
 // （服务控制区）：必须等工作区初始化完再展开，早了的话 closest('details')
 // 还是 null，等于没展开，按钮随后依然不可见。
 await page.waitForFunction(()=>!!document.querySelector('.workspace-nav button[data-panel="library"]'));
 await panel('library');
 await page.locator('#sample-button').evaluate(el=>{const d=el.closest('details');if(d)d.open=true;});
 await page.locator('#sample-button').click();
 await panel('play');
 await page.locator('#play-button').click();await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));
 await page.waitForTimeout(350);assert.equal(await page.locator('#accuracy').innerText(),'—');
 await page.locator('#tempo').fill('160');await page.locator('#tempo').dispatchEvent('change');await page.waitForFunction(()=>document.querySelector('#play-status').textContent.includes('160 BPM'));
 await page.locator('#play-button').click();const paused=await page.locator('#progress-label').innerText();await page.waitForTimeout(300);assert.equal(await page.locator('#progress-label').innerText(),paused);
 await page.locator('#play-button').click();await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));await page.locator('#play-reset').click();assert.equal(await page.locator('#progress-label').innerText(),'0%');
 await panel('play');await page.locator('#autoplay').check();
 await panel('library');await page.locator('#xml-input').setInputFiles('tests/playback.musicxml');await page.waitForFunction(()=>document.querySelector('#score-title').textContent==='导入与播放测试');
 await panel('play');await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));assert.equal(await page.locator('.note-event').count(),3);
 const parsed=await page.evaluate(async xml=>(await import('/score.js')).parseMusicXML(xml),fs.readFileSync('tests/playback.musicxml','utf8'));
 assert.deepEqual(parsed.events.map(e=>e.beat),[1,2,5]);assert.equal(parsed.events[1].notes[0].duration,3);
 // totalBeats 现在是「压缩小节间隙后，最后一个音符的结束拍」：尾部两拍休止
 // 不计入（score.js 取 max(beat+duration)），所以是 6，不是整段谱面的 8 拍。
 assert.equal(parsed.totalBeats,6);
 await page.locator('#play-button').click();
 const audio=await page.evaluate(async()=>{const {ScorePlayer}=await import('/player.js');const p=new ScorePlayer();p.load({events:[{beat:0,notes:[{midi:60,duration:4}]}]});await p.play();const a=p.context.createAnalyser();p.output.connect(a);await new Promise(r=>setTimeout(r,600));const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);const energy=data.reduce((s,x)=>s+x*x,0)/data.length;p.stop();await p.context.close();return energy;});assert.ok(audio>0.000001,'actual Web Audio output must be nonzero');
 // 上传改走 enqueueUploads 之后，校验失败不再写进 #notice，而是进「任务中心」
 // （task-center.js 把它渲染成“处理失败：…”）。
 await panel('library');
 await page.locator('#pdf-input').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('bad')});
 await page.waitForFunction(()=>document.querySelector('.task-center')?.textContent.includes('处理失败'));
 await page.waitForFunction(()=>document.querySelector('.task-center')?.textContent.includes('选择 PDF 或谱面图片'));
 // 无效上传不该打断当前正在演奏的谱面。
 assert.equal(await page.locator('#score-title').textContent(),'导入与播放测试');
 // Mock only the OMR transport to verify the frontend's completion/autoplay path.
 // This is explicitly not an end-to-end test of Audiveris.
 await page.route('**/api/health',r=>r.fulfill({json:{omr:true}}));
 await page.route('**/api/scores/*/recognize',r=>r.fulfill({json:{id:'fixture',status:'complete'}}));
 await page.route('**/api/jobs/*',r=>r.fulfill({json:{id:'fixture',status:'complete',xml:fs.readFileSync('tests/playback.musicxml','utf8'),metadata:{title:'导入与播放测试'}}}));
 // 上传只有在当前没有谱面时才会接管页面（uploadedQueuedScore 里
 // `if(!score&&!selectedJob)`），所以重载回未载入谱面的状态再验证成功路径。
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForTimeout(2500);
 await panel('library');
 await page.locator('#pdf-input').setInputFiles('outputs/test-score.pdf');
 await page.waitForFunction(()=>document.querySelectorAll('#pdf-pages canvas,#pdf-pages img').length===1);
 await page.waitForFunction(()=>document.querySelector('#score-title').textContent==='导入与播放测试');
 await panel('play');
 await page.waitForFunction(()=>document.querySelector('#play-button').textContent.includes('暂停'));
 await page.screenshot({path:'outputs/playback-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'outputs/playback-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('PASS: LAN PDF preview/errors, MusicXML autoplay, pause/resume, live tempo, ties/rests, real audio output, responsive layout; OMR completion tested with mocked transport only.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
