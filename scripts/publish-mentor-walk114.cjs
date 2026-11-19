const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk113-20261021':'mentor-garden-walk114-20261021','mentor-walk113':'mentor-walk114','mentor-preload.js?v=113':'mentor-preload.js?v=114','mentor-arrival.js?v=walk113':'mentor-arrival.js?v=walk114','mentor-sign-placement.js?v=4':'mentor-sign-placement.js?v=5'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk113'","'?v=walk114'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 114 published');
