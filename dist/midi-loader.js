export function readMidi(buffer,name,progress=()=>{}){return new Promise((resolve,reject)=>{
 let worker,timer,finished=false;
 const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);if(worker){worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();}error?reject(error):resolve(result);};
 try{
  worker=new Worker(new URL('./midi-worker.js',import.meta.url),{type:'module'});
  timer=setTimeout(()=>finish(Error('MIDI 解析超过两分钟，请检查文件或拆分音轨')),120000);
  worker.onmessage=({data})=>{try{if(data.error)finish(Error(data.error));else if(data.score)finish(null,data.score);else progress(data.progress,data.label);}catch(error){finish(error);}};
  worker.onerror=event=>finish(Error('MIDI 解析进程失败：'+(event.message||'无法启动解析')));
  worker.onmessageerror=()=>finish(Error('MIDI 解析结果无法读取，请重试'));
  worker.postMessage({buffer,name},[buffer]);
 }catch(error){finish(error);}
});}
export function saveMidi(url,options={},progress=()=>{}){return new Promise((resolve,reject)=>{
 const xhr=new XMLHttpRequest();xhr.open('POST',url);xhr.timeout=options.timeoutMs||90000;
 for(const [key,value]of Object.entries(options.headers||{}))xhr.setRequestHeader(key,value);
 xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(e.loaded/e.total)};
 xhr.onload=()=>{progress(1);try{const data=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw Error(data.error||'云端保存失败（'+xhr.status+'）');resolve(data)}catch(error){reject(error)}};
 xhr.onerror=()=>reject(Error('上传连接中断：'+(xhr._sent?'文件已发送，等待服务端处理结果时连接断开；请刷新曲谱确认是否绑定成功':'文件尚未发送完整，请检查网络并重试')));
 xhr.upload.onload=()=>{xhr._sent=true;progress(1);};xhr.ontimeout=()=>reject(Error('服务端处理超过 '+Math.round(xhr.timeout/1000)+' 秒'));
 xhr.onabort=()=>reject(Error('MIDI 上传已取消'));xhr.send(options.body);
});}
export function readLocalMidi(file,progress=()=>{}){return new Promise((resolve,reject)=>{
 const reader=new FileReader();let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;reader.abort();reject(Error('本地 MIDI 文件读取超过 20 秒；若文件保存在 iCloud 或网盘，请先下载到设备后再选择'));},20000);
 reader.onprogress=e=>{if(e.lengthComputable)progress(e.loaded/e.total)};
 reader.onload=()=>{clearTimeout(timer);resolve(reader.result)};
 reader.onerror=()=>{clearTimeout(timer);reject(Error('本地 MIDI 文件无法读取：'+(reader.error?.message||'文件不可用')))};
 reader.onabort=()=>{clearTimeout(timer);if(!timedOut)reject(Error('本地文件读取已中止'))};
 try{reader.readAsArrayBuffer(file);}catch(error){clearTimeout(timer);reject(error);}
});}
