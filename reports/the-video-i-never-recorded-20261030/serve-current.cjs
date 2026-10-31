// Isolated current-source Studio review host. Existing App files are untouched.
const express=require('express'),path=require('path'),fs=require('fs');
const app=express(),build=path.join(__dirname,'proof/verified-studio-build');
if(!fs.existsSync(path.join(build,'index.html')))throw Error('Build the current sources first.');
app.use('/background-review',express.static(build));
app.get('/background-review/{*rest}',(_req,res)=>res.sendFile(path.join(build,'index.html')));
app.get('/',(_req,res)=>res.redirect('/background-review/'));
const server=app.listen(5000,'127.0.0.40',error=>{
  if(error){console.error(error.message);process.exit(1);}
  console.log('Current isolated Studio listening on 127.0.0.40:5000; headless localhost resolver selects this listener.');
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
