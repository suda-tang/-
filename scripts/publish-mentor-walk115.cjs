const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk114-20261021':'mentor-garden-walk115-20261021','mentor-walk114':'mentor-walk115','mentor-preload.js?v=114':'mentor-preload.js?v=115','mentor-arrival.js?v=walk114':'mentor-arrival.js?v=walk115','mentor-flight-plan.js?v=11':'mentor-flight-plan.js?v=12','mentor-flight-worker.js?v=16':'mentor-flight-worker.js?v=17','mentor-chapter-flight.js?v=29':'mentor-chapter-flight.js?v=30','mentor-garden-floor.js?v=3':'mentor-garden-floor.js?v=4','mentor-garden-asset-stream.js?v=26':'mentor-garden-asset-stream.js?v=27','mentor-board-art.js?v=mentor-report-20261018':'mentor-board-art.js?v=report115'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk114'","'?v=walk115'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 115 published');
