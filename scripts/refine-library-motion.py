from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
p=root/'dist/index.html';s=p.read_text(encoding='utf-8');s=s.replace('src="/suda-seal.svg" alt="苏州大学校徽"','src="/assets/suda-official.jpg" alt="苏州大学"');p.write_text(s,encoding='utf-8')
s=(root/'outputs/suda-vector.svg').read_text(encoding='utf-8')
s=re.sub(r'viewBox="[^"]+"','viewBox="137 467 118 119"',s,count=1)
(root/'dist/suda-seal.svg').write_text(s,encoding='utf-8')
p=root/'dist/library.js';s=p.read_text(encoding='utf-8')
s=s.replace("let closing=false,motion=null;","let closing=false,motion=null,expanding=false,dockRect=null;")
s=s.replace("arrow.onclick=()=>list.scrollBy({left:direction*list.clientWidth*.72,behavior:'smooth'});", """let held=false,frame=0,start=0,last=0,moved=false;
    const release=()=>{held=false;cancelAnimationFrame(frame);list.style.scrollSnapType='';list.style.scrollBehavior='';};
    arrow.onpointerdown=e=>{if(e.button!==0)return;held=true;moved=false;start=last=performance.now();arrow.setPointerCapture(e.pointerId);list.style.scrollSnapType='none';list.style.scrollBehavior='auto';
      const pull=now=>{if(!held)return;const elapsed=now-start,dt=Math.min(32,now-last);last=now;if(elapsed>180){moved=true;list.scrollLeft+=direction*Math.min(2.8,.3+(elapsed-180)/650)*dt;}frame=requestAnimationFrame(pull);};frame=requestAnimationFrame(pull);};
    arrow.onpointerup=release;arrow.onpointercancel=release;arrow.onlostpointercapture=release;window.addEventListener('blur',release);
    arrow.onclick=()=>{if(!moved)list.scrollBy({left:direction*list.clientWidth*.72,behavior:'smooth'});};""")
start=s.index('    const frames=open?');end=s.index('    await motion.finished.catch',start)
s=s[:start]+"""    const box=dockRect||expand.getBoundingClientRect();
    const x=box.left+box.width/2-innerWidth/2,y=box.top+box.height/2-innerHeight/2;
    const dock={opacity:0,transform:`translate3d(${x}px,${y}px,0) scale(.07,.025)`,borderRadius:'80px'};
    const full={opacity:1,transform:'translate3d(0,0,0) scale(1)',borderRadius:'0px'};
    motion=browser.animate(open?[dock,{opacity:1,transform:`translate3d(${x*.15}px,${y*.25}px,0) scale(.8,.9)`,borderRadius:'38px',offset:.58},full]:[full,dock],{duration:open?650:460,easing:open?'cubic-bezier(.18,.8,.2,1)':'cubic-bezier(.55,.08,.8,.4)',fill:'both'});
"""+s[end:]
s=s.replace("if(!browser.open||closing)return;closing=true;","if(!browser.open||closing||expanding)return;closing=true;")
s=s.replace("await animateBrowser(false);browser.close();", "await animateBrowser(false);browser.close();motion?.cancel();")
s=s.replace("if(browser.open||closing)return;\n    browser.append(list);", "if(browser.open||closing||expanding)return;expanding=true;dockRect=expand.getBoundingClientRect();\n    browser.append(list);")
s=s.replace("animateCards('full');await animateBrowser(true);", "await animateBrowser(true);motion?.cancel();expanding=false;if(browser.open&&!closing)animateCards('full');")
s=s.replace("let closing=false", "let closing=false")
s=s.replace("  async function reload(){\n    scoreCache.clear();\n    if(pollTimer)clearTimeout(pollTimer);list.textContent='正在打开云曲谱';", """  let reloading=false;
  const cloudNotice=document.createElement('div');cloudNotice.className='cloud-library-notice';cloudNotice.setAttribute('role','status');cloudNotice.hidden=true;document.body.append(cloudNotice);
  async function reload(){
    if(reloading)return;reloading=true;refresh.disabled=true;cloudNotice.textContent='正在打开云曲库';cloudNotice.hidden=false;
    scoreCache.clear();if(pollTimer)clearTimeout(pollTimer);
    const leaving=[...list.querySelectorAll('.library-score')];
    if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await Promise.all(leaving.map((card,index)=>{card._deal?.cancel();card.style.opacity='';return card.animate([{opacity:1,translate:'0px 0px',rotate:'0deg',scale:'1'},{opacity:0,translate:`${Math.max(400,list.clientWidth)}px -35px`,rotate:'18deg',scale:'.25'}],{duration:360,delay:Math.min(index*28,350),easing:'cubic-bezier(.55,.05,.9,.4)',fill:'forwards'}).finished.catch(()=>{});}));""")
s=s.replace("    }catch{list.textContent='琴谱库暂不可用，点击刷新重试。';}\n  }", "    }catch{list.textContent='琴谱库暂不可用，点击刷新重试。';}\n    finally{reloading=false;refresh.disabled=false;cloudNotice.hidden=true;}\n  }")
# Always paint a local cover immediately; online replacements may arrive later.
s=s.replace("button._item=item;", """button._item=item;
        const fallback=document.createElement('span');fallback.className='library-cover';fallback.style.backgroundImage=`url('/api/scores/${item.id}/cover-fallback')`;button.append(fallback);""")
p.write_text(s,encoding='utf-8')
p=root/'dist/media-import.css';p.write_text(p.read_text(encoding='utf-8')+'''\n.cloud-library-notice{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);padding:14px 24px;border-radius:24px;background:#fffef2;box-shadow:0 12px 40px #35233725;border:1px solid #fff;backdrop-filter:blur(18px);z-index:20000;font-size:13px;pointer-events:none}.cloud-library-notice[hidden]{display:none}.studio .library-navigation{display:grid!important;grid-template-columns:repeat(4,1fr);gap:8px}.studio .library-navigation button{width:100%;margin:0!important;touch-action:none}.studio .library-browser .library-score{content-visibility:visible}\n''',encoding='utf-8')
