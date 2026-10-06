// 启动脚本必须走外链 /startup.js，不能退回 index.html 里的内联副本。
// 三段检查：
//   1. 正常路径 —— startup.js 被请求到 200，执行后打上 boot-ready 并移除遮罩；
//   2. 阳性对照 —— 把 /startup.js 拦成 404，证明「收尾」确实由它负责
//      （此时不该出现 boot-ready），同时验证 onerror 兜底不会把人卡在启动页；
//   3. ?tour=1 —— tour-arrival 仍然要挂上（这一行原本只存在于内联版）。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const BASE='http://127.0.0.1:5173/';

async function open(browser,url,block){
  const p=await browser.newPage({viewport:{width:1280,height:900}});
  const seen=[],errors=[];
  p.on('response',r=>{if(r.url().includes('/startup.js'))seen.push(r.status());});
  p.on('pageerror',e=>errors.push(e.message));
  // 注意 src 带版本号查询串（/startup.js?v=xxx），glob 必须留 * 才匹配得上，否则拦不住、对照组失效。
  if(block)await p.route('**/startup.js*',route=>route.fulfill({status:404,contentType:'text/plain',body:'not found'}));
  await p.goto(url,{waitUntil:'load'});
  return {p,seen,errors};
}
const cls=p=>p.evaluate(()=>document.documentElement.className);

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    {
      const {p,seen,errors}=await open(browser,BASE,false);
      await p.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:20000});
      const c=await cls(p);
      assert.ok(seen.includes(200),'startup.js 应被请求并返回 200，实际：'+JSON.stringify(seen));
      assert.match(c,/boot-ready/,'外链执行后应打上 boot-ready');
      assert.doesNotMatch(c,/(^|\s)booting(\s|$)/,'booting 应已移除');
      // startup.js 打完 boot-ready 后还有 500ms 的淡出才 remove，断言要等这一步
      await p.waitForSelector('#startup',{state:'detached',timeout:5000});
      assert.equal(await p.locator('#startup').count(),0,'启动遮罩应被移除');
      assert.deepEqual(errors,[],'页面不应有 JS 报错');
      console.log('PASS 外链 startup.js 已加载并执行（boot-ready + 遮罩移除）');
      await p.close();
    }
    {
      const {p,seen}=await open(browser,BASE,true);
      await p.waitForTimeout(3000);
      const c=await cls(p);
      assert.ok(seen.includes(404),'对照组应拦到 404，实际：'+JSON.stringify(seen));
      assert.doesNotMatch(c,/boot-ready/,'404 时不应有 boot-ready —— 否则说明收尾另有其人，本检查失去意义');
      assert.doesNotMatch(c,/(^|\s)booting(\s|$)/,'兜底应移除 booting，主体要可见');
      await p.waitForSelector('#startup',{state:'detached',timeout:5000});
      assert.equal(await p.locator('#startup').count(),0,'兜底应移除遮罩，不能把人卡在启动页');
      console.log('PASS 对照：startup.js 404 时兜底生效（主体可见，不卡启动页）');
      await p.close();
    }
    {
      const {p}=await open(browser,BASE+'?tour=1',false);
      await p.waitForFunction(()=>document.documentElement.classList.contains('tour-arrival'),null,{timeout:15000});
      console.log('PASS ?tour=1 仍带 tour-arrival');
      await p.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
