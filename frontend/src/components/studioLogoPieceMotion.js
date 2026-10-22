// Author a piece construction using ordinary images, masked titles and keys.
// Cropping preserves source RGBA; these are bitmap pieces, not vector contours.
import { separateStudioLogoParts } from './studioLogoParts';
import { buildStudioLogoDiamondMotion } from './studioLogoDiamondMotion';

export function cropStudioLogoBitmap(bitmap, bounds) {
  const [x,y,w,h]=bounds, canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');
  const image=context.createImageData(w,h);
  for(let row=0;row<h;row++)image.data.set(bitmap.pixels.subarray(((y+row)*bitmap.width+x)*4,((y+row)*bitmap.width+x+w)*4),row*w*4);
  context.putImageData(image,0,0);return canvas.toDataURL('image/png');
}

export function buildStudioLogoPieceMotion({bitmap,brandName,accent,duration,programmeDuration,width,height,
  includeBackground,measure,symbolWidth=28,pieceColumns=11,pieceStyle='spring',encodeCrop=cropStudioLogoBitmap}) {
  if(!Number.isInteger(pieceColumns)||pieceColumns<2||pieceColumns>16)throw Error('Choose 2–16 wordmark slices.');
  if(!['spring','diamond'].includes(pieceStyle))throw Error('Choose Spring assembly or Diamond cascade.');
  const [symbol,wordmark]=separateStudioLogoParts(bitmap,symbolWidth);
  if(pieceStyle==='diamond')return buildStudioLogoDiamondMotion({bitmap,symbol,wordmark,brandName,accent,duration,programmeDuration,width,height,includeBackground,measure,pieceColumns,encodeCrop});
  const [bx,by,bw,bh]=bitmap.bounds,ratio=width/height,layout=720*ratio;
  const layers=[],groups=[],markIds=[],time=t=>Math.round(t*duration/10*90000)/90000;
  const ease=[.18,1,.3,1],spring=[.2,1.35,.35,1],soft=[.65,0,.35,1];
  const add=(name,a,b,fields)=>{const layer={id:`piece-${layers.length}`,name,startTime:time(a),duration:time(b)-time(a),
    x:50,y:50,width:100,scale:1,rotation:0,opacity:1,keys:[],...fields};layers.push(layer);return layer;};
  const key=(layer,property,points,curve=ease)=>points.forEach(([t,value])=>layer.keys.push({property,time:time(t),value:value===0?0:value,easing:'bezier',curve}));
  const art=(name,a,b,svg,w,h,fields={})=>add(name,a,b,{type:'artwork',svg,width:w,height:h,...fields});
  const shape=(name,a,b,body,w,h,fields={})=>art(name,a,b,`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(2,Math.round(w*12.8))}" height="${Math.max(2,Math.round(h*7.2))}" viewBox="0 0 1280 720" preserveAspectRatio="none">${body}</svg>`,w,h,fields);
  const mask=path=>({enabled:true,shape:'polygon',path,feather:0,inverted:false});
  const fullWidth=Math.min(86,44/ratio*bw/bh),fullHeight=fullWidth*ratio*bh/bw;
  const geometry=b=>({width:fullWidth*b[2]/bw,height:fullHeight*b[3]/bh,
    x:50-fullWidth/2+(b[0]-bx+b[2]/2)*fullWidth/bw,
    y:42-fullHeight/2+(b[1]-by+b[3]/2)*fullHeight/bh});
  const sg=geometry(symbol.bounds),heroWidth=Math.min(40,62/ratio),heroHeight=heroWidth*ratio*symbol.bounds[3]/symbol.bounds[2];
  if(includeBackground){
    shape('Stage / plum',0,10,'<rect width="1280" height="720" fill="#10091f"/>',100,100);
    const light=shape('Stage / expanding pearl',1.15,10,'<circle cx="640" cy="360" r="640" fill="#f6f2ff"/>',100,100);
    key(light,'scale',[[1.15,.1],[1.85,1.7],[10,1.7]],soft);
  }
  // Short directional accents stay behind the identity and clear its reading.
  for(let i=0;i<3;i++){
    const a=.25+i*.16,b=1.9+i*.06;
    const stroke=shape(`Assembly / orbit ${i+1}`,a,b,`<path d="M80 550 Q640 -120 1200 550" fill="none" stroke="${i===1?'#00c7f4':accent}" stroke-width="${4-i}" stroke-dasharray="180 1400"/>`,84,70);
    key(stroke,'rotation',[[a,-90+i*60],[b,80+i*60]],soft);
    key(stroke,'opacity',[[a,0],[a+.18,.65],[b-.3,.3],[b,0]]);
  }
  const symbolPaths=['polygon(0% 0%,60% 0%,70% 38%,0% 86%)',
    'polygon(60% 0%,100% 0%,100% 100%,0% 100%,0% 86%,70% 38%)',
    'polygon(0% 80%,100% 15%,100% 50%,0% 100%)'];
  symbolPaths.forEach((path,i)=>{
    const a=i*.16,part=art(`Construction / symbol ribbon ${i+1}`,a,1.65,symbol.svg,heroWidth,heroHeight,{mask:mask(path)});
    key(part,'x',[[a,[19,81,25][i]],[1.04+i*.08,50],[1.65,50]],spring);
    key(part,'y',[[a,[72,26,76][i]],[1.04+i*.08,48],[1.65,48]],spring);
    key(part,'rotation',[[a,[-65,70,-25][i]],[1.04+i*.08,0],[1.65,0]],spring);
    key(part,'scale',[[a,1.3],[1.04+i*.08,1],[1.65,1]]);
    key(part,'opacity',[[a,1],[1.48,1],[1.65,0]]);markIds.push(part.id);
  });
  const mark=art('Mark / gradient symbol',1.4,4.85,symbol.svg,heroWidth,heroHeight);
  key(mark,'x',[[1.4,50],[1.65,50],[2.25,sg.x],[4.85,sg.x]],soft);
  key(mark,'y',[[1.4,48],[1.65,48],[2.25,sg.y],[4.85,sg.y]],soft);
  key(mark,'scale',[[1.4,1],[1.65,1],[2.25,sg.width/heroWidth],[4.85,sg.width/heroWidth]],soft);
  key(mark,'opacity',[[1.4,0],[1.55,1],[4.85,1]]);markIds.push(mark.id);
  const [wx,wy,ww,wh]=wordmark.bounds;
  const paths=['polygon(0% 0%,100% 0%,100% 38%,65% 38%,50% 62%,35% 38%,0% 38%)',
    'polygon(0% 38%,35% 38%,50% 62%,65% 38%,100% 38%,100% 100%,0% 100%)'];
  for(let column=0;column<pieceColumns;column++){
    const x=wx+Math.round(ww*column/pieceColumns),end=wx+Math.round(ww*(column+1)/pieceColumns);
    const bounds=[x,wy,end-x,wh],g=geometry(bounds),url=encodeCrop(bitmap,bounds);
    if(typeof url!=='string'||url.length>180000||!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(url))throw Error('The wordmark pieces could not be cropped within the artwork budget.');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${end-x}" height="${wh}" viewBox="0 0 ${end-x} ${wh}"><image width="${end-x}" height="${wh}" href="${url}"/></svg>`;
    paths.forEach((path,half)=>{
      const a=1.85+column*.085+half*.09,arrive=3.08+column*.09+half*.08;
      const part=art(`Wordmark pieces / ${column+1} ${half?'lower':'upper'}`,a,4.85,svg,g.width,g.height,{x:g.x,y:g.y,mask:mask(path)});
      const sign=half?1:-1,arc=Math.sin(column/(pieceColumns-1)*Math.PI);
      key(part,'x',[[a,Math.max(6,Math.min(94,g.x+sign*(9+arc*9)))],[arrive-.34,g.x-sign*.75],[arrive,g.x],[4.85,g.x]],spring);
      key(part,'y',[[a,g.y+sign*(16+arc*12)],[arrive-.34,g.y-sign*1.4],[arrive,g.y],[4.85,g.y]],spring);
      key(part,'rotation',[[a,sign*(38+column%3*15)],[arrive-.34,-sign*4],[arrive,0],[4.85,0]],spring);
      key(part,'scale',[[a,1.3],[arrive-.34,1.04],[arrive,1],[4.85,1]]);
      key(part,'opacity',[[a,0],[a+.08,1],[4.85,1]]);markIds.push(part.id);
    });
  }
  const full=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.round(1200*bh/bw)}" viewBox="${bitmap.bounds.join(' ')}"><image width="${bitmap.width}" height="${bitmap.height}" href="${bitmap.dataUrl}"/></svg>`;
  const original=art('Mark / continuous original lockup',4.8,10,full,fullWidth,fullHeight,{y:42});
  key(original,'opacity',[[4.8,0],[4.85,1],[10,1]]);markIds.push(original.id);
  groups.push({id:'identity',name:'Identity / interlocking source pieces',startTime:0,duration,layerIds:markIds,keys:[]});
  // Every word is cut through all of its letter strokes into three zigzag
  // bands. Separate native title layers retain text editing and mask controls.
  const words=['Create.','Schedule.','Publish.','Move','forward.'];
  const wordPaths=['polygon(0% 0%,100% 0%,100% 33%,75% 47%,50% 33%,25% 47%,0% 33%)',
    'polygon(0% 33%,25% 47%,50% 33%,75% 47%,100% 33%,100% 67%,75% 53%,50% 67%,25% 53%,0% 67%)',
    'polygon(0% 67%,25% 53%,50% 67%,75% 53%,100% 67%,100% 100%,0% 100%)'];
  // On narrower programmes, keep all five words in readable stacked rows.
  const portrait=ratio<1,scale=portrait?.76:1.5;
  const poses=portrait?[[50,64],[50,71],[50,78],[35,86],[65,86]]:[[27,66],[50,66],[74,66],[40,78],[58,78]];
  words.forEach((text,index)=>{
    const [x,y]=poses[index],a=4.95+index*.48,arrive=a+.9,ids=[];
    const wordWidth=Math.max(8,Math.min(90,(measure(text)+32)/layout*100+1));
    for(let band=0;band<3;band++){
      const begin=a+band*.075,layer=add(`Words / ${text} / piece ${band+1}`,begin,8.25,{type:'text',text,fontWeight:800,textAlign:'center',
        color:'#24133e',width:wordWidth,scale,x,y,mask:mask(wordPaths[band])});
      const sign=band===1?-1:1;
      key(layer,'x',[[begin,x+sign*(band===1?8:3)],[arrive-.18,x-sign*.6],[arrive,x],[8.25,x]],spring);
      key(layer,'y',[[begin,y+(band-1)*12],[arrive-.18,y-(band-1)*.7],[arrive,y],[8.25,y]],spring);
      key(layer,'rotation',[[begin,(band-1)*-20],[arrive-.18,(band-1)*2],[arrive,0],[8.25,0]],spring);
      key(layer,'opacity',[[begin,0],[begin+.08,1],[8.25,1]]);ids.push(layer.id);
    }
    const settled=add(`Words / ${text} / continuous`,8.25,10,{type:'text',text,fontWeight:800,textAlign:'center',color:'#24133e',width:wordWidth,scale,x,y});
    ids.push(settled.id);groups.push({id:`word-${index}`,name:`Word / ${text}`,startTime:time(a),duration:time(10)-time(a),layerIds:ids,keys:[]});
  });
  return {format:'autopromote-graphics',version:1,name:`${brandName} / Piece construction`,width,height,duration:programmeDuration,layers,groups};
}
