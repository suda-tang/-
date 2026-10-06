// 守住「AI 看得见整个曲库」这件事。
//
// 背景：本地模型走苏大网页，提问总长上限 5800 字符，系统提示只留 1500，裁剪是
// 「留头 2/3 + 留尾 1/3、中间省略」。之前每轮都塞 71 首 {id,title,ready}（约 7800 字符），
// 系统提示被撑爆 → 模型只看得见头尾 6 首 → 一本正经回答「曲库里只有 4 首曲目」。
//
// 这条用例不依赖模型发挥，只钉住**载荷不变量**：
//   普通提问：library 是一行紧凑曲名索引（含总数），scores 必须为空，整体要小；
//   内容检索（整个曲库 + 声部/和弦）：必须带上带 id 的完整列表，否则 ai_catalog 读不到谱面。
// 前提：本地 http://127.0.0.1:5173 已在跑。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');

const BUDGET=1500;   // 系统提示只留 1500 字符，留点余量

(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message.slice(0,160)));

    const payloads=[];
    await page.route('**/api/workspace-ai',async route=>{
      const post=route.request().postData()||'';
      let ctx=null;
      try{ctx=(JSON.parse(post).context)||null;}catch(e){}
      if(ctx&&!post.includes('"repair"'))payloads.push(ctx);
      // 不真打模型：回一个空动作的结果，只关心前端发了什么
      await route.fulfill({status:200,headers:{'Content-Type':'application/json; charset=utf-8'},
        body:JSON.stringify({type:'status',text:'检查'})+'\n'
            +JSON.stringify({type:'result',reply:'收到。',actions:[]})+'\n'});
    });

    await page.goto('http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.documentElement.classList.contains('boot-ready'),null,{timeout:40000});
    await page.locator('#workspace-ai').click();
    await page.waitForTimeout(1000);

    const total=await page.evaluate(async()=>{
      const r=await fetch('/api/scores');const d=await r.json();return d.scores.length;
    });
    assert.ok(total>10,'曲库曲目太少（'+total+'），这条用例失去意义');

    const ask=async q=>{
      payloads.length=0;
      await page.locator('.ai-conversation input').fill(q);
      await page.locator('.ai-conversation input').press('Enter');
      await page.waitForFunction(()=>!document.querySelector('.ai-conversation')?.classList.contains('is-thinking'),null,{timeout:60000});
      await page.waitForTimeout(800);
      assert.equal(payloads.length,1,'这次提问没有发出上下文，用例失效');
      return payloads[0];
    };

    // 1) 普通提问：索引小、无 id、整体在预算内
    const plain=await ask('曲库里一共有几首曲目');
    const index=String(plain.library||'');
    assert.ok(index.length>0,'上下文里没有曲名索引，模型又只能看见头尾几首了');
    assert.ok(index.includes('共'+total+'首'),'索引里应写明总数（模型自己数不准），实际开头：'+index.slice(0,20));
    assert.equal((plain.scores||[]).length,0,'普通提问不该带 71 条带 id 的曲库列表，会把系统提示撑爆');
    const size=JSON.stringify(plain).length;
    assert.ok(size<BUDGET,`上下文 ${size} 字符超过 ${BUDGET} 预算，模型会看不见大部分曲目`);

    // 2) 内容检索：必须带 id，ai_catalog 要读谱面缓存
    const catalog=await ask('云曲库里哪些谱有钢琴声部');
    assert.equal((catalog.scores||[]).length,total,'「整个曲库 + 声部」这类检索必须带完整带 id 列表');
    assert.ok((catalog.scores||[]).every(x=>/^[a-f0-9]{64}$/.test(String(x.id))),'检索用的 id 必须是完整 64 位，否则 ai_catalog 读不到缓存');

    assert.deepEqual(errors,[],'页面出现脚本错误：'+errors.join(' | '));
    console.log(`PASS AI 曲库可见性（普通提问上下文 ${size} 字符 / 检索带 ${total} 条完整 id）`);
  }finally{await browser.close();}
})().catch(error=>{console.error('FAIL',error.message);process.exitCode=1;});
