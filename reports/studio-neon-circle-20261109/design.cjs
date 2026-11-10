const prep=require('./one-preparation.json');
module.exports=s=>{
 const actions=[],layers=[],end=8,cx=50,cy=73,rx=34,ry=8,leadScale=1.25;
 const key=(property,time,value,ease=false)=>({property,time:Math.round(time*90000)/90000,value,easing:ease?'bezier':'linear',...(ease?{curve:[.2,.85,.25,1]}:{})});
 const art=(id,name,svg,alpha=1)=>({id,name,type:'artwork',svg,startTime:0,duration:end,x:50,y:50,width:100,height:100,scale:1,rotation:0,opacity:alpha,keys:[]});
 layers.push(art('stage','Circle / midnight stage','<svg xmlns="http://www.w3.org/2000/svg" width="576" height="1024" viewBox="0 0 576 1024"><defs><radialGradient id="b" cx="50%" cy="38%" r="75%"><stop stop-color="#293745"/><stop offset=".48" stop-color="#101923"/><stop offset="1" stop-color="#05090e"/></radialGradient><radialGradient id="l"><stop stop-color="#8ea5b6" stop-opacity=".16"/><stop offset="1" stop-color="#8ea5b6" stop-opacity="0"/></radialGradient><radialGradient id="sh"><stop stop-color="#000000" stop-opacity=".85"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient><linearGradient id="f" x2="0" y2="1"><stop stop-color="#18242c" stop-opacity="0"/><stop offset=".65" stop-color="#1b2831" stop-opacity=".5"/><stop offset="1" stop-color="#03080e"/></linearGradient></defs><path fill="url(#b)" d="M0 0h576v1024H0z"/><path fill="url(#f)" d="M0 475h576v549H0z"/><ellipse cx="288" cy="819" rx="180" ry="90" fill="url(#l)"/><ellipse cx="288" cy="822" rx="48" ry="12" fill="url(#sh)"/></svg>'));
 const spots=[['#00bdff',85,807,150,88],['#7c20ff',145,666,140,75],['#e71acc',305,604,140,70],['#ff7c12',449,720,150,80],['#ffc729',474,852,140,86]];
 const defs=spots.map(([color,x,y,w,h],i)=>`<radialGradient id="c${i}"><stop stop-color="${color}" stop-opacity=".48"/><stop offset=".3" stop-color="${color}" stop-opacity=".2"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`).join('');
 const wash=art('floor','Circle / broad floor light',`<svg xmlns="http://www.w3.org/2000/svg" width="576" height="1024"><defs>${defs}</defs>${spots.map(([c,x,y,w,h],i)=>`<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="url(#c${i})"/>`).join('')}</svg>`,0);
 wash.keys=[key('opacity',0,0),key('opacity',.55,.9),key('opacity',7,.9),key('opacity',7.72,0)];layers.push(wash);
 const atmosphere=art('haze','Circle / coloured atmosphere','<svg xmlns="http://www.w3.org/2000/svg" width="576" height="1024"><defs><radialGradient id="c"><stop stop-color="#00aaff" stop-opacity=".38"/><stop offset="1" stop-color="#0077ff" stop-opacity="0"/></radialGradient><radialGradient id="m"><stop stop-color="#b700e0" stop-opacity=".32"/><stop offset="1" stop-color="#b700e0" stop-opacity="0"/></radialGradient><radialGradient id="o"><stop stop-color="#ff5800" stop-opacity=".3"/><stop offset="1" stop-color="#ff5800" stop-opacity="0"/></radialGradient><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".01 .018" numOctaves="3" seed="18"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".35"/></feComponentTransfer></filter><mask id="cloud"><rect width="576" height="1024" filter="url(#n)" fill="white"/></mask></defs><g mask="url(#cloud)"><ellipse cx="100" cy="460" rx="180" ry="340" fill="url(#c)"/><ellipse cx="300" cy="300" rx="230" ry="220" fill="url(#m)"/><ellipse cx="500" cy="460" rx="180" ry="340" fill="url(#o)"/></g></svg>',0);
 atmosphere.keys=[key('opacity',0,0),key('opacity',1.1,.8),key('opacity',6.9,.8),key('opacity',7.75,0),key('x',0,48),key('x',8,52),key('scale',0,1),key('scale',8,1.12)];layers.push(atmosphere);
 const palette=['#145fff','#8f13ff','#ff168f','#ff4a12','#ffc421','#00dfff'];
 const angles=[-150,-115,-65,-30,25,155];
 const foot=t=>{let j=Math.max(0,Math.min(191,Math.round(t*24))),x=0,y=0,n=0;for(let k=Math.max(0,j-3);k<=Math.min(191,j+3);k++){const f=prep.feet[k].feet[0];x+=f.x;y+=f.y;n++}return{x:x/n,y:y/n}};
 const pose=(x,y,scale,t)=>{const f=foot(t);return{x:x+(50-f.x)*scale,y:y+(50-f.y)*scale,scale:scale/.7,rotation:0,opacity:1}};
 const copies=angles.map((deg,i)=>{const a=deg*Math.PI/180,back=Math.sin(a)<0;return{i,x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a),scale:back?1.06:1.12,a:.38+i*.1,lag:(i+1)*.1}}).sort((a,b)=>a.y-b.y);
 const fill=color=>({kind:'none',color,endColor:color,start:[0,0],end:[100,100]});
 const ellipse=a=>({x:cx+rx*Math.cos(a),y:50+6*Math.sin(a)/(576/1024)}),kk=.5522847498;
 for(let q=0;q<4;q++){
  const a=q*Math.PI/2,b=a+Math.PI/2,p=ellipse(a),z=ellipse(b),color=['#ffac19','#f329d5','#10d6ff','#9c26fa'][q];
  for(const core of [false,true]){
   const id=`ring_${q}_${core?'core':'light'}`,o={id,name:`Circle / ${q+1} ${core?'core':'light'}`,type:'artwork',vectorShape:{version:1,closed:false,nodes:[{x:p.x,y:p.y,in:[0,0],out:[-Math.sin(a)*rx*kk,Math.cos(a)*6*kk/(576/1024)]},{x:z.x,y:z.y,in:[Math.sin(b)*rx*kk,-Math.cos(b)*6*kk/(576/1024)],out:[0,0]}],fill:fill(color),stroke:{color:core?'#fff1e8':color,width:core?.18:1.15}},startTime:0,duration:8,x:50,y:80,width:100,height:100,scale:1,rotation:0,opacity:0,keys:[key('opacity',0,0),key('opacity',.55,core?.9:1),key('opacity',7,core?.9:1),key('opacity',7.72,0)]};
   layers.push(o);if(core)o.keys=[key('opacity',0,0),key('opacity',.82+q*.08,0),key('opacity',1+q*.08,.9),key('opacity',7,.9),key('opacity',7.72,0)];if(!core)actions.push({type:'keys',targetId:id,keys:[key('strokeEnd',.08+q*.08,0),key('strokeEnd',.8+q*.08,100,true)]});
   if(!core)actions.push({type:'layer_style',targetId:id,style:{glow:{enabled:true,color,radius:28,intensity:.92}}});
  }
 }
 const shadowDefs='<radialGradient id="s"><stop stop-color="#000000" stop-opacity=".82"/><stop offset=".38" stop-color="#000000" stop-opacity=".4"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient>';
 const contacts=art('contacts','Circle / grounded contact shadows',`<svg xmlns="http://www.w3.org/2000/svg" width="576" height="1024"><defs>${shadowDefs}</defs>${[...copies,{x:50,y:80}].map(c=>`<ellipse cx="${c.x*5.76}" cy="${c.y*10.24+3}" rx="38" ry="10" fill="url(#s)"/>`).join('')}</svg>`,0);
 contacts.keys=[key('opacity',0,0),key('opacity',1.6,.8),key('opacity',7,.8),key('opacity',7.72,0)];layers.push(contacts);
 actions.push({type:'keys',targetId:'main-video',keys:[key('opacity',0,0),key('opacity',8,0)]});
 const fg=s.projectMedia.find(m=>m.name===prep.foregroundName),matte=s.projectMedia.find(m=>m.name==='number one - subject matte.mp4');if(!fg||!matte)throw Error('Exact foreground/matte media required');
 function subject(c){
  const natural=!c,i=natural?'lead':c.i,start=natural?0:c.a,lag=natural?0:c.lag,sourceAt=start-lag,length=end-start,scale=natural?leadScale:c.scale,point=natural?{x:50,y:80}:c,base=pose(point.x,point.y,scale,sourceAt),pic=`picture_${i}`,mask=`matte_${i}`;
  for(const [id,name,media]of [[mask,`Circle / matte ${i}`,matte],[pic,natural?'Circle / lead':`Circle / vivid double ${c.i+1}`,fg]])actions.push({type:'media_plane',id,name,sourceMediaId:media.id,sourceStart:sourceAt,startTime:start,duration:length,transform:base,mask:{enabled:false,shape:'rectangle',feather:0,inverted:false}});
  actions.push({type:'matte',targetId:pic,matteSourceId:mask,mode:'luma'});
  for(const id of [pic,mask]){
   const times=[start,...Array.from({length:49},(_,j)=>Math.round((start+(8-start)*j/49)*90000)/90000).filter(t=>t>start&&t<8),8],keys=[];
   for(const t of times){const f=pose(point.x,point.y,scale,sourceAt+t-start);let k=1;if(!natural){k=Math.min(1,(t-start)/.72,Math.max(0,(7.72-t)/.55));k=Math.max(0,k);k=1-(1-k)**3;const from=pose(50,80,leadScale,sourceAt+t-start);f.x=from.x+(f.x-from.x)*k;f.y=from.y+(f.y-from.y)*k;}
    const si=Math.max(0,Math.min(191,Math.round((sourceAt+t-start)*24))),near=prep.subjectBounds.slice(Math.max(0,si-6),Math.min(192,si+7)),left=Math.min(...near.map(b=>b.left)),right=Math.max(...near.map(b=>b.right));f.x=Math.max(3-(left-50)*scale,Math.min(97-(right-50)*scale,f.x));keys.push(key('x',t,f.x),key('y',t,f.y));
   }
   if(id===pic)keys.push(...(natural?[key('opacity',0,1),key('opacity',8,1)]:[key('opacity',start,0),key('opacity',start+.16,1),key('opacity',7.1,1),key('opacity',7.72,0),key('opacity',8,0)]));
   actions.push({type:'keys',targetId:id,keys});
  }
  actions.push({type:'layer_style',targetId:pic,style:{matteSurface:{enabled:true,glowColor:natural?'#ab8dfb':palette[c.i],glowRadius:natural?2.5:4,glowIntensity:natural?.38:.88,reflectionEnabled:true,floorY:point.y,reflectionOpacity:natural?.42:.48,fadeHeight:22},colorize:natural?{enabled:true,color:'#f0f0fc',strength:.42,gamma:.48,lift:0,contrast:1.7}:{enabled:true,color:palette[c.i],strength:.98,gamma:.35,lift:.015,contrast:2.4}}});
 }
 copies.filter(c=>c.y<cy).forEach(subject);subject(null);copies.filter(c=>c.y>=cy).forEach(subject);
 if(actions.length>64)throw Error('Action limit');
 return{format:'autopromote-scene-actions',version:1,projectId:s.studioDocument.projectId,baseRevision:s.studioDocument.revision,name:'Copy circle / depth, texture and floor-light rebuild',graphics:{format:'autopromote-graphics',version:1,name:'Midnight floor / light, contact and editable vector circle',width:576,height:1024,duration:8,layers,groups:[]},actions};
};
