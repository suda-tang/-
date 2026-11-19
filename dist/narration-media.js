// Keep the authorised media element across the mentor and project narration.
let media;
export function narrationMedia(){
 if(!media){media=window.mentorPreparation?.audio||document.createElement('audio');media.preload='auto';media.playsInline=true;media.hidden=true;media.muted=false;media.volume=1;if(!media.isConnected)document.body.append(media);}
 media.onended=media.onerror=media.onplaying=media.ontimeupdate=media.onwaiting=media.onstalled=null;
 return media;
}
