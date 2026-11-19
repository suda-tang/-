import * as T from './vendor/three/three.module.js';

// The reference supplies geometry measurements only. No photograph is mapped
// onto the face: the head remains a complete, rotatable sculpted character.
export function buildReferenceHead(head,profile,{skin,hair,shine,white,iris,black,lip,silver},oval,strand){
 const point=i=>new T.Vector3(...profile.positions.slice(i*3,i*3+3));
 const samples=Array.from({length:profile.positions.length/3},(_,i)=>point(i));
 const boundary=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109].map(point);
 function widthAt(y){const crossings=[];for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];if((a.y<=y&&b.y>y)||(b.y<=y&&a.y>y))crossings.push(T.MathUtils.lerp(a.x,b.x,(y-a.y)/(b.y-a.y)));}return crossings.length>=2?(Math.max(...crossings)-Math.min(...crossings))*.5:null;}
 // Sculpting reference: Lorry Creative's mature female cartoon base.
 // Use its continuous cheek/socket/nose construction, not its mesh or texture.
 function front(x,y){
  const dome=.023+.163*Math.sqrt(Math.max(.008,1-(x/.221)**2-(y/.268)**2));
  const bump=(cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2)-(((y-cy)/ry)**2));
  return dome+.027*bump(0,.022,.027,.075)+.039*bump(0,-.039,.031,.025)+.009*bump(.11,-.045,.062,.05)+.009*bump(-.11,-.045,.062,.05)-.008*bump(.074,.047,.048,.026)-.008*bump(-.074,.047,.048,.026)+.006*bump(0,-.103,.075,.031);
 }
 const faceGeometry=new T.SphereGeometry(1,80,64),positions=faceGeometry.attributes.position;
 for(let i=0;i<positions.count;i++){
  const u=positions.getX(i),v=positions.getY(i),w=positions.getZ(i),y=v*.265,x=u*.218*(1-.11*Math.max(0,-v));
  const baseline=w*.16+.018,edge=Math.min(1,Math.max(0,w/.35));
  positions.setXYZ(i,x,y,w>0?T.MathUtils.lerp(baseline,front(x,y),edge):baseline);
 }
 const colors=[];const baseColor=new T.Color('#e9b6a0'),cheekColor=new T.Color('#d99791');for(let i=0;i<positions.count;i++){const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),blush=z>0?Math.exp(-(((Math.abs(x)-.13)/.052)**2)-(((y+.056)/.041)**2))*.18:0,c=baseColor.clone().lerp(cheekColor,blush);colors.push(c.r,c.g,c.b);}faceGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));const skinFace=skin.clone();skinFace.color.set('#ffffff');skinFace.vertexColors=true;
 faceGeometry.computeVertexNormals();const face=new T.Mesh(faceGeometry,skinFace);face.name='ReferenceSculpt';face.castShadow=true;head.add(face);
 const rest=positions.array.slice(),eyes=[],pupils=[],brows=[];
 const rimMaterial=new T.MeshStandardMaterial({color:'#ad786c',roughness:.85});
 function patch(parent,points,material){
  const center=points.reduce((sum,p)=>sum.add(new T.Vector3(...p)),new T.Vector3()).multiplyScalar(1/points.length),vertices=center.toArray();
  points.forEach(p=>vertices.push(...p));const indices=[];for(let i=0;i<points.length;i++)indices.push(0,i+1,(i+1)%points.length+1);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();const surface=material.clone();surface.side=T.DoubleSide;const mesh=new T.Mesh(geometry,surface);parent.add(mesh);return mesh;
 }
 // Almond-shaped eyes follow the curvature of the actual face measurements.
 for(const [sign,a,b]of [[-1,33,133],[1,362,263]]){
  const center=new T.Vector3(sign*.074,.047,0),width=.037;
  const group=new T.Group();group.position.set(center.x,center.y,front(center.x,center.y)+.0015);head.add(group);
  const upper=[],lower=[];
  for(let i=0;i<=24;i++){const t=i/24,x=(t*2-1)*width,tilt=sign*x*.08,up=Math.sin(Math.PI*t)*.022+tilt,down=-Math.sin(Math.PI*t)*.016+tilt;upper.push([x,up,front(center.x+x,center.y+up)-group.position.z+.003]);lower.push([x,down,front(center.x+x,center.y+down)-group.position.z+.003]);}
  patch(group,[...upper,...lower.reverse()],white);strand(group,upper,.0009,black);strand(group,lower,.0004,rimMaterial);
  const globe=oval(group,[0,.001,.006],[.015,.016,.0035],iris),pupil=oval(group,[0,.001,.009],[.009,.0115,.002],black);oval(group,[-.0035,.0055,.011],[.003,.003,.001],white);pupils.push(pupil,globe);eyes.push(group);
  const browPoints=[[-1,.025],[-.45,.037],[.1,.039],[.8,.023]].map(([x,y])=>{const px=center.x+x*width,py=center.y+y;return [px,py,front(px,py)+.0025];});brows.push(strand(head,browPoints,.0032,hair));
  const lid=upper.map(([x,y])=>[center.x+x,center.y+y+.009,front(center.x+x,center.y+y+.009)+.001]);strand(head,lid,.0013,rimMaterial);
 }
 // Nose and cheeks are part of the same continuous skin surface.
 for(const sign of [-1,1]){const x=sign*.020,y=-.045;oval(head,[x,y,front(x,y)+.001],[.005,.002,.0015],rimMaterial);oval(head,[sign*.22,-.061,.026],[.02,.04,.021],skin);oval(head,[sign*.226,-.099,.041],[.007,.008,.007],silver);}
 const left=new T.Vector3(-.071,-.096,0),right=new T.Vector3(.071,-.096,0),center=new T.Vector3(0,-.109,0);const lipY=center.y,mouthGroup=new T.Group();mouthGroup.position.y=lipY;head.add(mouthGroup);
 const contour=[];for(let i=0;i<=32;i++){const t=i/32,x=T.MathUtils.lerp(left.x,right.x,t),y=T.MathUtils.lerp(left.y,right.y,t)-Math.sin(Math.PI*t)*.020;contour.push([x,y-lipY,front(x,y)+.0025]);}for(let i=32;i>=0;i--){const t=i/32,x=T.MathUtils.lerp(left.x,right.x,t),y=T.MathUtils.lerp(left.y,right.y,t)-Math.sin(Math.PI*t)*.004;contour.push([x,y-lipY,front(x,y)+.003]);}
 const mouth=patch(mouthGroup,contour,new T.MeshStandardMaterial({color:'#703a3d',roughness:1,side:T.DoubleSide}));
 const top=[],bottom=[],teethTop=[],teethBottom=[];
 for(let i=0;i<=32;i++){const t=i/32,x=T.MathUtils.lerp(left.x,right.x,t),corner=T.MathUtils.lerp(left.y,right.y,t),arc=Math.sin(Math.PI*t),y=corner-arc*.022;bottom.push([x,y-lipY,front(x,y)+.004]);const upperY=corner-arc*.002;top.push([x,upperY-lipY,front(x,upperY)+.004]);const tx=x*.91,ty=corner-arc*.007;teethTop.push([tx,ty-lipY,front(tx,ty)+.004]);const by=corner-arc*.014;teethBottom.push([tx,by-lipY,front(tx,by)+.004]);}
 strand(mouthGroup,top,.002,lip);const lowerLip=strand(mouthGroup,bottom,.0035,lip);const teeth=patch(mouthGroup,[...teethTop,...teethBottom.reverse()],white);
 // A side part and full, irregular waves replace the old symmetrical hair cap.
 oval(head,[.015,-.14,-.105],[.258,.36,.15],hair);
 const hairGeometry=new T.SphereGeometry(1,64,32,0,Math.PI*2,0,Math.PI/2),hp=hairGeometry.attributes.position;
 for(let i=0;i<hp.count;i++){const x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i),phi=Math.atan2(z,x),frontness=Math.max(0,Math.sin(phi)),limit=1.90-frontness*.98+Math.cos(phi)*frontness*.16,theta=Math.acos(T.MathUtils.clamp(y,-1,1))/(Math.PI/2)*limit,px=Math.sin(theta)*Math.cos(phi)*.247,py=Math.cos(theta)*.308+.008,pz=Math.sin(theta)*Math.sin(phi)*.192-.003;hp.setXYZ(i,px,py,z>0?Math.max(pz,front(px,py)+.011):pz);}
 hairGeometry.computeVertexNormals();head.add(new T.Mesh(hairGeometry,hair));
 for(let i=0;i<42;i++){const phi=i/42*Math.PI*2,frontness=Math.max(0,Math.sin(phi)),limit=1.90-frontness*.98+Math.cos(phi)*frontness*.16,points=[];for(let k=0;k<=20;k++){const theta=.08+(limit-.08)*k/20,angle=phi+.10*Math.sin(theta),x=Math.sin(theta)*Math.cos(angle)*.249,y=Math.cos(theta)*.310+.008,z=Math.sin(theta)*Math.sin(angle)*.194-.003;points.push([x,y,Math.sin(angle)>0?Math.max(z,front(x,y)+.014):z]);}strand(head,points,.0009,i%3===0?shine:hair);}
 const sweptPoints=(side,n)=>{const volume=side>0?.024:.008,root=[-.053+n*.013,.31,.035];return [root,[side*.10,.27-n*.028,.14],[side*(.195+n*.022),.14-n*.025,.115],[side*(.231+Math.sin(n*9)*volume),-.05-n*.022,.073],[side*(.247+Math.sin(n*12)*volume),-.22-n*.04,.055],[side*(.23+Math.sin(n*7)*volume),-.39-n*.07,-.002]];};
 for(const side of [-1,1])for(let i=0;i<19;i++){const n=i/18;strand(head,sweptPoints(side,n),side>0?.012:.009,i%6===0?shine:hair);}
 for(let i=0;i<7;i++){const n=i/6;strand(head,Array.from({length:17},(_,k)=>{const t=k/16;return [.21+n*.065+Math.sin(t*Math.PI*3+n)*.018,-.04-t*(.37+n*.055),.057-n*.012+Math.cos(t*Math.PI*3+n)*.012];}),.019,i===3?shine:hair);}
 head.scale.set(.90,.90,.90);
 return {faceGeometry,rest,lipY,eyes,pupils,brows,animate(speaking,energy,blink,time){
  for(const eye of eyes)eye.scale.y=Math.max(.07,1-blink*.94);
  for(const pupil of pupils)pupil.position.x=Math.sin(time*.48)*.002;
  for(const brow of brows)brow.position.y=speaking?Math.sin(time*.9)*.0015:0;
  const opening=speaking?Math.min(.012,Math.max(0,energy)*.032):0;mouth.scale.y=1+opening*24;teeth.position.y=-opening*.10;lowerLip.position.y=-opening*.55;
  for(let i=0;i<positions.count;i++){const x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2],weight=z>0?Math.exp(-Math.pow(x/.105,4)-Math.pow((y-lipY)/.075,2))*Math.max(0,Math.min(1,(lipY-y)/.025)):0;positions.array[i*3+1]=y-opening*weight;}
  positions.needsUpdate=true;
 }};
}
