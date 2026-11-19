// Lossless, bounded requests: a long research chapter is spoken in order.
export function splitTourSpeech(text,limit=240){
 if(!Number.isInteger(limit)||limit<32)throw new RangeError('Speech chunk limit must be at least 32');
 const chars=Array.from(String(text??''));if(!chars.join('').trim())return [];
 const chunks=[];let from=0;
 while(from<chars.length){let to=Math.min(from+limit,chars.length);
  if(to<chars.length){for(let i=to-1;i>=from+Math.floor(limit/3);i--){if(/[。！？!?；;\n]/u.test(chars[i])){to=i+1;break;}}}
  chunks.push(chars.slice(from,to).join(''));from=to;
 }
 return chunks;
}
