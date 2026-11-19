const fs=require('fs'),path='dist/mentor-arrival.js';let s=fs.readFileSync(path,'utf8');
const from='if(index===lastChapter||exitState||!settled)return;if(lastActor?.visible)';
if(!s.includes(from))throw Error('Chapter insertion point missing');
s=s.replace(from,'if(index===lastChapter||exitState||!settled)return;departureBoard?.dispose();departureBoard=classroom.group.visible?captureDepartingBoard(classroom.board,scene):null;if(lastActor?.visible)');
s=s.replace('function dispose(){if(dead)return;dead=true;departurePose?.dispose();','function dispose(){if(dead)return;dead=true;departureBoard?.dispose();departurePose?.dispose();');fs.writeFileSync(path,s);
