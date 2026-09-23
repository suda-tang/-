const setup=document.querySelector('.setup'),playback=document.querySelector('.playback-panel');
const anchor=document.createComment('playback');playback.before(anchor);
const panel=document.createElement('details');panel.className='mobile-settings';
const summary=document.createElement('summary');summary.textContent='琴谱库与练习设置';
setup.before(panel);panel.append(summary,setup);
const query=matchMedia('(max-width:800px)');
function layout(){
 if(query.matches){panel.open=false;document.querySelector('.heading').after(playback);}
 else{panel.open=true;anchor.after(playback);}
}
query.addEventListener('change',layout);layout();
// Close the long settings panel once a new score has been selected.
new MutationObserver(()=>{if(query.matches&&document.querySelector('#play-button').disabled===false)panel.open=false;}).observe(document.querySelector('#score-title'),{childList:true});
