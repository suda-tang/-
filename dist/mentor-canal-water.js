import * as T from './vendor/three/three.module.js';

export function createCanalWater(){
 const clock={value:0},material=new T.MeshStandardMaterial({color:0x577c70,roughness:.3,metalness:.12});
 material.onBeforeCompile=shader=>{
  shader.uniforms.canalTime=clock;
  shader.vertexShader='varying vec2 canalPosition;\n'+shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
   vec4 canalLocal=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
   canalLocal=instanceMatrix*canalLocal;
   #endif
   canalPosition=(modelMatrix*canalLocal).xz;`);
  shader.fragmentShader='varying vec2 canalPosition;uniform float canalTime;\n'+shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
   float rippleA=sin(canalPosition.x*7.0+canalPosition.y*2.3+canalTime*.7);
   float rippleB=cos(canalPosition.y*9.0-canalPosition.x*1.7-canalTime*.55);
   normal=normalize(normal+vec3(rippleA*.032,rippleB*.018,(rippleA+rippleB)*.023));`);
 };
 material.customProgramCacheKey=()=> 'calm-canal-water-v1';
 return {material,update(now){clock.value=now*.001;}};
}
