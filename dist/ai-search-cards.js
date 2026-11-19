export function webSearchCard({query,log,onSearch}){
 const card=document.createElement('section');card.className='ai-search-card';
 const title=document.createElement('strong');title.textContent='曲库里暂未找到';
 const text=document.createElement('p');text.textContent=String(query||'所需作品');
 const button=document.createElement('button');button.type='button';button.textContent='联网找谱';
 button.onclick=async()=>{button.disabled=true;text.textContent='正在搜索《'+query+'》…';try{await onSearch(query);text.textContent=query;}catch(e){text.textContent=e.message;}finally{button.disabled=false;}};
 const link=document.createElement('a');link.href='/scorestarling.html?title='+encodeURIComponent(query);link.target='_blank';link.rel='noopener';link.textContent='用音视频链接转谱';
 card.append(title,text,button,link);log.append(card);return card;
}
export function webResultCards({items,query,log,onImport}){
 for(const item of items||[]){const card=document.createElement('section');card.className='ai-search-card';const title=document.createElement('strong');title.textContent=item.title;const source=document.createElement('small');source.textContent=item.source||'网络曲谱';const link=document.createElement('a');try{const url=new URL(item.url);if(!['https:','http:'].includes(url.protocol))continue;link.href=url.href;}catch{continue;}link.target='_blank';link.rel='noopener';link.textContent='查看来源';card.append(title,source,link);
 if(item.directPdf||item.autoImport){const button=document.createElement('button');button.type='button';button.textContent='下载并识谱';button.onclick=async()=>{button.disabled=true;button.textContent='正在下载…';try{await onImport(item);button.textContent='已加入识谱队列';}catch(e){source.textContent=e.message;button.textContent='重试下载';button.disabled=false;}};card.append(button);}else{const link=document.createElement('a');link.href='/scorestarling.html?title='+encodeURIComponent(query);link.target='_blank';link.rel='noopener';link.textContent='选择演奏链接转谱';card.append(link);}log.append(card);}
}
