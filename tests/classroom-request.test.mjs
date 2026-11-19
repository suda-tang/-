import test from 'node:test';
import assert from 'node:assert/strict';
import {classroomRequest} from '../dist/classroom-request.js';
function mock(t,fn){const old=globalThis.fetch;globalThis.fetch=fn;t.after(()=>globalThis.fetch=old);}
test('temporary HTML gateway error recovers on a read',async t=>{
 let calls=0;mock(t,async()=>++calls===1?{ok:false,status:502,json:async()=>{throw Error('HTML');}}:{ok:true,json:async()=>({scenes:[]})});
 assert.deepEqual(await classroomRequest('/api/classroom/test'),{scenes:[]});assert.equal(calls,2);
});
test('create requests are never duplicated after a gateway error',async t=>{
 let calls=0;mock(t,async()=>{calls++;return{ok:false,status:503,json:async()=>{throw Error('HTML');}};});
 await assert.rejects(classroomRequest('/api/classroom/test',{goal:'lesson'}),/HTTP 503/);assert.equal(calls,1);
});
test('invalid input is not retried',async t=>{
 let calls=0;mock(t,async()=>{calls++;return{ok:false,status:400,json:async()=>({error:'范围无效'})};});
 await assert.rejects(classroomRequest('/api/classroom/test'),/范围无效/);assert.equal(calls,1);
});
test('null success response produces a useful error',async t=>{
 mock(t,async()=>({ok:true,json:async()=>null}));await assert.rejects(classroomRequest('/api/classroom/test'),/空结果/);
});
