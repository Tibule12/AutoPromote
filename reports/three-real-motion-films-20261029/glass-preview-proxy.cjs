// Isolated candidate files; ordinary local API/emulator traffic is forwarded.
// No browser route interception, response fixtures or altered Auth state.
const http=require('http'),fs=require('fs'),path=require('path');
const express=require('express');
const appOrigin='http://127.0.0.1:39545';
const build='/dev/shm/autopromote-real-motion-glass-client';
const staticApp=express();staticApp.use(express.static(build));
staticApp.get('/{*path}',(_req,res)=>res.sendFile(path.join(build,'index.html')));
let ownOrigin;
const server=http.createServer((req,res)=>{
 let target;try{target=new URL(req.url,ownOrigin);}catch{res.writeHead(400).end();return;}
 if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)){res.writeHead(403).end();return;}
 if((target.origin===appOrigin||target.origin===ownOrigin)&&!target.pathname.startsWith('/api/')){
  req.url=target.pathname+target.search;staticApp(req,res);return;
 }
 const upstream=http.request(target,{method:req.method,headers:{...req.headers,host:target.host}},answer=>{
  res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);
 });upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);
});
server.on('connect',(_req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
server.listen(0,'127.0.0.1',()=>{ownOrigin='http://127.0.0.1:'+server.address().port;
 fs.writeFileSync('/dev/shm/autopromote-three-films/glass-candidate.json',JSON.stringify({origin:ownOrigin,pid:process.pid,appOrigin,build}));
 console.log('Isolated glass candidate ready.');
});
