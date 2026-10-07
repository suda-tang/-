// Classroom illustrations drawn locally; all timing follows the recorded speech.
export function paintLesson(ctx,state,tr=t=>t){
 const writing=true,ink=writing?'#f2ead4':'#304840',accent=writing?'#ebca82':'#9c4c37',muted=writing?'#91b9aa':'#738d80';
 const p=Math.max(0,Math.min(1,state.lessonPosition||0)),time=state.elapsed||0,topic=state.topic||'mentor-preface';
 const smooth=n=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n);};
 function text(value,x,y,size=32,color=ink,max=610){ctx.fillStyle=color;ctx.font=`${size}px "Mentor Hand", serif`;ctx.fillText(tr(value),x,y,max);}
 function path(points,reveal=1,color=muted,width=2){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';const length=points.slice(1).reduce((sum,point,i)=>sum+Math.hypot(point[0]-points[i][0],point[1]-points[i][1]),0);ctx.setLineDash([length*Math.max(.001,reveal),length+2]);ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([]);}
 function reveal(start,fn){const amount=smooth((p-start)/.10);if(!amount)return;ctx.save();ctx.globalAlpha=amount;ctx.translate(0,(1-amount)*12);fn(amount);ctx.restore();}
 function paper(x,y,w,h){ctx.fillStyle=writing?'#ffffff0a':'#ffffffa8';ctx.strokeStyle=muted;ctx.lineWidth=1.6;ctx.beginPath();ctx.roundRect(x,y,w,h,8);ctx.fill();ctx.stroke();}
 function piano(x,y,w=170){paper(x,y,w,58);for(let i=1;i<10;i++)path([[x+w*i/10,y],[x+w*i/10,y+58]],1,muted,1);for(const i of [1,2,4,5,6,8,9]){ctx.fillStyle=ink;ctx.fillRect(x+w*i/10-5,y,10,32);} }
 function note(x,y,stem=true,color=ink){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,8,5,-.4,0,Math.PI*2);ctx.fill();if(stem)path([[x+7,y],[x+7,y-33]],1,color,2);}
 function staff(x,y,w,variant=0){for(let row=0;row<2;row++){const sy=y+row*80;for(let i=0;i<5;i++)path([[x,sy+i*9],[x+w,sy+i*9]],1,muted,1.3);text(row?'左手':'右手',x-4,sy-13,23,muted);for(let i=0;i<5;i++)note(x+36+i*(w-58)/5,sy+18+((i+variant+row)%3-1)*9);path([[x+w,sy],[x+w,sy+36]],1,ink,2);} }
 function pulse(x,y,r,color=accent){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
 function arrow(x,y,endX,endY,amount=1){path([[x,y],[endX,endY]],amount,accent,2.5);if(amount>.95){const a=Math.atan2(endY-y,endX-x);path([[endX-10*Math.cos(a-.45),endY-10*Math.sin(a-.45)],[endX,endY],[endX-10*Math.cos(a+.45),endY-10*Math.sin(a+.45)]],1,accent,2.5);} }
 ctx.save();ctx.textAlign='left';
 const titles={'mentor-preface':'此课题之前的故事','mentor-context':'唐秋鸣研究时候发现的难点','mentor-material':'实现这个课题的技术细节'};
 text(titles[topic]||state.title,340,95,41);path([[342,118],[956,118]],smooth(p/.12),muted);
 if(topic==='mentor-preface'){
  if(p<.48){
   reveal(0,()=>{piano(360,192);text('一间琴房',360,285,30);piano(755,327);text('另一间琴房',735,426,30);});
   reveal(.13,amount=>{path([[545,220],[646,220],[646,358],[730,358]],amount,accent,3);text('声音传过来',570,177,30,accent);});
   reveal(.24,()=>{const travel=(time*.12)%1*323;const x=travel<101?545+travel:travel<239?646:646+travel-239,y=travel<101?220:travel<239?220+travel-101:358;ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();text('还得听着对方往下走',350,520,34);});
  }else{
   text('同一条时间线',350,178,34,accent);for(const [row,label]of [[0,'这边'],[1,'那边']]){const y=270+row*115;text(label,350,y,30);path([[435,y],[950,y]],1,muted,2);for(let i=0;i<5;i++){const x=470+i*96+(row?24*(1-smooth((p-.50)/.22)):0);note(x,y);}}
   const cursor=470+(time%4)/4*384;path([[cursor,239],[cursor,414]],1,accent,2);pulse(cursor,270,11,accent);
   reveal(.52,()=>{for(let i=0;i<5;i++)path([[470+i*96,251],[470+i*96,406]],smooth((p-.52)/.22),'#cbb977',1);text('合上的不只是音符，还有呼吸',350,515,32);});
  }
 }else if(topic==='mentor-context'){
  reveal(0,()=>{piano(360,173,175);text('异地排练',360,269,31);paper(717,163,218,111);for(let i=0;i<4;i++)path([[735,188+i*17],[916,188+i*17]],1,muted,1);text('钢琴学习',726,319,31);});
  reveal(.12,amount=>{arrow(555,220,694,220,amount);text('演奏体验',546,165,29,accent);});
  reveal(.30,()=>{path([[350,355],[950,355]],1,muted);text('可以先试：看谱、试听、练习',350,412,32);});
  reveal(.57,()=>{text('还要问：学生真的学会了吗？',350,490,32,accent);path([[349,507],[929,507]],smooth((p-.57)/.18),accent,2);});
  reveal(.64,()=>text('请把它当作一次研究过程的介绍',350,572,28,muted));
 }else{
  if(p<.42){
   reveal(0,()=>{paper(357,174,153,205);staff(375,215,116);text('电子文件',355,428,29);});
   reveal(.10,()=>{paper(575,159,124,229);paper(586,186,103,164);path([[593,221],[680,210],[674,315],[600,326],[593,221]],1,accent);text('手机照片',550,428,29);});
   reveal(.20,()=>{paper(756,220,170,128);for(let i=0;i<24;i++){const x=765+i*6,h=12+28*Math.abs(Math.sin(i*1.1+time*.6));path([[x,284-h],[x,284+h]],1,ink,2);}text('一段录音',753,428,29);});
   reveal(.28,()=>text('材料不同，先把页序和内容理清',350,531,31,accent));
  }else{
   text('原稿',358,170,31);text('识别后的谱',683,170,31);staff(357,216,241);staff(682,216,241,1);
   reveal(.45,()=>{arrow(614,271,655,271);text('回头核对',568,424,29,accent);});
   reveal(.56,()=>{const a=smooth((p-.56)/.1);pulse(725,234,26*a);text('拍号、左右手、时值',350,496,32,accent);});
   reveal(.66,()=>text('显示出来了，不等于读对了',350,568,32));
  }
 }
 // Moving chalk tip follows the currently revealed annotation, without flashing.
 if(writing&&state.speaking){ctx.fillStyle=accent;ctx.beginPath();ctx.arc(344+Math.min(606,p*650),120,3,0,Math.PI*2);ctx.fill();}
 ctx.restore();
}
