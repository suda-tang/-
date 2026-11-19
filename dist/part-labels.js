export function uniquePartLabels(parts){
 const counts=new Map(),seen=new Map();
 for(const part of parts){const name=String(part.name||part.label||part.id||'乐器');counts.set(name,(counts.get(name)||0)+1);}
 return parts.map(part=>{const name=String(part.name||part.label||part.id||'乐器');const n=(seen.get(name)||0)+1;seen.set(name,n);return {...part,name:counts.get(name)>1?`${name} ${n}`:name};});
}
