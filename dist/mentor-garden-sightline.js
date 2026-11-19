import * as T from './vendor/three/three.module.js';
// Fade only the foreground part of vegetation that covers the lecturer, without
// changing draw ordering or raycasting every instance on every animation frame.
export function createGardenSightline(root){
 const uniforms={active:{value:0},eye:{value:new T.Vector3()},target:{value:new T.Vector3()}},installed=new WeakSet();root.userData.gardenSightlineUniforms=uniforms;
 function install(object,garden){object.traverse(o=>{if(!o.isMesh)return;for(const material of [o.material].flat().filter(Boolean)){
  const id=Number(material.name.split('-').at(-1)),tree=/willow|leaf|tree/i.test(o.name)||(garden==='zhuozhengyuan'?id>=143&&id<=151:id===55||id===56);if(!tree||installed.has(material))continue;installed.add(material);
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material);material.onBeforeCompile=shader=>{compile.call(material,shader);shader.uniforms.lectureSightActive=uniforms.active;shader.uniforms.lectureEye=uniforms.eye;shader.uniforms.lectureTarget=uniforms.target;
   shader.vertexShader='varying vec3 lectureVegetationWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvec4 lecturePlant=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nlecturePlant=instanceMatrix*lecturePlant;\n#endif\nlectureVegetationWorld=(modelMatrix*lecturePlant).xyz;');
   shader.fragmentShader='uniform float lectureSightActive;uniform vec3 lectureEye;uniform vec3 lectureTarget;varying vec3 lectureVegetationWorld;\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(lectureSightActive>.5){vec3 corridor=lectureTarget-lectureEye;float along=dot(lectureVegetationWorld-lectureEye,corridor)/max(.001,dot(corridor,corridor));if(along>0.0&&along<.98){float gap=length(lectureVegetationWorld-(lectureEye+corridor*along));float radius=mix(.35,.88,clamp(along,0.0,1.0));float opacity=mix(.04,1.0,smoothstep(radius*.45,radius,gap));float pattern=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));if(pattern>opacity)discard;}}');
  };material.customProgramCacheKey=()=>key()+'-lecture-vegetation-sightline1';material.needsUpdate=true;material.userData.lectureSightline=true;
 }});}
 function update(actor,camera,active){uniforms.active.value=active?1:0;if(active){uniforms.eye.value.copy(camera.position);uniforms.target.value.set(actor.position.x,(actor.userData.siteFloor??actor.position.y)+1.15,actor.position.z);}}
 return {install,update,dispose(){uniforms.active.value=0;if(root.userData.gardenSightlineUniforms===uniforms)delete root.userData.gardenSightlineUniforms;}};
}
