import * as T from './vendor/three/three.module.js';

export const gardenTours={};
export const gardenToursReady=fetch('/assets/arrival/garden-tour-rails.json?v=118',{cache:'force-cache'}).then(r=>{
 if(!r.ok)throw Error('园内路线 HTTP '+r.status);return r.json();
}).then(data=>{
 for(const [name,rail]of Object.entries(data)){
  rail.lengths=[0];for(let i=1;i<rail.walk.length;i++)rail.lengths.push(rail.lengths.at(-1)+Math.hypot(rail.walk[i][0]-rail.walk[i-1][0],rail.walk[i][2]-rail.walk[i-1][2]));
  gardenTours[name]=rail;
 }return gardenTours;
}).catch(()=>null);

export function sampleGardenTour(rail,distance){
 const lengths=rail.lengths;distance=T.MathUtils.clamp(distance,0,lengths.at(-1));let lo=0,hi=lengths.length-2;
 while(lo<hi){const mid=(lo+hi+1)>>1;if(lengths[mid]<=distance)lo=mid;else hi=mid-1;}
 const i=lo,t=T.MathUtils.clamp((distance-lengths[i])/Math.max(.000001,lengths[i+1]-lengths[i]),0,1),u=t*t,v=u*t;
 const walk=new T.Vector3(...rail.walk[i]).lerp(new T.Vector3(...rail.walk[i+1]),t);
 const camera=new T.Vector3(...rail.camera[i]).multiplyScalar(2*v-3*u+1).addScaledVector(new T.Vector3(...rail.tangents[i]),v-2*u+t).addScaledVector(new T.Vector3(...rail.camera[i+1]),-2*v+3*u).addScaledVector(new T.Vector3(...rail.tangents[i+1]),v-u);
 return {walk,camera,index:i,t};
}

// Shared actor/camera clock, with acceleration-limited turns and gentle endpoints.
export function gardenWalkDistance(length,elapsed,rail=null){
 if(rail?.time?.length&&rail.speed?.length){
  const duration=rail.time.at(-1),t=T.MathUtils.clamp(elapsed,0,duration);let lo=0,hi=rail.time.length-2;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(rail.time[mid]<=t)lo=mid;else hi=mid-1;}
  const i=lo,dt=t-rail.time[i],span=rail.time[i+1]-rail.time[i],acceleration=(rail.speed[i+1]-rail.speed[i])/Math.max(.000001,span);
  return {distance:T.MathUtils.clamp(rail.lengths[i]+rail.speed[i]*dt+.5*acceleration*dt*dt,0,length),duration};
 }
 const duration=Math.max(40,Math.min(60,length/.5+2)),speed=length/(duration-2),t=T.MathUtils.clamp(elapsed,0,duration);
 const ramp=x=>2*(x*x*x-.5*x*x*x*x);
 const distance=t<2?speed*ramp(t/2):t>duration-2?length-speed*ramp((duration-t)/2):speed*(t-1);
 return {distance,duration};
}
