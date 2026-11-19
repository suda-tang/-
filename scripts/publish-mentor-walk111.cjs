const fs=require('fs'),path=require('path');
const swaps={'mentor-garden-walk110-20261021':'mentor-garden-walk111-20261021','mentor-walk110':'mentor-walk111','mentor-preload.js?v=110':'mentor-preload.js?v=111','mentor-arrival.js?v=walk110':'mentor-arrival.js?v=walk111','mentor-site-activity.js?v=19':'mentor-site-activity.js?v=20','mentor-garden-tour.js?v=2':'mentor-garden-tour.js?v=3','garden-tour-rails.json?v=110':'garden-tour-rails.json?v=111','garden-walking-paths.json?v=interior110':'garden-walking-paths.json?v=interior111'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;
 for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk110'","'?v=walk111'").replace("'?v=19'","'?v=20'");
 s=s.split('mentor110-video').join('mentor111-video');
 if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 111 published');
