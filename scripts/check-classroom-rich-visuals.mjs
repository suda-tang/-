import fs from 'node:fs';
import assert from 'node:assert/strict';
import {resolveTeachingVisuals,placeTeachingImage} from '../services/openmaic/classroom-visuals.mjs';
const id=process.argv[2];
const course=JSON.parse(fs.readFileSync(`.sites-runtime/classrooms/${id}.json`,'utf8'));
const input={...JSON.parse(fs.readFileSync(`.sites-runtime/classrooms/${id}.input.json`,'utf8')),...course};
const visuals=await resolveTeachingVisuals(input.outlines,input,async()=>{throw Error('offline test')});
let added=0;
for(const scene of course.scenes){const asset=visuals.get(scene.outlineId)?.image;if(scene.type==='slide'&&asset){assert(asset.src.startsWith('data:image/jpeg;base64,'));placeTeachingImage(scene.content.canvas,asset);scene.visualRevision=(scene.visualRevision||0)+1;added++;}}
assert(added>0,'original score diagrams must remain available without a model or image search');
fs.writeFileSync('audit/classroom-rich-visuals.json',JSON.stringify(course));
if(process.argv.includes('--save')){const path=`.sites-runtime/classrooms/${id}.json`;fs.copyFileSync(path,path+'.before-visuals');course.updatedAt=Date.now()/1000;fs.writeFileSync(path,JSON.stringify(course));}
console.log('PASS actual score: embedded illustration pages',added);
