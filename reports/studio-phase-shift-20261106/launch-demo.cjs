const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'../..'),dep=path.join(root,'frontend/node_modules'),shared=path.resolve(root,'../AutoPromote/frontend/node_modules');
if(!fs.existsSync(dep)){fs.symlinkSync(shared,dep,'dir');fs.writeFileSync(path.join(__dirname,'created-dependency-link.json'),JSON.stringify({path:dep,target:shared}));}
const spawn=cp.spawn;
cp.spawn=function(cmd,args,options){
 if(args?.length===1&&args[0].endsWith('/react-scripts/scripts/build.js')){
  args=['-e',`process.env.NODE_ENV='production';process.env.BABEL_ENV='production';const p=require.resolve('react-scripts/config/webpack.config'),make=require(p);require.cache[p].exports=(...args)=>{const c=make(...args);c.cache=false;const visit=r=>{if(r.options?.cacheDirectory)r.options.cacheDirectory=false;(r.oneOf||r.rules||[]).forEach(visit)};c.module.rules.forEach(visit);return c};require('react-scripts/scripts/build');`];
 }
 return spawn.call(this,cmd,args,options);
};
require('../../scripts/monetization/application-demo.cjs');
