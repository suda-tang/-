const chapters={
 'mentor-preface':['课题起点','课堂上的问题怎样成为可执行操作','教学现场','听清内声部，重听局部，比较不同处理。','开发过程','从一次试听，到谱面、声音和课堂的联动。'],
 'mentor-context':['音乐材料的统一表征','原稿可以核对，声音可以定位','保留原稿','识别后仍能回看照片和原始谱面。','核对结构','拍号、时值和声部决定播放是否成立。'],
 'mentor-material':['课堂指令的执行过程','连续追问时保留刚才的作品和位置','操作依据','先确定作品，再定位小节和声部。','继续讨论','放慢、加入声部，接着听同一片段。'],
 'mentor-listening':['课堂活动的组织','讲解、聆听、讨论需要接得上','教学条件','不同学段采用不同活动设计。','教师介入','跳转环节，或回到原谱重听。'],
 'mentor-arrangement':['教学材料的修订','先听声部配合，再判断改编是否合适','音乐约束','旋律、音区、织体密度和演奏难度。','修订过程','保留两个版本，试听后逐处修改。'],
 'mentor-learning':['反馈时机的教学效应','指出错误以后，学生怎样改变练习','研究问题','即时提示是否影响乐句的完整表达？','验证思路','比较练习过程及撤去提示后的表现。'],
 'mentor-handoff':['项目演示','回到同一份材料，检验每个操作','音乐教育','课堂活动、声部听辨和练习反馈。','技术实现','材料解析、状态保持和操作执行。']
};
let campus;
function photo(){if(!campus&&typeof Image!=='undefined'){campus=new Image();campus.src='/assets/arrival/dongwu-north-reference.jpg';}return campus;}
photo();
export function paintLesson(c,s,tr=x=>x){
 const p=Math.max(0,Math.min(1,s.lessonPosition||0)),topic=s.topic||'mentor-preface',d=chapters[topic]||chapters['mentor-preface'],clock=s.elapsed||0;
 const ink='#f3eee1',gold='#e8c98c',blue='#9bcdd7',muted='#b1c6b8',rose='#e6afa4';
 const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 const text=(t,x,y,size=23,color=ink,max=590)=>{c.fillStyle=color;c.font=`${size}px "Mentor Hand", "Microsoft YaHei", sans-serif`;c.fillText(tr(t),x,y,max);};
 const line=(x,y,a,b,color=muted,width=1.5)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(a,b);c.stroke();};
 const panel=(x,y,w,h,fill='#ffffff09')=>{c.fillStyle=fill;c.strokeStyle='#c1d6c426';c.lineWidth=1;c.beginPath();c.roundRect(x,y,w,h,12);c.fill();c.stroke();};
 function reveal(at,fn){const a=ease((p-at)/.12);if(!a)return;c.save();c.globalAlpha*=a;c.translate(0,12*(1-a));fn(a);c.restore();}
 function arrow(x,y,a,b,amount=1){line(x,y,x+(a-x)*amount,y+(b-y)*amount,gold,2);if(amount>.98){const angle=Math.atan2(b-y,a-x);line(a,b,a-8*Math.cos(angle-.45),b-8*Math.sin(angle-.45),gold,2);line(a,b,a-8*Math.cos(angle+.45),b-8*Math.sin(angle+.45),gold,2);}}
 function staff(x,y,w,active=0,voices=2){for(let r=0;r<voices;r++){const yy=y+r*50;for(let j=0;j<5;j++)line(x,yy+j*5,x+w,yy+j*5,'#b1c6b85a',1);for(let k=0;k<7;k++){const nx=x+20+k*(w-32)/7,ny=yy+10+[0,-5,5,0,10,5,-5][(k+r)%7];c.fillStyle=k===active?gold:r?blue:ink;c.beginPath();c.ellipse(nx,ny,5,3.5,-.35,0,7);c.fill();line(nx+4,ny,nx+4,ny-22,c.fillStyle,1.4);}for(let k=1;k<4;k++)line(x+w*k/4,yy,x+w*k/4,yy+20,'#b1c6b88a',1);}}
 function wave(x,y,w,h,color=blue){for(let i=0;i<Math.floor(w/5);i++){const a=(.15+.85*Math.abs(Math.sin(i*.71)*Math.cos(i*.19)))*h;line(x+i*5,y-a,x+i*5,y+a,color,2);}}
 function keyboard(x,y,w){for(let i=0;i<14;i++){c.fillStyle=i===Math.floor(clock*1.2)%14?gold:'#dbe5d9';c.fillRect(x+i*w/14,y,w/14-1,42);}for(let i=0;i<13;i++)if(![2,6].includes(i%7)){c.fillStyle='#173b33';c.fillRect(x+(i+.68)*w/14,y,w/26,25);}}
 function person(x,y,color=blue){c.fillStyle=color;c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fill();c.beginPath();c.roundRect(x-12,y+11,24,24,7);c.fill();}
 function speech(x,y,w,t,color=ink){panel(x,y,w,42,'#ffffff0c');text(t,x+13,y+27,19,color,w-24);}
 function paragraph(t,x,y){c.fillStyle=ink;c.font='19px "Mentor Hand",sans-serif';const rows=[];let row='';for(const token of tr(t).match(/[A-Za-z0-9]+\s*|./gu)||[]){if(row&&c.measureText(row+token).width>298&&!/^[，。！？、；：,.!?;:）)]$/.test(token)){rows.push(row);row=token.trimStart();}else row+=token;}if(row)rows.push(row);rows.forEach((line,i)=>c.fillText(line,x,y+i*28,300));}
 const scan=(Math.sin(clock*.5)+1)/2;
 c.save();c.textAlign='left';text('苏州大学音乐教育研究',350,49,18,muted);text(d[0],350,99,34);text(d[1],350,137,20,gold);line(350,155,970,155,'#bfd2bd45');
 reveal(0,()=>panel(350,177,620,279));c.save();c.beginPath();c.roundRect(351,178,618,277,11);c.clip();
 if(topic==='mentor-preface')reveal(.02,a=>{const img=photo();if(img?.complete&&img.naturalWidth){c.save();c.beginPath();c.roundRect(365,191,280,176,7);c.clip();const scale=Math.max(280/img.naturalWidth,176/img.naturalHeight);c.globalAlpha*=.85;c.drawImage(img,365+(280-img.naturalWidth*scale)/2,191+(176-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);c.restore();}text('苏州大学',379,392,22);text('从专业学习进入教学现场',379,425,18,muted,265);staff(674,232,264,Math.floor(scan*7));keyboard(674,349,264);text('让问题在课堂上听得见',674,425,19,gold,268);});
 else if(topic==='mentor-context')reveal(.02,a=>{c.save();c.translate(379,210);c.rotate(-.035*(1-a));panel(0,0,157,187,'#ede9dc');for(let y=24;y<145;y+=42){for(let j=0;j<5;j++)line(14,y+j*4,142,y+j*4,'#5c6f64',1);for(let j=0;j<4;j++){c.fillStyle='#314d41';c.beginPath();c.ellipse(29+j*30,y+8+(j%2)*4,3.5,2.5,0,0,7);c.fill();}}text('原始谱面',23,173,19,'#314d41',130);c.restore();arrow(550,287,604,287,a);staff(630,220,300,Math.floor(scan*7));text('音符 · 时值 · 声部',630,339,20,gold,315);wave(630,389,300,24);line(630+300*scan,355,630+300*scan,422,gold,2);});
 else if(topic==='mentor-material')reveal(.02,a=>{speech(371,194,344,'把刚才的低声部单独放一遍');speech(594,394,353,'慢一点，再把弦乐加进来',gold);['作品','声部','小节'].forEach((t,i)=>{const x=392+i*188;panel(x,269,140,66,'#ffffff0e');text(t,x+47,310,24,i===1?gold:ink,100);if(i<2)arrow(x+145,303,x+180,303,a);});wave(392,363,500,13);line(392+500*scan,343,392+500*scan,381,gold,2);});
 else if(topic==='mentor-listening')reveal(.02,a=>{panel(374,196,244,148,'#153c34');staff(392,218,205,Math.floor(scan*7),1);wave(392,293,205,17);text('聆听主题片段',398,330,18,gold,210);person(699,232,gold);for(const [x,y]of [[665,317],[746,317],[827,317],[900,317]]){person(x,y);line(x-21,y+38,x+21,y+38,'#bfd2bd70',3);}text('讨论音乐中的重复',661,401,20);arrow(622,270,654,270,a);arrow(857,242,916,242,a);text('重听',861,226,18,muted,100);});
 else if(topic==='mentor-arrangement')reveal(.02,a=>{text('旋律',373,213,19,gold,100);staff(438,197,507,Math.floor(scan*7),1);text('弦乐',373,285,19,blue,100);staff(438,268,507,Math.floor(scan*7),1);text('鼓组',373,360,19,rose,100);for(let j=0;j<24;j++){const x=443+j*21;line(x,335,x,378,'#bfd2bd16',1);if(j%3===0||j%8===7){c.fillStyle=j%8===7?rose:blue;c.beginPath();c.arc(x,351+j%2*12,4,0,7);c.fill();}}text('保留旋律，再安排声部间的疏密和呼应',395,424,20,gold,550);line(438+507*scan,186,438+507*scan,384,'#e8c98c80',1.5);});
 else if(topic==='mentor-learning')reveal(.02,a=>{for(const [t,y,color]of [['即时提示',236,gold],['乐句后提示',307,blue],['撤去提示',378,rose]]){text(t,373,y,20,color,142);line(526,y-5,937,y-5,'#b1c6b855');for(let j=0;j<9;j++)line(540+j*46,y-11,540+j*46,y+1,'#b1c6b877');if(y!==378){const x=y===236?616:863;c.fillStyle=color;c.beginPath();c.arc(x,y-5,7,0,7);c.fill();}}line(526+411*scan,209,526+411*scan,391,'#e8c98c65',1.5);text('提示条件 → 练习过程 → 独立完成',441,432,19,ink,520);});
 else reveal(.02,a=>{panel(377,197,568,214,'#153c34');for(let i=0;i<4;i++){panel(392+i*135,210,120,25,i===Math.floor(scan*4)?'#b0c8ba38':'#ffffff08');text(['曲库','演奏','改编','任务'][i],421+i*135,228,16,muted,90);}panel(392,248,138,145);for(let j=0;j<3;j++){panel(402,259+j*42,118,32,'#d5e0cd16');text(['选定作品','定位片段','执行操作'][j],412,282+j*42,15,ink,107);}staff(550,267,367,Math.floor(scan*7));keyboard(550,350,367);});
 c.restore();for(let i=0;i<2;i++)reveal(.20+i*.18,()=>{const x=350+i*318;line(x,481,x+300,481,'#c0d4c140');text(d[2+i*2],x,512,23,gold,300);paragraph(d[3+i*2],x,545);});c.restore();
}
