const {chromium}=require('C:/Users/mail/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:5173/voice-record.html');
  console.log(await page.evaluate(async()=>{
   const {createPortraitMentor}=await import('/mentor-portrait-model.js?v=expression5');const model=await createPortraitMentor();let face;
   model.traverse(o=>{if(o.geometry?.attributes.position.count===7245)face=o;});
   const original=face.geometry.attributes.position.array.slice(),originalUV=face.geometry.attributes.uv.array.slice();
   for(let i=0;i<180;i++)model.userData.updatePortrait(i/60,true,.3,'slides',0);
   const uvMotion=Math.max(...originalUV.map((v,i)=>Math.abs(v-face.geometry.attributes.uv.array[i])));
   model.userData.updatePortrait(3.8,true,.3,'slides',1);
   const upperMotion=face.geometry.attributes.position.array[159*3+1]-original[159*3+1];
   const lowerMotion=face.geometry.attributes.position.array[145*3+1]-original[145*3+1];
   if(!(uvMotion>0&&uvMotion<.02&&upperMotion<0&&lowerMotion>0))throw Error(JSON.stringify({uvMotion,upperMotion,lowerMotion}));
   for(let i=0;i<600;i++)model.userData.updatePortrait(i/60,i<300,.25,i<300?'writing':'slides',0);
   if(!Array.from(face.geometry.attributes.position.array).every(Number.isFinite)||!Array.from(face.geometry.attributes.uv.array).every(Number.isFinite))throw Error('Non-finite facial coordinates');
   const restored=Math.max(...original.map((v,i)=>Math.abs(v-face.geometry.attributes.position.array[i])));
   if(restored>1e-6||model.getObjectByName('MentorMouth').visible)throw Error('Speaking expression did not reset');
   return {gaze:true,blink:true,uvMotion,upperMotion,lowerMotion,pausedFaceRestored:true};
  }));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
