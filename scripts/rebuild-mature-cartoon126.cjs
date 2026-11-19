const fs=require('fs'),p='dist/mentor-cartoon-head.js';let s=fs.readFileSync(p,'utf8');let a=s.indexOf(' function front(x,y){'),b=s.indexOf(' const faceGeometry=',a);s=s.slice(0,a)+` // Sculpting reference: Lorry Creative's mature female cartoon base.
 // Use its continuous cheek/socket/nose construction, not its mesh or texture.
 function front(x,y){
  const dome=.023+.163*Math.sqrt(Math.max(.008,1-(x/.221)**2-(y/.268)**2));
  const bump=(cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2)-(((y-cy)/ry)**2));
  return dome+.027*bump(0,.022,.027,.075)+.039*bump(0,-.039,.031,.025)+.009*bump(.11,-.045,.062,.05)+.009*bump(-.11,-.045,.062,.05)-.008*bump(.074,.047,.048,.026)-.008*bump(-.074,.047,.048,.026)+.006*bump(0,-.103,.075,.031);
 }
`+s.slice(b);
s=s.replace("const u=positions.getX(i),v=positions.getY(i),w=positions.getZ(i),y=v*.275,measuredWidth=widthAt(y),naturalWidth=.226*Math.sqrt(Math.max(.001,1-v*v)),fit=measuredWidth?T.MathUtils.lerp(1,T.MathUtils.clamp(measuredWidth/naturalWidth,.86,1.08),.35):1,x=u*.226*fit*(1-.045*Math.max(0,-v));","const u=positions.getX(i),v=positions.getY(i),w=positions.getZ(i),y=v*.265,x=u*.218*(1-.11*Math.max(0,-v));");
s=s.replace("const center=point(a).add(point(b)).multiplyScalar(.5),width=point(a).distanceTo(point(b))*.46;center.x*=.86;center.y-=.018;","const center=new T.Vector3(sign*.074,.047,0),width=.037;");
s=s.replace('Math.sin(Math.PI*t)*.016','Math.sin(Math.PI*t)*.022').replace('Math.sin(Math.PI*t)*.011','Math.sin(Math.PI*t)*.016');s=s.replace('[.0125,.013,.0025]','[.015,.016,.0035]').replace('[.0075,.0095,.0015]','[.009,.0115,.002]');
s=s.replace("const left=point(61),right=point(291),center=point(13).add(point(14)).multiplyScalar(.5);for(const p of [left,right,center]){p.x*=.84;p.y+=.015;}","const left=new T.Vector3(-.071,-.096,0),right=new T.Vector3(.071,-.096,0),center=new T.Vector3(0,-.109,0);");
s=s.replace('strand(mouthGroup,top,.003,lip)','strand(mouthGroup,top,.002,lip)').replace('strand(mouthGroup,bottom,.005,lip)','strand(mouthGroup,bottom,.0035,lip)').replace('head.scale.set(1.08,1.025,1.08);','head.scale.set(.90,.90,.90);');
fs.writeFileSync(p,s);
