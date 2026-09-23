const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});try{const p=await b.newPage();await p.goto('http://127.0.0.1:5173/');const result=await p.evaluate(async()=>{
 const {preparePerformance}=await import('/performance.js');
 const xml='<score-partwise><part id="P1"><measure><attributes><divisions>1</divisions></attributes><direction><direction-type><dynamics><p/></dynamics><pedal type="start"/></direction-type></direction><note><duration>1</duration></note><direction><direction-type><dynamics><ff/></dynamics><pedal type="stop"/></direction-type></direction></measure></part></score-partwise>';
 return preparePerformance({xml,events:[0,1].map(offset=>({measure:1,offset,beat:offset,notes:[{part:'P1',staff:1,duration:1}]}))}).events.map(e=>e.notes[0].expression);
});assert.ok(result[1].velocity>result[0].velocity);assert.equal(result[0].pedal,true);assert.equal(result[1].pedal,false);console.log('PASS: written dynamics and pedal affect performance');}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
