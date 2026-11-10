const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'../..'),spawn=cp.spawn;
cp.spawn=function(cmd,args,options){
 if(args?.length===1&&args[0].endsWith('/react-scripts/scripts/build.js')){
  options={...options,env:{...options.env,REACT_APP_STUDIO_DIRECTOR_MOTION:'true'}};
  args=['-e',`process.env.NODE_ENV='production';process.env.BABEL_ENV='production';const p=require.resolve('react-scripts/config/webpack.config'),make=require(p);require.cache[p].exports=(...args)=>{const c=make(...args);c.cache=false;const visit=r=>{if(r.options?.cacheDirectory)r.options.cacheDirectory=false;(r.oneOf||r.rules||[]).forEach(visit)};c.module.rules.forEach(visit);return c};require('react-scripts/scripts/build');`];
 }
 return spawn.call(this,cmd,args,options);
};
require('../../scripts/monetization/application-demo.cjs');
