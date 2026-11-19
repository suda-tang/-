import {chapters} from './tour-chapters.js?v=full-demonstration1';
import {audienceChapters} from './tour-audiences.js?v=research-depth-20261025';
export function createTourCopy(direction='education'){
 return audienceChapters(chapters,direction).map(chapter=>Object.assign([chapter.panel,chapter.target,chapter.title,chapter.text],{id:chapter.id,group:chapter.group,demo:chapter.id==='classroom-design'?'classroom-configure':chapter.id==='classroom-actions'?'classroom-status':chapter.demo,english:chapter.english,audience:chapter.audience}));
}
