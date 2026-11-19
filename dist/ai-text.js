// Small DOM renderer for assistant prose. Model content is never inserted as HTML.
export function decodeEntities(text){
 const decoder=document.createElement('textarea');
 let source=String(text??'');
 for(let pass=0;pass<2;pass++){
  const decoded=source.replace(/&(?:#\d{1,7}|#x[\da-f]{1,6}|amp|lt|gt|quot|apos|nbsp);/gi,entity=>{decoder.innerHTML=entity;return decoder.value;});
  if(decoded===source)break;source=decoded;
 }
 return source.replace(/\u00a0/g,' ');
}

function inline(parent,text,depth=0){
 if(depth>4){parent.append(document.createTextNode(text));return;}
 const pattern=/`([^`\n]+)`|\*\*\*([^*\n]+)\*\*\*|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^\s)]+)\)/g;
 let start=0;
 for(const match of text.matchAll(pattern)){
  parent.append(document.createTextNode(text.slice(start,match.index)));
  let node;
  if(match[1]!==undefined){node=document.createElement('code');node.textContent=match[1];}
  else if(match[2]!==undefined){node=document.createElement('strong');const em=document.createElement('em');inline(em,match[2],depth+1);node.append(em);}
  else if(match[3]!==undefined||match[4]!==undefined){node=document.createElement('strong');inline(node,match[3]??match[4],depth+1);}
  else if(match[5]!==undefined){node=document.createElement('em');inline(node,match[5],depth+1);}
  else{
   let url;try{url=new URL(match[7],location.href);}catch{}
   if(url&&['https:','http:','mailto:'].includes(url.protocol)){node=document.createElement('a');node.href=url.href;node.target='_blank';node.rel='noopener noreferrer';inline(node,match[6],depth+1);}
   else{node=document.createTextNode(match[6]);}
  }
  parent.append(node);start=match.index+match[0].length;
 }
 parent.append(document.createTextNode(text.slice(start)));
}

export function renderAssistantText(target,value){
 const source=decodeEntities(value).replace(/找到到列出来/g,'找到后列出来').replace(/\r\n?/g,'\n').replace(/\\([*#_>-])/g,'$1').replace(/\*{4,}/g,'**')
  .replace(/([：:])\s*-\s+(?=\S)/g,'$1\n- ').replace(/([。？！；])\s*-\s+(?=\S)/g,'$1\n- ');
 const fragment=document.createDocumentFragment();let paragraph=null,list=null,listType='',fence=false,code=null;
 for(const line of source.split('\n')){
  if(/^\s*```/.test(line)){paragraph=null;list=null;if(fence){fence=false;code=null;}else{fence=true;const pre=document.createElement('pre');code=document.createElement('code');pre.append(code);fragment.append(pre);}continue;}
  if(fence){code.append(document.createTextNode((code.textContent?'\n':'')+line));continue;}
  if(!line.trim()){paragraph=null;list=null;continue;}
  const quote=line.match(/^\s*>\s?(.*)$/);
  if(quote){const block=document.createElement('blockquote');inline(block,quote[1]);fragment.append(block);paragraph=null;list=null;continue;}
  const item=line.match(/^\s*(?:([-+*])\s+|(\d+)[.)、]\s+)(.+)$/);
  if(item){const type=item[2]?'ol':'ul';if(!list||listType!==type){list=document.createElement(type);if(type==='ol'&&Number(item[2])!==1)list.start=Number(item[2]);fragment.append(list);listType=type;}const li=document.createElement('li');inline(li,item[3]);list.append(li);paragraph=null;continue;}
  list=null;const heading=line.match(/^\s*#{1,6}\s+(.+)$/);
  if(heading){const p=document.createElement('p'),strong=document.createElement('strong');inline(strong,heading[1]);p.append(strong);fragment.append(p);paragraph=null;continue;}
  if(!paragraph){paragraph=document.createElement('p');fragment.append(paragraph);}else paragraph.append(document.createElement('br'));
  inline(paragraph,line);
 }
 target.replaceChildren(fragment);target.classList.add('ai-formatted-text');
}
