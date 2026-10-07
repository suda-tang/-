export function filenameTitle(filename){
 let name=String(filename||'').split(/[\\/]/).pop().replace(/\.(mid|midi|musicxml|mxl|xml|pdf|png|jpe?g|webp|mp3|wav|m4a|mp4|mov)$/i,'');
 const quoted=name.match(/[《「]([^》」]+)[》」]/);if(quoted)return quoted[1].trim();
 name=name.replace(/\.(mp3|wav|m4a)\s*\d*$/i,'').replace(/[_ -]\d{4,}$/,'').replace(/^简谱[·：:]?/,'');
 name=name.split(/(?:作词|作曲|编曲|编配|制谱|排版|改编|原调|独奏|钢琴版|完整版)/)[0];
 name=name.split(/[（(]/)[0].split(/[-–—]/)[0].replace(/\.(mp3|wav|m4a)$/i,'');
 return name.trim().replace(/^[_ -]+|[_ -]+$/g,'')||'未命名曲谱';
}
export function usableSongTitle(title){const text=String(title||'').trim();return !!text&&!/^(?:acoustic grand piano|piano|grand piano|untitled|untitled score|conductor|tempo(?: track)?|midi(?: score|乐谱)?|track\s*\d*|音轨\s*\d*|未命名.*|导入.*|钢琴|鼓组|violin|strings|flute|bass|drums?)$/i.test(text)&&!text.includes('\ufffd')&&!/^(?:作词|作曲|编曲|制谱)[:：]/.test(text);}
