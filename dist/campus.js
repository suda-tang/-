// Apply the same university seal to asynchronous status messages, including
// messages created later by PDF rendering and the saved-score list.
const selector='#notice,#play-status,#service-state,#score-subtitle,#import-progress-status,.notation-note';
function update(){
 for(const el of document.querySelectorAll(selector)){
  const busy=/正在.*(?:加载|读取|识别|渲染|排版|同步|连接|检查)|加载中|读取中|等待琴谱识别/.test(el.textContent);
  el.classList.toggle('campus-loading',busy);
  el.setAttribute('aria-busy',String(busy));
 }
}
new MutationObserver(update).observe(document.querySelector('.workspace'),{childList:true,subtree:true,characterData:true});
update();
