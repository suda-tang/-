import {dictionary} from '../dist/translations-en.js';
import fs from 'node:fs';
import {extraDictionary} from '../dist/translations-extra.js';
Object.assign(dictionary,extraDictionary);
for(const chapter of JSON.parse(fs.readFileSync('dist/narration/mentor-script.en.json','utf8'))){dictionary['narration:'+chapter.id]=chapter.text;dictionary['narration-title:'+chapter.id]=chapter.title;}
const extra=fs.readFileSync('dist/language-switch.js','utf8').match(/Object\.assign\(dictionary,(\{[^\n]+\})\);/);if(extra)Object.assign(dictionary,Function('return '+extra[1])());
for(const template of ['Loading the full-body model: {n}%','Page {n}','Measure {n} · {n} / {n} onsets','{n} onsets · {n} measures','Target: {n} BPM','Uploading {n} / {n}','Score tempo: {n} BPM'])dictionary['template:'+template]=template;
fs.writeFileSync('.sites-runtime/ui-translations-source.json',JSON.stringify(dictionary));
