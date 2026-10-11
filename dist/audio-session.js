// A pending permission request also owns capture mode: playback must not change
// the category while Safari is opening its input route.
const captures=new Set();
let previousType='auto';
function setType(type){
 try{if(globalThis.navigator?.audioSession)navigator.audioSession.type=type;}catch{
  // Older/partial implementations may expose the API but reject explicit modes.
  try{navigator.audioSession.type='auto';}catch{}
 }
}
export function beginAudioCapture(){
 const token={};
 if(!captures.size){try{previousType=navigator.audioSession?.type||'auto';}catch{previousType='auto';}}
 captures.add(token);setType('play-and-record');
 return ()=>{if(!captures.delete(token)||captures.size)return;setType(previousType);};
}
export function prepareAudioPlayback(){setType(captures.size?'play-and-record':'playback');}
