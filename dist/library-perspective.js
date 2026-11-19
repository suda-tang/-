// Shared by the early library and the later workspace controller. A card must
// land at the same perspective before and after controller initialization.
export function applyLibraryPerspective(list,instant=false){
 const width=list.clientWidth,center=list.scrollLeft+width/2;if(!width)return;
 const cards=[...list.querySelectorAll('.library-score')].filter(card=>!card.hidden&&(!card.closest('.library-card-stack:not(.is-expanded)')||card.classList.contains('stack-peek'))).map(card=>({card,left:card.offsetLeft,w:card.offsetWidth})).filter(p=>p.left+p.w>list.scrollLeft-width&&p.left<list.scrollLeft+width*2);
 const transitions=instant?cards.map(({card})=>[card,card.style.getPropertyValue('transition'),card.style.getPropertyPriority('transition')]):[];
 for(const [card]of transitions)card.style.setProperty('transition','none','important');
 for(const {card,left,w}of cards){const d=Math.max(-1,Math.min(1,(left+w/2-center)/width)),turn=(-d*28)+'deg',depth=(-Math.abs(d)*38)+'px';if(card.style.getPropertyValue('--deck-turn')!==turn)card.style.setProperty('--deck-turn',turn);if(card.style.getPropertyValue('--deck-depth')!==depth)card.style.setProperty('--deck-depth',depth);}
 if(instant){for(const {card}of cards)getComputedStyle(card).transform;for(const [card,value,priority]of transitions)if(value)card.style.setProperty('transition',value,priority);else card.style.removeProperty('transition');}
}
