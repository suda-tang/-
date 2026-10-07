import {parseMidi} from './midi.js';
self.onmessage=({data})=>{try{const score=parseMidi(data.buffer,data.name,(progress,label)=>self.postMessage({progress,label}));self.postMessage({score});}catch(error){self.postMessage({error:error.message});}};
