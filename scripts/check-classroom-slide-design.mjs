import assert from 'node:assert/strict';
import {designClassroomSlide} from '../dist/classroom-slide-design.js';
const original={elements:[{id:'title',type:'text',left:20,top:20,content:'<p>作品比较</p>'},{id:'body',type:'text',left:30,top:140,content:'<p>先聆听，再说明音乐依据。</p>'},{id:'chart',type:'chart',left:50,top:200,width:800,height:500,chartType:'column',data:{labels:['A','B'],series:[[1,2]]}}]};
const saved=JSON.stringify(original),designed=designClassroomSlide(original,{title:'作品比较'});assert.equal(JSON.stringify(original),saved);assert.equal(designed.elements.find(e=>e.id==='chart').data.series[0][1],2);assert.deepEqual(designClassroomSlide(designed),designed);assert(designed.elements.every(e=>(e.left||0)+(e.width||0)<=1000&&(e.top||0)+(e.height||0)<=563));
console.log('PASS shared slide composition: data, bounds, identifiers and idempotence');
