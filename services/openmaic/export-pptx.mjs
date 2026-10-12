import fs from 'node:fs';
import pptxgen from 'pptxgenjs';
const course=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),pptx=new pptxgen();
pptx.layout='LAYOUT_WIDE';pptx.author='唐秋鸣';pptx.subject=course.goal;pptx.title=course.title;pptx.lang='zh-CN';
const text=value=>String(value||'').replace(/<\/(p|li|h[1-6])>/gi,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const color=(v,fallback='333333')=>/^#?[a-f\d]{6}$/i.test(v||'')?v.replace('#',''):fallback;
const factor=13.333333/1000;
for(const scene of course.scenes){
 const slide=pptx.addSlide();slide.background={color:'FAF7F2'};
 if(scene.type==='slide'){
  for(const e of scene.content.canvas?.elements||[]){
   const box={x:Math.max(0,Number(e.left)||0)*factor,y:Math.max(0,Number(e.top)||0)*factor,w:Math.max(1,Number(e.width)||100)*factor,h:Math.max(1,Number(e.height)||50)*factor,rotate:Number(e.rotate)||0};
   if(e.type==='text'){const sizes=[...String(e.content).matchAll(/font-size:\s*([\d.]+)px/g)].map(m=>Number(m[1]));slide.addText(text(e.content),{...box,fontFace:'Microsoft YaHei',fontSize:Math.max(10,(sizes[0]||22)*.72),color:color(e.defaultColor),margin:0,breakLine:false,valign:'top',fit:'shrink'});}
   else if(e.type==='shape')slide.addShape(pptx.ShapeType.rect,{...box,fill:{color:color(e.fill,'EEE8E0')},line:{color:color(e.outline?.color,e.fill?.replace?.('#','')||'EEE8E0'),transparency:100},radius:.1});
   else if(e.type==='image'&&String(e.src).startsWith('data:image/'))slide.addImage({...box,data:e.src});
  }
 }else{
  slide.addText(scene.title,{x:.6,y:.4,w:12,h:.6,fontSize:28,color:'824338'});
  const content=scene.content;
  const body=scene.type==='quiz'?(content.questions||[]).map(q=>q.question+'\n'+(q.options||[]).map(o=>o.value+'. '+o.label).join('\n')).join('\n\n'):scene.type==='pbl'?[content.projectV2?.title,content.projectV2?.description,content.projectV2?.learningObjective,...(content.projectV2?.milestones||[]).flatMap(m=>[m.title,m.briefing||m.description,...(m.microtasks||[]).map(t=>t.title+': '+(t.learnerBrief||t.description||''))])].filter(Boolean).join('\n\n'):'互动活动请在曲谱课堂中打开。';
  slide.addText(body,{x:.6,y:1.2,w:12,h:5.5,fontSize:18,fit:'shrink',valign:'top',color:'333333'});
 }
 slide.addNotes((scene.actions||[]).filter(a=>a.type==='speech').map(a=>a.text).join('\n'));
}
await pptx.writeFile({fileName:process.argv[3]});
