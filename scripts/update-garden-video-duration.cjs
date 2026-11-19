const fs=require('fs'),p='scripts/check-mentor-route-visuals.cjs';
let s=fs.readFileSync(p,'utf8');
s=s.replace('await p.waitForTimeout(Number(process.env.WALK_SAMPLE_MS)||5000);','await p.waitForTimeout(process.env.RECORD_TOUR ? await p.evaluate(()=>Math.ceil((window.__sceneProbe.root.userData.gardenWalk?.duration||50)*250)+500) : Number(process.env.WALK_SAMPLE_MS)||5000);');
fs.writeFileSync(p,s);
