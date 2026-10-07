// Retain serialized measures, not a full DOM tree, between engraving jobs.
const plans=new WeakMap();
export function engravingPlan(score,sourceDocument){
 const hit=plans.get(score);if(hit?.xml===score.xml)return hit.promise;
 const promise=(async()=>{
  const doc=sourceDocument||new DOMParser().parseFromString(score.xml,'application/xml');
  const serializer=new XMLSerializer(),root=doc.documentElement;
  const open=serializer.serializeToString(root.cloneNode(false)).replace(/\s*\/>$/, '>');
  const headers=[...root.children].filter(n=>n.localName!=='part').map(n=>serializer.serializeToString(n)).join('');
  const parts=[];let work=0;
  for(const part of [...root.children].filter(n=>n.localName==='part')){
   const measures=[],changes=[],state=new Map();
   for(const measure of [...part.children].filter(n=>n.localName==='measure')){
    const attributes=measure.querySelector(':scope > attributes');if(attributes){for(const attr of attributes.children)state.set(attr.localName+':'+(attr.getAttribute('number')||''),serializer.serializeToString(attr));changes.push({at:measures.length,state:new Map(state)});}
    measures.push(serializer.serializeToString(measure));
    if(++work%96===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   parts.push({open:serializer.serializeToString(part.cloneNode(false)).replace(/\s*\/>$/, '>'),measures,changes});
  }
  return {open,headers,parts,count:parts[0]?.measures.length||0,close:'</'+root.tagName+'>'};
 })();plans.set(score,{xml:score.xml,promise});promise.catch(()=>plans.delete(score));return promise;
}
export async function engravingChunk(score,start,count=16){
 const plan=await engravingPlan(score);
 const raw=plan.open+plan.headers+plan.parts.map(part=>part.open+part.measures.slice(start,start+count).join('')+'</part>').join('')+plan.close;
 const doc=new DOMParser().parseFromString(raw,'application/xml');
 if(start)for(const [index,part]of [...doc.documentElement.children].filter(n=>n.localName==='part').entries()){
  const source=plan.parts[index];let inherited;for(const change of source.changes){if(change.at>=start)break;inherited=change.state;}
  const first=part.querySelector('measure');if(!first||!inherited)continue;
  let attributes=first.querySelector(':scope > attributes');if(!attributes){attributes=doc.createElement('attributes');first.prepend(attributes);}
  const existing=new Set([...attributes.children].map(n=>n.localName+':'+(n.getAttribute('number')||'')));
  for(const [key,value]of inherited)if(!existing.has(key)){const node=new DOMParser().parseFromString(value,'application/xml').documentElement;attributes.append(doc.importNode(node,true));}
 }
 return new XMLSerializer().serializeToString(doc);
}
