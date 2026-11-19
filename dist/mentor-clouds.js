import * as T from './vendor/three/three.module.js';
// Low-resolution volume integration, then bilinear compositing. No opaque DOM mask.
export function createAtmosphericClouds(){
 const camera=new T.OrthographicCamera(-1,1,1,-1,0,1),geometry=new T.PlaneGeometry(2,2),volumeScene=new T.Scene(),compositeScene=new T.Scene();
 const uniforms={uTime:{value:0},uAspect:{value:1},uAmount:{value:0}};
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,vertexShader:`varying vec2 uvCloud;void main(){uvCloud=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,fragmentShader:`
 precision highp float;varying vec2 uvCloud;uniform float uTime,uAspect,uAmount;
 float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
 float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 float field(vec3 p){return .57*noise(p)+.28*noise(p*2.03)+.15*noise(p*4.01);}
 void main(){vec2 uv=(uvCloud-.5)*vec2(uAspect,1.)*3.;vec3 origin=vec3(uv,-2.5);vec3 ray=normalize(vec3(uv*.25,1.));vec3 wind=vec3(uTime*.16,uTime*.035,uTime*.4);float alpha=0.;vec3 light=vec3(0.);
 for(int i=0;i<12;i++){vec3 p=origin+ray*(float(i)*.55)+wind;float n=field(p*.85);float density=max(0.,n-.48)*8.0*uAmount*exp(-pow((float(i)-5.5)/4.0,2.0));float shade=clamp(.72+(n-field(p*.85+vec3(.3,.8,-.2)))*1.6,.48,1.);vec3 colour=mix(vec3(.54,.64,.72),vec3(1.,.99,.96),shade);float a=(1.-exp(-density*.7))*(1.-alpha);light+=a*colour;alpha+=a;if(alpha>.99)break;}
 gl_FragColor=vec4(light/max(alpha,.0001),alpha*uAmount);
 }`});
 volumeScene.add(new T.Mesh(geometry,material));let target=null,disposed=false,last=-100,w=0,h=0;
 const compositeMaterial=new T.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false});compositeScene.add(new T.Mesh(geometry,compositeMaterial));
 return {render(renderer,amount,time){if(disposed||amount<.002)return;const size=renderer.getSize(new T.Vector2()),scale=Math.min(.35,360/Math.max(size.x,size.y)),nw=Math.max(1,Math.round(size.x*scale)),nh=Math.max(1,Math.round(size.y*scale));
  if(!target){target=new T.WebGLRenderTarget(nw,nh,{depthBuffer:false,stencilBuffer:false,minFilter:T.LinearFilter,magFilter:T.LinearFilter});compositeMaterial.map=target.texture;compositeMaterial.needsUpdate=true;w=nw;h=nh;}else if(w!==nw||h!==nh){target.setSize(nw,nh);w=nw;h=nh;}
  const previousTarget=renderer.getRenderTarget(),auto=renderer.autoClear,colour=renderer.getClearColor(new T.Color()),clearAlpha=renderer.getClearAlpha();
  if(time-last>1/30||Math.abs(uniforms.uAmount.value-amount)>.02){uniforms.uTime.value=time;uniforms.uAspect.value=size.x/size.y;uniforms.uAmount.value=amount;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.autoClear=true;renderer.render(volumeScene,camera);last=time;}
  renderer.setRenderTarget(previousTarget);renderer.autoClear=false;renderer.render(compositeScene,camera);renderer.autoClear=auto;renderer.setClearColor(colour,clearAlpha);
 },dispose(){if(disposed)return;disposed=true;target?.dispose();geometry.dispose();material.dispose();compositeMaterial.dispose();}};
}
