const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk118-20261021':'mentor-garden-walk119-20261021','mentor-walk118':'mentor-walk119','mentor-preload.js?v=118':'mentor-preload.js?v=119','mentor-arrival.js?v=walk118':'mentor-arrival.js?v=walk119','mentor-flight-plan.js?v=14':'mentor-flight-plan.js?v=15','mentor-flight-worker.js?v=19':'mentor-flight-worker.js?v=20','mentor-chapter-flight.js?v=32':'mentor-chapter-flight.js?v=33'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden|zhuo)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk118'","'?v=walk119'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 119 published');
