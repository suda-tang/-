const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function boardFocus(topic,time,duration){if(!Number.isFinite(duration)||duration<=0)return 0;const p=time/duration;const full=topic==='mentor-preface'?.74:.76;const pull=Math.max(full+.035,1-5/duration);return ease((p-full)/.055)*(1-ease((p-pull)/Math.min(.09,3/duration)));}
