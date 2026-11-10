// An isolated ordinary App build. Preserve the existing preview and its assets.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),build=fs.mkdtempSync('/dev/shm/autopromote-reviewed-client-');
const variant=process.env.STUDIO_REVIEW_VARIANT||'',apiPort=Number(process.env.STUDIO_QA_API_PORT||5128);
if(!/^(|-batch|-corrected)$/.test(variant)||![5128,5129,5138].includes(apiPort))throw Error('Use the task-owned local ports.');
const settings=require('dotenv').parse(fs.readFileSync(path.join(root,'frontend/.env.development')));
const account=Object.fromEntries(Object.entries(settings).filter(([key])=>key.startsWith('REACT_APP_FIREBASE_')));
const runner=`process.env.NODE_ENV='production';process.env.BABEL_ENV='production';
const p=require.resolve('react-scripts/config/webpack.config'),make=require(p);
require.cache[p].exports=(...args)=>{const config=make(...args);config.cache=false;
const visit=r=>{if(r.options?.cacheDirectory)r.options.cacheDirectory=false;(r.oneOf||r.rules||[]).forEach(visit)};
config.module.rules.forEach(visit);return config};require('react-scripts/scripts/build');`;
fs.writeFileSync(path.join(__dirname,`reviewed-client-build${variant}.private.json`),JSON.stringify({build,apiOrigin:`http://127.0.0.1:${apiPort}`,welcomeStudioPreview:true,authBypass:false,priorBuildPreserved:true},null,2)+'\n');
const result=spawnSync(process.execPath,['-e',runner],{cwd:path.join(root,'frontend'),stdio:'inherit',env:{...process.env,...account,
 REACT_APP_API_URL:`http://127.0.0.1:${apiPort}`,REACT_APP_WELCOME_STUDIO_PREVIEW:'true',REACT_APP_ENABLE_E2E_BYPASS:'false',
 GENERATE_SOURCEMAP:'false',DISABLE_ESLINT_PLUGIN:'true',CI:'false',BUILD_PATH:build,NODE_OPTIONS:'--max-old-space-size=4096'}});
process.exitCode=result.status??1;
