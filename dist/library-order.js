export function createCardOrder(random=Math.random,previousFirst=''){
 let order=[];
 return (items,refresh=false)=>{
  const current=new Map(items.map(item=>[item.id,item]));
  if(refresh||!order.length){
   const before=order[0]||previousFirst;order=[...current.keys()];
   for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
   // A refresh must visibly change the leading card when another is available.
   if(order.length>1&&order[0]===before){const j=1+Math.floor(random()*(order.length-1));[order[0],order[j]]=[order[j],order[0]]}
   previousFirst=order[0]||'';
  }else{const known=new Set(order);order=order.filter(id=>current.has(id));for(const id of current.keys())if(!known.has(id))order.push(id)}
  return order.map(id=>current.get(id)).filter(Boolean);
 };
}
