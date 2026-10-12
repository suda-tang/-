import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {modelCompletion} from './model-client.mjs';
async function server(handler,fn){const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+s.address().port)}finally{s.closeAllConnections();await new Promise(r=>s.close(r))}}
const options=url=>({url,key:'test',model:'test',messages:[],idleMs:1000,totalMs:2000});
test('collects split UTF-8 stream and ends without waiting for socket close',async()=>server((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: {"choices":[{"delta":{"content":"高中音乐"}}]}\n\n');setTimeout(()=>res.write('data: {"choices":[{"delta":{"content":"课堂"},"finish_reason":"stop"}]}\n\n'),20)},async url=>assert.equal(await modelCompletion(options(url)),'高中音乐课堂')));
test('rejects truncated replies instead of saving broken PPT',async()=>server((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.end('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')},async url=>assert.rejects(modelCompletion(options(url)),/完成前关闭/)));
test('reports upstream errors and preserves nonretryable HTTP status',async()=>server((req,res)=>{res.writeHead(401);res.end('{}')},async url=>assert.rejects(modelCompletion(options(url)),e=>e.status===401)));
test('reports stalled connection with concrete timeout',async()=>server((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': waiting\n\n')},async url=>assert.rejects(modelCompletion({...options(url),idleMs:50}),/未收到模型数据/)));
