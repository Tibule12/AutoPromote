// Wait for actual native core completion, then assemble ordinary Studio edits.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root='/dev/shm/autopromote-abstract-20261030',python='/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/.venv/bin/python';
async function run(args,name){const fd=fs.openSync(path.join(__dirname,name+'.log'),'a',0o600);const code=await new Promise(resolve=>spawn(args[0],args.slice(1),{env:process.env,stdio:['ignore',fd,fd]}).on('exit',resolve));fs.closeSync(fd);if(code!==0)throw Error(name+' stopped; preserve accepted work.');}
(async()=>{for(const id of ['prism','fold']){
 while(!fs.existsSync(path.join(root,id,'native-core-final.mp4')))await new Promise(resolve=>setTimeout(resolve,5000));
 await run([python,path.join(__dirname,'prepare-media.py'),id,'--sources'],id+'-media-sources');
 await Promise.all(['cinema','episode'].map(kind=>run([process.execPath,path.join(__dirname,'native-delivery.cjs'),id,kind,'prepare'],id+'-'+kind+'-prepare')));
 console.log(id+' prepared for actual picture review; no final render submitted.');
}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
