// A reviewed art-direction document. It lowers exclusively into ordinary Studio
// media layers, masks, Parent connections, keys and adjustment grades.
module.exports=function design(saved){
 const s=saved.snapshot,d=s.studioDocument,duration=d.outputTimeMap.at(-1).outputRange.endTick/90000;if(duration!==18)throw Error('Expected exact18s source cut.');const actions=[],layers=[];
 const curve=[.22,1,.36,1],key=(property,time,value,easing='bezier')=>({property,time,value,easing,...(easing==='bezier'?{curve}:{})});
 const main=[];for(const[a,b,scaleA,scaleB,y]of[[0,3,1,1.035,47],[3,6,1,1,47],[6,11.5,1,1,50],[11.5,14.5,1.03,1,53],[14.5,18,1,1.025,46.5]])for(const[p,u,v]of[['scale',scaleA,scaleB],['x',50,50],['y',y,y]])main.push(key(p,a,u,'linear'),key(p,b===18?18:b-1/24,v,'linear'));actions.push({type:'keys',targetId:'main-video',keys:main});
 for(const[id,a,b,exposureStops,contrast,saturation]of[['Red shadow',0,6,-.15,1.10,.84],['Neon separation',6,11.5,-.05,1.12,1.08],['Red return',11.5,18,-.15,1.12,.88]])actions.push({type:'adjustment',id:id.replaceAll(' ','_'),name:id,startTime:a,duration:b-a,grade:{exposureStops,brightness:1,contrast,saturation}});
 const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${body}</svg>`;const add=(id,name,a,b,body,keys=[])=>layers.push({id,name,type:'artwork',svg:svg(body),startTime:a,duration:b-a,x:50,y:50,width:100,height:100,scale:1,rotation:0,opacity:1,keys});
 add('black_stage','Black performance stage',3,11.5,'<rect width="1280" height="720" fill="#05060a"/>',[key('opacity',3,0),key('opacity',3.4,1),key('opacity',11.5,1)]);
 const media=name=>{const m=s.projectMedia.find(m=>m.name===name+'.mp4'&&m.status==='ready');if(!m)throw Error('Missing saved '+name);return m;};
 actions.push({type:'null',id:'red_camera',name:'Red triptych camera',startTime:3,duration:3,transform:{x:50,y:50,scale:1,rotation:0,opacity:1}},{type:'keys',targetId:'red_camera',keys:[key('scale',3,1),key('scale',6,1.04)]});
 const red=media('cinema');for(let i=0;i<3;i++){const id='red_'+i,x=[23,50,77][i],from=[-8,50,108][i],a=3,scale=i===1?1.06:1.02;
 actions.push({type:'media_plane',id,name:['Red / early echo','Red / centre performance','Red / late echo'][i],sourceMediaId:red.id,sourceStart:5+i*.2,startTime:a,duration:3,transform:{x:from,y:50,scale,rotation:0,opacity:1},mask:{enabled:true,shape:'polygon',path:'polygon(33% 0%,67% 0%,67% 100%,33% 100%)',feather:0,inverted:false}});
 actions.push({type:'keys',targetId:id,keys:[key('x',3,from),key('x',3.55+i*.03,x),key('x',5.7,x),key('x',6,x),key('scale',3,scale+.06),key('scale',4,scale),key('scale',6,scale)]},{type:'node_connect',sourceId:'red_camera',targetId:id,port:'Parent'});
 }
 const blue=media('music');actions.push({type:'null',id:'neon_camera',name:'Neon performance camera',startTime:6,duration:5.5,transform:{x:50,y:50,scale:1,rotation:0,opacity:1}},{type:'keys',targetId:'neon_camera',keys:[key('scale',6,.92),key('scale',7,1),key('scale',11.5,1.045)]});
 for(let i=0;i<3;i++){const id='blue_'+i,x=[22,50,78][i],scale=i===1?1.4:1.12,y=i===1?50:51,opacity=i===1?1:.68;actions.push({type:'media_plane',id,name:['Neon / minus half-second','Neon / lead performance','Neon / plus half-second'][i],sourceMediaId:blue.id,sourceStart:[.5,1,1.5][i],startTime:6,duration:5.5,transform:{x,y,scale,rotation:0,opacity},mask:{enabled:false,shape:'rectangle',feather:0,inverted:false}});actions.push({type:'keys',targetId:id,keys:[key('opacity',6,0),key('opacity',6.25,opacity),key('opacity',11.25,opacity),key('opacity',11.5,opacity),key('x',6,i===0?15:i===2?85:50),key('x',6.6,x),key('x',11.5,x)]},{type:'node_connect',sourceId:'neon_camera',targetId:id,port:'Parent'});}
 add('falloff','Lens edge falloff',0,18,'<defs><radialGradient id="g"><stop offset="46%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".32"/></radialGradient></defs><rect width="1280" height="720" fill="url(#g)"/>');
 add('aperture','Cinema aperture',0,18,'<path d="M0 0h1280v56H0zM0 664h1280v56H0z" fill="#05060a"/>');
 add('in','Opening shutter',0,.35,'<rect width="1280" height="720" fill="#05060a"/>',[key('opacity',0,1,'linear'),key('opacity',.35,0)]);
 add('out','Final shutter',17.35,18,'<rect width="1280" height="720" fill="#05060a"/>',[key('opacity',17.35,0,'linear'),key('opacity',17.9583333333,1)]);
 // Declare one exact final stack after graphics/media creation. Reversed
 // iteration produces the same back-to-front order in every native consumer.
 const stack=['black_stage','red_camera','neon_camera','red_0','red_1','red_2','blue_0','blue_2','blue_1','falloff','aperture','in','out'];for(let i=stack.length-2;i>=0;i--)actions.push({type:'move_layer',targetId:stack[i],beforeId:stack[i+1]});
 if(actions.length>64)throw Error('Native action budget exceeded.');return{format:'autopromote-scene-actions',version:1,projectId:d.projectId,baseRevision:d.revision,name:'Afterimage / reviewed cinematic performance',graphics:{format:'autopromote-graphics',version:1,name:'Afterimage / photographic finish',width:1280,height:720,duration,layers,groups:[]},actions};
};
