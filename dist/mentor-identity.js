export function isCartoonMentor(){const params=new URLSearchParams(location.search),lang=(params.get('lang')||'zh').replaceAll('_','-');return params.get('tour')==='1'&&/^zh(?:-(?:CN|Hans)(?:-CN)?)?$/i.test(lang);}
export function mentorIdentityText(text){if(!isCartoonMentor())return text;return String(text??'').replace(/我是苏大音乐学院的冒小[瑛英][。！]?/g,'').replace(/冒小[瑛英](?:教授|老师)?/g,'音乐教师').replace(/(?:Professor\s+)?Mao\s+Xiaoying/gi,'Music educator');}
export function mentorTrackListUrl(){return isCartoonMentor()?'/narration/tour.cartoon.json':'/narration/tour.json';}
export function mentorPrefaceUrl(){return isCartoonMentor()?'/narration/mentor-preface.cartoon.eleven-v4-20261027.m4a':'/narration/mentor-preface.eleven-v4-20261027.m4a';}
export function mentorGreetingUrl(name){const params=new URLSearchParams({name});if(isCartoonMentor())params.set('avatar','cartoon');return '/api/mentor-greeting?'+params;}
