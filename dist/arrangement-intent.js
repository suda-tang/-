// Validate the entire proposal before changing any existing control.
export function validateArrangementIntent(raw, capabilities){
 const value=typeof raw==='string'?JSON.parse(raw):raw;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['style','programs','drums'].includes(k)))throw Error('配器参数无效');
 if(!capabilities.styles.some(s=>s.id===value.style))throw Error('没有这个编制');
 if(typeof value.drums!=='boolean')throw Error('请明确是否加入鼓声部');
 const programs=value.programs??[];
 if(!Array.isArray(programs)||programs.some(p=>!Number.isInteger(p)||!capabilities.programs.some(x=>x.id===p)))throw Error('包含不支持的乐器');
 if(new Set(programs).size!==programs.length)throw Error('同一乐器不能重复选择');
 if(value.style==='custom'&&(programs.length<1||programs.length>8))throw Error('请选择 1–8 个乐器声部');
 if(value.style!=='custom'&&programs.length)throw Error('预设编制不能夹带自选乐器');
 return {style:value.style,programs:[...programs],drums:value.drums||value.style==='original'};
}

export function arrangementCapabilities(root=document){
 return {styles:[...root.querySelectorAll('.arrangement-presets [data-style]')].map(b=>({id:b.dataset.style,name:b.textContent.trim()})),programs:[...root.querySelectorAll('input[name="arrangement-program"]')].map(i=>({id:Number(i.value),name:i.parentElement.textContent.trim()}))};
}

export function configureArrangement(raw,root=document){
 const value=validateArrangementIntent(raw,arrangementCapabilities(root));
 const select=root.querySelector('#arrangement-select'),drums=root.querySelector('#generation-drums');
 const preset=[...root.querySelectorAll('.arrangement-presets [data-style]')].find(b=>b.dataset.style===value.style);
 if(!select||!drums||!preset||preset.disabled)throw Error('配器控件尚未准备好');
 preset.click();
 for(const input of root.querySelectorAll('input[name="arrangement-program"]')){input.checked=value.programs.includes(Number(input.value));input.dispatchEvent(new Event('change',{bubbles:true}));}
 drums.checked=value.drums;drums.dispatchEvent(new Event('change',{bubbles:true}));
 const actual=[...root.querySelectorAll('input[name="arrangement-program"]:checked')].map(i=>Number(i.value));
 if(select.value!==value.style||drums.checked!==value.drums||JSON.stringify(actual.sort((a,b)=>a-b))!==JSON.stringify([...value.programs].sort((a,b)=>a-b)))throw Error('配器参数没有全部生效，未提交生成');
 return value;
}
