import fs from 'node:fs';
import {modelCompletion} from './model-client.mjs';
import {resolveTeachingVisuals,placeTeachingImage,ensureIllustratedOutlines} from './classroom-visuals.mjs';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const emit=data=>process.stdout.write(JSON.stringify(data)+'\n');
try{
 const ai=(system,user)=>modelCompletion({url:process.env.CLASSROOM_MODEL_URL||'http://127.0.0.1:8765/v1/chat/completions',key:process.env.CLASSROOM_MODEL_KEY||'suda-local',model:process.env.CLASSROOM_MODEL||'suda-deepseek',messages:[{role:'system',content:system},{role:'user',content:user}]});
 emit({type:'progress',progress:10,message:'正在检查课件图片'});
 input.outlines=ensureIllustratedOutlines(input.outlines||[]);emit({type:'outline',outlines:input.outlines});
 for(const o of input.outlines.filter(o=>o.imageSupplement&&!input.scenes.some(s=>s.outlineId===o.id)))input.scenes.push({id:input.id+'-'+o.id,outlineId:o.id,stageId:input.id,type:'slide',title:o.title,order:input.scenes.length,imageSupplement:true,phase:'ready',content:{type:'slide',canvas:{elements:[{id:o.id+'-title',type:'text',top:12,left:36,width:928,height:82,content:'<p>'+o.title+'</p>'}]}},actions:[]});
 const visuals=await resolveTeachingVisuals(input.outlines||[],input,ai,emit);let added=0;
 for(const [i,scene]of input.scenes.entries()){
  const image=visuals.get(scene.outlineId)?.image;
  if(scene.content?.canvas&&image){placeTeachingImage(scene.content.canvas,image,visuals.get(scene.outlineId)?.additionalImages);scene.visualRevision=(scene.visualRevision||0)+1;added++;emit({type:'scene',scene});}
  emit({type:'progress',progress:70+29*(i+1)/input.scenes.length,message:'已检查 '+(i+1)+'/'+input.scenes.length+' 个环节，补入 '+added+' 幅图片'});
 }
 if(!added)throw Error('尚未取得可用图片；已有课件保持原样。'+[...visuals.values()].map(v=>v.error).filter(Boolean).join('；'));
 emit({type:'complete',progress:100,message:'已补入 '+added+' 幅课件图片'});
}catch(e){emit({type:'error',message:e.message});process.exitCode=1;}
