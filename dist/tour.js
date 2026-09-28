export function initTour(){
const params=new URLSearchParams(location.search);
if(params.get('tour')==='1'){
 const steps=[['library','导入与核对','从曲库打开作品，核对原稿和电子谱。未准备琴谱时，可在设置中打开示例谱。'],['play','播放与聆听','点击播放，比较速度、音源和节拍器。请先听节拍与声部，再讨论自然表达。'],['arrange','改编与检查','选择配器后生成总谱。生成结果需要核对和声与声部，不能直接当作教学结论。'],['tasks','过程与记录','这里查看上传、识谱与生成进度。跟弹实验还需要经过同意的数据采集与研究设计。']];
 let index=Math.max(0,steps.findIndex(s=>s[0]===params.get('panel')));
 const box=document.createElement('aside');box.className='guided-tour';box.setAttribute('aria-label','项目导览');
 const head=document.createElement('strong'),copy=document.createElement('p'),actions=document.createElement('div'),prev=document.createElement('button'),next=document.createElement('button'),exit=document.createElement('button');
 prev.textContent='上一步';exit.textContent='结束导览';actions.append(prev,next,exit);box.append(head,copy,actions);document.body.append(box);
 function render(){const [panel,title,text]=steps[index];document.querySelector(`[data-panel="${panel}"]`)?.click();head.textContent=`${index+1} / ${steps.length}　${title}`;copy.textContent=text;prev.disabled=index===0;next.textContent=index===steps.length-1?'返回项目介绍':'下一步';}
 prev.onclick=()=>{index=Math.max(0,index-1);render();};next.onclick=()=>{if(index===steps.length-1){location.href='/research.html?'+new URLSearchParams({mentor:params.get('mentor')||'',direction:params.get('direction')||'ensemble'});return;}index++;render();};exit.onclick=()=>box.remove();render();
}
}
