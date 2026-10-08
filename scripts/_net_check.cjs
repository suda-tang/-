// 用真实 Chromium 复现外网访问报错：默认 / 强制 IPv4 / 强制 IPv6。
const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL='https://suzhou.super-tang.com/';
const RULES={
  'default': [],
  'force-IPv4': ['--host-resolver-rules=MAP suzhou.super-tang.com 64.90.11.182'],
  'force-IPv6': ['--host-resolver-rules=MAP suzhou.super-tang.com [2409:8a20:4883:8950::1eb]'],
};
(async()=>{
  for(const [label,args] of Object.entries(RULES)){
    const browser=await chromium.launch({channel:'msedge',headless:true,args});
    try{
      const page=await browser.newPage();
      try{
        const resp=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:25000});
        console.log('['+label+'] OK  status='+(resp&&resp.status())+'  title='+JSON.stringify((await page.title()).slice(0,40)));
      }catch(e){
        console.log('['+label+'] FAIL  '+(e.message.split('\n')[0]).slice(0,160));
      }
    } finally { await browser.close(); }
  }
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
