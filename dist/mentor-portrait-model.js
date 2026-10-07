import * as T from './vendor/three/three.module.js';

// A single articulated character: the portrait surface and hair share one head pivot.
export async function createPortraitMentor(signal, progress = () => {}) {
  progress('正在载入面部');
  const response = await fetch('/narration/models/mentor-portrait-surface.json?v=2', {signal});
  if (!response.ok) throw Error('Portrait surface HTTP '+response.status);
  const data = await response.json();
  const texture = await new T.TextureLoader().loadAsync('/narration/models/mentor-reference-face.png?v=2');
  texture.colorSpace = T.SRGBColorSpace;
  const model = new T.Group(), body = new T.Group(), head = new T.Group();
  head.name = 'Head'; head.position.set(0,1.27,0); model.add(body,head);
  const skin = new T.MeshStandardMaterial({color:'#c99781',roughness:.8});
  const silk = new T.MeshStandardMaterial({color:'#257da9',roughness:.46,metalness:.08});
  const dark = new T.MeshStandardMaterial({color:'#26303d',roughness:.76});
  const hair = new T.MeshStandardMaterial({color:'#201c1d',roughness:.48,metalness:.05});
  const sheen = new T.MeshStandardMaterial({color:'#302728',roughness:.53});
  function oval(parent,position,scale,material) {
    const mesh = new T.Mesh(new T.SphereGeometry(1,40,28),material);
    mesh.position.set(...position);mesh.scale.set(...scale);parent.add(mesh);return mesh;
  }
  oval(body,[0,.88,0],[.19,.225,.12],silk);
  oval(body,[0,.72,0],[.155,.095,.10],silk);
  // The neck overlaps the chin and torso rather than hovering between them.
  oval(body,[0,1.08,-.022],[.066,.125,.061],skin);
  const skirt = new T.Mesh(new T.CylinderGeometry(.153,.197,.34,48),dark);
  skirt.position.y=.49;body.add(skirt);
  const arms=[],walkLimbs=[];
  for(const sign of [-1,1]) {
    const pivot=new T.Group();pivot.position.set(sign*.178,1.005,0);body.add(pivot);
    oval(pivot,[0,-.09,0],[.062,.13,.061],silk);
    const elbow=new T.Group();elbow.position.y=-.20;pivot.add(elbow);
    oval(elbow,[0,-.074,0],[.043,.105,.042],silk);
    const hand=oval(elbow,[0,-.173,.006],[.035,.047,.029],skin);
    if(sign===1){const chalk=new T.Mesh(new T.CylinderGeometry(.004,.004,.047,10),new T.MeshStandardMaterial({color:'#eee9da'}));chalk.position.set(.017,-.174,.032);chalk.rotation.z=.4;elbow.add(chalk);}
    arms.push({pivot,elbow,hand,sign});
    const hip=new T.Group();hip.position.set(sign*.076,.34,0);body.add(hip);
    oval(hip,[0,-.075,0],[.05,.095,.052],skin);
    const knee=new T.Group();knee.position.y=-.15;hip.add(knee);
    oval(knee,[0,-.072,0],[.044,.09,.047],skin);
    const foot=oval(knee,[0,-.151,.038],[.06,.035,.092],dark);
    walkLimbs.push({sign,mesh:hip,knee,foot});
  }
  // Source photo's double-chain neckline and small stud earrings.
  const silver=new T.MeshStandardMaterial({color:'#c6c4ba',metalness:.75,roughness:.3});
  for(let row=0;row<2;row++){
    const curve=new T.CatmullRomCurve3(Array.from({length:33},(_,i)=>{const a=i/32*Math.PI;return new T.Vector3(Math.cos(a)*(.105+row*.006),1.045-Math.sin(a)*(.076+row*.013),.104+Math.sin(a)*.008);}));
    body.add(new T.Mesh(new T.TubeGeometry(curve,64,.003,6,false),silver));
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
  geometry.setIndex(data.indices);geometry.computeVertexNormals();
  const face=new T.Mesh(geometry,new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,toneMapped:false}));
  head.add(face);
  // Close the skull directly along the actual face boundary, without a second
  // generic head poking through the portrait or leaving gaps at the temples.
  const outline=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
  const skullVertices=[],skullIndices=[],rings=12;
  for(let r=0;r<=rings;r++)for(const index of outline){
    const t=r/rings,x=data.positions[index*3],y=data.positions[index*3+1],z=data.positions[index*3+2];
    const radial=Math.cos(t*Math.PI/2);
    skullVertices.push(x*radial,y*radial,z*(1-t)-.15*Math.sin(t*Math.PI/2));
  }
  for(let r=0;r<rings;r++)for(let i=0;i<outline.length;i++){
    const a=r*outline.length+i,b=r*outline.length+(i+1)%outline.length;
    skullIndices.push(a,b,a+outline.length,b,b+outline.length,a+outline.length);
  }
  const skull=new T.BufferGeometry();skull.setAttribute('position',new T.Float32BufferAttribute(skullVertices,3));skull.setIndex(skullIndices);skull.computeVertexNormals();
  head.add(new T.Mesh(skull,new T.MeshStandardMaterial({color:'#c99781',roughness:.82,side:T.DoubleSide})));
  for(const sign of [-1,1]){
    oval(head,[sign*.139,-.018,.005],[.022,.042,.021],skin);
    oval(head,[sign*.149,-.04,.026],[.006,.007,.005],silver);
  }
  // Every hair component uses the head's local coordinates and shared scalp surface.
  const hairGroup=new T.Group();hairGroup.name='MentorHair';head.add(hairGroup);
  const scalpPoint=(a,p,inset=1)=>new T.Vector3(Math.sin(a)*Math.sin(p)*.190*inset,Math.cos(p)*.230*inset+.015,Math.cos(a)*Math.sin(p)*.219*inset-.025);
  const hairBoundary=a=>{const front=Math.max(0,Math.cos(a));return .53+(1-front)*1.52+.045*Math.sin(a)*front;};
  // Crown and shoulder-length hair are one indexed surface, sharing the
  // exact same boundary vertices. Separate tube roots cannot leave a gap.
  const crownFraction=22/46;
  function hairSurface(a,s){
    const boundary=hairBoundary(a);
    if(s<=crownFraction)return scalpPoint(a,s/crownFraction*boundary);
    const root=scalpPoint(a,boundary),t=(s-crownFraction)/(1-crownFraction);
    const distance=Math.acos(Math.cos(a)),length=Math.max(0,Math.min(1,(distance-.95)/.35));
    if(!length)return root;
    const wave=Math.sin(t*5.4+a*2)*.008*t;
    return new T.Vector3(root.x+Math.sin(a)*(.018*t+wave)*length,
      root.y+(-.33+.018*Math.sin(a*3)-root.y)*t*length,
      root.z+(Math.cos(a)*.18-.035-root.z)*t*length-wave*.6*length);
  }
  const vertices=[],indices=[],uCount=96,vCount=46;
  for(let u=0;u<=uCount;u++){
    const a=u/uCount*Math.PI*2;
    for(let v=0;v<=vCount;v++){
      vertices.push(...hairSurface(a,v/vCount).toArray());
      if(u<uCount&&v<vCount){const i=u*(vCount+1)+v;indices.push(i,i+vCount+1,i+1,i+1,i+vCount+1,i+vCount+2);}
    }
  }
  const scalp=new T.BufferGeometry();scalp.setAttribute('position',new T.Float32BufferAttribute(vertices,3));scalp.setIndex(indices);scalp.computeVertexNormals();
  const hairShell=new T.Mesh(scalp,new T.MeshStandardMaterial({color:'#201c1d',roughness:.52,side:T.DoubleSide}));hairShell.name='MentorContinuousHair';hairGroup.add(hairShell);
  // Fine strands follow the continuous surface; they are decoration, not
  // detached structural locks with exposed roots above the scalp.
  for(let i=0;i<40;i++){
    const a=1.12+i/39*(Math.PI*2-2.24);
    const start=crownFraction*.67/hairBoundary(a),root=hairSurface(a,start);
    const points=Array.from({length:33},(_,j)=>hairSurface(a,start+(1-start)*j/32));
    const curve=new T.CatmullRomCurve3(points), lockGeometry=new T.TubeGeometry(curve,48,.0035,6,false);
    const attribute=lockGeometry.attributes.position;
    for(let segment=0;segment<=48;segment++){
      const t=segment/48,center=curve.getPointAt(t),radiusScale=Math.sin(Math.PI*t)**.4;
      for(let k=0;k<=6;k++){
        const index=segment*7+k,v=new T.Vector3().fromBufferAttribute(attribute,index).sub(center).multiplyScalar(radiusScale).add(center);
        attribute.setXYZ(index,v.x,v.y,v.z);
      }
    }
    lockGeometry.computeVertexNormals();
    const lock=new T.Mesh(lockGeometry,i%7===0?sheen:hair);
    lock.userData.scalpRoot=root.toArray();hairGroup.add(lock);
  }
  for(let i=0;i<9;i++){
    const points=Array.from({length:33},(_,j)=>{
      const t=j/32,a=-.7+1.83*t,p=Math.min(hairBoundary(a)-.01,.23+1.07*t+i*.005);
      return hairSurface(a,crownFraction*p/hairBoundary(a));
    });
    const curve=new T.CatmullRomCurve3(points),detail=new T.TubeGeometry(curve,32,.0025,6,false);
    const positions=detail.attributes.position;
    for(let j=0;j<=32;j++)for(let k=0;k<=6;k++){
      const center=curve.getPointAt(j/32),index=j*7+k;
      const point=new T.Vector3().fromBufferAttribute(positions,index).sub(center).multiplyScalar(Math.sin(Math.PI*j/32)**.4).add(center);
      positions.setXYZ(index,point.x,point.y,point.z);
    }
    detail.computeVertexNormals();hairGroup.add(new T.Mesh(detail,i%4===0?sheen:hair));
  }
  const base=geometry.attributes.position.array.slice();
  const baseUV=geometry.attributes.uv.array.slice();
  const eyes=[[33,133,159,145],[362,263,386,374]].map(([a,b,top,bottom])=>({
    x:(base[a*3]+base[b*3])/2,y:(base[top*3+1]+base[bottom*3+1])/2,
    width:Math.abs(base[a*3]-base[b*3])/2,height:Math.abs(base[top*3+1]-base[bottom*3+1])/2,
    ux:(baseUV[b*2]-baseUV[a*2])/(base[b*3]-base[a*3]),
    vy:(baseUV[top*2+1]-baseUV[bottom*2+1])/(base[top*3+1]-base[bottom*3+1])
  }));
  const expressionWeights=Array.from({length:base.length/3},(_,i)=>{
    const x=base[i*3],y=base[i*3+1];
    return {
      eyes:eyes.map(eye=>({blink:Math.exp(-(((x-eye.x)/(eye.width*.86))**4))*Math.exp(-(((y-eye.y)/(eye.height*1.55))**4)),iris:Math.exp(-(((x-eye.x)/.020)**4)-(((y-eye.y)/.017)**4))})),
      brow:Math.exp(-(((Math.abs(x)-.078)/.035)**2)-(((y-.125)/.018)**2)),
      smile:Math.exp(-(((Math.abs(x)-.066)/.027)**2)-(((y+.080)/.024)**2))
    };
  });
  let gazeX=0,gazeY=-.006,lastFrame=0,headYaw=0,headPitch=.045,expression=0;
  const lipY=(base[13*3+1]+base[14*3+1])/2,lipX=(base[13*3]+base[14*3])/2;
  const mouthGap=new T.Mesh(new T.CircleGeometry(1,32),new T.MeshBasicMaterial({color:'#58302e',side:T.DoubleSide,toneMapped:false}));
  mouthGap.name='MentorMouth';mouthGap.position.set(lipX,lipY,Math.max(base[13*3+2],base[14*3+2])+.0008);mouthGap.visible=false;head.add(mouthGap);
  model.userData.updatePortrait=(time,speaking,energy,mode,blink=0,interaction={})=>{
    const dt=Math.min(.05,Math.max(0,time-lastFrame));lastFrame=time;
    const elapsed=Number.isFinite(interaction.elapsed)?interaction.elapsed:time;
    const phase=elapsed%14;const boardSide=interaction.boardSide||1;
    const attention=phase>11.5?'visitor':(mode==='writing'?'board':'slides');
    const viewerYaw=Math.max(-.22,Math.min(.22,interaction.viewerYaw||0));
    const targetYaw=attention==='board'?boardSide*.65:attention==='slides'?boardSide*.55:viewerYaw+Math.sin(time*.7)*.035;
    const targetPitch=attention==='board'?-.025:attention==='slides'?.018:.055+Math.sin(elapsed*2.1)*.025*(speaking?1:.15);
    const smooth=1-Math.exp(-dt*4);headYaw+=(targetYaw-headYaw)*smooth;headPitch+=(targetPitch-headPitch)*smooth;
    const targetX=attention==='visitor'?Math.sin(time*.62)*.0025:boardSide*.008;
    const targetY=attention==='board'?-.0008:attention==='slides'?-.002:-.006+Math.sin(time*.8)*.0007;
    gazeX+=(targetX-gazeX)*(1-Math.exp(-dt*7));gazeY+=(targetY-gazeY)*(1-Math.exp(-dt*7));
    expression+=((speaking?Math.min(1,.22+energy*2):0)-expression)*smooth;
    const emphasis=expression;
    body.scale.y=1+Math.sin(time*1.35)*.0025;
    head.rotation.x=headPitch;
    head.rotation.z=speaking?Math.sin(time*.85)*.022:Math.sin(time*.3)*.005;
    head.rotation.y=headYaw;
    // Keep photographed facial features intact; only a restrained lower-jaw movement.
    const p=geometry.attributes.position.array;
    const uv=geometry.attributes.uv.array;
    const opening=speaking?Math.min(.016,Math.max(0,energy)*.038):0;
    for(let i=0;i<p.length;i+=3){
      const index=i/3,x=base[i],y=base[i+1],weights=expressionWeights[index];
      const lateral=Math.exp(-(((x-lipX)/.052)**2));const lower=Math.max(0,Math.min(1,(lipY-y)/.016));const falloff=Math.exp(-(((y-lipY)/.065)**2));
      let dy=-opening*lateral*lower*falloff;
      let du=0,dv=0;
      for(let eyeIndex=0;eyeIndex<eyes.length;eyeIndex++){
        const eye=eyes[eyeIndex],w=weights.eyes[eyeIndex];
        dy+=(eye.y-y)*blink*.94*w.blink;
        du-=gazeX*eye.ux*w.iris*(1-blink);dv-=gazeY*eye.vy*w.iris*(1-blink);
      }
      dy+=weights.brow*.004*emphasis+weights.smile*.003*emphasis;
      p[i+1]=y+dy;uv[index*2]=baseUV[index*2]+du;uv[index*2+1]=baseUV[index*2+1]+dv;
    }
    mouthGap.visible=opening>.0003;mouthGap.scale.set(.025,opening*.48,1);mouthGap.position.y=lipY-opening*.28;
    geometry.attributes.position.needsUpdate=true;
    geometry.attributes.uv.needsUpdate=true;
    model.userData.expressionState={blink,gazeX,gazeY,emphasis,attention,headYaw,headPitch};
  };
  model.userData.chibiBody=body;body.userData.arms=arms;body.userData.walkLimbs=walkLimbs;
  model.userData.portraitReport={source:data.source,vertices:data.positions.length/3,limitations:data.limitations};
  progress('形象已载入');return model;
}
