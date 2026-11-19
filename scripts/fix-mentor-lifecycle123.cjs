const fs=require('fs');function edit(path,fn){const old=fs.readFileSync(path,'utf8'),next=fn(old);if(old===next)throw Error('No edits '+path);fs.writeFileSync(path,next);}function swap(s,a,b){if(!s.includes(a))throw Error('Missing target '+a.slice(0,100));return s.replace(a,b);}
edit('dist/narration-opening.js',s=>{
 s=swap(s,"audio.dataset.lectureReady='0';document.addEventListener('play',e=>{if(e.target!==audio&&audio.dataset.lectureReady==='1'&&e.target.matches?.('audio[data-city-music],audio[data-lecture-music]')){e.target.pause();e.target.volume=0;}},{capture:true,signal:mediaLifecycle.signal});","audio.dataset.lectureReady='0';audio.dataset.mentorVoice='1';");
 s=swap(s,'lastDraw=0,revision=0;','lastDraw=0,revision=0,selecting=false;');
 s=swap(s,'if(index>0)arrival.setChapter(index);','');
 s=swap(s,'async function play(gesture=false){delete audio.dataset.priming;','async function play(gesture=false){if(finished||selecting||arrival.transitioning||!arrival.chapterReady(index))return;delete audio.dataset.priming;');
 const a=s.indexOf('  async function select(){'),b=s.indexOf('  async function finish(){',a);
 if(a<0||b<0)throw Error('Select not found');
 s=s.slice(0,a)+`  async function select(){
   warmUpcoming(index);arrival.setChapter(index);if(index===0&&!audio.paused&&audio.currentTime>0)return;
   audio.dataset.chapterTransition='1';revision++;const selectedRevision=revision;selecting=true;skip.disabled=true;trackStart=performance.now();audio.pause();prepareTrack(tracks[index].url);
   let retries=0;while(!finished&&revision===selectedRevision&&arrival.transitioning){
    if(arrival.transitionError){if(retries++<1){await wait(500);if(finished||revision!==selectedRevision)return;arrival.retryChapter(index);}else{selecting=false;buffering.hidden=false;bufferingLabel.textContent='场景未能准备好：'+arrival.transitionError;hideBuffering();sound.hidden=false;sound.textContent='重新载入当前场景';sound.onclick=event=>{event.stopPropagation();arrival.retryChapter(index);void select();};return;}}
    await wait(80);
   }
   if(finished||revision!==selectedRevision)return;selecting=false;skip.disabled=false;if(arrival.chapterReady(index))void play();
  }
`+s.slice(b);
 s=swap(s,'async function advance(){if(finished)return;','async function advance(){if(finished||selecting||arrival.transitioning||!arrival.chapterReady(index))return;');
 s=swap(s,'function unlock(event){if(finished||(!blocked&&!audio.paused))return;','function unlock(event){if(finished||selecting||arrival.transitioning||(!blocked&&!audio.paused))return;');
 s=swap(s,'function visibility(){if(document.hidden)audio.pause();else{','function visibility(){if(document.hidden)audio.pause();else if(!selecting&&!arrival.transitioning){');
 return s;
});
edit('dist/mentor-arrival.js',s=>{
 s=swap(s,"if(tr.elapsed>tr.duration+1.5){stageTransition=null;gardenShotStarted=now;}","if(tr.elapsed>tr.duration+1.5){stageTransition=null;departurePose?.dispose();departurePose=null;gardenShotStarted=now;}");
 s=swap(s,'departurePose?.update(camera);if(!inFlight)',"if(actor.visible){departurePose?.dispose();departurePose=null;}else departurePose?.update(camera);if(!inFlight)");
 s=swap(s,'if(lastActor?.visible){departurePose?.dispose();departurePose=captureDeparturePose(lastActor,contactShadow,scene);}',"departurePose?.dispose();departurePose=null;if(lastActor?.visible){departurePose=captureDeparturePose(lastActor,contactShadow,scene);lastActor.visible=false;}");
 s=swap(s,'const fromYaw=lastActor?.rotation.y||0,fromActor=', 'const previousChapter=lastChapter,fromYaw=lastActor?.rotation.y||0,fromActor=');
 s=swap(s,'const tr={ready,sceneReady:', 'const tr={fromChapter:previousChapter,ready,sceneReady:');
 s=swap(s,"root.userData.flightError=error.message;parent.dataset.flightError=error.message;", "tr.error=error.message;root.userData.flightError=error.message;parent.dataset.flightError=error.message;");
 s=swap(s,'prefetchChapter,setChapter(index,ready){if(departingBoat)return;',`prefetchChapter,chapterReady(index){return settled&&!dead&&!stageTransition&&!departingBoat&&lastChapter===index;},get transitionError(){return stageTransition?.error||null;},retryChapter(index){if(!stageTransition?.error)return;const failed=stageTransition;releaseFlightPlanner();departurePose?.dispose();departurePose=null;departureBoard?.dispose();departureBoard=null;stageOffset.copy(failed.from);lastChapter=failed.fromChapter;stageTransition=null;delete root.userData.flightError;delete parent.dataset.flightError;this.setChapter(index);},setChapter(index,ready){if(departingBoat||stageTransition)return;`);
 // Preserve the outgoing pose only while the real actor is hidden.
 return s;
});
