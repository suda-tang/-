// Begin the short personalised greeting before the 3D module graph loads.
(()=>{
 const params=new URLSearchParams(location.search),cartoon=params.get('tour')==='1'&&/^zh(?:-(?:CN|Hans)(?:-CN)?)?$/i.test((params.get('lang')||'zh').replaceAll('_','-'));
 if(params.get('tour')!=='1'||window.mentorPreparation)return;
 const audio=document.createElement('audio');audio.preload='auto';audio.playsInline=true;audio.hidden=true;
 audio.setAttribute('fetchpriority','high');audio.src=cartoon?'/narration/mentor-preface.cartoon.eleven-v4-20261027.m4a':'/narration/mentor-preface.eleven-v4-20261027.m4a';(document.body||document.documentElement).append(audio);audio.load();
 // Start the scene module and the shared portrait request during the greeting request.
 for(const [href,rel,as] of [['/mentor-arrival.js?v=flow138','modulepreload',''],['/narration/models/mentor-reference-face.png?v=2','preload','image']]){if(as==='image'&&cartoon)continue;const link=document.createElement('link');link.href=href;link.rel=rel;if(as)link.as=as;link.fetchPriority='low';document.head.append(link);}
 const boardFont=document.createElement('link');boardFont.rel='preload';boardFont.as='font';boardFont.type='font/woff2';boardFont.crossOrigin='anonymous';boardFont.href='/fonts/mentor-board-wenkai.woff2';boardFont.fetchPriority='low';document.head.append(boardFont);
 const prep=window.mentorPreparation={name:params.get('mentor')||'',audio,state:null,started:performance.now()};
 prep.tracks=import('/mentor-track-list.js?v=eleven-v4-20261027').then(module=>module.openingTracks());
 prep.warmAudio=[];prep.tracks.then(tracks=>{const chapters=tracks.filter(t=>t.role==='mentor'&&t.url);if(!prep.name&&!prep.lectureStarted&&chapters[0]){audio.src=chapters[0].url;audio.load();}for(const track of chapters.slice(1,3)){const next=new Audio();next.preload='auto';next.src=track.url;next.load();prep.warmAudio.push(next);}});
 document.addEventListener('mentor-resources-released',()=>{for(const a of prep.warmAudio){a.pause();a.removeAttribute('src');a.load();}prep.warmAudio.length=0;},{once:true});

 prep.ready=(async()=>{
  if(!prep.name)return null;
  const deadline=performance.now()+180000;
  while(performance.now()<deadline&&!prep.cancelled){
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
   try{
    let state;if(window.earlyMentorGreeting){const first=window.earlyMentorGreeting;window.earlyMentorGreeting=null;state=await first;}if(!state){const response=await fetch('/api/mentor-greeting?name='+encodeURIComponent(prep.name)+(cartoon?'&avatar=cartoon':''),{signal:controller.signal,priority:'high'});if(!response.ok)throw Error('HTTP '+response.status);state=await response.json();}prep.state=state;
    window.dispatchEvent(new CustomEvent('mentor-greeting-progress',{detail:prep.state}));
    if(state.url){
     // Let the media element issue range requests; do not block on a full blob download.
     if(prep.cancelled)return null;
     prep.greetingSource=state.url;prep.playable=state;
     if(!prep.lectureStarted){audio.src=state.url;audio.load();}
     window.dispatchEvent(new CustomEvent('mentor-greeting-buffered',{detail:state}));
     return state;
    }
    if(prep.state.status==='failed')return null;
   }catch(error){prep.connectionError=error.message;}
   finally{clearTimeout(timeout);}
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  return null;
 })();
})();
