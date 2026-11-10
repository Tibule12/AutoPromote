// Read-only access to the first completed worker's retained original URL.
const http=require('http');
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)||!/^\/local-output\/viral_[a-f0-9]{64}_viral-[a-f0-9]{8}\.mp4$/.test(req.url)){res.writeHead(403).end();return;}
 const upstream=http.request({host:'127.0.0.1',port:8028,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:8028'}},answer=>{
  const headers={...answer.headers};
  if(req.headers.origin==='http://localhost:5000'){headers['access-control-allow-origin']=req.headers.origin;headers.vary='Origin';}
  res.writeHead(answer.statusCode,headers);answer.pipe(res);
 });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});server.listen(8000,'127.0.0.1',()=>console.log('Original completed local output, GET/HEAD only, exact local Studio origin.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
