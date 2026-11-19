const fs=require('fs'),path=require('path'),swaps={
 'mentor-garden-walk117-20261021':'mentor-garden-walk118-20261021','mentor-walk117':'mentor-walk118','mentor-preload.js?v=117':'mentor-preload.js?v=118','mentor-arrival.js?v=walk117':'mentor-arrival.js?v=walk118',
 'mentor-flight-safety.js?v=18':'mentor-flight-safety.js?v=19','mentor-flight-plan.js?v=13':'mentor-flight-plan.js?v=14','mentor-flight-worker.js?v=18':'mentor-flight-worker.js?v=19','mentor-chapter-flight.js?v=31':'mentor-chapter-flight.js?v=32',
 'mentor-garden-view.js?v=8':'mentor-garden-view.js?v=9','mentor-site-activity.js?v=20':'mentor-site-activity.js?v=21','mentor-sign-placement.js?v=5':'mentor-sign-placement.js?v=6','mentor-garden-asset-stream.js?v=28':'mentor-garden-asset-stream.js?v=29',
 'mentor-waterside-willows.js?v=11':'mentor-waterside-willows.js?v=12','mentor-garden-vegetation.js?v=9':'mentor-garden-vegetation.js?v=10','mentor-garden-neighborhood.js?v=21':'mentor-garden-neighborhood.js?v=22','mentor-old-city.js?v=51':'mentor-old-city.js?v=52','mentor-water-town.js?v=15':'mentor-water-town.js?v=16',
 'mentor-garden-stations.js?v=11':'mentor-garden-stations.js?v=12','mentor-garden-tour.js?v=3':'mentor-garden-tour.js?v=4','garden-tour-rails.json?v=111':'garden-tour-rails.json?v=118','garden-walking-paths.json?v=interior111':'garden-walking-paths.json?v=interior118'};
for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){
 if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^(check-(mentor|garden)-|build-garden-promenade).*\.cjs$/.test(name)))continue;
 const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);
 if(name==='check-mentor-route-release.cjs')s=s.replace("'?v=walk117'","'?v=walk118'").replace("'?v=20'","'?v=21'");if(s!==old)fs.writeFileSync(file,s);
}
console.log('Mentor walk 118 published');
