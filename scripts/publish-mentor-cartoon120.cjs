const fs=require('fs'),path=require('path'),swaps={'mentor-garden-walk119-20261021':'mentor-garden-walk120-20261021','mentor-walk119':'mentor-walk120','mentor-preload.js?v=119':'mentor-preload.js?v=120','mentor-arrival.js?v=walk119':'mentor-arrival.js?v=walk120'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden)-.*\.cjs$/.test(name)))continue;const p=path.join(dir,name);let s=fs.readFileSync(p,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk119'","'?v=walk120'");if(s!==old)fs.writeFileSync(p,s);
}console.log('Cartoon mentor mode published');
