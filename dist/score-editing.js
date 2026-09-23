export function exportXML(score){
 let xml=score.xml;
 if(!xml){
  const measures=[];
  for(let m=1;m<=score.measures;m++){
   const events=score.events.filter(e=>e.measure===m);
   measures.push(`<measure number="${m}">${m===1?'<attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':''}${events.map(e=>e.notes.map((n,i)=>{const pitch=['C','C','D','D','E','F','F','G','G','A','A','B'][n.midi%12];const sharp=[1,3,6,8,10].includes(n.midi%12);return `<note>${i?'<chord/>':''}<pitch><step>${pitch}</step>${sharp?'<alter>1</alter>':''}<octave>${Math.floor(n.midi/12)-1}</octave></pitch><duration>${Math.round(n.duration*4)}</duration></note>`;}).join('')).join('')}</measure>`);
  }
  xml=`<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${measures.join('')}</part></score-partwise>`;
 }
 const doc=new DOMParser().parseFromString(xml,'application/xml'),root=doc.documentElement;
 let work=root.querySelector('work');if(!work){work=doc.createElement('work');root.prepend(work);}
 let title=work.querySelector('work-title');if(!title){title=doc.createElement('work-title');work.append(title);}title.textContent=score.title;
 for(const el of root.querySelectorAll('movement-title'))el.textContent=score.title;
 return new XMLSerializer().serializeToString(doc);
}

export function setupScoreEditing({getScore,onRename,message}){
 const importer=document.querySelector('.xml-label');
 const button=document.createElement('button');button.id='export-xml';button.className='small-button';button.textContent='导出 MusicXML';importer.after(button);
 const form=document.createElement('form');form.className='rename-form';
 form.innerHTML='<label for="score-name">曲名</label><div><input id="score-name" maxlength="120" autocomplete="off" placeholder="输入曲名"><button class="small-button" type="submit">保存曲名</button></div>';
 document.querySelector('.technical').append(form);
 function sync(){const s=getScore();button.disabled=!s;form.querySelector('button').disabled=!s;if(document.activeElement!==form.querySelector('input'))form.querySelector('input').value=s?.title||'';}
 new MutationObserver(sync).observe(document.querySelector('#score-title'),{childList:true,subtree:true,characterData:true});sync();
 button.onclick=()=>{const s=getScore();if(!s)return;const url=URL.createObjectURL(new Blob([exportXML(s)],{type:'application/vnd.recordare.musicxml+xml;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=s.title.replace(/[<>:"/\\|?*]/g,'_')+'.musicxml';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 form.onsubmit=async event=>{
  event.preventDefault();const s=getScore(),title=form.querySelector('input').value.trim();if(!s||!title)return;
  const submit=form.querySelector('button');submit.disabled=true;
  try{
   if(s.serverId){const response=await fetch(`/api/scores/${s.serverId}/title`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title})});const data=await response.json();if(!response.ok)throw Error(data.error);}
   if(getScore()!==s)return;
   s.title=title;s.meta={...s.meta,title,ocrTitle:title,userTitle:title};if(s.xml)s.xml=exportXML(s);onRename();message('曲名已更新');
  }catch(error){message(`改名失败：${error.message}`,'error');}finally{sync();}
 };
}
