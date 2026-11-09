// Explicit qualification on the existing laptop; no credentials/cloud dispatch.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {fail}=require('./contract');
async function digest(file){const hash=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))hash.update(chunk);return hash.digest('hex');}
async function localCudaProfile(directory){
 require('../services/unifiedCredits/runtime').assertSandbox();
 if(process.env.NODE_ENV!=='test'||process.env.STUDIO_BACKGROUND_DEMO!=='true'||process.env.STUDIO_BACKGROUND_DEMO_LOCAL_CUDA!=='true'||directory!=='/dev/shm/autopromote-local-cu118-20261104')throw fail('MODEL_DEMO_CUDA_OFFLINE',503);
 const names=['torch/__init__.py','torch/lib/libtorch_cuda.so','torch/lib/libtorch_cpu.so','torch/lib/libc10_cuda.so','torch.installed.json'];
 for(const entry of await fs.readdir(path.join(directory,'torch')))if(entry.startsWith('_C.')&&entry.endsWith('.so'))names.push('torch/'+entry);
 const libraryDirectories=[];
 for(const entry of await fs.readdir(path.join(directory,'nvidia'),{withFileTypes:true})){if(!entry.isDirectory())continue;const lib=path.join(directory,'nvidia',entry.name,'lib');try{const stat=await fs.stat(lib);if(!stat.isDirectory())continue;}catch(e){if(e.code==='ENOENT')continue;throw e;}libraryDirectories.push(lib);for(const name of await fs.readdir(lib))if(name.includes('.so')&&!name.endsWith('.py'))names.push(path.relative(directory,path.join(lib,name)));}
 const files={};for(const name of [...new Set(names)]){const full=path.join(directory,name);if(!(await fs.realpath(full)).startsWith(directory+'/'))throw fail('MODEL_DEMO_CUDA_PATH_INVALID');files[name]=await digest(full);}
 const metadata=JSON.parse(await fs.readFile(path.join(directory,'torch.installed.json'),'utf8'));
 if(metadata.version!=='2.5.1+cu118'||metadata.sha256!=='f4c3ae93c72e8b725b510c3bc5b9dd5437f6740a66c3cc3bb1a19f177c3baef4')throw fail('MODEL_DEMO_CUDA_PACKAGE_INVALID');
 return {profile:{kind:'private_local_cuda_host_overlay_v1',directory,files,torch:'2.5.1+cu118',torchCuda:'11.8',hermeticCloudRunImage:false},libraries:libraryDirectories.join(':')};
}
module.exports={localCudaProfile};
