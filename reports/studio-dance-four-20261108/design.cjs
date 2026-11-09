const fs=require('fs'),path=require('path'),vm=require('vm');
const transformed=require('@babel/core').transformFileSync(path.resolve(__dirname,'../../frontend/src/components/studioSubjectEcho.js'),{babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const sandbox={exports:{}};vm.runInNewContext(transformed,sandbox);const build=sandbox.exports.buildStudioSubjectEchoPlan;
const presets={one:{name:'One / silver afterbeats',mode:'ghost',count:3,delay:.14,opacity:.63,spread:-4,trailX:50,trailY:78,palette:['#5ce8ff','#b1f0ff','#efeaff']},two:{name:'Two / red double-take',mode:'ghost',count:2,delay:.18,opacity:.55,spread:3,trailX:47,trailY:85,palette:['#ff6b45','#ffbedb','#ff3154']},three:{name:'Three / group timeprint',mode:'chroma',count:2,delay:.1,opacity:.5,spread:-2.5,trailX:54,trailY:85,palette:['#ffe451','#fe5428','#fc758a']},four:{name:'Four / electric footwork',mode:'chroma',count:3,delay:.12,opacity:.6,spread:2.5,trailX:53,trailY:88,palette:['#56f857','#21caff','#bb64ff']}};
module.exports=(record,word)=>{const s=record.snapshot,d=s.studioDocument,p=presets[word],prep=JSON.parse(fs.readFileSync(path.join(__dirname,word+'-preparation.json')));const source=s.projectMedia.find(m=>m.name===`number ${word} dance.mp4`),matte=s.projectMedia.find(m=>m.name===`number ${word} - subject matte.mp4`);if(!source||!matte)throw Error('Missing saved dancing source/matte');
 const settings={sourceMediaId:source.id,matteMediaId:matte.id,mode:p.mode,count:p.count,delay:p.delay,opacity:p.opacity,spread:p.spread,sourceStart:prep.sourceStart+.5,matteStart:.5,startTime:.5,duration:7.3,width:405,height:720,trails:true,trailX:p.trailX,trailY:p.trailY};const plan=JSON.parse(JSON.stringify(build(s,settings)));plan.name=p.name;
 // Music analysis selects accent candidates; these explicit keys remain editable.
 const beats=prep.onsets.filter(t=>t>.8&&t<7.4).slice(0,9);const pulse=t=>Math.max(0,...beats.map(b=>t<b?Math.max(0,1-(b-t)/.12):Math.max(0,1-(t-b)/.32)));
 const key=(property,time,value,easing='linear')=>({property,time:Math.round(time*90000)/90000,value,easing});
 const pictures=plan.actions.filter(a=>a.type==='matte'&&!a.targetId.endsWith('_0')).map(a=>a.targetId);
 for(const id of pictures){const i=Number(id.split('_').at(-1)),a=.5+i*p.delay,base=p.opacity*Math.pow(.76,i-1);plan.actions=plan.actions.filter(action=>!(action.type==='keys'&&action.targetId===id&&action.keys.every(k=>k.property==='opacity')));plan.actions.push({type:'keys',targetId:id,keys:[...new Set([a,7.8,...beats.flatMap(t=>[Math.max(a,t-.12),Math.max(a,t),Math.min(7.8,t+.32)])])].sort((a,b)=>a-b).map(t=>key('opacity',t,base*pulse(t)))});}
 for(const layer of plan.graphics.layers){
  if(layer.id.startsWith('echo_picture_')){const i=Number(layer.id.split('_').at(-1));layer.vectorShape.fill.color=layer.vectorShape.fill.endColor=p.palette[(i-1)%3];}
  if(layer.id.startsWith('light_')){const parts=layer.id.split('_'),i=Number(parts[1]),core=parts[2]==='core',c=p.palette[i%3];layer.vectorShape.stroke.color=core?'#f5ffed':c;const styled=plan.actions.find(a=>a.type==='layer_style'&&a.targetId===layer.id);if(styled)styled.style.glow.color=c;
   // Different stage-bound ribbons for the court, duo and trio. The paths are
   // manual composition geometry, not a foot-tracking claim.
   const cx=p.trailX,cy=p.trailY-i*1.5;
   layer.vectorShape.nodes=[{x:Math.max(3,cx-34),y:cy+3,in:[0,0],out:[23,0]},{x:Math.min(96,cx+29),y:cy+1,in:[4,4],out:[-11,-8]},{x:cx+(i-1)*6,y:word==='two'?36:word==='four'?42:50,in:[2,16],out:[0,0]}];
   const action=plan.actions.find(a=>a.type==='keys'&&a.targetId===layer.id);action.keys=action.keys.filter(k=>!['strokeStart','strokeEnd'].includes(k.property));
   const progress=[];for(const b of beats.slice(0,5)){progress.push([Math.max(.5,b-.18),0],[b,70],[Math.min(7.8,b+.24),100]);}const unique=new Map(progress.map(([t,v])=>[Math.round(t*30)/30,v]));action.keys.push(...[...unique].sort((a,b)=>a[0]-b[0]).map(([t,v])=>key('strokeEnd',t,v)),key('strokeStart',.5,0));
   const times=[...new Set([.5,7.8,...beats.flatMap(t=>[Math.max(.5,t-.14),t,Math.min(7.8,t+.3)])])].sort((a,b)=>a-b);action.keys.push(...times.map(t=>key('opacity',t,(core?.8:.45)*pulse(t))));
  }
 }
 for(const action of plan.actions){if(action.type==='keys'){const unique=new Map(action.keys.map(k=>[k.property+':'+Math.round(k.time*90000),k]));action.keys=[...unique.values()];}}
 if(plan.actions.length>64)throw Error('Scene action budget exceeded');return plan;
};
module.exports.presets=presets;
