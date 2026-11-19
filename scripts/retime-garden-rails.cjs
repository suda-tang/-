const fs=require('fs');
function retime(data){for(const [name,rail]of Object.entries(data)){
 const n=rail.walk.length,lengths=[0],caps=Array(n).fill(.5),limits=[];
 const norm=a=>Math.hypot(...a),cameraSpeed=2.4,cameraAcceleration=3;
 for(let i=0;i<n-1;i++){
  const ds=Math.hypot(rail.walk[i+1][0]-rail.walk[i][0],rail.walk[i+1][2]-rail.walk[i][2]);lengths.push(lengths.at(-1)+ds);let first=0,second=0;
  for(let k=0;k<=12;k++){const t=k/12,t2=t*t,a=rail.camera[i],b=rail.camera[i+1],u=rail.tangents[i],v=rail.tangents[i+1];
   first=Math.max(first,norm(a.map((x,j)=>((6*t2-6*t)*x+(3*t2-4*t+1)*u[j]+(-6*t2+6*t)*b[j]+(3*t2-2*t)*v[j])/ds)));
   second=Math.max(second,norm(a.map((x,j)=>((12*t-6)*x+(6*t-4)*u[j]+(-12*t+6)*b[j]+(6*t-2)*v[j])/(ds*ds))));
  }
  const cap=Math.min(.5,cameraSpeed/Math.max(.001,first),Math.sqrt(cameraAcceleration*.65/Math.max(.001,second)));caps[i]=Math.min(caps[i],cap);caps[i+1]=Math.min(caps[i+1],cap);limits.push(Math.min(.2,cameraAcceleration*.35/Math.max(.001,first)));
 }
 caps[0]=caps[n-1]=0;for(let pass=0;pass<4;pass++){
  for(let i=1;i<n;i++)caps[i]=Math.min(caps[i],Math.sqrt(caps[i-1]**2+2*limits[i-1]*(lengths[i]-lengths[i-1])));
  for(let i=n-2;i>=0;i--)caps[i]=Math.min(caps[i],Math.sqrt(caps[i+1]**2+2*limits[i]*(lengths[i+1]-lengths[i])));
 }
 rail.time=[0];rail.speed=caps;for(let i=1;i<n;i++)rail.time.push(rail.time.at(-1)+2*(lengths[i]-lengths[i-1])/Math.max(.00001,caps[i]+caps[i-1]));
 console.log(name,{duration:rail.time.at(-1),metres:lengths.at(-1),minimumCruise:Math.min(...caps.slice(1,-1))});
}return data;}
module.exports={retime};
if(require.main===module){const file='dist/assets/arrival/garden-tour-rails.json';fs.writeFileSync(file,JSON.stringify(retime(JSON.parse(fs.readFileSync(file,'utf8')))));}
