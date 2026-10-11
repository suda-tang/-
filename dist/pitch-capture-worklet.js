class PracticeCapture extends AudioWorkletProcessor{
 constructor(){super();this.samples=[];this.start=0;this.finished=false;this.port.onmessage=e=>{if(e.data==='finish'){this.flush();this.finished=true;this.port.postMessage({type:'ended'});}};}
 flush(){if(!this.samples.length)return;const samples=Float32Array.from(this.samples);this.port.postMessage({type:'audio',samples,start:this.start,rate:sampleRate},[samples.buffer]);this.samples=[];}
 process(inputs){if(this.finished)return false;const input=inputs[0]?.[0];if(input){if(!this.samples.length)this.start=currentTime;for(const value of input)this.samples.push(value);if(this.samples.length>=sampleRate)this.flush();}return true;}
}
registerProcessor('practice-capture',PracticeCapture);
