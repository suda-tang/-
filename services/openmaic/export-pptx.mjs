import {designClassroomSlide} from '../../dist/classroom-slide-design.js';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import pptxgen from 'pptxgenjs';
import {classroomGeometry,slideContentSize,classroomTextColor} from '../../dist/classroom-theme.js';
const course=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),pptx=new pptxgen();
pptx.layout='LAYOUT_WIDE';pptx.author='唐秋鸣';pptx.subject=course.goal;pptx.title=course.title;pptx.lang='zh-CN';
const text=value=>String(value||'').replace(/<\/(p|li|h[1-6])>/gi,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const color=(v,fallback='333333')=>/^#?[a-f\d]{6}$/i.test(v||'')?v.replace('#',''):fallback;
const sealPath=fileURLToPath(new URL('../../dist/suda-seal.svg',import.meta.url));
const sourceScenes=course.scenes;
const projectNotes=p=>[p.title,p.description,p.learningObjective,...(p.milestones||[]).flatMap(m=>[m.title,m.briefing||m.description,...(m.microtasks||[]).flatMap(t=>[t.title,t.learnerBrief||t.description,t.completionCriteria||t.successWhen])])].filter(v=>typeof v==='string'&&v.trim()).join('\n\n');
const teachingPage=(source,title,blocks,table)=>({id:source.id+'-print-'+title,type:'slide',title,sourceNotes:source.type==='pbl'?projectNotes(source.content.projectV2||{}):source.type==='quiz'?(source.content.questions||[]).map(q=>'答案：'+JSON.stringify(q.answer)+'\n'+(q.analysis||'')).join('\n\n'):'',actions:source.actions||[],content:{canvas:{elements:[{id:source.id+'-title',type:'text',left:36,top:12,width:928,height:82,content:'<p>'+title.replace(/</g,'&lt;')+'</p>'},...blocks.filter(Boolean).map((value,i)=>({id:source.id+'-body-'+i,type:'text',left:36,top:120+i*90,width:460,height:85,content:'<p>'+String(value).replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</p>'})),...(table?.length?[{id:source.id+'-table',type:'table',left:550,top:120,width:414,height:390,data:table.map(row=>row.map(value=>({text:String(value||'')})))}]:[])]}}});
const exportScenes=[];
for(const scene of sourceScenes){
 if(scene.type==='slide'){exportScenes.push(scene);continue;}
 if(scene.type==='quiz'){
  for(const [n,q]of (scene.content.questions||[]).entries())exportScenes.push(teachingPage(scene,scene.title+' / '+(n+1),[q.question,q.analysis?'作答后，请说明你的判断依据。':'请结合刚才的聆听作答。'],(q.options||[]).map(o=>[o.value,o.label])));
 }else if(scene.type==='pbl'){
  const project=scene.content.projectV2||{},milestones=project.milestones||[];
  exportScenes.push(teachingPage(scene,scene.title,[project.title,project.description,project.learningObjective],milestones.slice(0,5).map((m,i)=>[String(i+1),m.title])));
  for(const milestone of milestones)exportScenes.push(teachingPage(scene,milestone.title,[milestone.briefing||milestone.description,...(milestone.microtasks||[]).slice(0,4).map(t=>t.title+'：'+(t.learnerBrief||t.description||''))],(milestone.microtasks||[]).slice(0,5).map((t,i)=>[String(i+1),t.title])));
 }else{
  const html=String(scene.content.html||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'');
  const labels=[...html.matchAll(/<(?:button|label|h[1-6])[^>]*>([\s\S]*?)<\/(?:button|label|h[1-6])>/gi)].map(m=>text(m[1]).trim()).filter(Boolean);
  const instructions=(scene.actions||[]).filter(a=>a.type==='speech').map(a=>a.text).slice(0,3);
  exportScenes.push(teachingPage(scene,scene.title,instructions,[...new Set(labels)].slice(0,6).map((value,i)=>[String(i+1),value])));
 }
}
course.scenes=exportScenes;
for(const [index,scene] of course.scenes.entries()){
 const designed=scene.type==='slide'?designClassroomSlide(scene.content.canvas,{title:scene.title,cover:index===0}):scene.content.canvas;
 const elements=designed?.elements||[],creditIds=new Set(elements.filter(e=>e.type==='image').map(e=>e.id+'-credit'));
 const visible=elements.filter(e=>!creditIds.has(e.id)),size=slideContentSize(visible),geometry=classroomGeometry(size.width,size.height),factor=13.333333/geometry.width;
 const slide=pptx.addSlide();slide.background={color:'FCFAF7'};
 slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333333,h:index===0?.10:.07,fill:{color:'922C32'},line:{transparency:100}});
 slide.addShape(pptx.ShapeType.rect,{x:0,y:7.34,w:index===0?13.333333:2.4,h:.16,fill:{color:'922C32'},line:{transparency:100}});
 slide.addShape(pptx.ShapeType.line,{x:.5,y:7.12,w:12.3,h:0,line:{color:'DACBC4',width:.6}});
 slide.addImage({path:sealPath,x:.5,y:.23,w:.48,h:.48,altText:'苏州大学校徽'});
 slide.addText('苏州大学',{x:1.12,y:.23,w:3,h:.30,fontFace:'SimSun',fontSize:19,bold:true,color:'922C32',margin:0});
 slide.addText('SOOCHOW UNIVERSITY',{x:1.12,y:.55,w:3,h:.15,fontFace:'Georgia',fontSize:6.5,charSpacing:1.2,color:'922C32',margin:0});
 slide.addImage({path:sealPath,x:9.5,y:4.1,w:4.1,h:4.1,transparency:96,altText:'苏州大学校徽背景'});
 slide.addText(String(index+1).padStart(2,'0')+' / '+String(course.scenes.length).padStart(2,'0'),{x:11.9,y:7.22,w:.9,h:.15,fontSize:8,color:'806D66',align:'right',margin:0});
 if(scene.type==='slide'){
  for(const e of visible){
   const box={x:(geometry.bodyX+Math.max(0,Number(e.left)||0))*factor,y:(geometry.bodyY+Math.max(0,Number(e.top)||0))*factor,w:Math.max(1,Number(e.width)||100)*factor,h:Math.max(1,Number(e.height)||50)*factor,rotate:Number(e.rotate)||0};
   if(e.type==='text'){const sizes=[...String(e.content).matchAll(/font-size:\s*([\d.]+)px/g)].map(m=>Number(m[1]));slide.addText(text(e.content),{...box,fontFace:'Microsoft YaHei',bold:/font-weight:\s*(?:bold|[6-9]00)/i.test(e.content||''),fontSize:Math.max(10,(sizes[0]||e.fontSize||23)*factor*72),color:color(classroomTextColor(e.defaultColor)),margin:0,breakLine:false,valign:'top',fit:'shrink'});}
   else if(e.type==='shape')slide.addShape(pptx.ShapeType.rect,{...box,fill:{color:color(e.fill,'EEE8E0')},line:{color:color(e.outline?.color,e.fill?.replace?.('#','')||'EEE8E0'),transparency:100},radius:.1});
   else if(e.type==='chart'){const labels=(e.data?.labels||[]).slice(0,20),series=(e.data?.series||[]).slice(0,6).map((values,i)=>({name:e.data?.legends?.[i]||'声部 '+(i+1),labels,values:labels.map((_,j)=>Number.isFinite(Number(values[j]))?Number(values[j]):0)}));const type={column:pptx.ChartType.bar,bar:pptx.ChartType.bar,line:pptx.ChartType.line,pie:pptx.ChartType.pie,ring:pptx.ChartType.doughnut,radar:pptx.ChartType.radar}[e.chartType]||pptx.ChartType.bar;if(series.length)slide.addChart(type,series,{...box,showLegend:series.length>1,showTitle:false,catAxisLabelFontSize:12,valAxisLabelFontSize:11,chartColors:['922C32','728A83','A47E4E','7676A4'],showBorder:false});}
   else if(e.type==='table'){const rows=(e.data||[]).map(row=>row.map(cell=>({text:text(cell.text||cell.content||''),options:{colSpan:Number(cell.colspan)||1,rowSpan:Number(cell.rowspan)||1}})));if(rows.length)slide.addTable(rows,{...box,fontFace:'Microsoft YaHei',fontSize:14,color:'332B2A',border:{type:'solid',pt:.6,color:'DACBC4'},fill:'FCFAF7',margin:.08});}
   else if(e.type==='latex')slide.addText(String(e.latex||''),{...box,fontFace:'Cambria Math',fontSize:20,color:'332B2A',fit:'shrink'});
   else if(e.type==='image'&&String(e.src).startsWith('data:image/')){const ratio=(Number(e.sourceWidth)||box.w)/(Number(e.sourceHeight)||box.h),w=Math.min(box.w,box.h*ratio),h=w/ratio;slide.addImage({...box,x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h,data:e.src});}
  }
 }else{
  slide.addText(scene.title,{x:.6,y:1.05,w:12,h:.6,fontSize:28,color:'922C32'});
  const content=scene.content;
  const body=scene.type==='quiz'?(content.questions||[]).map(q=>q.question+'\n'+(q.options||[]).map(o=>o.value+'. '+o.label).join('\n')).join('\n\n'):scene.type==='pbl'?[content.projectV2?.title,content.projectV2?.description,content.projectV2?.learningObjective,...(content.projectV2?.milestones||[]).flatMap(m=>[m.title,m.briefing||m.description,...(m.microtasks||[]).map(t=>t.title+': '+(t.learnerBrief||t.description||''))])].filter(Boolean).join('\n\n'):(scene.actions||[]).filter(a=>a.type==='speech').map(a=>a.text).slice(0,2).join('\n\n')||'互动活动请在曲谱课堂中打开。';
  slide.addText(body,{x:.6,y:1.85,w:12,h:5.1,fontSize:18,fit:'shrink',valign:'top',color:'333333'});
 }
 const credits=(scene.content?.canvas?.elements||[]).filter(e=>e.type==='image'&&e.credit).map(e=>e.credit+(e.sourceUrl?' '+e.sourceUrl:''));
 slide.addNotes((scene.sourceNotes||'')+'\n'+credits.join('\n')+'\n'+elements.filter(e=>e.fullContent).map(e=>text(e.fullContent)).join('\n\n')+'\n'+(scene.actions||[]).filter(a=>a.type==='speech').map(a=>a.text).join('\n'));
}
await pptx.writeFile({fileName:process.argv[3]});

