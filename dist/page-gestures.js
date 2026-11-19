// Cancel browser magnification, while letting component gesture handlers run.
(() => {
 const options={capture:true,passive:false};
 const cancel=event=>{if(event.cancelable)event.preventDefault();};
 for(const name of ['gesturestart','gesturechange','gestureend'])document.addEventListener(name,cancel,options);
 // Capture before modal/carousel handlers can stop propagation. preventDefault
 // suppresses browser zoom; it does not stop the DAW/3D custom gesture handlers.
 for(const name of ['touchstart','touchmove'])document.addEventListener(name,event=>{if(event.touches.length>1)cancel(event);},options);
 document.addEventListener('wheel',event=>{if(event.ctrlKey)cancel(event);},options);
 const style=document.createElement('style');style.dataset.pageGestureLock='';style.textContent=`
 html,body{touch-action:pan-x pan-y}
 @media(hover:none) and (pointer:coarse){
 input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]),textarea,select{font-size:16px!important}
 }`;
 document.head.append(style);
})();
