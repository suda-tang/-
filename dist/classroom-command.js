// Normalize tool arguments at the boundary, then validate against registered UI fields.
export function normalizeClassroomCommand(command){
 if(!command||typeof command!=='object'||Array.isArray(command))throw Error('课堂指令格式无效');
 if(command.operation!=='configure')return command;
 let raw=command.settings||command.parameters||command.options||command;
 if(typeof raw==='string')raw=JSON.parse(raw);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('课堂设置格式无效');
 const settings={};for(const key of ['goal','schoolStage','mode','duration','scope','start','end'])if(raw[key]!=null)settings[key]=raw[key];
 const range=raw.range||command.range;
 settings.start??=raw.from??raw.startMeasure??range?.start??range?.from;
 settings.end??=raw.to??raw.endMeasure??range?.end??range?.to;
 if(typeof range==='string'){const span=range.match(/(\d+)\D+(\d+)/);if(span){settings.start??=Number(span[1]);settings.end??=Number(span[2]);}}
 settings.schoolStage??=raw.stage;settings.duration??=raw.minutes;
 for(const key of Object.keys(settings))if(settings[key]==null)delete settings[key];
 if(settings.start!=null||settings.end!=null)settings.scope??='range';
 if(!Object.keys(settings).length)throw Error('没有收到可更新的课堂设置，请补齐 settings 参数');
 return {...command,settings};
}
