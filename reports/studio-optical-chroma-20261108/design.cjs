// Optical compositing study. Every lens is a set of native moving video masks,
// not a pre-rendered effect or a shader outside the saved Studio project.
module.exports=function design(saved){
 const s=saved.snapshot,d=s.studioDocument,duration=16,actions=[],layers=[],stack=[];
 if(d.outputTimeMap.at(-1).outputRange.endTick!==duration*90000)throw Error('Expected16s timeline');
 const k=(property,time,value)=>({property,time,value,easing:'bezier',curve:[.42,0,.58,1]});
 const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">${body}</svg>`;
 const art=(id,name,a,b,body,keys=[])=>{layers.push({id,name,type:'artwork',svg:svg(body),startTime:a,duration:b-a,x:50,y:50,width:100,height:100,scale:1,rotation:0,opacity:1,keys});return id};
 const keyActions=(id,keys)=>{for(let i=0;i<keys.length;i+=128)actions.push({type:'keys',targetId:id,keys:keys.slice(i,i+128)})};
 const shape=(rx,ry,n,angle)=>Array.from({length:32},(_,i)=>{const a=i*Math.PI/16,co=Math.cos(a),si=Math.sin(a),x=rx*Math.sign(co)*Math.abs(co)**(2/n),y=ry*Math.sign(si)*Math.abs(si)**(2/n),r=angle*Math.PI/180;return[x*Math.cos(r)-y*Math.sin(r),x*Math.sin(r)+y*Math.cos(r)]});
 const path=points=>'polygon('+points.map(p=>p.map(v=>v.toFixed(6)+'%').join(' ')).join(', ')+')';
 const xy=(z,p)=>[(1-z)*p[0]+z*50,(1-z)*p[1]+z*50];
 const media=name=>{const m=s.projectMedia.find(m=>m.name===name+'.mp4'&&m.status==='ready');if(!m)throw Error('Missing source '+name);return m};
 function lens(id,name,source,a,b,sourceStart,poses,radii,n,angle,zooms){
  // Source clock is identical to the background: the effect changes spatial
  // sampling, never delays the performance as in the previous time-strip films.
  const visible=[k('opacity',a,0),k('opacity',a+.45,1),k('opacity',b-.45,1),k('opacity',b,0)];
  const pts=shape(...radii,n,angle),outline=pts.map(([x,y])=>`${640+x},${360+y}`).join(' ');
  const rim=art(id+'_rim',name+' / physical edge',a,b,`<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".88"/><stop offset=".25" stop-color="#f9beff" stop-opacity=".32"/><stop offset=".55" stop-color="#000000" stop-opacity=".65"/><stop offset=".8" stop-color="#b4efff" stop-opacity=".6"/><stop offset="1" stop-color="#ffffff" stop-opacity=".9"/></linearGradient><filter id="s"><feGaussianBlur stdDeviation="9"/></filter></defs><polygon points="${outline}" fill="#000000" opacity=".035" transform="translate(0 8)" filter="url(#s)"/><polygon points="${outline}" fill="none" stroke="url(#c)" stroke-width="1.8"/>`,[...visible,...poses.flatMap(([t,x,y])=>[k('x',t,x),k('y',t,y)])]);
  for(let j=0;j<zooms.length;j++){
   const z=zooms[j],fraction=1-j*.105,geometry=shape(radii[0]*fraction,radii[1]*fraction,n,angle),p0=poses[0],center=xy(z,[p0[1],p0[2]]),mask=geometry.map(([dx,dy])=>[p0[1]+dx/(1280*z)*100,p0[2]+dy/(720*z)*100]);
   const local=id+'_'+j;actions.push({type:'media_plane',id:local,name:name+' / refraction '+(j+1),sourceMediaId:source.id,sourceStart,startTime:a,duration:b-a,transform:{x:center[0],y:center[1],scale:z/.7,rotation:0,opacity:0},mask:{enabled:true,shape:'polygon',path:path(mask),feather:j?3:0.5,inverted:false}});
   const keys=[...visible];for(const[t,x,y]of poses){const c=xy(z,[x,y]);keys.push(k('x',t,c[0]),k('y',t,c[1]));geometry.forEach(([dx,dy],i)=>keys.push(k('maskPoint'+i+'X',t,x+dx/(1280*z)*100),k('maskPoint'+i+'Y',t,y+dy/(720*z)*100)));}
   keyActions(local,keys);stack.push(local);
  }
  // The lip/shadow sits above the nested video surfaces. This is a photographed
  // glass approximation, not a claim of raytraced optical material simulation.
  stack.push(rim);
 }
 const bloom=media('bloom'),blue=media('blue');
 actions.push({type:'adjustment',id:'warm_ink',name:'Warm ink / deep colour',startTime:0,duration:3,grade:{exposureStops:.08,contrast:1.12,saturation:1.12}},{type:'adjustment',id:'cool_ink',name:'Cool ink / crisp microstructure',startTime:3,duration:13,grade:{exposureStops:-.16,contrast:1.22,saturation:1.24}});
 lens('hero','Travelling cut-glass lens',bloom,.75,3,1.75,[[.75,22,48],[1.8,45,50],[3,65,51]],[168,168],4.2,-17,[1.04,1.15,1.32,1.55,1.9]);
 lens('capsule','Floating glass capsule',blue,8,15.6,5,[[8,17,38],[11.6,45,37],[15.6,78,35]],[229,79],4.5,18,[1.04,1.3,1.75]);
 lens('drop','Counter-moving water lens',blue,8,15.6,5,[[8,81,70],[11.6,60,66],[15.6,25,68]],[103,124],2,-14,[1.04,1.32,1.85]);
 const end=art('end','Final falloff',15.45,16,'<rect width="1280" height="720" fill="#03070e"/>',[k('opacity',15.45,0),k('opacity',15.9583333333,1)]);stack.push(end);
 const opening=art('opening','First breath',0,.3,'<rect width="1280" height="720" fill="#03070e"/>',[k('opacity',0,1),k('opacity',.3,0)]);stack.push(opening);
 for(let i=stack.length-2;i>=0;i--)actions.push({type:'move_layer',targetId:stack[i],beforeId:stack[i+1]});
 if(actions.length>64)throw Error('Action budget: '+actions.length);return{format:'autopromote-scene-actions',version:1,projectId:d.projectId,baseRevision:d.revision,name:'Glass Current / spatial refraction study',graphics:{format:'autopromote-graphics',version:1,name:'Glass Current / optical edges',width:1280,height:720,duration,layers,groups:[]},actions};
};
