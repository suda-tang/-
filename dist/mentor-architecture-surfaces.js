import * as T from './vendor/three/three.module.js';
const cache=new Map();
function atlas(kind){
 let entry=cache.get(kind);if(entry)return entry;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');let seed=317+kind.length*19;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 c.fillStyle='#e5e3dc';c.fillRect(0,0,256,256);
 if(kind==='brick'||kind==='stone')for(let y=0;y<256;y+=32)for(let x=-32;x<288;x+=32){const offset=y%64?16:0,tone=190+random()*48;c.fillStyle=`rgb(${tone},${tone},${tone-3})`;c.fillRect(x+offset+1,y+1,30,30);c.fillStyle='#fff2';c.fillRect(x+offset+2,y+2,29,1);c.fillStyle='#0002';c.fillRect(x+offset+1,y+30,30,1);}
 if(kind==='roof'){c.fillStyle='#d5d8d3';c.fillRect(0,0,256,256);for(let y=0;y<256;y+=32){for(let x=-16;x<272;x+=32){const g=c.createLinearGradient(x,0,x+32,0);g.addColorStop(0,'#82908b');g.addColorStop(.45,'#eef0e9');g.addColorStop(1,'#71817b');c.fillStyle=g;c.fillRect(x,y,32,30);}c.fillStyle='#65736c';c.fillRect(0,y+30,256,2);}}
 if(kind==='wood'){c.fillStyle='#e0d1b9';c.fillRect(0,0,256,256);for(let i=0;i<150;i++){c.strokeStyle=`rgba(75,53,30,${.02+random()*.10})`;c.beginPath();const x=random()*256;c.moveTo(x,0);c.bezierCurveTo(x+random()*8,70,x-random()*8,180,x,256);c.stroke();}}
 const image=c.getImageData(0,0,256,256);for(let i=0;i<image.data.length;i+=4){const n=(random()-.5)*(kind==='plaster'?15:10);for(let j=0;j<3;j++)image.data[i+j]+=n;}c.putImageData(image,0,0);
 const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=2;entry={texture,users:0};cache.set(kind,entry);return entry;
}
export function architecturalMaterial(kind,color){const a=atlas(kind);a.users++;const material=new T.MeshStandardMaterial({color,map:a.texture,bumpMap:a.texture,bumpScale:kind==='plaster'?.003:.009,roughness:kind==='wood'?.73:.91});material.userData.architectural=kind;material.addEventListener('dispose',()=>{if(--a.users===0){a.texture.dispose();cache.delete(kind);}});return material;}
export function finishArchitecture(group){group.traverse(o=>{if(!o.isMesh||!o.material?.userData.architectural||!o.geometry?.attributes.normal)return;const kind=o.material.userData.architectural,g=o.geometry,p=g.attributes.position,n=g.attributes.normal,uv=[];const sx=kind==='roof'?.625:kind==='wood'?.5:.5,sy=kind==='brick'?1.5625:kind==='stone'?.8:kind==='roof'?.625:.5;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));if(ny>nx&&ny>nz)uv.push(x*sx,z*sy);else if(nx>nz)uv.push(z*sx,y*sy);else uv.push(x*sx,y*sy);}g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));});}
