// Compare acceptance and errors with the retained implementation, including
// dense real project trajectories and malformed intermediate geometry.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),root=path.resolve(__dirname,'../..');
const babel=require(path.join(root,'frontend/node_modules/@babel/core'));
const plugin=require.resolve(path.join(root,'frontend/node_modules/@babel/plugin-transform-modules-commonjs'));
const folder=path.join(root,'reports/studio-preview-throughput-20261102');
const load=file=>{const box={exports:{}};vm.runInNewContext(babel.transformFileSync(file,{configFile:false,babelrc:false,plugins:[plugin]}).code,box);return box.exports;};
const before=load(path.join(folder,'studioPerspective.before.js')),after=load(path.join(root,'frontend/src/components/studioPerspective.js'));
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'reports/studio-folded-space-20261101/flowing-ribbon/episode/Editable Project.autopromote.json'))).snapshot;
const cases=snapshot.overlays.filter(l=>l.perspective).map(layer=>({layer,keys:snapshot.motionKeyframes.filter(k=>k.targetId===layer.id)}));
const identity=[[0,0],[100,0],[100,100],[0,100]],layer={id:'proof',type:'video',perspective:{version:1,corners:identity,sourceRect:[25,0,50,100]}};
const keys=end=>identity.flatMap((p,i)=>p.flatMap((v,j)=>[{property:`planeCorner${i}${j?'Y':'X'}`,time:0,value:v,easing:'linear'},{property:`planeCorner${i}${j?'Y':'X'}`,time:2,value:end[i][j],easing:'linear'}]));
const valid=keys([[10,10],[90,0],[90,100],[10,90]]);
cases.push({layer,keys:valid},{layer,keys:[...valid].reverse()},{layer,keys:valid.map(k=>({...k,easing:'hold'}))},
 {layer,keys:[...valid,{...valid[0],value:2}]},
 {layer,keys:valid.filter(k=>k.property==='planeCorner0X')},
 {layer,keys:keys(identity.map(p=>p.map(v=>100-v)))});
for(const value of [NaN,Infinity,-1,101,true])cases.push({layer,keys:valid.map((k,i)=>i? k:{...k,value})});
for(const time of [NaN,Infinity])cases.push({layer,keys:valid.map((k,i)=>i?k:{...k,time})});
for(const easing of ['bezier','ease_in',null])cases.push({layer,keys:valid.map((k,i)=>i?k:{...k,easing})});
cases.push({layer:{...layer,perspectiveProgress:50},keys:valid},
 {layer,keys:[...valid,{property:'perspectiveProgress',time:1,value:50,easing:'linear'}]},
 {layer,keys:[...valid,{property:'planeCorner4X',time:1,value:50,easing:'linear'}]});
const outcome=(impl,{layer,keys})=>{try{impl.validateStudioPerspectiveLayer(layer,keys);return 'accepted';}catch(e){return e.message;}};
const outcomes=cases.map(c=>{const input=JSON.stringify(c),original=outcome(before,c);assert.equal(outcome(after,c),original);assert.equal(JSON.stringify(c),input);return original;});
const benchmark=impl=>{const began=performance.now();for(let run=0;run<3;run++)for(const c of cases.slice(0,20))impl.validateStudioPerspectiveLayer(c.layer,c.keys);return performance.now()-began;};
const result={cases:cases.length,accepted:outcomes.filter(v=>v==='accepted').length,rejected:outcomes.filter(v=>v!=='accepted').length,
 identicalAcceptanceAndErrorMessages:true,keysUnmodified:true,benchmark:{runs:3,planes:20,beforeMs:benchmark(before),afterMs:benchmark(after)},
 scope:'Local validator only. Real Studio throughput and picture checks remain separate.'};
fs.writeFileSync(path.join(folder,'corner-validation-equivalence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
