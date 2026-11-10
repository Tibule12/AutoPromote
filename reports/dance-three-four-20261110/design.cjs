const fs=require('fs');
module.exports=(s,word)=>{
 const prep=JSON.parse(fs.readFileSync(__dirname+'/'+word+'-preparation.json')),end=prep.seconds,actions=[],layers=[];
 const key=(property,time,value,ease=false)=>({property,time:Math.round(time*90000)/90000,value,easing:ease?'bezier':'linear',...(ease?{curve:[.2,.85,.25,1]}:{})});
 const art=(id,name,svg,opacity=1)=>({id,name,type:'artwork',svg,startTime:0,duration:end,x:50,y:50,width:100,height:100,scale:1,rotation:0,opacity,keys:[]});
 const wrap=content=>`<svg xmlns="http://www.w3.org/2000/svg" width="576" height="1024" viewBox="0 0 576 1024">${content}</svg>`;
 actions.push({type:'keys',targetId:'main-video',keys:[key('opacity',0,0),key('opacity',end,0)]});
 if(word==='three'){
  // Three separate moving source-time planes, with perspective shared by
  // native preview/export. No fabricated footage or external final composite.
  layers.push(art('stage','Prism / ink stage',wrap('<defs><radialGradient id="b"><stop stop-color="#23213b"/><stop offset="1" stop-color="#070a13"/></radialGradient><radialGradient id="g"><stop stop-color="#8133d8" stop-opacity=".24"/><stop offset="1" stop-color="#8133d8" stop-opacity="0"/></radialGradient></defs><path fill="url(#b)" d="M0 0h576v1024H0z"/><ellipse cx="400" cy="330" rx="390" ry="450" fill="url(#g)"/>')));
  const media=s.projectMedia.find(m=>m.name===prep.sourceName);if(!media)throw Error('Original dance media required');
  const configurations=[{id:'top',at:0,delta:0,y:28,rot:-3,col:'#26d5e2'},{id:'bottom',at:.32,delta:.36,y:72,rot:3,col:'#ffb52d'}];
  for(const [i,c]of configurations.entries()){
   const corners=i%2?[[5,24],[98,30],[95,76],[2,70]]:[[2,30],[95,24],[98,70],[5,76]];
   actions.push({type:'media_plane',id:c.id,name:`Prism / temporal dance panel ${i+1}`,sourceMediaId:media.id,sourceStart:prep.sourceStart+c.delta+c.at,startTime:c.at,duration:end-c.at,transform:{x:50,y:c.y,scale:1.28,rotation:c.rot,opacity:1},perspective:{version:1,corners,sourceRect:[0,20,100,71]}});
   actions.push({type:'layer_style',targetId:c.id,style:{glow:{enabled:true,color:c.col,radius:14,intensity:.22},colorize:{enabled:true,color:c.col,strength:.15,gamma:1,lift:0,contrast:1.06}}});
   const fade=end-.52;
   actions.push({type:'keys',targetId:c.id,keys:[key('x',c.at,i%2?124:-24),key('x',c.at+.72,50,true),key('y',c.at,c.y+6),key('y',c.at+.72,c.y,true),key('rotation',c.at,c.rot*2),key('rotation',c.at+.85,c.rot,true),key('scale',c.at,1.12),key('scale',c.at+.8,1.28,true),key('opacity',c.at,0),key('opacity',c.at+.16,1),key('opacity',fade,1),key('opacity',end-.08,0)]});
  }
 }else{
  // A bright cyan/amber stage, clean isolated crew, delayed chromatic
  // silhouettes and a moving floor reflection. No circle or line decorations.
  layers.push(art('stage','Pulse / cobalt atmosphere',wrap('<defs><radialGradient id="b" cx="50%" cy="36%" r="70%"><stop stop-color="#15354d"/><stop offset=".48" stop-color="#081828"/><stop offset="1" stop-color="#03070f"/></radialGradient><radialGradient id="c"><stop stop-color="#00cbff" stop-opacity=".32"/><stop offset="1" stop-color="#00cbff" stop-opacity="0"/></radialGradient><radialGradient id="a"><stop stop-color="#ff7d1d" stop-opacity=".25"/><stop offset="1" stop-color="#ff7d1d" stop-opacity="0"/></radialGradient></defs><path fill="url(#b)" d="M0 0h576v1024H0z"/><ellipse cx="60" cy="400" rx="290" ry="440" fill="url(#c)"/><ellipse cx="550" cy="500" rx="260" ry="400" fill="url(#a)"/>')));
  const wash=art('wash','Pulse / broad luminous floor',wrap('<defs><radialGradient id="w"><stop stop-color="#0dcfff" stop-opacity=".45"/><stop offset=".45" stop-color="#4a35a7" stop-opacity=".12"/><stop offset="1" stop-color="#03070f" stop-opacity="0"/></radialGradient></defs><ellipse cx="288" cy="795" rx="260" ry="105" fill="url(#w)"/>'),.8);wash.keys=[key('opacity',0,.2),key('opacity',.5,.85),key('opacity',end-.6,.85),key('opacity',end,.2)];layers.push(wash);
  const fg=s.projectMedia.find(m=>m.name===prep.foregroundName),matte=s.projectMedia.find(m=>m.name===`number ${word} - subject matte.mp4`);if(!fg||!matte)throw Error('Exact prepared foreground/matte required');
  const cfg=[{id:'cyan',x:40,y:68,scale:.76,lag:.16,col:'#0ed9fa',opacity:.62},{id:'amber',x:60,y:68,scale:.76,lag:.32,col:'#ffa82e',opacity:.62},{id:'lead',x:50,y:77,scale:.90,lag:0,col:'#d1edff',opacity:1}];
  for(const c of cfg){
   const start=c.id==='lead'?0:.64+c.lag,sourceAt=start-c.lag,length=end-start;
   const sample=t=>prep.feet[Math.max(0,Math.min(prep.frames-1,Math.round(t*24)))].feet[0];
   const pose=t=>{const j=Math.max(0,Math.min(prep.frames-1,Math.round(t*24))),near=prep.feet.slice(Math.max(0,j-3),Math.min(prep.frames,j+4)).map(v=>v.feet[0]),f={x:near.reduce((a,b)=>a+b.x,0)/near.length,y:near.reduce((a,b)=>a+b.y,0)/near.length},b=prep.subjectBounds[j];let x=c.x+(50-f.x)*c.scale;x=Math.max(3-(b.left-50)*c.scale,Math.min(97-(b.right-50)*c.scale,x));return{x,y:c.y+(50-f.y)*c.scale,scale:c.scale/.7,rotation:0,opacity:1}};
   for(const [id,media]of [[c.id+'_mask',matte],[c.id,fg]])actions.push({type:'media_plane',id,name:`Pulse / ${c.id}${id.endsWith('_mask')?' matte':' crew'}`,sourceMediaId:media.id,sourceStart:sourceAt,startTime:start,duration:length,transform:pose(sourceAt),mask:{enabled:false,shape:'rectangle',feather:0,inverted:false}});
   actions.push({type:'matte',targetId:c.id,matteSourceId:c.id+'_mask',mode:'luma'});
   for(const id of [c.id,c.id+'_mask']){
    const keys=[];for(let j=0;j<=32;j++){const t=start+(end-start)*j/32,f=pose(sourceAt+t-start),mix=c.id==='lead'?1:Math.min(1,(t-start)/.7);keys.push(key('x',t,50+(f.x-50)*mix),key('y',t,f.y));}
    if(id===c.id)keys.push(key('opacity',start,c.id==='lead'?1:0),key('opacity',start+.25,c.opacity),key('opacity',end-.7,c.opacity),key('opacity',end-.1,c.id==='lead'?1:0));actions.push({type:'keys',targetId:id,keys});
   }
   actions.push({type:'layer_style',targetId:c.id,style:{matteSurface:{enabled:true,glowColor:c.col,glowRadius:c.id==='lead'?1.5:2.8,glowIntensity:c.id==='lead'?.28:.55,reflectionEnabled:true,floorY:c.y,reflectionOpacity:.32,fadeHeight:20},...(c.id==='lead'?{}:{colorize:{enabled:true,color:c.col,strength:.82,gamma:.7,lift:.01,contrast:1.25}})}});
  }
 }
 return{format:'autopromote-scene-actions',version:1,projectId:s.studioDocument.projectId,baseRevision:s.studioDocument.revision,name:word==='three'?'Prism Relay / two native time planes':'Mirror Pulse / light, colour and reflected motion',graphics:{format:'autopromote-graphics',version:1,name:'Native stage',width:576,height:1024,duration:end,layers,groups:[]},actions};
};
