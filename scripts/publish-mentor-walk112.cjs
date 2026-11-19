const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk111-20261021':'mentor-garden-walk112-20261021','mentor-walk111':'mentor-walk112','mentor-preload.js?v=111':'mentor-preload.js?v=112','mentor-arrival.js?v=walk111':'mentor-arrival.js?v=walk112','mentor-flight-plan.js?v=9':'mentor-flight-plan.js?v=10','mentor-flight-worker.js?v=14':'mentor-flight-worker.js?v=15','mentor-chapter-flight.js?v=27':'mentor-chapter-flight.js?v=28'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk111'","'?v=walk112'");
 s=s.split('mentor111-video').join('mentor112-video');if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 112 published');
