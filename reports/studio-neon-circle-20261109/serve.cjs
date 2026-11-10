const fs=require('fs'),path=require('path'),express=require('express');
const report=__dirname,build=JSON.parse(fs.readFileSync(path.join(report,'candidate-build.json'))).build;
const app=express();app.use(express.static(build));app.use((_req,res)=>res.sendFile(path.join(build,'index.html')));
const server=app.listen(0,'127.0.0.1',()=>{const origin=`http://127.0.0.1:${server.address().port}`;fs.writeFileSync(path.join(report,'candidate-server.json'),JSON.stringify({origin,pid:process.pid,build},null,2));console.log(origin);});
