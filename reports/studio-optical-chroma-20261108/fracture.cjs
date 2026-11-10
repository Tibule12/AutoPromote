// A real native tessellation. The moving texture and each outline share the
// same centroid/pose, leaving editable source masks and keys after application.
module.exports=function(saved){const s=saved.snapshot,d=s.studioDocument,actions=[],layers=[],stack=[];
 const k=(property,time,value,easing='bezier')=>({property,time,value,easing,...(easing==='bezier'?{curve:[.42,0,.84,.55]}:{})});
 const points=[[12,15],[38,13],[63,17],[88,12],[9,47],[34,49],[64,43],[90,48],[13,83],[39,80],[63,85],[88,84]];
 const clip=(poly,A,B,C)=>{const out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],u=A*p[0]+B*p[1]-C,v=A*q[0]+B*q[1]-C;if(u<=1e-9)out.push(p);if((u<=0)!==(v<=0)){const t=u/(u-v);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])}}return out};
 const cells=points.map((p,i)=>{let poly=[[0,0],[100,0],[100,100],[0,100]];for(let j=0;j<points.length;j++){if(j===i)continue;const q=points[j];poly=clip(poly,2*(q[0]-p[0]),2*(q[1]-p[1]),q[0]**2+q[1]**2-p[0]**2-p[1]**2)}return poly});
 const media=name=>s.projectMedia.find(m=>m.name===name+'.mp4'&&m.status==='ready'),red=media('bloom'),blue=media('blue');if(!red||!blue)throw Error('New source videos required');
 actions.push({type:'media_plane',id:'revealed_blue',name:'Blue world behind fractured colour',sourceMediaId:blue.id,sourceStart:0,startTime:3,duration:5,transform:{x:50,y:50,scale:1/.7,rotation:0,opacity:1},mask:{enabled:false,shape:'rectangle',feather:0,inverted:false}});stack.push('revealed_blue');
 cells.forEach((poly,i)=>{const id='fracture_'+i,p=points[i],dx=(p[0]-50),dy=(p[1]-50),length=Math.hypot(dx,dy),vx=dx/length,vy=dy/length,delay=(i%4)*.07,rotation=(i%2?1:-1)*(16+i*2.7),at=3,finish=7.5;
  const centroid=[poly.reduce((a,p)=>a+p[0],0)/poly.length,poly.reduce((a,p)=>a+p[1],0)/poly.length];
  const pose=(travel,z,rot)=>{const rad=rot*Math.PI/180,x=(centroid[0]-50)*12.8,y=(centroid[1]-50)*7.2,rx=z*(x*Math.cos(rad)-y*Math.sin(rad)),ry=z*(x*Math.sin(rad)+y*Math.cos(rad));return{ x:centroid[0]+vx*travel-rx/12.8,y:centroid[1]+vy*travel-ry/7.2,scale:z/.7,rotation:rot,opacity:travel>100?0:1}};
  const poses=[[at,pose(0,1,0)],[at+.18+delay,pose(0,1,0)],[4.9+delay,pose(16,.94,rotation*.25)],[finish,pose(125,.56,rotation)]];
  actions.push({type:'media_plane',id,name:'Fractured ink / piece '+(i+1),sourceMediaId:red.id,sourceStart:4,startTime:at,duration:finish-at,transform:{x:50,y:50,scale:1/.7,rotation:0,opacity:1},mask:{enabled:true,shape:'polygon',path:'polygon('+poly.map(p=>p.map(n=>n.toFixed(6)+'%').join(' ')).join(', ')+')',feather:0,inverted:false}});
  actions.push({type:'keys',targetId:id,keys:poses.flatMap(([t,p])=>Object.entries(p).map(([property,value])=>k(property,t,value)))});stack.push(id);
  // Static contour pixels are authored in Studio. Their transforms are the
  // same source-rectangle transforms, with artwork width100 vs video width70.
  const line=id+'_edge',lineKeys=poses.flatMap(([t,p])=>Object.entries({...p,scale:p.scale*.7,opacity:t===at?0:Math.min(.42,p.opacity)}).map(([property,value])=>k(property,t,value)));
  layers.push({id:line,name:'Cut-glass edge / piece '+(i+1),type:'artwork',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><polygon points="'+poly.map(p=>[p[0]*12.8,p[1]*7.2].join(',')).join(' ')+'" fill="none" stroke="#c9edff" stroke-width="1.1" stroke-linejoin="round"/></svg>',startTime:at,duration:finish-at,x:50,y:50,width:100,height:100,scale:1,rotation:0,opacity:0,keys:lineKeys});stack.push(line);
 });
 for(let i=stack.length-2;i>=0;i--)actions.push({type:'move_layer',targetId:stack[i],beforeId:stack[i+1]});if(actions.length>64)throw Error('Fracture action budget');
 return{format:'autopromote-scene-actions',version:1,name:'Glass Current / whole-picture fracture',projectId:d.projectId,baseRevision:d.revision,graphics:{format:'autopromote-graphics',version:1,name:'Glass Current / twelve editable cut edges',width:1280,height:720,duration:16,layers,groups:[]},actions};
};
