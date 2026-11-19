const fs=require('fs'),rows=JSON.parse(fs.readFileSync('.sites-runtime/mentor118-video/motion.json','utf8')).filter(r=>r.name==='zhuozhengyuan'&&r.actor&&Number.isFinite(r.heading));let front=0,min=1;
for(const r of rows){const dx=r.camera[0]-r.actor[0],dz=r.camera[2]-r.actor[2],score=(Math.sin(r.heading)*dx+Math.cos(r.heading)*dz)/Math.hypot(dx,dz);if(score>0)front++;min=Math.min(min,score);}
if(!rows.length||front/rows.length<.99)throw Error(JSON.stringify({samples:rows.length,front,min}));console.log({samples:rows.length,frontFacingRatio:front/rows.length,minFacingDotProduct:min});
