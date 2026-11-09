// Art direction only: this produces a reviewed ordinary Studio action plan.
// No rendering, alternative editor, model claim or custom visual consumer.
module.exports=function design(saved){
 const snapshot=saved.snapshot,doc=snapshot.studioDocument,duration=doc.outputTimeMap.at(-1).outputRange.endTick/90000;if(duration!==24)throw Error('Expected exact 24-second native cut.');
 const cuts=[0,2.4,4.8,8.4,12.6,17.4,24],actions=[],layers=[],camera=[];
 const views=[[1.075,1.13,50,50,52,53],[1.06,1.09,49,51,57,57],[1.045,1.08,50,51,50,50],[1.035,1.085,50,50,50,51],[1.04,1.075,50,49.5,50,50],[1.045,1.085,50,49,50,49.5]];
 for(let i=0;i<6;i++){const a=cuts[i],b=cuts[i+1],v=views[i];for(const [p,from,to]of [['scale',v[0],v[1]],['x',v[2],v[3]],['y',v[4],v[5]]])camera.push({property:p,time:a,value:from,easing:'linear'},{property:p,time:b===24?24:b-1/24,value:to,easing:'linear'});}
 actions.push({type:'keys',targetId:'main-video',keys:camera});
 const grades=[[-.12,.97,1.12,.76],[-.05,.98,1.10,.86],[-.05,1,1.08,.82],[-.05,1,1.08,.84],[-.1,1,1.12,.82],[-.05,1,1.05,.94]];
 for(let i=0;i<6;i++){const [exposureStops,brightness,contrast,saturation]=grades[i];actions.push({type:'adjustment',id:'grade_'+i,name:['Cool concrete','City separation','Muted autumn','Open sky','Mountain contrast','Sunset colour'][i],startTime:cuts[i],duration:cuts[i+1]-cuts[i],grade:{exposureStops,brightness,contrast,saturation}});}
 const media=name=>{const m=snapshot.projectMedia.find(m=>m.name===name+'.mp4'&&m.status==='ready');if(!m)throw Error('Missing saved '+name);return m;};
 // The two short dissolves carry genuine moving source pictures, aligned to the
 // following main occurrence through ordinary opacity keys.
 for(const [id,name,start,end,sourceStart,shape]of [['mountain','Summit',12,12.6,.4,'rise'],['sea','Coast',16.8,17.4,2.4,'side']]){
  const m=media(name),rig=id+'_camera',plane=id+'_reveal',scale=(name==='Summit'?1.04:1.045)*10/7;
  actions.push({type:'null',id:rig,name:name+' reveal camera',startTime:start,duration:end-start,transform:{x:50,y:50,scale:1,rotation:0,opacity:1}});
  actions.push({type:'media_plane',id:plane,name:name+' / aligned moving reveal',sourceMediaId:m.id,sourceStart,startTime:start,duration:end-start,transform:{x:50,y:50,scale,rotation:0,opacity:1},mask:{enabled:false,shape:'rectangle',feather:0,inverted:false}});
  actions.push({type:'keys',targetId:plane,keys:[{property:'opacity',time:start,value:0,easing:'bezier',curve:[.42,0,.58,1]},{property:'opacity',time:end-1/24,value:1,easing:'bezier',curve:[.42,0,.58,1]}]});
  actions.push({type:'node_connect',sourceId:rig,targetId:plane,port:'Parent'});
 }
 const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${body}</svg>`;
 const add=(id,name,start,end,body,keys=[])=>layers.push({id,name,type:'artwork',svg:svg(body),startTime:start,duration:end-start,x:50,y:50,width:100,height:100,scale:1,rotation:0,opacity:1,keys});
 add('cinemascope','2.39 / native cinema aperture',0,24,'<path d="M0 0h1280v92H0zM0 628h1280v92H0z" fill="#050608"/>');
 add('edge_falloff','Subtle lens edge falloff',0,24,'<defs><radialGradient id="g"><stop offset="52%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.23"/></radialGradient></defs><rect width="1280" height="720" fill="url(#g)"/>');
 add('arrival','Opening from black',0,.6,'<rect width="1280" height="720" fill="#050608"/>',[{property:'opacity',time:0,value:1,easing:'linear'},{property:'opacity',time:.6,value:0,easing:'bezier',curve:[.42,0,.58,1]}]);
 add('outro','Final breath to black',23.1,24,'<rect width="1280" height="720" fill="#050608"/>',[{property:'opacity',time:23.1,value:0,easing:'linear'},{property:'opacity',time:23.9583333333,value:1,easing:'bezier',curve:[.42,0,.58,1]}]);
 // Artwork import prepares these first; explicitly move the finishing planes
 // above the newly created moving-video reveals in the same composition stack.
 for(const graphic of ['cinemascope','edge_falloff','arrival','outro'])actions.push({type:'move_layer',targetId:'sea_reveal',beforeId:graphic},{type:'move_layer',targetId:'mountain_reveal',beforeId:graphic});
 return{format:'autopromote-scene-actions',version:1,projectId:doc.projectId,baseRevision:doc.revision,name:'Open Country / reviewed cinematic scene',graphics:{format:'autopromote-graphics',version:1,name:'Open Country / cinema aperture and optical falloff',width:1280,height:720,duration,layers,groups:[]},actions};
};
