const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {localStorageRead}=require('../../src/services/unifiedCredits/localStorageRead');
test('actual local HTTP connection reset recovers exact source bytes with one extra read',async()=>{
 const bytes=Buffer.from('owned immutable media bytes');let requests=0;
 const server=http.createServer((req,res)=>{if(++requests===1){req.socket.destroy();return;}res.writeHead(200,{'Content-Length':bytes.length});res.end(bytes)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const result=await localStorageRead(()=>new Promise((resolve,reject)=>{http.get(`http://127.0.0.1:${server.address().port}/source`,res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject)}).on('error',reject)}));
  assert.deepEqual(result,bytes);assert.equal(requests,2);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('denial, missing object, changed generation and unknown failures are not retried',async()=>{
 for(const code of [403,404,409,'HASH_CHANGED','UNKNOWN']){let calls=0;const error=Object.assign(new Error('read refused'),{code});await assert.rejects(localStorageRead(async()=>{calls++;throw error}),e=>e===error);assert.equal(calls,1);}
});
test('persistent connection failure stops after exactly two reads',async()=>{
 let calls=0;const error=Object.assign(new Error('socket hang up'),{code:'ECONNRESET'});await assert.rejects(localStorageRead(async()=>{calls++;throw error}),e=>e===error);assert.equal(calls,2);
});
