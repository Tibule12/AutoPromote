const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const express=require('express');
const variant=process.env.STUDIO_REVIEW_VARIANT||'',apiPort=Number(process.env.STUDIO_QA_API_PORT||5128),host=variant==='-corrected'?'127.0.0.38':variant? '127.0.0.37':'127.0.0.36';
if(!/^(|-batch|-corrected)$/.test(variant)||![5128,5129,5138].includes(apiPort))throw Error('Use task-owned local ports.');
const {build}=JSON.parse(fs.readFileSync(path.join(__dirname,`reviewed-client-build${variant}.private.json`)));
if(!fs.existsSync(path.join(build,'index.html')))throw Error('Candidate build is not complete.');
const app=express();
app.use('/api',(req,res)=>{
 const upstream=http.request({host:'127.0.0.1',port:apiPort,path:req.originalUrl,method:req.method,headers:{...req.headers,host:`127.0.0.1:${apiPort}`}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
 upstream.on('error',()=>{if(!res.headersSent)res.status(502).json({message:'Local API unavailable'});else res.destroy()});
 req.pipe(upstream);
});
app.use(express.static(build));app.get(/.*/,(_req,res)=>res.sendFile(path.join(build,'index.html')));
const server=app.listen(5000,host,()=>console.log(`Repaired candidate on separate loopback ${host}:5000. Existing preview preserved.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
