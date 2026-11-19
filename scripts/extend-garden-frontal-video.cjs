const fs=require('fs'),path='scripts/check-mentor-route-visuals.cjs';let s=fs.readFileSync(path,'utf8');
s=s.replace('window.__sceneProbe={root,camera,classroom,scene};','window.__sceneProbe={root,camera,classroom,scene,get actor(){return lastActor;}};');
s=s.replace("for(const name of (process.env.GARDENS_ONLY?", "if(process.env.SLOW_FLIGHTS)await p.emulateMedia({reducedMotion:'no-preference'});\n for(const name of (process.env.GARDEN_EXIT?['clock','yiyuan','zhuozhengyuan','huqiu']:process.env.GARDENS_ONLY?");
s=s.replace("if(process.env.WALK_DETAIL&&['yiyuan','zhuozhengyuan'].includes(name)){","if(process.env.WALK_DETAIL&&['yiyuan','zhuozhengyuan'].includes(name)&&(!process.env.GARDEN_EXIT||name==='zhuozhengyuan')){");
s=s.replace('distance:walk.distance,camera:probe.camera.position.toArray(),mode:',"distance:walk.distance,actor:probe.actor?.position.toArray(),heading:probe.actor?.rotation.y,camera:probe.camera.position.toArray(),mode:");
s=s.split('mentor112-video').join('mentor118-video');
fs.writeFileSync(path,s);
