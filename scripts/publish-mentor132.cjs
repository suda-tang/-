const fs=require('fs'),path=require('path');
const swaps={
 'mentor-garden-walk131-20261022':'mentor-camera132-20261024',
 'mentor-walk131':'mentor-camera132',
 'mentor-preload.js?v=131':'mentor-preload.js?v=132',
 'mentor-arrival.js?v=walk131':'mentor-arrival.js?v=camera132',
 'mentor-identity.js?v=130':'mentor-identity.js?v=132',
 'mentor-track-list.js?v=130':'mentor-track-list.js?v=132',
 'mentor-chapter-flight.js?v=35':'mentor-chapter-flight.js?v=36',
 'mentor-flight-plan.js?v=17':'mentor-flight-plan.js?v=18',
 'mentor-flight-worker.js?v=22':'mentor-flight-worker.js?v=23',
 'mentor-flight-safety.js?v=19':'mentor-flight-safety.js?v=20',
 'mentor-board-transition.js?v=116':'mentor-board-transition.js?v=132',
 'mentor-tower-classroom.js?v=8':'mentor-tower-classroom.js?v=9'
};
let files=0;for(const dir of ['dist','scripts'])for(const name of fs.readdirSync(dir)){if(!(dir==='dist'?(name.endsWith('.js')||name==='index.html'):/^check-(mentor|garden|cartoon)-.*\.cjs$/.test(name)))continue;const file=path.join(dir,name);let s=fs.readFileSync(file,'utf8'),old=s;for(const [a,b]of Object.entries(swaps))s=s.split(a).join(b);if(s!==old){fs.writeFileSync(file,s);files++;}}
console.log('Updated version references in '+files+' files');
