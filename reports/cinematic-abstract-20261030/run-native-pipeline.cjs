const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawn}=require('child_process');
const {validateStudio3DScene}=require('../../src/services/studio3DService');
const root='/dev/shm/autopromote-abstract-20261030';
async function run(id,phase){
 const log=fs.openSync(path.join(__dirname,id+'-native-'+phase+'.log'),'a',0o600);
 const code=await new Promise(resolve=>spawn(process.execPath,[path.join(__dirname,'native-abstract.cjs'),'/dev/shm/autopromote-application-demo-rlq21z',id,phase],{env:process.env,stdio:['ignore',log,log]}).on('exit',resolve));
 fs.closeSync(log);assert.equal(code,0,id+' '+phase+' stopped; recover accepted work without another dispatch.');
}
(async()=>{
 for(const id of ['current','prism','fold']){
  const dir=path.join(root,id);assert(fs.existsSync(path.join(dir,'cold-recovery.json')));
  const record=JSON.parse(fs.readFileSync(path.join(dir,'authored-project.private.json')));
  validateStudio3DScene(record.snapshot.threeDScenes[0],id==='fold'?'demo-pilot-bob':'demo-pilot-alice');
  if(!fs.existsSync(path.join(dir,'SOURCE_BEFORE_GPU.autopromote.json')))fs.copyFileSync(path.join(dir,'CORE.autopromote.json'),path.join(dir,'SOURCE_BEFORE_GPU.autopromote.json'));
  if(!fs.existsSync(path.join(dir,'render-result.json')))await run(id,fs.existsSync(path.join(dir,'accepted-blender.json'))?'recover':'render');
  if(!fs.existsSync(path.join(dir,'native-core-final.mp4')))await run(id,'export');
  console.log(id+' native GPU, verified storage handoff and native alpha export complete.');
 }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
