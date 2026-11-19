const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk115-20261021':'mentor-garden-walk116-20261021','mentor-walk115':'mentor-walk116','mentor-preload.js?v=115':'mentor-preload.js?v=116','mentor-arrival.js?v=walk115':'mentor-arrival.js?v=walk116','mentor-garden-floor.js?v=4':'mentor-garden-floor.js?v=5','mentor-garden-asset-stream.js?v=27':'mentor-garden-asset-stream.js?v=28','mentor-board-art.js?v=report115':'mentor-board-art.js?v=report116','mentor-board-report.js?v=115':'mentor-board-report.js?v=116','mentor-board-transition.js?v=115':'mentor-board-transition.js?v=116'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk115'","'?v=walk116'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 116 published');
