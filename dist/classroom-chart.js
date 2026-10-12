// Small native SVG charts: no charting runtime or animation loop per slide.
export function classroomChart(element){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 340');svg.setAttribute('role','img');svg.setAttribute('aria-label',element.chartType||'课堂图表');
 const node=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));if(text!=null)n.textContent=String(text);svg.append(n);return n};
 const data=element.data||{},labels=(data.labels||[]).slice(0,20),series=(data.series||[]).slice(0,6).map(s=>labels.map((_,i)=>Number.isFinite(Number(s[i]))?Number(s[i]):0)),type=element.chartType||'column';
 const palette=['#874357','#728a83','#a47e4e','#7676a4','#b86d63','#4d899b'],color=i=>/^#[\da-f]{3,8}$/i.test(element.themeColors?.[i]||'')?element.themeColors[i]:palette[i%palette.length],max=Math.max(1,...series.flat().map(Math.abs));
 if(type==='pie'||type==='ring'){
  const values=series[0]||[],total=values.reduce((sum,x)=>sum+Math.max(0,x),0)||1;let angle=-Math.PI/2;
  values.forEach((value,i)=>{const sweep=Math.max(0,value)/total*Math.PI*2,end=angle+sweep;if(sweep>=Math.PI*2-.001)node('circle',{cx:225,cy:160,r:130,fill:color(i)});else if(sweep>0)node('path',{d:`M225 160 L${225+130*Math.cos(angle)} ${160+130*Math.sin(angle)} A130 130 0 ${sweep>Math.PI?1:0} 1 ${225+130*Math.cos(end)} ${160+130*Math.sin(end)} Z`,fill:color(i)});angle=end;node('text',{x:390,y:35+i*24,fill:color(i),'font-size':16},labels[i])});if(type==='ring')node('circle',{cx:225,cy:160,r:78,fill:'#fffcf6'});
 }else if(type==='radar'){
  const count=labels.length,point=(i,r)=>[300+Math.sin(i*2*Math.PI/count)*r,160-Math.cos(i*2*Math.PI/count)*r];
  labels.forEach((label,i)=>{const [x,y]=point(i,130);node('line',{x1:300,y1:160,x2:x,y2:y,stroke:'#8885'});const [tx,ty]=point(i,150);node('text',{x:tx,y:ty,'text-anchor':'middle','font-size':14},label)});series.forEach((values,i)=>node('polygon',{points:values.map((v,j)=>point(j,Math.abs(v)/max*130).join(',')).join(' '),fill:color(i)+'30',stroke:color(i),'stroke-width':3}));
 }else if(type==='bar'){
  labels.forEach((label,i)=>{const y=20+i*280/Math.max(1,labels.length);node('text',{x:8,y:y+16,'font-size':14},label);series.forEach((s,j)=>node('rect',{x:130,y:y+j*12,width:Math.max(0,s[i])/max*430,height:Math.max(3,Math.min(11,250/Math.max(1,labels.length*series.length))),fill:color(j)}))});
 }else{
  const x=i=>50+i*510/Math.max(1,labels.length-1),y=v=>285-v/max*240;node('line',{x1:45,y1:285,x2:575,y2:285,stroke:'#8888'});labels.forEach((label,i)=>node('text',{x:x(i),y:310,'text-anchor':'middle','font-size':13},label));
  series.forEach((values,j)=>{if(['line','area'].includes(type)){const points=values.map((v,i)=>`${x(i)},${y(v)}`).join(' ');if(type==='area')node('polygon',{points:`${x(0)},285 ${points} ${x(values.length-1)},285`,fill:color(j)+'30'});node('polyline',{points,fill:'none',stroke:color(j),'stroke-width':3})}values.forEach((v,i)=>type==='column'||!['line','area','scatter'].includes(type)?node('rect',{x:x(i)-10+j*14,y:y(v),width:12,height:Math.max(0,285-y(v)),fill:color(j)}):node('circle',{cx:x(i),cy:y(v),r:4,fill:color(j)}));});
 }
 return svg;
}
