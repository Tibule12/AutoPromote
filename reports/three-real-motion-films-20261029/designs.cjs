// Authoring intentions applied by ordinary Studio controls, never graph injection.
const fs = require('node:fs'), path = require('node:path');
const defaults = { x:0,y:0,z:0,scaleX:1,scaleY:1,scaleZ:1,rotationX:0,rotationY:0,rotationZ:0 };
const pose = v => Object.fromEntries(Object.entries({...defaults,...v}).map(([field,value])=>[field,
 field.startsWith('scale')?Math.max(.05,Math.min(4,value)):field.startsWith('rotation')?((value+180)%360+360)%360-180:Math.max(-6,Math.min(6,value))]));
const object = (name, shape, color, material, values, keys=[], bevel=0) => ({name,shape,color,material,...pose(values),bevel,keys});
const floor = color => object('Studio cyclorama / contact stage','box',color,'matte',{y:-2.15,z:-1.8,scaleX:4,scaleY:.1,scaleZ:4},[],.1);
const key=(time,values,easing='ease_in_out')=>({time,values:pose(values),easing});
function camera(){
 const objects=[floor('#151b23')];
 function part(name,shape,color,material,v,index,spread,bevel=.06){
  const start=.25+index*.045,final=2.8+index*.025;
  objects.push(object(name,shape,color,material,v,[key(0,{...v,...spread}),key(start,{...v,...spread}),key(final,{...v,z:v.z+.08},'ease_out'),key(final+.28,v),key(7.8,v)],bevel));
 }
 part('Machined graphite body','box','#202832','matte',{scaleX:1.72,scaleY:1.05,scaleZ:.55,z:-.25},0,{x:-3.5,rotationZ:-22});
 part('Brushed copper top rail','box','#b58b62','chrome',{y:1.02,z:-.25,scaleX:1.72,scaleY:.16,scaleZ:.55},1,{y:3,rotationY:-35});
 part('Copper bottom rail','box','#b58b62','chrome',{y:-1.02,z:-.25,scaleX:1.72,scaleY:.12,scaleZ:.55},2,{y:-1.7,rotationY:25});
 part('Textured rubber hand grip','box','#0e1218','matte',{x:1.35,z:.15,scaleX:.34,scaleY:.88,scaleZ:.68},3,{x:3.5,rotationZ:18});
 part('Lens mount / knurled barrel','cylinder','#222a31','matte',{x:-.25,z:.65,scaleX:.92,scaleY:.92,scaleZ:.42},4,{x:-.25,z:3.7});
 part('Copper mount ring','torus','#cf9e69','chrome',{x:-.25,z:.72,scaleX:.88,scaleY:.88,scaleZ:.5},5,{x:-.25,z:4.1});
 part('Focus barrel','cylinder','#111923','matte',{x:-.25,z:1.05,scaleX:.75,scaleY:.75,scaleZ:.32},6,{x:-.25,z:4.5});
 part('Polished focus rim','torus','#a6b1b8','chrome',{x:-.25,z:1.38,scaleX:.74,scaleY:.74,scaleZ:.36},7,{x:-.25,z:4.8});
 part('Optical front element','sphere','#3a6777','glass',{x:-.25,z:1.38,scaleX:.65,scaleY:.65,scaleZ:.09},8,{x:-.25,z:5.3});
 part('Fine front lens rim','torus','#c2d5de','chrome',{x:-.25,z:1.43,scaleX:.65,scaleY:.65,scaleZ:.2},9,{x:-.25,z:5.7});
 part('Viewfinder housing','box','#111923','matte',{x:.93,y:.63,z:.36,scaleX:.34,scaleY:.23,scaleZ:.09},10,{x:3,y:2,rotationY:50});
 part('Viewfinder glass','box','#2c6679','glass',{x:.93,y:.63,z:.46,scaleX:.27,scaleY:.16,scaleZ:.05},11,{x:3.5,y:2.4,rotationY:65});
 part('Shutter dial','cylinder','#c2c7ce','chrome',{x:1.12,y:1.26,z:-.1,scaleX:.22,scaleY:.22,scaleZ:.1,rotationX:90},12,{y:3.8,rotationX:135});
 part('Exposure dial','cylinder','#26333f','matte',{x:-1.12,y:1.27,z:-.2,scaleX:.3,scaleY:.3,scaleZ:.12,rotationX:90},13,{y:3.3,rotationX:140});
 for(let i=0;i<4;i++){const x=i<2?-1.48:1.48,y=i%2?.78:-.78;
  part(`Recessed steel screw ${i+1}`,'cylinder','#a9b5bd','chrome',{x,y,z:.33,scaleX:.065,scaleY:.065,scaleZ:.05},14+i,{x:x*2,y:y*2,z:2.5},.02);
 }
 part('Left strap lug','torus','#94a0a9','chrome',{x:-1.89,y:.62,z:-.1,scaleX:.16,scaleY:.23,scaleZ:.25,rotationY:90},18,{x:-3.5,y:1.2});
 part('Right strap lug','torus','#94a0a9','chrome',{x:1.89,y:.62,z:-.1,scaleX:.16,scaleY:.23,scaleZ:.25,rotationY:90},19,{x:3.5,y:1.2});
 return {id:'aperture',name:'APERTURE / engineered motion',objects,duration:8,pitch:14,yaw:-24,light:'#ffe9d1',lightIntensity:3.6,bloom:0,heroTimes:[3.7,5.2,6.7],rootKeys:[{time:0,rotationY:-34},{time:3.5,rotationY:-18},{time:6.6,rotationY:25},{time:7.8,rotationY:33}]};
}
function city(){
 const objects=[floor('#26232a'),object('Architectural model plinth','box','#c7b6a1','matte',{y:-1.82,z:-.25,scaleX:2.95,scaleY:.22,scaleZ:2.15},[],.1),object('Plinth floating reveal','box','#806645','chrome',{y:-1.58,z:-.25,scaleX:2.8,scaleY:.05,scaleZ:2.02},[],.08)];
 const blocks=[[-1.9,-1.1,.75,.33],[-.95,-1.1,1.5,.31],[.05,-1.1,2.35,.34],[1.05,-1.1,1.35,.32],[2,-1.1,.9,.3],[-1.65,.05,1.1,.36],[-.5,.05,2.8,.38],[.75,.05,1.85,.4],[1.95,.05,1.3,.32],[-1.25,1.25,.65,.38],[0,1.25,1.15,.4],[1.35,1.25,.75,.4]];
 blocks.forEach(([x,z,height,w],i)=>{
  const y=-1.5+height/2, v={x,y,z,scaleX:w,scaleY:height/2,scaleZ:.4};
  const low={...v,y:-1.5,scaleY:.05,rotationY:-40};const lift=.25+(i%5)*.22+Math.floor(i/5)*.4;
  objects.push(object(`Tower ${String(i+1).padStart(2,'0')} / facade`,'box',i%3===0?'#577780':i%3===1?'#bcb8ad':'#7e8589','architecture',v,[key(0,low),key(lift,low),key(lift+.9,{...v,y:y+.12},'ease_out'),key(lift+1.2,v),key(7.8,v)],.055));
 });
 for(let i=0;i<7;i++){const [x,z,height,w]=blocks[i+2],v={x,y:-1.5+height*.65,z:z+.408,scaleX:w*.86,scaleY:.045,scaleZ:.05};const low={...v,y:-1.5,scaleX:.05};
  objects.push(object(`Warm window ribbon ${i+1}`,'box','#e7b56b','neon',v,[key(0,low),key(2.6+i*.07,low),key(3.4+i*.07,v,'ease_out'),key(7.8,v)],.01));
 }
 return {id:'city',name:'BLOCK LIGHT / a miniature world',objects,duration:8,pitch:33,yaw:-32,light:'#ffd9a1',lightIntensity:4.2,bloom:.12,heroTimes:[4.1,5.6,6.8],rootKeys:[{time:0,rotationY:-38},{time:3.6,rotationY:-25},{time:7.8,rotationY:24}]};
}
function timepiece(){
 const objects=[floor('#161b22')];
 function part(name,shape,color,material,v,i,spread,bevel=.04){const at=.3+i*.065;
  objects.push(object(name,shape,color,material,v,[key(0,{...v,...spread}),key(at,{...v,...spread}),key(at+1.7,v,'ease_out'),key(7.8,v)],bevel));
 }
 part('Machined case','cylinder','#b1bdc6','chrome',{z:.1,scaleX:1.65,scaleY:1.65,scaleZ:.26},0,{y:1.2,z:-1.8,rotationX:-35});
 part('Deep teal dial','cylinder','#103b44','matte',{z:.4,scaleX:1.48,scaleY:1.48,scaleZ:.055},1,{z:2.1,rotationZ:-80});
 part('Polished inner bezel','torus','#d6ba83','gold',{z:.48,scaleX:1.31,scaleY:1.31,scaleZ:.24},2,{z:3.2,rotationX:65});
 part('Outer steel bezel','torus','#c1cbd2','chrome',{z:.32,scaleX:1.48,scaleY:1.48,scaleZ:.5},3,{z:3.8,rotationY:-45});
 for(let i=0;i<8;i++){const a=i*Math.PI/4,v={x:Math.sin(a)*1.11,y:Math.cos(a)*1.11,z:.52,scaleX:.045,scaleY:.16,scaleZ:.05,rotationZ:-i*45};
  const spread={x:Math.sin(a)*2.65,y:Math.cos(a)*2.65,z:1.2,rotationZ:-i*45-75};
  part(`Applied hour marker ${i+1}`,'box','#e4cf9b','gold',v,4+i,spread,.08);
 }
 part('Hour hand','box','#e5d5a8','gold',{x:-.19,y:.22,z:.62,scaleX:.06,scaleY:.49,scaleZ:.05,rotationZ:40},12,{y:3.3,z:2.4,rotationZ:-100},.1);
 part('Minute hand','box','#cad8df','chrome',{x:.35,y:.4,z:.68,scaleX:.04,scaleY:.69,scaleZ:.05,rotationZ:-40},13,{y:3.8,z:3,rotationZ:100},.1);
 part('Hand bearing','sphere','#d4b67a','gold',{z:.78,scaleX:.13,scaleY:.13,scaleZ:.075},14,{z:4.8});
 part('Sapphire crystal','cylinder','#c5e3ed','glass',{z:.78,scaleX:1.38,scaleY:1.38,scaleZ:.05},15,{z:5.6,rotationY:45},.01);
 part('Crown','cylinder','#d5b681','gold',{x:1.82,z:.14,scaleX:.19,scaleY:.19,scaleZ:.2,rotationY:90},16,{x:3.6,rotationY:135},.06);
 part('Upper graphite strap','box','#182029','matte',{y:2.05,z:-.16,scaleX:.67,scaleY:.66,scaleZ:.15},17,{y:4.5,z:-1.5,rotationX:-35},.14);
 part('Lower graphite strap','box','#182029','matte',{y:-2.05,z:-.16,scaleX:.67,scaleY:.66,scaleZ:.15},18,{y:-4.5,z:-1.5,rotationX:35},.14);
 part('Upper strap inset','box','#536069','matte',{y:2.05,z:0,scaleX:.49,scaleY:.58,scaleZ:.05},19,{y:4.6,z:1,rotationX:45},.12);
 part('Lower strap inset','box','#536069','matte',{y:-2.05,z:0,scaleX:.49,scaleY:.58,scaleZ:.05},20,{y:-4.6,z:1,rotationX:-45},.12);
 // Raise the watch above the contact stage and keep it comfortably in frame.
 return {id:'chrono',name:'CHRONO / precision in pieces',objects,duration:8,pitch:16,yaw:-25,light:'#d7ebff',lightIntensity:3.8,bloom:0,scale:.8,heroTimes:[3.8,5.4,6.8],rootKeys:[{time:0,rotationY:-38,rotationZ:-8},{time:3.4,rotationY:-15,rotationZ:-8},{time:6.7,rotationY:24,rotationZ:5},{time:7.8,rotationY:32,rotationZ:8}]};
}
const designs=[camera(),city(),timepiece()];
function spec(design,at){
 const fixture=require('../../studio_3d_renderer/tests/objects.json');const scene={...fixture.scene,id:'physical-'+design.id,name:design.name,duration:design.duration,endTime:design.duration,text:'',secondary:'',material:'matte',rotationX:design.pitch,rotationY:design.yaw,scale:design.scale||1,hold:'still',entrance:'fade',exit:'fade',lightColor:design.light,lightIntensity:design.lightIntensity,cameraMotion:0,bloom:design.bloom};
 scene.objects=design.objects.map((o,i)=>{const {keys,bevel,...rest}=o;return {id:'object-'+i,...rest,...(bevel?{bevel}:{}),keyframes:keys.map((k,j)=>({id:'key-'+j,...k}))};});
 const rootbase={x:scene.x,y:scene.y,z:scene.z,scale:scene.scale,rotationX:scene.rotationX,rotationY:scene.rotationY,rotationZ:scene.rotationZ};
 scene.keyframes=design.rootKeys.map((k,i)=>({id:'root-'+i,time:k.time,easing:'ease_in_out',values:{...rootbase,...Object.fromEntries(Object.entries(k).filter(([f])=>f!=='time'))}}));
 if(at!==undefined){const {spawnSync}=require('child_process');const python='/home/tibule12/Projects/AutoPromte/AutoPromote/python_media_worker/.venv/bin/python';const r=spawnSync(python,['-c',`import sys,json;sys.path.insert(0,'studio_3d_renderer');from objects import object_pose;from spec import validate_spec;s=json.load(sys.stdin);t=${at};\nfor o in s['scene']['objects']:o.update(object_pose(o,t));o['keyframes']=[]\ns['scene']['duration']=s['duration']=.5;s['scene']['endTime']=.5;s['scene']['keyframes']=[];print(json.dumps(s))`],{input:JSON.stringify({version:1,ownerUid:'qa_user_123',mode:'preview',width:1280,height:720,fps:12,duration:design.duration,scene}),encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout);}
 return {version:1,ownerUid:'qa_user_123',mode:'preview',width:1280,height:720,fps:24,duration:design.duration,scene};
}
module.exports={designs,spec};
if(require.main===module){const out='/dev/shm/autopromote-three-films';fs.mkdirSync(out,{recursive:true,mode:0o700});for(const d of designs){const dir=path.join(out,d.id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'design.json'),JSON.stringify(d,null,2));fs.writeFileSync(path.join(dir,'still-spec.json'),JSON.stringify(spec(d,4.5),null,2));console.log(d.id,d.objects.length,'objects');}}
