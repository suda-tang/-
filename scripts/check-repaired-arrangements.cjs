const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const keys=['21a8047ffb91342a082ffea6857c229436dd4575a3689588b3559ace83954c0e','c8cc67f0f6218057afe404a7d46b2f7294bd01f80d705cf336fdb7094666dfef'];
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/');
 for(const key of keys){
  const manifest=JSON.parse(fs.readFileSync(`.sites-runtime/arrangements/${key}.manifest.json`));
  const original=JSON.parse(fs.readFileSync(`.sites-runtime/score-cache/${manifest.digest}.json`)).xml;
  const xml=fs.readFileSync(`.sites-runtime/verification/${key}.musicxml`,'utf8');
  const result=await page.evaluate(async({original,xml})=>{
   const {parseMusicXML,renderNotation}=await import('/score.js');const a=parseMusicXML(original),b=parseMusicXML(xml);
   const ids=new Set(a.events.flatMap(e=>e.notes.map(n=>n.part)));
   const flatten=(s,keep)=>s.events.flatMap(e=>e.notes.filter(keep).map(n=>[e.beat,n.midi,n.duration,n.part,n.staff])).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
   const host=document.createElement('div');host.style.width='1000px';document.body.append(host);await renderNotation(host,b);
   return {before:flatten(a,()=>true),after:flatten(b,n=>ids.has(n.part)),sourceDrums:b.events.flatMap(e=>e.notes).filter(n=>ids.has(n.part)&&n.percussion).length,svg:host.querySelectorAll('svg').length,error:host.textContent.includes('排版失败')};
  },{original,xml});
  assert.deepEqual(result.after,result.before);assert.equal(result.sourceDrums,0);assert.ok(result.svg);assert.equal(result.error,false);
  console.log(key.slice(0,8)+': original notes/timing/staves preserved; SVG rendered');
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
