export function updateRangeFill(input){
  if(!input)return;
  const min=Number(input.min)||0,max=input.max===''?100:Number(input.max);
  const ratio=max>min?Math.max(0,Math.min(1,(Number(input.value)-min)/(max-min))):0;
  const daw=input.closest('#daw-view,.daw-view');
  const thumb=daw?(input.closest('.daw-control')?12:14):0;
  // Native thumbs travel over (track width - thumb width), not the full track.
  input.style.setProperty('--range-fill',thumb?`calc(${ratio*100}% + ${(0.5-ratio)*thumb}px)`:`${ratio*100}%`);
}
