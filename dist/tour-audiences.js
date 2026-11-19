import {manuscripts} from './tour-manuscripts.js?v=research-depth-20261025';
import {audienceEnglish} from './tour-audience-english.js';
// Explicit link choices take precedence over inferred mentor profiles.
export function tourAudience(value){return /^(technology|technical|ai|computer|generation)$/.test(value||'')?'technology':'education';}
export const audiences={
 education:{label:'音乐教育',en:'Music education',intro:'音乐教育研究',description:'结合星海高中的教学实践，介绍作品选择、聆听比较、课堂互动与练习反馈，以及这些操作怎样用于观察学生的音乐判断。'},
 technology:{label:'人工智能技术',en:'AI and computing',intro:'系统技术实现',description:'从一份作品的导入和解析开始，介绍时间与声部的对应、智能体操作、课堂执行和异常恢复，说明各模块之间的数据关系。'}
};
const priority={education:['opening','select','ai-library','ai-context','ai-solo','ai-range','ai-chords','ai-structure','classroom-design','classroom-evidence','classroom-slides','classroom-actions','classroom-state','classroom-interaction','classroom-materials','practice','practice-plan','source-check'],technology:['opening','select','inputs','recording-import','shared-time','part-identity','ai-tools','ai-library','ai-context','ai-execution','ai-solo','ai-range','ai-chords','ai-structure','classroom-design','classroom-evidence','classroom-actions','classroom-interaction','tasks','recovery']};
const groups={'项目来由':'研究背景','材料与识谱':'音乐材料处理','AI 找谱':'音乐资源检索','AI 连续操作':'智能体操作','AI 音乐分析':'音乐分析','播放与声部':'多声部演奏','生成与审听':'音乐改编','曲谱课堂':'曲谱课堂','练习与研究':'练习反馈','任务与复用':'后台任务'};
export function audienceChapters(chapters,value){
 const route=tourAudience(value),copy=manuscripts[route];
 const order=[...priority[route],...chapters.map(c=>c.id).filter(id=>!priority[route].includes(id)&&id!=='research'),'research'];
 const byId=new Map(chapters.map(c=>[c.id,c]));
 return order.map(id=>{const chapter=byId.get(id),row=copy[id];if(!chapter||!row)throw Error('Missing tour manuscript: '+route+'/'+id);return {...chapter,title:row[0],text:row[1],english:audienceEnglish[route][id],group:groups[chapter.group]||chapter.group,audience:route};});
}
