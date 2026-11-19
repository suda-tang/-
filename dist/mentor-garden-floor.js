import * as T from './vendor/three/three.module.js';

// Trim the complete low base, including its vertical edge and raised paving.
// A thin-slab-only filter misses the thick white plinth around the source model.
export function createGardenFloorTrim(root,signal){
 const loaded=new Map(),clones=new Map();let disposed=false;
 function prepare(name){if(loaded.has(name))return loaded.get(name);const task=(async()=>{
  const r=await fetch('/assets/arrival/'+name+'-outline.json?v=walk106',{signal});if(!r.ok)throw Error('园林边界 HTTP '+r.status);const meta=await r.json();
  const texture=await new T.TextureLoader().loadAsync('/assets/arrival/'+name+'-base-outline.png?v=walk110');
  const wallTexture=await new T.TextureLoader().loadAsync('/assets/arrival/'+name+'-wall-outline.png?v=walk116');
  texture.colorSpace=T.NoColorSpace;texture.flipY=false;texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;
  wallTexture.colorSpace=T.NoColorSpace;wallTexture.flipY=false;wallTexture.minFilter=wallTexture.magFilter=T.NearestFilter;wallTexture.generateMipmaps=false;
  if(disposed){texture.dispose();wallTexture.dispose();return null;}return {meta,texture,wallTexture};
 })().catch(error=>{loaded.delete(name);if(!disposed)root.userData.gardenFloorWarning=error.message;return null;});loaded.set(name,task);return task;}
 async function apply(object,name){const data=await prepare(name);if(!data||disposed)return;root.updateWorldMatrix(true,true);const {meta,texture,wallTexture}=data;
  object.traverse(o=>{if(!o.isMesh||!o.visible)return;const box=new T.Box3().setFromObject(o),size=box.getSize(new T.Vector3());
   if(box.min.y>meta.floor+4.5)return;
   const adopt=base=>{if(clones.has(base))return clones.get(base);const m=base.clone();m.userData.gardenShared=true;m.userData.gardenFloorTrim=true;
    const enclosure=!base.transparent&&!base.alphaTest;
    const origin={value:new T.Vector2(meta.origin[0]-meta.cell*.5,meta.origin[1]-meta.cell*.5)},extent={value:meta.cell*meta.size},rootPosition={value:root.position},height={value:meta.floor+.85},baseTop={value:meta.floor+(name==='zhuozhengyuan'?.305:.025)};
    m.onBeforeCompile=shader=>{shader.uniforms.gardenOutline={value:texture};shader.uniforms.gardenOrigin=origin;shader.uniforms.gardenExtent=extent;shader.uniforms.gardenRoot=rootPosition;shader.uniforms.gardenBaseHeight=height;shader.uniforms.gardenBaseTop=baseTop;
     shader.vertexShader='varying vec3 gardenWorld;\n'+shader.vertexShader;
     shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvec4 gardenVertex=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ngardenVertex=instanceMatrix*gardenVertex;\n#endif\ngardenWorld=(modelMatrix*gardenVertex).xyz;');
     shader.fragmentShader='uniform sampler2D gardenOutline;uniform vec2 gardenOrigin;uniform float gardenExtent;uniform vec3 gardenRoot;uniform float gardenBaseHeight;uniform float gardenBaseTop;varying vec3 gardenWorld;\n'+shader.fragmentShader;
     shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nvec2 gardenUV=(gardenWorld.xz-gardenRoot.xz-gardenOrigin)/gardenExtent;\nfloat gardenY=gardenWorld.y-gardenRoot.y;\nfloat gardenHorizontal=abs(normalize(cross(dFdx(gardenWorld),dFdy(gardenWorld))).y);\nbool gardenOutside=any(lessThan(gardenUV,vec2(0.0)))||any(greaterThan(gardenUV,vec2(1.0)))||texture2D(gardenOutline,gardenUV).r<0.5;\nif(gardenOutside&&gardenY<gardenBaseHeight&&(gardenY<gardenBaseTop||gardenHorizontal>.75))discard;');
    };
    const compile=m.onBeforeCompile;m.onBeforeCompile=shader=>{compile(shader);if(enclosure){shader.uniforms.gardenWallOutline={value:wallTexture};shader.fragmentShader='uniform sampler2D gardenWallOutline;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('if(gardenOutside&&gardenY<gardenBaseHeight',`if((gardenOutside||texture2D(gardenWallOutline,gardenUV).r<.5)&&gardenY>${meta.floor+.05}&&gardenY<${meta.floor+4.5})discard;\nif(gardenOutside&&gardenY<gardenBaseHeight`);}};
    m.customProgramCacheKey=()=> 'garden-open-perimeter-115-'+enclosure;m.userData.gardenEnclosureRemoved=enclosure;m.onBeforeRender=()=>rootPosition.value.copy(root.position);clones.set(base,m);return m;
   };
   o.material=Array.isArray(o.material)?o.material.map(adopt):adopt(o.material);o.userData.trimmedGardenPlinth=true;
  });
 }
 void prepare('yiyuan').catch(()=>{});void prepare('zhuozhengyuan').catch(()=>{});
 function dispose(){disposed=true;for(const m of clones.values())m.dispose();clones.clear();for(const promise of loaded.values())promise.then(data=>{data?.texture.dispose();data?.wallTexture.dispose();}).catch(()=>{});loaded.clear();}
 signal.addEventListener('abort',dispose,{once:true});return {apply,dispose};
}
