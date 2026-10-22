// An alternate authoring arrangement of the same native images, titles,
// percentage masks and transform keys. No separate preview/render runtime.
export function buildStudioLogoDiamondMotion({bitmap,symbol,wordmark,brandName,accent,duration,programmeDuration,
  width,height,includeBackground,measure,pieceColumns,encodeCrop}) {
  const layers=[],groups=[],ids=[],ratio=width/height,layout=720*ratio;
  const time=t=>Math.round(t*duration/10*90000)/90000,ease=[.16,1,.3,1],soft=[.65,0,.35,1];
  const add=(name,a,b,fields)=>{const layer={id:`diamond-${layers.length}`,name,startTime:time(a),duration:time(b)-time(a),
    x:50,y:50,width:100,scale:1,rotation:0,opacity:1,keys:[],...fields};layers.push(layer);return layer;};
  const key=(layer,property,points,curve=ease)=>points.forEach(([t,value])=>layer.keys.push({property,time:time(t),value:value===0?0:value,easing:'bezier',curve}));
  const art=(name,a,b,svg,w,h,fields={})=>add(name,a,b,{type:'artwork',svg,width:w,height:h,...fields});
  const shape=(name,a,b,body,w,h,fields={})=>art(name,a,b,`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(2,Math.round(w*12.8))}" height="${Math.max(2,Math.round(h*7.2))}" viewBox="0 0 1280 720" preserveAspectRatio="none">${body}</svg>`,w,h,fields);
  const mask=path=>({enabled:true,shape:'polygon',path,feather:0,inverted:false});
  const [bx,by,bw,bh]=bitmap.bounds,fullWidth=Math.min(86,44/ratio*bw/bh),fullHeight=fullWidth*ratio*bh/bw;
  const geometry=b=>({width:fullWidth*b[2]/bw,height:fullHeight*b[3]/bh,
    x:50-fullWidth/2+(b[0]-bx+b[2]/2)*fullWidth/bw,
    y:39-fullHeight/2+(b[1]-by+b[3]/2)*fullHeight/bh});
  if(includeBackground)shape('Stage / lavender paper',0,10,'<rect width="1280" height="720" fill="#f6f2ff"/>',100,100);
  for(let i=0;i<6;i++){
    const a=4.28+i*.065,b=6.9,angle=i*Math.PI/3;
    const petal=shape(`Cascade / flying diamond ${i+1}`,a,b,`<path d="M640 0 1280 360 640 720 0 360Z" fill="${i%2?'#00c7f4':accent}"/>`,1.6,2.8,{x:50,y:39});
    key(petal,'x',[[a,50],[a+.6,50+Math.cos(angle)*34],[b,50+Math.cos(angle)*42]],soft);
    key(petal,'y',[[a,39],[a+.6,39+Math.sin(angle)*24],[b,39+Math.sin(angle)*28]],soft);
    key(petal,'rotation',[[a,i*30-75],[b,i*30+105]]);
    key(petal,'opacity',[[a,0],[a+.15,.65],[a+.7,.4],[b,0]]);
  }
  const sg=geometry(symbol.bounds),symbolPaths=['polygon(0% 0%,60% 0%,70% 38%,0% 86%)',
    'polygon(60% 0%,100% 0%,100% 100%,0% 100%,0% 86%,70% 38%)',
    'polygon(0% 80%,100% 15%,100% 50%,0% 100%)'];
  symbolPaths.forEach((path,i)=>{
    const a=4.25+i*.14,arrive=5.3+i*.12,part=art(`Construction / symbol ribbon ${i+1}`,a,5.72,symbol.svg,sg.width,sg.height,{x:sg.x,y:sg.y,mask:mask(path)});
    key(part,'x',[[a,[70,8,50][i]],[a+.4,sg.x+[8,-6,10][i]],[arrive,sg.x],[5.72,sg.x]]);
    key(part,'y',[[a,[16,18,12][i]],[a+.4,sg.y+[-5,4,4][i]],[arrive,sg.y],[5.72,sg.y]]);
    key(part,'rotation',[[a,[120,-115,70][i]],[a+.4,[-18,15,-20][i]],[arrive,0],[5.72,0]]);
    key(part,'scale',[[a,1.45],[a+.4,.95],[arrive,1],[5.72,1]]);
    key(part,'opacity',[[a,0],[a+.08,1],[5.58,1],[5.72,0]]);ids.push(part.id);
  });
  const mark=art('Mark / gradient symbol',5.5,7.05,symbol.svg,sg.width,sg.height,{x:sg.x,y:sg.y});
  key(mark,'opacity',[[5.5,0],[5.65,1],[7.05,1]]);ids.push(mark.id);
  const [wx,wy,ww,wh]=wordmark.bounds,sequence=Array.from({length:pieceColumns},(_,i)=>i)
    .sort((a,b)=>Math.abs(a-(pieceColumns-1)/2)-Math.abs(b-(pieceColumns-1)/2)||a-b);
  const rank=new Map(sequence.map((column,i)=>[column,i]));
  for(let column=0;column<pieceColumns;column++){
    const x=wx+Math.round(ww*column/pieceColumns),end=wx+Math.round(ww*(column+1)/pieceColumns),bounds=[x,wy,end-x,wh];
    const g=geometry(bounds),url=encodeCrop(bitmap,bounds);
    if(typeof url!=='string'||url.length>180000||!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(url))throw Error('The wordmark pieces could not be cropped within the artwork budget.');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${end-x}" height="${wh}" viewBox="0 0 ${end-x} ${wh}"><image width="${end-x}" height="${wh}" href="${url}"/></svg>`;
    const paths=column%2?['polygon(0% 0%,100% 0%,0% 100%)','polygon(100% 0%,100% 100%,0% 100%)']
      :['polygon(0% 0%,100% 0%,100% 100%)','polygon(0% 0%,100% 100%,0% 100%)'];
    paths.forEach((path,half)=>{
      const a=4.65+rank.get(column)*.055+half*.08,arrive=5.75+rank.get(column)*.065+half*.09;
      const angle=column/pieceColumns*Math.PI*2+half*Math.PI,part=art(`Wordmark pieces / ${column+1} ${half?'lower':'upper'}`,a,7.05,svg,g.width,g.height,{x:g.x,y:g.y,mask:mask(path)});
      const safeY=value=>Math.max(10,Math.min(56-g.height*.6,value));
      const startX=Math.max(4,Math.min(96,g.x+Math.cos(angle)*18)),startY=safeY(g.y+Math.sin(angle)*26);
      key(part,'x',[[a,startX],[a+.35,Math.max(4,Math.min(96,g.x-Math.sin(angle)*6))],[arrive,g.x],[7.05,g.x]]);
      key(part,'y',[[a,startY],[a+.35,safeY(g.y+Math.cos(angle)*7)],[arrive,g.y],[7.05,g.y]]);
      key(part,'rotation',[[a,half?-110:110],[a+.35,half?16:-16],[arrive,0],[7.05,0]]);
      key(part,'scale',[[a,.4],[a+.35,1.15],[arrive,1],[7.05,1]]);
      key(part,'opacity',[[a,0],[a+.08,1],[7.05,1]]);ids.push(part.id);
    });
  }
  const full=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.round(1200*bh/bw)}" viewBox="${bitmap.bounds.join(' ')}"><image width="${bitmap.width}" height="${bitmap.height}" href="${bitmap.dataUrl}"/></svg>`;
  const original=art('Mark / continuous original lockup',7,10,full,fullWidth,fullHeight,{y:39});
  key(original,'opacity',[[7,0],[7.05,1],[10,1]]);ids.push(original.id);
  groups.push({id:'identity',name:'Identity / diamond cascade',startTime:0,duration,layerIds:ids,keys:[]});
  const words=['Create.','Schedule.','Publish.','Move','forward.'],portrait=ratio<1;
  const poses=portrait?[[50,62],[50,69],[50,76],[35,85],[65,85]]:[[27,66],[50,66],[74,66],[40,79],[58,79]];
  const wedges=['polygon(0% 0%,100% 0%,50% 50%)','polygon(100% 0%,100% 100%,50% 50%)',
    'polygon(100% 100%,0% 100%,50% 50%)','polygon(0% 100%,0% 0%,50% 50%)'];
  words.forEach((text,index)=>{
    const a=index*.82,arrive=a+.62,handoff=a+.72,[x,y]=poses[index],wordIds=[];
    const heroScale=Math.min(portrait?2.15:4,layout*.73/(measure(text)+32)),finalScale=portrait?.76:1.5;
    const wordWidth=Math.max(15,Math.min(90,(measure(text)+32)/layout*100+1));
    wedges.forEach((path,piece)=>{
      const begin=a+piece*.035,angle=piece*Math.PI/2+index*.25;
      const item=add(`Words / ${text} / piece ${piece+1}`,begin,handoff,{type:'text',text,fontWeight:800,textAlign:'center',color:'#24133e',width:wordWidth,scale:heroScale,x:50,y:40,mask:mask(path)});
      key(item,'x',[[begin,50+Math.cos(angle)*18],[arrive-.2,50-Math.cos(angle)*1.5],[arrive,50],[handoff,50]]);
      key(item,'y',[[begin,40+Math.sin(angle)*23],[arrive-.2,40-Math.sin(angle)*2],[arrive,40],[handoff,40]]);
      key(item,'rotation',[[begin,(piece%2?1:-1)*(55+index*8)],[arrive-.2,(piece%2?-1:1)*5],[arrive,0],[handoff,0]]);
      key(item,'opacity',[[begin,0],[begin+.05,1],[handoff,1]]);wordIds.push(item.id);
    });
    const whole=add(`Words / ${text} / continuous`,handoff,10,{type:'text',text,fontWeight:800,textAlign:'center',color:'#24133e',width:wordWidth,scale:finalScale,x,y});
    key(whole,'x',[[handoff,50],[a+1.1,x],[10,x]],soft);
    key(whole,'y',[[handoff,40],[a+1.1,y],[10,y]],soft);
    key(whole,'scale',[[handoff,heroScale],[a+1.1,finalScale],[10,finalScale]],soft);wordIds.push(whole.id);
    groups.push({id:`word-${index}`,name:`Word / ${text}`,startTime:time(a),duration:time(10)-time(a),layerIds:wordIds,keys:[]});
  });
  return {format:'autopromote-graphics',version:1,name:`${brandName} / Diamond cascade`,width,height,duration:programmeDuration,layers,groups};
}
