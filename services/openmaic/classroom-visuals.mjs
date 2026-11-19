// Actual embedded image assets, shared by browser presentation and PPTX export.
export function placeTeachingImage(content,asset,additionalImages=[]){
 if(!asset?.src)return content;
 const elements=(content.elements||[]).filter(e=>!e.id?.startsWith('teaching-evidence-'));let target=elements.find(e=>e.type==='image');
 if(!target){
  const placeholder=elements.find(e=>e.type==='text'&&/(?:图片占位|插图占位|此处.{0,8}(?:图片|照片)|\[(?:图片|插图)|image placeholder)/i.test(String(e.content)));
  if(placeholder){target=placeholder;target.type='image';delete target.content;}
 }
 if(!target){
  // Reserve a real image column; preserve existing IDs used by narration cues.
  for(const e of elements){if((Number(e.top)||0)<110)continue;const x=Number(e.left)||0,w=Number(e.width)||100;e.left=40+x*.46;e.width=Math.max(20,w*.46);if(e.type==='text'){e.content=String(e.content||'').replace(/font-size:\s*([\d.]+)px/g,(_,v)=>'font-size: '+Math.max(18,Number(v)*.85)+'px');}}
  target={id:'teaching-image-'+Math.random().toString(36).slice(2,10),type:'image',left:540,top:135,width:420,height:300,rotate:0};elements.push(target);
 }
 for(const key of ['sourceUrl','sourceWidth','sourceHeight','credit'])delete target[key];
 Object.assign(target,asset,{type:'image',objectFit:'contain',left:540,top:135,width:420,height:300,rotate:0});
 const oldCredit=elements.find(e=>e.id===target.id+'-credit');if(oldCredit)elements.splice(elements.indexOf(oldCredit),1);
 for(const [index,image]of additionalImages.slice(0,3).entries()){const id='teaching-evidence-'+index;let secondary=elements.find(e=>e.id===id);if(!secondary){secondary={id};elements.push(secondary);}Object.assign(secondary,image,{type:'image',left:540,top:345,width:420,height:180,rotate:0});}
 delete content.designVersion;content.elements=elements;return content;
}
export function ensureIllustratedOutlines(outlines){const result=[...outlines],slides=result.filter(o=>o.type==='slide');if(!slides.length)return result;for(let i=slides.length;i<7;i++){const original=slides[i%slides.length];result.push({id:'image-observation-'+i,type:'slide',order:result.length,title:original.title+'：图像观察',description:'结合本环节涉及的真实人物、乐器与音乐图像进行观察，不把历史图像说成当前作品的创作现场。',keyPoints:original.keyPoints||[],imageSupplement:true});}return result;}
export function fallbackVisualPlans(outlines,input){
 const hasNotes=(input.evidence?.notes||[]).some(n=>n.pitch&&!n.rest);
 return outlines.filter(o=>o.type==='slide').flatMap((o,i)=>{
  const text=[o.title,o.description,...(o.keyPoints||[])].join(' ');
  if(/讨论|总结|评价|作业|反思|合作|创作/.test(o.title||''))return [{outlineId:o.id,kind:'activity',steps:(o.keyPoints||[]).slice(0,3)}];
  if(!hasNotes)return /钢琴|键盘/.test(text)?[{outlineId:o.id,kind:'keyboard'}]:[];
  const ranges=[...text.matchAll(/第?(\d+)\s*(?:到|至|—|–|-)\s*(\d+)小节/g)].map(m=>[Number(m[1]),Number(m[2])]);if(/比较|对比|复听/.test(o.title||'')&&ranges.length>1)return [{outlineId:o.id,kind:'comparison',measureRanges:ranges.slice(0,2)}];
  return [{outlineId:o.id,kind:/节奏|节拍|时值|律动/.test(text)?'rhythm':/声部|织体|合奏|伴奏|配器/.test(text)?'parts':/键盘|指法|钢琴结构/.test(text)?'keyboard':i%3===1?'rhythm':i%3===2?'parts':'contour'}];
 });
}
export function webVisualPlans(outlines,input){
 const slides=outlines.filter(o=>o.type==='slide');
 const source=[input.title,...slides.map(o=>[o.title,o.description,...(o.keyPoints||[])].join(' '))].join(' ');
 const composers=[[/塔雷加|Tárrega|Tarrega/i,'Francisco Tarrega portrait'],[/勃拉姆斯|Brahms/i,'Johannes Brahms portrait'],[/贝多芬|Beethoven/i,'Ludwig van Beethoven portrait'],[/莫扎特|Mozart/i,'Wolfgang Amadeus Mozart portrait'],[/肖邦|Chopin/i,'Frederic Chopin portrait'],[/巴赫|\bBach\b/i,'Johann Sebastian Bach portrait'],[/德沃夏克|Dvorak|Dvořák/i,'Antonin Dvorak portrait'],[/帕格尼尼|Paganini/i,'Niccolo Paganini portrait'],[/埃尔加|Elgar/i,'Edward Elgar portrait'],[/舒伯特|Schubert/i,'Franz Schubert portrait'],[/舒曼|Schumann/i,'Robert Schumann portrait'],[/李斯特|Liszt/i,'Franz Liszt portrait'],[/柴可夫斯基|Tchaikovsky/i,'Pyotr Ilyich Tchaikovsky portrait'],[/德彪西|Debussy/i,'Claude Debussy portrait'],[/拉威尔|Ravel/i,'Maurice Ravel portrait'],[/海顿|Haydn/i,'Joseph Haydn portrait'],[/亨德尔|Handel/i,'George Frideric Handel portrait'],[/维瓦尔第|Vivaldi/i,'Antonio Vivaldi portrait'],[/门德尔松|Mendelssohn/i,'Felix Mendelssohn portrait'],[/格里格|Grieg/i,'Edvard Grieg portrait'],[/古诺|Gounod/i,'Charles Gounod portrait'],[/圣桑|Saint.Saens/i,'Camille Saint Saens portrait']];
 const plans=[];
 const preferred=slides.filter(o=>!/测验|作业|评价|总结|反思/.test(o.title||''));const suitable=preferred.length?preferred:slides;
 const portrait=suitable.find(o=>/作曲|作者|文化背景/.test(o.title||''))||suitable.find(o=>/认识|导入/.test([o.title,o.description].join(' ')))||suitable[0];
 const composer=composers.find(([pattern])=>pattern.test(source));
 if(portrait&&composer)plans.push({outlineId:portrait.id,kind:'photo',query:composer[1]});
 const parts=(input.evidence?.parts||[]).map(p=>p.name||'').join(' ');
 const instruments=[[/钢琴|piano/i,'grand piano keyboard',/键盘|钢琴|伴奏/],[/吉他|guitar/i,'classical guitar',/吉他|前奏|导入|伴奏|声部/],[/鼓|drum/i,'drum kit',/节奏|鼓|律动|力度/],[/弦乐|小提琴|violin|string/i,'violin instrument',/弦乐|织体|合奏|声部/],[/贝斯|bass/i,'electric bass guitar',/贝斯|低音|节奏/],[/长笛|flute/i,'concert flute',/长笛|音色|声部/]];
 for(const [known,query,topic]of instruments){if(!known.test(parts))continue;const available=suitable.filter(o=>!plans.some(p=>p.outlineId===o.id));const slide=available.find(o=>topic.test([o.title,o.description,...(o.keyPoints||[])].join(' ')))||available[0];if(slide)plans.push({outlineId:slide.id,kind:'photo',query});if(plans.length>=3)break;}
 if(!plans.length&&suitable.length){
  // A verified instrument is safer than inventing a composer or depicting a song's assumed mood.
  const text=[parts,source].join(' ');const topic=/合唱|演唱|人声|vocal|choir/i.test(text)?'choir singing':/管弦|orchestra/i.test(text)?'symphony orchestra':/小提琴|violin/i.test(text)?'violin instrument':/钢琴|piano/i.test(text)?'grand piano':'sheet music musical notation';
  plans.push({outlineId:suitable[0].id,kind:'photo',query:topic});
 }
 return plans;
}
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function resolveTeachingVisuals(outlines,input,ai,emit=()=>{},{localOnly=false}={}){
 const slides=outlines.filter(o=>o.type==='slide');if(!slides.length)return new Map();
 emit({type:'progress',transport:true,message:'正在为课件选择图片与谱面图示'});
 let plans=[];
 try{
  const raw=input.imagesOnly?'{}':await ai('只输出JSON对象 {"images":[{"outlineId":"真实环节id","kind":"photo|upload|keyboard|contour","query":"精确英文图片检索词","materialId":"上传图片ID"}]}。为需要图片的音乐课件安排真实素材，每个环节最多一幅。作曲家介绍可选photo肖像；乐器结构用keyboard或photo；需要观察旋律走向时用contour（根据原谱音高绘图，不是曲式分析）；已有上传图片优先选upload。不要给纯讨论、测验页硬塞图片。不可捏造作曲者，query只检索课堂确实涉及的人物或物体；不要要求用景物图片替代尚未验证的作品情感。不要输出图片描述代替图片。',JSON.stringify({title:input.title,goal:input.goal,outlines:slides,materials:(input.materials||[]).filter(m=>/\.(jpg|jpeg|png|webp)$/i.test(m.name)).map(m=>({id:m.id,name:m.name})),hasNotes:!!input.evidence?.notes?.length}));
  const parsed=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));plans=(parsed.images||[]).filter(p=>slides.some(o=>o.id===p.outlineId)&&['photo','upload','keyboard','contour','rhythm','parts','activity','comparison'].includes(p.kind)).slice(0,12);
 }catch(error){emit({type:'progress',transport:true,message:'联网插图计划未完成，正在绘制原谱图解'})}
 const fallback=fallbackVisualPlans(outlines,input);
 const verifiedPhotos=webVisualPlans(outlines,input);
 plans=plans.filter(plan=>plan.kind!=='photo'||verifiedPhotos.some(known=>known.query===plan.query));
 for(const plan of (localOnly?[]:verifiedPhotos)){const at=plans.findIndex(p=>p.outlineId===plan.outlineId);if(at<0)plans.push(plan);else if(plans[at].kind!=='upload')plans[at]=plan;}
 for(const plan of fallback)if(!plans.some(p=>p.outlineId===plan.outlineId))plans.push(plan);
 for(const plan of plans){const outline=outlines.find(o=>o.id===plan.outlineId);const text=[outline?.title,outline?.description,...(outline?.keyPoints||[])].join(' ');const range=text.match(/第?(\d+)\s*(?:到|至|—|–|-)\s*(\d+)小节/);if(range)plan.measureRange=[Number(range[1]),Number(range[2])];}
 if(!localOnly){const supplements=plans.filter(p=>p.kind==='photo').flatMap(p=>{const diagram=fallback.find(f=>f.outlineId===p.outlineId);return diagram?[{...diagram,outlineId:p.outlineId+'::evidence'}]:[]});plans.push(...supplements);}
 if(!plans.length)return new Map();
 const script=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../scripts/classroom-images.py');
 const python=process.env.CLASSROOM_PYTHON||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'Programs/Python/Python312/python.exe'):'python3');
 const results=await new Promise((resolve,reject)=>{const p=spawn(python,[script],{windowsHide:true});let output='',error='';const timeout=setTimeout(()=>{p.kill();reject(Error('课件图片检索超时'))},180000);p.stdout.on('data',d=>{output+=d;if(output.length>32000000){p.kill();reject(Error('课件图片数据过大'))}});p.stderr.on('data',d=>{error=(error+d).slice(-1500);for(const match of String(d).matchAll(/IMAGE_PROGRESS (\d+)\/(\d+)/g))emit({type:'progress',transport:true,message:'联网插图已取得 '+match[1]+'/'+match[2]+' 张'});});p.on('error',e=>{clearTimeout(timeout);reject(e)});p.on('close',code=>{clearTimeout(timeout);try{if(code)throw Error(error||'图片处理失败');resolve(JSON.parse(output))}catch(e){reject(e)}});p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify({...input,plans,...(!localOnly?{galleryQueries:[...new Set([...verifiedPhotos.map(p=>p.query),...(verifiedPhotos.some(p=>/piano/.test(p.query))?['pianist','sheet music musical notation']:[])])],gallerySlideIds:slides.map(s=>s.id),galleryMinimum:20}:{})}));});
 for(const result of results.filter(r=>r.outlineId.includes('::evidence'))){const primary=results.find(r=>r.outlineId===result.outlineId.split('::')[0]);if(primary&&result.image)primary.additionalImages=[result.image];}
 const failed=results.filter(r=>!r.image&&['photo','upload'].includes(plans.find(p=>p.outlineId===r.outlineId)?.kind)&&fallback.some(p=>p.outlineId===r.outlineId));
 if(failed.length){for(const r of failed)emit({type:'progress',transport:true,message:'联网插图未取得：'+r.error});const local=await resolveTeachingVisuals(outlines.filter(o=>failed.some(r=>r.outlineId===o.id)),input,async()=>'{"images":[]}',emit,{localOnly:true});for(const r of failed){const replacement=local.get(r.outlineId);if(replacement?.image)Object.assign(r,replacement);}}
 const seenWeb=new Set(results.filter(r=>!r.outlineId.includes('::')&&r.image?.sourceUrl).flatMap(r=>[r.image.sourceUrl,...(r.additionalImages||[]).map(a=>a.sourceUrl).filter(Boolean)]));
 for(const extra of results.filter(r=>r.outlineId.includes('::web-')&&r.image)){if(seenWeb.has(extra.image.sourceUrl))continue;const targets=results.filter(r=>!r.outlineId.includes('::')&&r.image&&slides.some(s=>s.id===r.outlineId)).sort((a,b)=>(a.additionalImages?.length||0)-(b.additionalImages?.length||0));const target=targets.find(r=>(r.additionalImages?.length||0)<3);if(target){(target.additionalImages||=[]).push(extra.image);seenWeb.add(extra.image.sourceUrl);}}
 for(const r of results)emit({type:'progress',transport:true,message:r.image?'课件插图已准备：'+r.image.alt:'图片尚未取得：'+r.error});
 emit({type:'visual-report',version:seenWeb.size>=20?'rich-20-web':'rich-20-incomplete',webImageCount:seenWeb.size,visuals:results.map(r=>({outlineId:r.outlineId,kind:r.image?.sourceUrl?'web':r.image?'diagram':'missing',sourceUrl:r.image?.sourceUrl||'',credit:r.image?.credit||'',alt:r.image?.alt||'',error:r.error||''}))});
 return new Map(results.filter(r=>!r.outlineId.includes('::')).map(r=>[r.outlineId,r]));
}
