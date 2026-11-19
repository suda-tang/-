const fs=require('fs'),p='dist/mentor-arrival.js';let s=fs.readFileSync(p,'utf8');
s=s.replace('let departureBoard=null,departurePose=null','let lectureYaw=0,departureBoard=null,departurePose=null');
s=s.replace("function stageAngle(){return (lastChapter===1?gardenStations.yiyuan[3]||0:lastChapter===2?gardenStations.zhuozhengyuan[3]||0:0)*Math.PI/2;}","function stageAngle(){return lastChapter===1?(gardenStations.yiyuan[3]||0)*Math.PI/2:lastChapter===2?(gardenStations.zhuozhengyuan[3]||0)*Math.PI/2:lectureYaw;}");
const anchor='lastChapter=index;if(index===1||index===2)';if(!s.includes(anchor))throw Error('Chapter yaw anchor missing');
s=s.replace(anchor,"const incoming=Math.atan2(controls.target.x-camera.position.x,controls.target.z-camera.position.z),towardBoat=Math.atan2(Math.sin(Math.PI-incoming),Math.cos(Math.PI-incoming));lectureYaw=index===3||index===4?incoming+towardBoat/(index===3?3:2)-Math.PI:0;lastChapter=index;if(index===1||index===2)");
const target='let endFov=camera.aspect<.8?42:35;';if(!s.includes(target))throw Error('Target insertion missing');
s=s.replace(target,target+"if(index===3||index===4){const direction=new T.Vector3(Math.sin(lectureYaw+Math.PI),0,Math.cos(lectureYaw+Math.PI));to.set(x,0,z+93).addScaledVector(direction,-8);endTarget.copy(to).add(new T.Vector3(home.x,.87,0));endCamera.copy(to).add(home);}");
s=s.replace("if(station){const axis=new T.Vector3(0,1,0),angle=(station[3]||0)*Math.PI/2;","if(station||index===3||index===4){const axis=new T.Vector3(0,1,0),angle=stageAngle();");
fs.writeFileSync(p,s);
