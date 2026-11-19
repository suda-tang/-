// A shared editorial composition for the browser and exported PowerPoint.
const escape=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const plain=html=>String(html||'').replace(/<\/(?:p|li|h[1-6])>/gi,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();
function excerpt(value,limit){const text=plain(value);if(text.length<=limit)return text;const sentences=text.match(/[^。！？；\n]+[。！？；]?/g)||[text];let out='';for(const sentence of sentences){if(out.length+sentence.length>limit&&out)break;out+=sentence;if(out.length>=limit)break;}if(out.length>limit){const words=out.slice(0,limit).replace(/[，,、：:][^，,、：:]*$/,'');out=(words||out.slice(0,limit))+'…';}return out;}
export function designClassroomSlide(canvas,options={}){
 if(!canvas?.elements)return canvas;
 const result={...canvas,elements:canvas.elements.map(e=>({...e}))};
 if(canvas.designVersion==='editorial-7')return result;
 const elements=result.elements,images=elements.filter(e=>e.type==='image'&&e.src),texts=elements.filter(e=>e.type==='text'&&plain(e.content||e.text)),charts=elements.filter(e=>['chart','table','latex'].includes(e.type));
 const title=texts.find(e=>Number(e.top||0)<110)||texts[0];
 if(!title)return result;
 const titleText=plain(title.content||title.text),body=texts.filter(e=>e!==title&&!e.id?.endsWith('-credit'));
 const kind=/比较|对比|复听/.test(options.title||titleText)?'comparison':/节奏|动机|旋律|谱|结构|声部/.test(options.title||titleText)?'evidence':/讨论|合作|创作|提问|总结|评价/.test(options.title||titleText)?'discussion':options.cover?'cover':'portrait';
 for(const e of elements)if(e.type==='shape'||e.type==='line')e.designDecoration=true;
 Object.assign(title,{left:36,top:12,width:928,height:82,fontSize:options.cover?54:42,defaultColor:'#922C32',rotate:0,fullContent:title.fullContent||title.content,content:'<p style="font-size: '+(options.cover?54:42)+'px; font-weight: 700; line-height: 1.18">'+escape(titleText)+'</p>'});
 const graphics=[...charts.slice(0,1),...images];const visualTop=112,visualHeight=kind==='evidence'||kind==='comparison'?246:390;
 const visualBand=(kind==='evidence'||kind==='comparison')&&graphics.length>0&&graphics.length<=2;
 const chosen=graphics.slice(0,4);for(const extra of graphics.slice(4))if(extra.id?.startsWith('teaching-evidence-'))extra.designDecoration=true;
 chosen.forEach((image,i)=>Object.assign(image,chosen.length>2?{left:550+(i%2)*214,top:112+Math.floor(i/2)*207,width:200,height:190}:visualBand?{left:36+i*480,top:316,width:chosen.length===1?928:448,height:224}:{left:550,top:visualTop+(chosen.length>1&&i?270:0),width:414,height:chosen.length>1?(i?120:250):390},{rotate:0,objectFit:'contain'}));
 const bodyX=36,bodyY=116,bodyWidth=graphics.length&&!visualBand?468:928,bodyHeight=visualBand?176:398;
 const columns=visualBand||(!graphics.length&&body.length>3)?2:1,gap=8,cellW=(bodyWidth-20*(columns-1))/columns;
 const seen=new Map(),duplicates=[],unique=[];
 for(const e of body){const value=plain(e.fullContent||e.content||e.text);if(seen.has(value)){duplicates.push([e,seen.get(value)]);continue;}seen.set(value,e);unique.push(e);}
 const units=text=>[...text].reduce((sum,c)=>sum+(/[\u2e80-\uffef]/u.test(c)?1:.55),0);
 const lineCount=text=>text.split('\n').filter(Boolean).reduce((sum,line)=>sum+Math.max(1,Math.ceil(units(line)/(cellW/22))),0)||1;
 const columnsData=Array.from({length:columns},()=>[]);
 const cut=Math.ceil(unique.length/columns);
 for(const [i,e]of unique.entries())columnsData[Math.min(columns-1,Math.floor(i/cut))].push(e);
 for(const [column,entries]of columnsData.entries()){
  const desired=entries.map(e=>lineCount(plain(e.fullContent||e.content||e.text))*30+6),total=desired.reduce((a,b)=>a+b,0),available=bodyHeight-gap*Math.max(0,entries.length-1);let y=bodyY;
  for(const [i,e]of entries.entries()){
   const original=e.fullContent||e.content||e.text||'',height=available*desired[i]/Math.max(1,total),lines=Math.max(1,Math.floor((height-2)/30)),limit=Math.max(8,(Math.floor(cellW/23)-1)*lines-1);e.fullContent=original;
   const value=lineCount(plain(original))*30<=height?plain(original):excerpt(plain(original).replace(/\n/g,' '),limit);
   const label=value.length<12&&!/[。！？]/.test(value);
   Object.assign(e,{left:bodyX+column*(cellW+20),top:y,width:cellW,height:Math.max(30,height),fontSize:22,defaultColor:label?'#922C32':'#332B2A',rotate:0,content:'<p style="font-size: 22px; line-height: 1.36; font-weight: '+(label?600:400)+'">'+escape(value).replace(/\n/g,'<br>')+'</p>'});y+=height+gap;
  }
 }
 for(const [duplicate,original]of duplicates)Object.assign(duplicate,{left:original.left,top:original.top,width:original.width,height:original.height,fontSize:22,fullContent:duplicate.fullContent||duplicate.content,content:'',aliasOf:original.id});
 result.elements=elements.filter(e=>!e.designDecoration&&!e.id?.endsWith('-credit'));
 // Full source text is preserved in each element and exported to speaker notes.
 result.designVersion='editorial-7';result.designKind=kind;result.width=1000;result.height=562.5;return result;
}
