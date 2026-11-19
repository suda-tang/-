import {abortTimeout} from './abort-timeout.js';
import {prepareAudioPlayback} from './audio-session.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};
const connectionMessage=error=>error.name==='TimeoutError'?'搜索等待超时，请重试；尚未创建转谱任务。':error.name==='AbortError'?'搜索连接已中止，请重试。':error instanceof TypeError?'连接中断，请重试。':error.message;
async function api(body,signal,onEvent){
 const timeout=abortTimeout(signal,40000);
 try{for(let attempt=0;;attempt++){try{
  const r=await fetch('/api/online-music',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:timeout.signal});
  if(r.ok&&r.headers.get('Content-Type')?.includes('ndjson')&&r.body?.getReader){
   const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',doneEvent=null;
   const consume=line=>{if(!line.trim())return;const event=JSON.parse(line);onEvent?.(event);if(event.type==='done')doneEvent=event;};
   try{for(;;){const {value,done}=await reader.read();timeout.reset();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)consume(line);if(doneEvent){await reader.cancel();return doneEvent;}if(done){consume(buffer);break;}}}finally{reader.releaseLock();}
   if(!doneEvent)throw Error('搜索连接中断，已显示的版本仍可使用，请重试补充。');return doneEvent;
  }
  const d=await r.json();if(!r.ok)throw Error(d.error||'联网转谱未完成');return d;
 }catch(error){if(body.action==='start'||attempt||timeout.signal.aborted||!(error instanceof TypeError))throw error;await new Promise(resolve=>setTimeout(resolve,500));}}}finally{timeout.dispose()}
}
export function mountOnlineMusic(browser,input,{onImported}={}){
 // 预加载全屏歌词模块：否则首次点击要等模块下载完（实测 400ms+）才开始缩放动画。
 void import('./fullscreen-lyrics.js').catch(()=>{});
 const style=document.createElement('style');
 // 网络结果不再自带一套小卡片：直接把卡片塞进 .library-list，尺寸、封面铺顶、3D hover
 // 全部由本地那套 .studio .library-score 规则决定，所以两边长得一模一样。
 // display:contents 让包装层不产生盒子，卡片和平台标题直接成为曲库网格的 item。
 style.textContent=''
  +'.library-online-results{display:contents}'
  // 联网区不再是那块玻璃表单：只剩一条细进度和一行出错提示，没有标题/按钮/下拉。
  +'.library-online-music.is-minimal{background:none;border:0;box-shadow:none;padding:0;'
  +'margin:2px 8px 4px;border-radius:0}'
  +'.library-online-music.is-minimal p{margin:2px 2px 4px;font-size:12px;line-height:1.5;color:#8a7580}'
  // 平台卡堆：整行一个 item，靠左；展开后 .is-expanded 自己铺满。
  // 折叠时占一列（和本地卡片同宽），展开时 library-pending.css 自己把它撑成整行。
  +'.library-online-results .library-online-stack{margin:6px 0 2px}'
  +'.library-online-results .library-cover.is-placeholder{display:grid;place-items:center;'
  +'font-size:30px;font-weight:600;color:#8d7691;letter-spacing:.02em;'
  +'background:linear-gradient(145deg,#efe7f0,#ded3e0)!important}'
  // 分类内部的「加载更多」：只在展开态出现，接在这一摞卡下面。
  +'.library-online-stack .online-more{display:block;width:min(100%,280px);margin:14px auto 4px;'
  +'border:1px solid #87435728;border-radius:20px;background:#fff9;color:#874357;'
  +'padding:10px 16px;font-size:13px;cursor:pointer}'
  +'.library-online-stack:not(.is-expanded) .online-more{display:none}'
  +'.library-online-stack .online-more[hidden]{display:none}'
  +'.library-online-stack .online-more:disabled{opacity:.55;cursor:default}';
 document.head.append(style);
 // 搜索不再占一块表单：没有标题、没有「搜索音乐」按钮、没有三个下拉。
 // 输入停顿就自动搜（本地 + 两个平台），结果直接长在曲库网格里。
 // 这块只剩「搜索中」的一条细进度和出错时的一行说明。
 const section=node('section');section.className='library-online-music is-minimal';section.hidden=true;
 const search=node('button','搜索音乐');            // 内部触发器，不上屏
 const message=node('p'),results=node('div');
 results.className='library-online-results';
 section.append(message);
 const previewAudio=document.createElement('audio');previewAudio.preload='none';previewAudio.playsInline=true;previewAudio.hidden=true;section.append(previewAudio);let previewButton=null,previewId='';
 function stopPreview(){previewAudio.pause();previewAudio.removeAttribute('src');previewAudio.load();if(previewButton)previewButton.textContent='试听';previewButton=null;previewId='';}
 previewAudio.addEventListener('playing',()=>{if(previewButton)previewButton.textContent='暂停'});previewAudio.addEventListener('pause',()=>{if(previewButton)previewButton.textContent='试听'});previewAudio.addEventListener('ended',()=>{if(previewButton)previewButton.textContent='试听'});
 browser.querySelector('.library-search-status').after(section);
 // 网络卡片住在本地曲库那同一个网格里（list 每次全量刷新会被 replaceChildren，
 // 所以每次写入前都确认一次挂载关系）。
 let resultsGuard=null;
 // list 每次全量刷新（点「刷新列表」）都会 replaceChildren，会把 results 一起摘掉；
 // 挂个 observer 在刷新后把它接回去，否则搜索结果会莫名其妙消失。
 const attachResults=()=>{const target=browser.querySelector('.library-list');if(!target)return null;
  if(results.parentElement!==target)target.append(results);
  if(!resultsGuard){resultsGuard=new MutationObserver(()=>{
    if(results.parentElement!==target&&results.childElementCount>1)target.append(results);});
   resultsGuard.observe(target,{childList:true});}
  return target;};
 const stats=new Map();
 // 这块平时完全是 invisible 的：只有一行错误才让它出现（进度条按用户要求撤掉）。
 const syncSection=()=>{section.hidden=!message.textContent.trim();};
 const resetResults=()=>{results.replaceChildren();stats.clear();};
 attachResults();
 document.addEventListener('library-tour-opened',()=>{if(!input.value.trim()){resetResults();section.hidden=true;}});
 let controller=null,revision=0;
 let autoSearch=0;
 input.addEventListener('input',()=>{stopPreview();++revision;controller?.abort();search.disabled=false;
  const typed=input.value.trim();resetResults();message.textContent='';syncSection();
  // 搜索就是一件事：本地曲谱由 library.js 自己过滤，网络曲谱在这里跟上。
  // 停手 900ms 自动开搜，不用再点「搜索音乐」；继续打字就取消上一轮。
  clearTimeout(autoSearch);
  if(typed.length>=2)autoSearch=setTimeout(()=>{if(input.value.trim()===typed&&search.onclick)void search.onclick();},900);
 });
 search.onclick=async()=>{
  const query=input.value.trim();if(!query)return;const current=++revision;controller?.abort();stopPreview();controller=new AbortController();resetResults();attachResults();
  // 平台固定「全部」：网易云 + 酷我各来一路，谁都可能先返回。
  const selectedPlatform='all',seen=new Set(),pageSignatures=new Map();let searchStage='',started=0,busy=false,nextPages=null;
  const paintSearch=()=>{searchStage=searchStage||'';};
  const PLATFORM_NAMES={netease:'网易云音乐',qq:'QQ 音乐',kugou:'酷狗音乐',kuwo:'酷我音乐',migu:'咪咕音乐'};
  // 每个平台是一个「曲谱卡堆」：和云曲库分类视图同一套 .library-card-stack ——
  // 折叠时是一摞卡 + 底下一颗「平台名 N 首」胶囊，点开铺满整行。
  const openGroup=group=>{
   const open=!group.classList.contains('is-expanded');
   group.classList.toggle('is-expanded',open);
   const toggle=group.querySelector('.card-stack-toggle');
   if(toggle)toggle.setAttribute('aria-expanded',String(open));
   for(const card of group.querySelectorAll('.library-score'))card.inert=!open;
   // 展开后这一摞会突然变成整行网格，下面的内容被推走；把卡堆顶对齐到视口，
   // 否则用户点完看到的是一片空白（「一张卡都不显示」就是这么来的）。
   if(open)requestAnimationFrame(()=>{
     const box=group.getBoundingClientRect();
     if(box.top<0||box.top>innerHeight*0.55)group.scrollIntoView({block:'start',behavior:'smooth'});
   });
  };
  const platformBucket=name=>{
   let stat=stats.get(name);
   if(stat)return stat;
   const index=stats.size;
   const group=node('section');
   group.className='library-card-stack library-category-stack library-online-stack';
   group.dataset.onlineGroup=name;
   group.style.order=String(100+index*2);
   const toggle=node('button');toggle.type='button';toggle.className='card-stack-toggle';
   toggle.setAttribute('aria-expanded','false');
   const label=node('span',PLATFORM_NAMES[name]||name),count=node('small','0 首');
   toggle.append(label,count);
   const items=node('div');items.className='card-stack-items';
   // 加载更多放进分类内部：只把这一路平台的下一页接在这摞卡后面。
   const more=node('button','加载更多');more.className='online-more';more.type='button';more.hidden=true;
   more.onclick=()=>{const stat=stats.get(name);if(!stat||!stat.next||busy)return;void loadPage({[name]:stat.next},name);};
   group.append(toggle,items,more);
   toggle.onclick=()=>openGroup(group);
   group.addEventListener('click',event=>{
     if(!group.classList.contains('is-expanded')&&!event.target.closest('button'))toggle.click();
   });
   results.append(group);
   stat={group,items,count,more,next:0};stats.set(name,stat);return stat;
  };
  const openLyrics=async(item,origin)=>{
   try{
    if(previewId!==item.id){stopPreview();previewButton=null;previewId=item.id;
     previewAudio.src='/api/online-music/preview?id='+encodeURIComponent(item.id);}
    prepareAudioPlayback();
    if(previewAudio.paused)previewAudio.play().catch(()=>{});
    const {openFullscreenLyrics}=await import('./fullscreen-lyrics.js');
    await openFullscreenLyrics({catalogId:item.id,title:item.title,artist:item.artist,audio:previewAudio,originEl:origin||null});
   }catch(error){message.textContent=error.message||'全屏歌词打开失败';}
  };
  const appendSong=item=>{
   if(current!==revision||seen.has(item.id))return;
   seen.add(item.id);paintSearch();
   attachResults();
   const bucket=platformBucket(item.platform||'netease');
   const card=node('button');card.type='button';
   // 与本地卡片同一套 class、同一个网格：样式一律不覆盖，站长啥样它就啥样。
   card.className='library-score';
   card.dataset.onlineId=item.id;
   card.style.setProperty('--stack-order',String(bucket.items.children.length));
   const cover=node('span');cover.className='library-cover';
   if(item.cover){cover.style.backgroundImage='url("'+item.cover+'")';}
   else{cover.classList.add('is-placeholder');cover.textContent=(item.title||'♪').trim().charAt(0);}
   cover.setAttribute('aria-label',(item.title||'')+' 封面');
   const title=node('strong',item.title);title.className='library-title';
   const detail=node('small',item.artist||'');detail.className='library-detail';
   card.append(cover,title,detail);
   card.onclick=()=>{void openLyrics(item,card);};
   // 折叠态只让前 4 张露出来当卡堆，其余交给 CSS 隐藏；点开才铺整行。
   if(bucket.items.children.length<4)card.classList.add('stack-peek');
   card.inert=true;
   bucket.items.append(card);
   bucket.count.textContent=bucket.items.children.length+' 首';
  };
  async function loadPage(pages,only){
   if(busy||current!==revision)return;busy=true;search.disabled=true;started=performance.now();searchStage='正在查询音乐来源';paintSearch();message.textContent='';syncSection();
   const searchClock=setInterval(()=>{if(current===revision)paintSearch()},1000),repeated=new Set();
   try{
    // only 有值 = 某个分类里点了「加载更多」，只续这一路；否则首次搜索走全部平台。
    const targets=only?[only]:(selectedPlatform==='all'?['netease','kuwo']:[selectedPlatform]);
    const mergedPages={};
    for(const target of targets){
     if(current!==revision)break;
     searchStage=(selectedPlatform==='all'?'正在查询 '+(PLATFORM_NAMES[target]||target):'正在查询音乐来源');
     paintSearch();
     const data=await api({action:'search',query,platform:target,stream:true,...(pages&&pages[target]?{pages:{[target]:pages[target]}}:{})},controller.signal,event=>{
      if(current!==revision)return;
      if(event.type==='song')appendSong(event.item);
      else if(event.type==='page'){const signature=JSON.stringify(event.ids||[]),known=pageSignatures.get(event.provider)||new Set();if(known.has(signature))repeated.add(event.provider);known.add(signature);pageSignatures.set(event.provider,known);}
      else if(event.type==='progress'){searchStage=event.text;paintSearch();}
      else if(event.type==='warning'){searchStage=event.text;paintSearch();}
     });
     if(current!==revision)return;
     for(const item of data.results||[])appendSong(item);
     Object.assign(mergedPages,data.nextPages||{});
     const bucket=stats.get(target);
     if(bucket){
       bucket.next=data.nextPages?.[target]||0;
       bucket.more.hidden=!bucket.next;
     }
    }
    nextPages=mergedPages;for(const provider of repeated)delete nextPages[provider];
    message.textContent=seen.size?'':'没搜到可用的网络版本，换个歌名试试。';
   }catch(error){if(current===revision){message.textContent=connectionMessage(error)+(seen.size?' 已显示的版本仍可使用。':'');syncSection();if(pages){nextPages=pages;}}}
   finally{clearInterval(searchClock);busy=false;if(current===revision){search.disabled=false;syncSection();
     for(const b of stats.values())b.more.disabled=false;}}
  }
  await loadPage();
 };
 browser.addEventListener('close',()=>{stopPreview();++revision;controller?.abort();search.disabled=false;clearTimeout(autoSearch);resetResults();syncSection();});
}
