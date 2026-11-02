const fs=require('fs'),path=require('path');
const file=path.join(process.argv[2],'config.json');const config=JSON.parse(fs.readFileSync(file));Object.assign(process.env,config.env);
require('./preview-provider.cjs').create({directory:path.join(process.argv[2],'subject-previews'),python:config.env.CREDITS_PYTHON_BIN,env:config.env,origin:config.origin}).then(server=>{
 Object.assign(config.env,{STUDIO_MODEL_VFX_URL:server.url,STUDIO_MODEL_VFX_SECRET:server.secret,STUDIO_SUBJECT_MASK_PREVIEW_ENABLED:'true',STUDIO_SUBJECT_MASK_PREVIEW_UIDS:'demo-pilot-alice'});
 fs.writeFileSync(file,JSON.stringify(config),{mode:0o600});fs.writeFileSync(path.join(process.argv[2],'subject-provider-ready.json'),JSON.stringify({pid:process.pid,url:server.url}));
 process.on('SIGTERM',async()=>{await server.stop();process.exit(0);});
}).catch(e=>{console.error(e);process.exit(1);});
