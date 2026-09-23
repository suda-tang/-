import {cleanText} from './library.js';
export function titleFromBlocks(data,width,height){
 const lines=(data?.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
 const metadata=/作词|作曲|编曲|制谱|制谱人|作者|演奏|演奏者|钢琴|改编|配器|扒谱|制作|出版社|版权|关注|公众号|谱例|伴奏|词[:：]|曲[:：]|music by|arranged by/i;
 const candidates=lines.map(line=>{const text=cleanText(line.text).replace(/\s+/g,' ').trim(),box=line.bbox||{};return {text,box,confidence:line.confidence??data?.confidence??50};}).filter(x=>x.text.length>=2&&x.text.length<=35&&x.confidence>=35&&!metadata.test(x.text)&&x.box.y1<height*.62);
 candidates.sort((a,b)=>{const score=x=>(x.box.y1<height*.42?2:0)+(x.box.y1-x.box.y0)/height*4-Math.abs((x.box.x0+x.box.x1)/2-width/2)/width;return score(b)-score(a);});
 const title=candidates[0]?.text||'';
 return {title,ocrTitle:title,source:'OCR',titleVersion:'6',candidates:candidates.slice(0,12).map(x=>({text:x.text,confidence:x.confidence,center:(x.box.x0+x.box.x1)/2/width,size:(x.box.y1-x.box.y0)/height})),ocrText:data?.text||''};
}
