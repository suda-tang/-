export function listeningInstruction(text){
 const source=String(text||'').replace(/<[^>]*>/g,'');
 if(/(?:不要|不必|无需|不需要|暂不)[^。！？]{0,12}(?:听|播放)/.test(source))return null;
 const match=source.match(/(?:聆听|试听|播放|听一听|听)(?:[^。！？；]{0,36}?)(\d+(?:\.\d+)?|[一二两三四五六七八九十百]+)\s*(秒钟?|分钟)/i);
 const range=source.match(/第\s*(\d+)\s*(?:[—–~～至到-]\s*第?\s*(\d+)\s*)?小节/);
 const full=/(?:请(?:大家|同学们)?|现在|接下来|再次|再来)[^。！？；]{0,18}(?:聆听|播放|听一遍|听一听)[^。！？；]{0,8}全曲|(?:完整聆听全曲)/.test(source);
 const rangeCommand=range&&/(?:请(?:大家|同学们)?)[^。！？；]{0,12}(?:聆听|播放|听一听)/.test(source);
 if(!match&&!full&&!rangeCommand)return null;
 const number=value=>{if(/^\d/.test(value))return Number(value);const digits={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};let sum=0,n=0;for(const char of value){if(char==='十'||char==='百'){sum+=(n||1)*(char==='十'?10:100);n=0}else n=digits[char]||0}return sum+n};
 const seconds=match?number(match[1])*(match[2].startsWith('分')?60:1):0;if(match&&!(seconds>0&&seconds<=1800))return null;
 return{type:'music-listen',seconds,...(full?{wholeScore:true}:{}),...(range?{startMeasure:Number(range[1]),endMeasure:Number(range[2]||range[1])}:{})};
}
export function lessonActions(actions=[],elements=[]){
 const output=[];let cue=null,cueUsed=false;const texts=new Map(elements.map(e=>[e.id,e.content||e.text||'']));
 for(let i=0;i<actions.length;i++){const action=actions[i];output.push(action);if(action.type==='spotlight'||action.type==='laser'){cue=action.elementId;cueUsed=false}if(action.type==='speech'){const listen=listeningInstruction(action.text)||(!cueUsed&&listeningInstruction(texts.get(cue)));if(listen){cueUsed=true;if(!['music-listen','listen','play_music'].includes(actions[i+1]?.type))output.push(listen)}}}
 return output;
}

export function speechRegion(text,elements=[],currentId=null){
 const plain=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/&[^;]+;/g,' ').toLowerCase();
 const tokens=value=>new Set(plain(value).match(/[a-z]{3,}|[\u3400-\u9fff]{2,}/g)?.flatMap(word=>/[a-z]/.test(word)?[word]:Array.from({length:word.length-1},(_,i)=>word.slice(i,i+2)))||[]);
 const spoken=tokens(text),scores=elements.filter(e=>e.type==='text').map(e=>{const words=tokens(e.content||e.text),common=[...words].filter(w=>spoken.has(w)).length;return {id:e.id,common,score:common/Math.max(1,words.size)}}).sort((a,b)=>b.score-a.score||b.common-a.common);
 const current=scores.find(e=>e.id===currentId),best=scores[0];
 return best&&best.common>=3&&best.score>=.35&&best.score>(current?.score||0)+.2?best.id:(elements.some(e=>e.id===currentId)?currentId:null);
}
