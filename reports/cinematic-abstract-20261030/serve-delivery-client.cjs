// Same reviewed local client and Auth origin; current task-owned API source.
const fs=require('fs'),path=require('path'),http=require('http'),express=require('express');
const {build}=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../motion-graphics-rebuild-20261029/reviewed-client-build.private.json')));
const app=express();
app.use('/api',(req,res)=>{const upstream=http.request({host:'127.0.0.1',port:5148,path:req.originalUrl,method:req.method,headers:{...req.headers,host:'127.0.0.1:5148'}},answer=>{res.writeHead(answer.statusCode,answer.headers);answer.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(upstream);});
app.use(express.static(build));app.get(/.*/,(_req,res)=>res.sendFile(path.join(build,'index.html')));
const server=app.listen(5000,'127.0.0.36',()=>console.log('Same local reviewed client, current owned API5148.'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit()));
