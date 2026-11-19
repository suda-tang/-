const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk116-20261021':'mentor-garden-walk117-20261021','mentor-walk116':'mentor-walk117','mentor-preload.js?v=116':'mentor-preload.js?v=117','mentor-arrival.js?v=walk116':'mentor-arrival.js?v=walk117','mentor-flight-plan.js?v=12':'mentor-flight-plan.js?v=13','mentor-flight-worker.js?v=17':'mentor-flight-worker.js?v=18','mentor-chapter-flight.js?v=30':'mentor-chapter-flight.js?v=31'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk116'","'?v=walk117'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 117 published');
