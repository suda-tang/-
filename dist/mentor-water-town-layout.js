import {landmarkLocations} from './mentor-narrated-landmarks.js?v=3';
// A compact exhibition layout: surveyed waterways guide the streets; gardens keep their full footprint.
export function createWaterTownLots(mapped, rivers) {
 const lots=[],cells=new Map(),size=12;
 const key=(x,z)=>`${Math.floor(x/size)},${Math.floor(z/size)}`;
 const protectedSite=(x,z,w,d,lectureBank=false)=>
  (Math.abs(x)<27+w/2&&z<30+d/2&&z>-145-d/2)||
  (Math.abs(x+80)<43+w/2&&Math.abs(z+160)<28+d/2)||
  (Math.abs(x+75)<78+w/2&&Math.abs(z+242)<47+d/2)||
  [...landmarkLocations.slice(3,5).map(([x,z])=>[x,z,10]),[...landmarkLocations[5],11]].some(([a,b,r])=>!(lectureBank&&a===43&&b===-102)&&Math.hypot(x-a,z-b)<r+Math.hypot(w,d)/2);
 function place(x,z,w,d,source,angle=0){
  const worldW=Math.abs(Math.cos(angle))*w+Math.abs(Math.sin(angle))*d,worldD=Math.abs(Math.sin(angle))*w+Math.abs(Math.cos(angle))*d;
  if(x < -330||x>290||z < -430||z>150||protectedSite(x,z,worldW,worldD,source==='shantang-lecture-bank'))return;
  const radius=Math.hypot(w,d)*.52,cx=Math.floor(x/size),cz=Math.floor(z/size);
  for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++)for(const other of cells.get(`${cx+a},${cz+b}`)||[]){if(Math.hypot(x-other[0],z-other[1])>radius+other[2]+.4)continue;let overlaps=true;for(const axis of [angle,angle+Math.PI/2,other[5],other[5]+Math.PI/2]){const c=Math.cos(axis),s=-Math.sin(axis),distance=Math.abs((x-other[0])*c+(z-other[1])*s),reach=w/2*Math.abs(Math.cos(angle-axis))+d/2*Math.abs(Math.sin(angle-axis))+other[3]/2*Math.abs(Math.cos(other[5]-axis))+other[4]/2*Math.abs(Math.sin(other[5]-axis));if(distance>reach+.35){overlaps=false;break;}}if(overlaps)return;}
  // Reject plots whose footprint would intrude into a canal.
  for(const [rx,rz,len,angle,width]of rivers){if(Math.abs(x-rx)>len/2+radius+width||Math.abs(z-rz)>len/2+radius+width)continue;const dx=Math.sin(angle),dz=Math.cos(angle),along=Math.max(-len/2,Math.min(len/2,(x-rx)*dx+(z-rz)*dz));if(Math.hypot(x-rx-dx*along,z-rz-dz*along)<width/2+Math.min(w,d)*.47)return;}
  const row=[x,z,worldW,worldD,3,angle];row.frontage=w;row.depth=d;row.layoutAngle=angle;row.layoutSource=source;lots.push(row);const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push([x,z,radius,w,d,angle]);
 }
 // Reserve the lecture-facing street front before placing surrounding courtyards.
 for(let k=-3;k<=3;k++)for(const side of [-1,1])place(43+side*6.35,-102+k*12.3,11.5,5.3,'shantang-lecture-bank',side>0?-Math.PI/2:Math.PI/2);
 // Canal streets lead the composition; isolated mapped footprints no longer scatter houses across open land.
 // Two uneven banks follow each actual bend; no rectangular carpet of identical roofs.
 for(let i=0;i<rivers.length;i++){
  const [x,z,len,angle,width]=rivers[i],dx=Math.sin(angle),dz=Math.cos(angle),nx=Math.cos(angle),nz=-Math.sin(angle);
  if(len<5)continue;
  for(let t=-len/2+5;t<len/2;t+=12.4)for(const side of [-1,1]){const phase=Math.sin(i*1.91+t*.37),w=10.2+(phase+1)*.6,d=5.3+(Math.cos(i+t)+1)*.45,bank=width/2+d*.5+1.15,facing=angle+Math.PI/2+(side>0?Math.PI:0);place(x+dx*t+side*nx*bank,z+dz*t+side*nz*bank,w,d,'canal-bank-composition',facing);for(let row=1;row<=3;row++){const rear=bank+row*(d+1.2),stagger=(row%2?1.2:-.7),court=row===2&&Math.floor(i+t)%4===0;place(x+dx*(t+stagger)+side*nx*rear,z+dz*(t+stagger)+side*nz*rear,w*(court?1.4:1),d*(court?1.8:1),'rear-courtyard',facing);}}
 }
 // Shantang's lecture canal has its own banks; use the same extracted houses here too.

 return lots;
}
