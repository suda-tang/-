// Move the original cards, retaining playback handlers and cover observers.
export function createCardDecks({list,pendingGroup,pendingItems,pendingToggle,openBrowser,isFullscreen}){
 let categorized=false,categories={},query='',matches=null;const groups=new Map(),expandedLabels=new Set();
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function positions(root){return new Map([...root.querySelectorAll('.library-score')].filter(c=>!c.hidden&&(!c.closest('.library-card-stack:not(.is-expanded)')||c.classList.contains('stack-peek'))).map(c=>[c,c.getBoundingClientRect()]).filter(([,r])=>r.width&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth).slice(0,24));}
 function deal(root,change){const before=positions(root);change();if(reduced())return;const after=positions(root);let i=0;for(const [card,box]of after){const old=before.get(card);if(!old||!box.width||!box.height||Math.abs(old.left-box.left)+Math.abs(old.top-box.top)<1)continue;card._stackMotion?.cancel();card._stackMotion=card.animate([{translate:`${old.left-box.left}px ${old.top-box.top}px`,rotate:'-5deg'},{translate:'0px 0px',rotate:'0deg'}],{duration:560,delay:Math.min(i++*24,240),easing:'cubic-bezier(.18,.8,.24,1)'});}}
 function decorate(group,items,toggle,label){
  group.classList.add('library-card-stack');toggle.classList.add('card-stack-toggle');toggle.setAttribute('aria-label',label);
  let busy=false;
  toggle.onclick=async()=>{
   if(busy)return;busy=true;
   try{
    if(!isFullscreen())await openBrowser();
    const expanded=toggle.getAttribute('aria-expanded')!=='true';
    const quiet=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const limit=document.body.classList.contains('library-low-memory')?8:20;
    const cards=[...items.children].filter(c=>!c.hidden).slice(0,limit);
    const anchor=cards[0]?.getBoundingClientRect();
    const siblings=[...list.children].filter(c=>c!==group&&!c.hidden).slice(0,24);
    const before=new Map(siblings.map(c=>[c,c.getBoundingClientRect()]));
    const motion=(node,frames,delay=0)=>{node._stackMotion?.cancel();const anim=node.animate(frames,{duration:420,delay,easing:'cubic-bezier(.22,.75,.24,1)',fill:'backwards'});node._stackMotion=anim;return anim.finished.catch(()=>{});};
    if(!expanded&&!quiet&&anchor){
     await Promise.all(cards.map((card,i)=>{const r=card.getBoundingClientRect();return motion(card,[{translate:'0px 0px',opacity:1},{translate:`${anchor.left-r.left}px ${anchor.top-r.top}px`,scale:Math.min(1,anchor.width/r.width),opacity:i<4?1:0}],Math.min(i*10,100));}));
    }
    const old=new Map(cards.map(c=>[c,c.getBoundingClientRect()]));
    for(const card of cards)card._stackMotion?.cancel();
    toggle.setAttribute('aria-expanded',String(expanded));group.classList.toggle('is-expanded',expanded);
    for(const card of items.children)card.inert=!expanded;
    if(!quiet){
     for(const sibling of siblings){const r=sibling.getBoundingClientRect(),o=before.get(sibling);if(r.width&&o)motion(sibling,[{translate:`${o.left-r.left}px ${o.top-r.top}px`},{translate:'0px 0px'}]);}
     if(expanded&&anchor)await Promise.all(cards.map((card,i)=>{const r=card.getBoundingClientRect(),o=i<4?old.get(card):anchor;if(!r.width)return;return motion(card,[{translate:`${o.left-r.left}px ${o.top-r.top}px`,scale:Math.min(1,o.width/r.width),opacity:i<4?1:0},{translate:'0px 0px',scale:1,opacity:1}],Math.min(i*14,140));}));
    }
    if(expanded)document.dispatchEvent(new CustomEvent('library-deck-expanded',{detail:group}));
   }finally{busy=false;}
  };
  items.classList.add('card-stack-items');group.addEventListener('click',event=>{if(!group.classList.contains('is-expanded')&&!event.target.closest('button'))toggle.click();});
 }
 decorate(pendingGroup,pendingItems,pendingToggle,'展开未就绪曲谱');
 function stack(label){if(groups.has(label))return groups.get(label);const group=document.createElement('section');group.className='library-card-stack library-category-stack';const toggle=document.createElement('button');toggle.type='button';toggle.className='card-stack-toggle';toggle.setAttribute('aria-expanded','false');const name=document.createElement('span');name.textContent=label;const count=document.createElement('small');toggle.append(name,count);if(expandedLabels.has(label)){group.classList.add('is-expanded');toggle.setAttribute('aria-expanded','true');}const items=document.createElement('div');items.className='card-stack-items';group.append(toggle,items);decorate(group,items,toggle,'展开'+label);const value={group,items,toggle};groups.set(label,value);return value;}
 function regroup(){
  const cards=[...list.querySelectorAll('.library-score')];
  for(const card of cards){card.hidden=!!query&&!String(card._item?.title||'').toLowerCase().includes(query)&&!matches?.has(card.dataset.scoreId);if(card.dataset.ready!=='true'){if(card.parentElement!==pendingItems)pendingItems.append(card);}else if(categorized){const target=stack(categories[card.dataset.scoreId]||'待分类').items;if(card.parentElement!==target)target.append(card);}else {card.inert=false;if(card.parentElement!==list)list.insertBefore(card,pendingGroup.parentElement===list?pendingGroup:null);}}
  for(const [label,{group,items,toggle}]of groups){if(categorized&&items.children.length){toggle.querySelector('small').textContent=items.children.length+' 首';group.hidden=![...items.children].some(c=>!c.hidden);if(group.parentElement!==list)list.append(group);}else{group.remove();groups.delete(label);}}
  pendingToggle.querySelector('small').textContent=pendingItems.children.length+' 首';pendingGroup.hidden=![...pendingItems.children].some(c=>!c.hidden);if(pendingItems.children.length){if(pendingGroup.parentElement!==list)list.append(pendingGroup);}else pendingGroup.remove();
  list.classList.toggle('library-categorized',categorized);
  for(const group of [...groups.values()].map(x=>x.group).concat(pendingGroup)){let n=0;for(const card of group.querySelectorAll('.library-score')){if(card.hidden)continue;card.inert=!group.classList.contains('is-expanded');card.style.setProperty('--stack-order',n);card.classList.toggle('stack-peek',n<4);n++;}}
 }
 return {regroup,reset(){categorized=false;query='';matches=null;pendingGroup.classList.remove('is-expanded');pendingToggle.setAttribute('aria-expanded','false');regroup();},clear(preserve=false){expandedLabels.clear();if(preserve)for(const [label,value]of groups)if(value.group.classList.contains('is-expanded'))expandedLabels.add(label);for(const value of groups.values())value.group.remove();groups.clear();},get categorized(){return categorized;},setCategorized(value){categorized=value;deal(list,regroup);},setCategories(value){categories=value;if(categorized)deal(list,regroup);},search(value,ids=null){query=value;matches=ids?new Set(ids):null;regroup();}};
}
