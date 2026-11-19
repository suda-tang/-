const fs=require('fs');
function edit(file,from,to){let text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');if(text.includes(to))return;if(!text.includes(from))throw Error('Missing edit in '+file+': '+from.slice(0,90));fs.writeFileSync(file,text.replace(from,to));}
const file='dist/mentor-arrival.js';
edit(file,"import {createPresentationFacing}","import {minimumLectureFov,keepLectureDistance} from './mentor-shot-framing.js?v=132';\nimport {createPresentationFacing}");
edit(file,'let departingBoat=false;','let departingBoat=false,boatBoardElapsed=0;');
edit(file,'boardY:classroom.board.position.y,stage:', 'boardY:classroom.board.position.y,boardX:classroom.board.position.x,boardYaw:classroom.group.rotation.y,stage:');
edit(file,'classroom.group.visible=true;classroom.group.position.copy(e.stage);classroom.group.rotation.y=0;classroom.board.position.set(0,e.boardY+16*lift,0);','classroom.group.visible=lift<1;classroom.group.position.copy(e.stage);classroom.group.rotation.y=e.boardYaw;classroom.board.position.set(e.boardX,e.boardY+3.2*lift,0);');
edit(file,'interior.update(camera.position.z<-9.5,','interior.update(camera.position.z<-16.2,');
edit(file,'if(settled){','if(settled){\n    if(departingBoat){boatBoardElapsed+=dt;departureBoard?.update(boatBoardElapsed);}');
edit(file,'classroom.board.position.set(.85,16*boardLift,0);','classroom.board.position.set(.85,3.2*boardLift,0);');
edit(file,"classroom.group.visible=!stageTransition||travelState==='lowering';","classroom.group.visible=!departingBoat&&(!stageTransition||travelState==='lowering');");
edit(file,'const close=Math.max(2.1,','const close=Math.max(4.8,');
edit(file,"scene.fog=new T.Fog(sky,220,650);parent.dataset.gardenShot='walking';camera.fov=camera.aspect<.8?52:48;camera.updateProjectionMatrix();", "scene.fog=new T.Fog(sky,220,650);parent.dataset.gardenShot='walking';camera.fov=minimumLectureFov(camera.position.distanceTo(feet.clone().add(new T.Vector3(0,1.05,0))),camera.aspect,camera.aspect<.8?52:48);camera.updateProjectionMatrix();");
edit(file,"if(lastChapter===5&&index!==5&&!siteActivity.ashore){departingBoat=true;siteActivity.disembark()", "if(lastChapter===5&&index!==5&&!siteActivity.ashore){departureBoard?.dispose();departureBoard=classroom.group.visible?captureDepartingBoard(classroom.board,scene):null;classroom.group.visible=false;boatBoardElapsed=0;departingBoat=true;siteActivity.disembark()");
edit(file,'const offset=camera.position.clone().sub(controls.target);const spherical=', 'const previous=camera.position.clone(),offset=camera.position.clone().sub(controls.target);const spherical=');
edit(file,'spherical.radius*=zoom;', 'spherical.radius=Math.max(3.4,spherical.radius*zoom);');
edit(file,'camera.position.copy(safeOrbitPosition(controls.target.clone().add(shift),camera.position.clone().add(shift)).sub(shift));', 'camera.position.copy(keepLectureDistance(previous.clone().add(shift),camera.position.clone().add(shift),controls.target.clone().add(shift),safeOrbitPosition).sub(shift));');
// Expose lightweight pose diagnostics for live regressions without retaining scene objects.
edit(file,"if(actor.visible){departurePose?.dispose();", "parent.dataset.lectureShot=JSON.stringify({chapter:lastChapter,distance:camera.position.distanceTo(actor.position),fov:camera.fov,boardVisible:classroom.group.visible,transitioning:!!stageTransition,departingBoat});if(actor.visible){departurePose?.dispose();");
const safety='dist/mentor-flight-safety.js';
edit(safety,'Math.cos(i*Math.PI/4)*1.9,0,Math.sin(i*Math.PI/4)*1.9','Math.cos(i*Math.PI/4)*2.4,0,Math.sin(i*Math.PI/4)*2.4');
const plan='dist/mentor-flight-plan.js';
edit(plan,'if(!matches())curve=plan();', 'const cruise=departure&&arrival&&i===2;\n    if(!matches()&&!cruise)curve=plan();');
edit(plan,'if(!matches())curve=withWalkingClearance(plan);', 'if(!matches()&&!cruise)curve=withWalkingClearance(plan);');
edit(plan,'Math.min(p.distanceTo(start),p.distanceTo(end))<8','Math.min(p.distanceTo(start),p.distanceTo(end))<3');
