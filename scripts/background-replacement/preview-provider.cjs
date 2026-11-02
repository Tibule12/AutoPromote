// Loopback transport only; actual production compositor, actual owned bytes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process'),express=require('express');
async function create({directory,python,env,origin}){
 require('../../src/services/unifiedCredits/runtime').assertSandbox(env);
 if(env.STUDIO_BACKGROUND_DEMO!=='true')throw Error('Demo only');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const secret=crypto.randomBytes(32).toString('hex'),app=express(),running=new Map();
 app.use(express.json({limit:'512kb'}));app.use((req,res,next)=>req.get('Authorization')===`Bearer ${secret}`?next():res.sendStatus(403));
 const folder=id=>{if(!/^[A-Za-z0-9_-]{8,128}$/.test(id))throw Error('Invalid job');return path.join(directory,id);};
 app.post('/jobs',(req,res)=>{const spec=req.body,work=folder(spec.jobId);fs.mkdirSync(work,{recursive:true,mode:0o700});
  const file=path.join(work,'spec.json');if(fs.existsSync(file)){if(JSON.stringify(JSON.parse(fs.readFileSync(file)).spec)!==JSON.stringify(spec))return res.sendStatus(409);return res.json({jobId:spec.jobId});}
  fs.writeFileSync(file,JSON.stringify({spec,origin}),{mode:0o600,flag:'wx'});
  const log=fs.openSync(path.join(work,'process.log'),'a',0o600);const child=spawn(python,[path.join(__dirname,'compose-demo.py'),file],{env:{...env,CUDA_VISIBLE_DEVICES:'',OMP_NUM_THREADS:'4',OPENBLAS_NUM_THREADS:'1'},stdio:['ignore',log,log]});running.set(spec.jobId,child);
  child.on('exit',code=>{running.delete(spec.jobId);fs.writeFileSync(path.join(work,'terminal.json'),JSON.stringify({code}));});res.json({jobId:spec.jobId});
 });
 app.get('/jobs/:id',(req,res)=>{const work=folder(req.params.id),spec=JSON.parse(fs.readFileSync(path.join(work,'spec.json'))).spec;
  const terminal=path.join(work,'terminal.json');const completed=fs.existsSync(terminal)&&JSON.parse(fs.readFileSync(terminal)).code===0;
  res.json({jobId:spec.jobId,ownerUid:spec.ownerUid,requestHash:spec.requestHash,status:completed?'completed':fs.existsSync(terminal)?'failed':'processing',...(completed?{receipt:JSON.parse(fs.readFileSync(path.join(work,'result.json')))}:{})});
 });
 app.get('/jobs/:id/media',(req,res)=>res.sendFile(path.join(folder(req.params.id),'render.mp4')));
 app.delete('/jobs/:id',(req,res)=>{running.get(req.params.id)?.kill('SIGKILL');res.json({jobId:req.params.id,status:'cancelling'});});
 const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
 return {url:`http://127.0.0.1:${server.address().port}`,secret,stop:async()=>{for(const child of running.values())child.kill('SIGKILL');await new Promise(resolve=>server.close(resolve));}};
}
module.exports={create};
