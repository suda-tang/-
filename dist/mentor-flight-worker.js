import {flightSafetyReady,restoreSafety} from './mentor-flight-safety.js?v=flow138';
import {computeFlightPoints} from './mentor-flight-plan.js?v=flow138';
let jobs=Promise.resolve();self.onmessage=({data})=>{jobs=jobs.then(async()=>{try{await flightSafetyReady;restoreSafety(data.snapshot);self.postMessage({id:data.id,points:await computeFlightPoints(data)});}catch(error){self.postMessage({id:data.id,error:error.message});}});};
