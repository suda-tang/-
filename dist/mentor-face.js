import * as THREE from './vendor/three/three.module.js';

let identity;
export async function personalizeMentorFace(model) {
 identity ||= fetch('/narration/models/mentor-identity.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Face fit unavailable');return r.json();}).catch(e=>{identity=null;throw e;});
 const data=await identity;
 const texture=await new THREE.TextureLoader().loadAsync(data.texture);
 // Fitting stores standard UVs (v=1-imageY). This PNG is not a glTF texture:
 // preserve TextureLoader's vertical upload flip, otherwise the face is upside down.
 // Custom uniforms do not get map-specific colour decoding. Decode explicitly
 // after scene tone mapping so the photographed skin is not brightened twice.
 texture.colorSpace=THREE.NoColorSpace;texture.flipY=true;
 const fits=new Map(data.meshes.map(m=>[m.name,m]));let fitted=0;
 model.traverse(object=>{
  const fit=fits.get(object.name);if(!fit||!object.isMesh)return;
  const geometry=object.geometry,position=geometry.attributes.position;
  if(position.array.length!==fit.delta.length)throw Error('Face topology does not match');
  for(let i=0;i<position.array.length;i++)position.array[i]+=fit.delta[i];
  position.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  if(/eyebrow|eyelash/i.test(object.name)){object.visible=false;return;}
  if(!fit.mask.some(value=>value>.01))return;
  geometry.setAttribute('mentorUV',new THREE.Float32BufferAttribute(fit.uv,2));
  geometry.setAttribute('mentorMask',new THREE.Float32BufferAttribute(fit.mask,1));
  const original=object.material,material=original.clone();original.dispose();
  material.onBeforeCompile=shader=>{
   shader.uniforms.mentorSkin={value:texture};
   shader.vertexShader='attribute vec2 mentorUV; attribute float mentorMask; varying vec2 vMentorUV; varying float vMentorMask;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMentorUV=mentorUV; vMentorMask=mentorMask;');
   shader.fragmentShader='uniform sampler2D mentorSkin; varying vec2 vMentorUV; varying float vMentorMask;\n'+shader.fragmentShader;
   // The UVs follow the fitted 3D surface and its skinning; no camera-facing photo plane.
   // Reference skin already contains illumination. Adding the studio lights again
   // washes it out and creates a pale mask; preserve the reference colour instead.
   shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','gl_FragColor.rgb=mix(gl_FragColor.rgb,sRGBTransferEOTF(texture2D(mentorSkin,vMentorUV)).rgb,clamp(vMentorMask,0.0,1.0));\n#include <colorspace_fragment>');
  };
  material.customProgramCacheKey=()=> 'mentor-personalized-face-v3';
  material.userData.mentorSkin=texture;object.material=material;fitted++;
 });
 if(!fitted){texture.dispose();throw Error('No face mesh was fitted');}
 return {report:data.report,texture};
}
