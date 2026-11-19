const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk112-20261021':'mentor-garden-walk113-20261021','mentor-walk112':'mentor-walk113','mentor-preload.js?v=112':'mentor-preload.js?v=113','mentor-arrival.js?v=walk112':'mentor-arrival.js?v=walk113','mentor-flight-plan.js?v=10':'mentor-flight-plan.js?v=11','mentor-flight-worker.js?v=15':'mentor-flight-worker.js?v=16','mentor-chapter-flight.js?v=28':'mentor-chapter-flight.js?v=29'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk112'","'?v=walk113'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 113 published');
