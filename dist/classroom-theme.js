// Project-owned Soochow classroom template, shared by screen and PPTX export.
// This is not an official university-issued presentation template.
export const classroomPalette={paper:'#FCFAF7',red:'#922C32',ink:'#332B2A',line:'#DACBC4',muted:'#806D66'};
export function classroomTextColor(value){
 const match=/^#?([a-f\d]{6})$/i.exec(value||'');
 if(!match)return value;
 const [r,g,b]=[0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16));
 return b>r*1.25&&b>g*1.05?classroomPalette.red:value;
}
export function classroomGeometry(width=1000,height=562.5){
 const h=Math.max(562.5,height)+132,w=Math.max(width+112,h*16/9);
 return {width:w,height:h,bodyX:(w-width)/2,bodyY:88,contentWidth:width,contentHeight:height};
}
export function slideContentSize(elements=[]){
 let width=1000,height=562.5;
 for(const e of elements){width=Math.max(width,(Number(e.left)||0)+(Number(e.width)||0)+16);height=Math.max(height,(Number(e.top)||0)+(Number(e.height)||0)+16)}
 return {width,height};
}
