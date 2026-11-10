const fs=require('fs'),path=require('path'),vm=require('vm');
const transformed=require('@babel/core').transformFileSync(path.resolve(__dirname,'../../frontend/src/components/studioSubjectEcho.js'),{babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;const sandbox={exports:{}};vm.runInNewContext(transformed,sandbox);const build=sandbox.exports.buildStudioSubjectEchoPlan;
const presets={one:{name:'One / clean silver afterimages',mode:'ghost',count:4,delay:.15,opacity:.76,spread:-3.5,palette:['#8fa9b7','#b3cee1','#dbedff']},two:{name:'Two / clean mirror doubles',mode:'ghost',count:2,delay:.18,opacity:.73,spread:5,palette:['#f13e4e','#a33151']},three:{name:'Three / clean warm timeprint',mode:'chroma',count:2,delay:.14,opacity:.72,spread:-4.5,palette:['#ffce31','#ff5941']},four:{name:'Four / clean electric echoes',mode:'chroma',count:3,delay:.15,opacity:.75,spread:4,palette:['#31f786','#32beff','#ad75ff']}};
module.exports=(record,word)=>{const s=record.snapshot,p=presets[word],prep=JSON.parse(fs.readFileSync(path.join(__dirname,word+'-preparation.json'))),source=s.projectMedia.find(m=>m.name===`number ${word} dance.mp4`),matte=s.projectMedia.find(m=>m.name===`number ${word} - subject matte.mp4`);if(!source||!matte)throw Error('Saved dancing source/matte required');
 const plan=JSON.parse(JSON.stringify(build(s,{sourceMediaId:source.id,matteMediaId:matte.id,mode:p.mode,count:p.count,delay:p.delay,opacity:p.opacity,spread:p.spread,sourceStart:prep.sourceStart+.5,matteStart:.5,startTime:.5,duration:7.3,width:405,height:720,trails:false,trailX:50,trailY:80})));plan.name=p.name;
 // Fewer separated measured audio accents; all dancing/source audio stays at speed1.
 const beats=[];for(const t of prep.onsets.filter(t=>t>1.1&&t<7.05)){if(!beats.length||t-beats.at(-1)>.8)beats.push(t)}
 const pulse=t=>Math.max(0,...beats.map(b=>t<b?Math.max(0,1-(b-t)/.12):Math.max(0,1-(t-b)/.5)));
 const key=(property,time,value)=>({property,time:Math.round(time*90000)/90000,value,easing:'linear'});
 for(let i=1;i<=p.count;i++){const id=`echo_picture_${i}`,maskId=`echo_matte_${i}`,a=.5+i*p.delay,base=p.opacity*Math.pow(.8,i-1),spread=word==='two'?(i===1?-6:6):word==='three'?(i===1?-5:5):i*p.spread;
  plan.actions=plan.actions.filter(x=>!(x.type==='keys'&&x.targetId===id));
  const times=[...new Set([a,7.8,...beats.flatMap(t=>[Math.max(a,t-.12),Math.max(a,t),Math.min(7.8,t+.5)])])].sort((a,b)=>a-b);
  plan.actions.push({type:'keys',targetId:id,keys:times.map(t=>key('opacity',t,base*pulse(t)))});
  // Matching picture/matte transforms fan outward on accents then return together.
  for(const targetId of [id,maskId]){plan.actions.push({type:'keys',targetId,keys:times.map(t=>key('x',t,50+spread*(.35+.65*pulse(t))))})}
 }
 for(const layer of plan.graphics?.layers||[]){if(layer.id.startsWith('echo_picture_')){const i=Number(layer.id.split('_').at(-1));layer.vectorShape.fill.color=layer.vectorShape.fill.endColor=p.palette[(i-1)%p.palette.length]}}
 for(const action of plan.actions)if(action.type==='keys'){const unique=new Map(action.keys.map(k=>[k.property+':'+Math.round(k.time*90000),k]));action.keys=[...unique.values()]}
 if(plan.actions.length>64)throw Error('Scene action budget exceeded');if((plan.graphics?.layers||[]).some(x=>x.vectorShape.closed===false)||JSON.stringify(plan).includes('light_'))throw Error('No added lines permitted');return plan;
};module.exports.presets=presets;
