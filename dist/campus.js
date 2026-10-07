// Apply the same university seal to asynchronous status messages, including
// messages created later by PDF rendering and the saved-score list.
const selector='#notice,#play-status,#service-state,#score-subtitle,#import-progress-status,.notation-note';
function update(elements=document.querySelectorAll(selector)){
 for(const el of elements){
  const busy=/正在.*(?:加载|读取|识别|渲染|排版|同步|连接|检查)|加载中|读取中|等待琴谱识别/.test(el.textContent);
  el.classList.toggle('campus-loading',busy);
  el.setAttribute('aria-busy',String(busy));
 }
}
new MutationObserver(records=>{const changed=new Set();for(const record of records){const target=record.target.nodeType===1?record.target:record.target.parentElement;const status=target?.closest(selector);if(status)changed.add(status);for(const node of record.addedNodes||[]){if(node.nodeType!==1)continue;if(node.matches(selector))changed.add(node);node.querySelectorAll(selector).forEach(el=>changed.add(el));}}if(changed.size)update(changed);}).observe(document.querySelector('.workspace'),{childList:true,subtree:true,characterData:true});
update();
