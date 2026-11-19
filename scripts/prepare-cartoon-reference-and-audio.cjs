const fs=require('fs'),{spawnSync}=require('child_process'),path=require('path');
const d=JSON.parse(fs.readFileSync('dist/narration/models/mentor-portrait-surface.json','utf8')),positions=[];
for(let i=0;i<d.positions.length;i+=3)positions.push(d.positions[i]*1.4,d.positions[i+1]*1.45,d.positions[i+2]*.9+.07);
fs.writeFileSync('dist/narration/models/mentor-cartoon-profile.json',JSON.stringify({positions,indices:d.indices,photographicTexture:false,source:'authorised-reference-proportions'}));
const source='dist/narration/mentor-preface.voxcpm.clean.m4a',target='dist/narration/mentor-preface.cartoon.m4a',ff='C:/Users/mail/AppData/Local/Programs/nascab/libs/ffmpeg/bin/win/x64/ffmpeg.exe';
// Word-aligned self-introduction: 3.96–5.72 s. Join within the surrounding
// silences (previous phrase ends 3.64 s; the next begins at 6.42 s).
const r=spawnSync(ff,['-v','error','-y','-i',source,'-filter_complex','[0:a]asplit=2[a][b];[a]atrim=end=3.82,asetpts=PTS-STARTPTS,afade=t=out:st=3.80:d=0.02[left];[b]atrim=start=6.20,asetpts=PTS-STARTPTS,afade=t=in:d=0.02[right];[left][right]concat=n=2:v=0:a=1[out]','-map','[out]','-c:a','aac','-b:a','128k','-movflags','+faststart',target],{encoding:'utf8'});if(r.status)throw Error(r.stderr);
const tracks=JSON.parse(fs.readFileSync('dist/narration/tour.json','utf8'));const first=tracks.find(t=>t.id==='mentor-preface');if(!first||!first.text.includes('冒小瑛'))throw Error('Original self-introduction text not found');first.url='/narration/mentor-preface.cartoon.m4a';first.text=first.text.replace(/我是苏大音乐学院的冒小瑛[。！]?/,'');fs.writeFileSync('dist/narration/tour.cartoon.json',JSON.stringify(tracks));
fs.writeFileSync('.sites-runtime/tour-synthesis/cartoon-preface-edit.json',JSON.stringify({source,target,removed:[3.82,6.20],wordRange:[3.96,5.72],removedSeconds:2.38,originalPreserved:true}));
console.log('Cartoon facial proportions and name-free preface prepared');
