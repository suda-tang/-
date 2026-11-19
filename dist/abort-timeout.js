// AbortSignal.any/timeout are absent in older Safari. Keep cancellation local
// to the request, and release listeners and timers when it finishes.
export function abortTimeout(parent, milliseconds){
 const controller=new AbortController();let timer=null;
 const dispose=()=>{if(timer!==null){clearTimeout(timer);timer=null}parent?.removeEventListener('abort',cancel)};
 const cancel=()=>{dispose();controller.abort(parent.reason)};
 if(parent?.aborted)cancel();
 else{parent?.addEventListener('abort',cancel,{once:true});reset()}
 function reset(){if(controller.signal.aborted)return;if(timer!==null)clearTimeout(timer);timer=setTimeout(()=>{dispose();controller.abort(new DOMException('请求等待超时，请重试','TimeoutError'))},milliseconds)}
 return {signal:controller.signal,dispose,reset};
}
