import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {splitTourSpeech} from '../dist/tour-speech-chunks.js';
import {manuscripts} from '../dist/tour-manuscripts.js';
import {createTourCopy} from '../dist/tour-copy.js';
let chunks=0,characters=0;
for(const route of ['education','technology'])for(const step of createTourCopy(route)){
 const text=step[3],parts=splitTourSpeech(text);
 assert.equal(parts.join(''),text,route+'/'+step.id+' text loss');
 assert.ok(parts.every(p=>Array.from(p).length<=240));
 assert.ok(text.length>=900,route+'/'+step.id+' lacks depth');
 assert.equal(step[2],manuscripts[route][step.id][0]);
 assert.ok(!/OpenMAIC|Audiveris|CosyVoice|VoxCPM|BasicPitch/.test(text),route+'/'+step.id+' tool branding in speech');
 assert.ok(!/[\uD800-\uDBFF]$/.test(parts.at(-1)));
 chunks+=parts.length;characters+=text.length;
}
for(const text of ['🎹'.repeat(300),'a'.repeat(1001),'a。b！c？\n'.repeat(100)]){const p=splitTourSpeech(text);assert.equal(p.join(''),text);assert.ok(p.every(c=>Array.from(c).length<=240));}
assert.deepEqual(splitTourSpeech(''),[]);assert.deepEqual(splitTourSpeech('  '),[]);assert.throws(()=>splitTourSpeech('x',12),RangeError);
const guide=await fs.readFile(new URL('../dist/guided-tour.js',import.meta.url),'utf8');
assert.ok(guide.includes('const spokenText=narrationText'));
assert.ok(guide.includes('continueChapter();'));
assert.ok(guide.includes('requestGeneration!==narrationGeneration'));
assert.ok(!guide.includes("encodeURIComponent(window.sudaLanguage?.translate(nextText)||nextText)"));
console.log(JSON.stringify({status:'PASS',chapters:88,characters,chunks,lossless:true,maxChunkCharacters:240,staleRequestGuard:true}));
