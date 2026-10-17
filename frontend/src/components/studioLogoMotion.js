// Logo motion is authored into ordinary Studio graphics and property keys.
// History, preview, grouping and export keep using the canonical editor.
import { sanitizeLogoSvg } from './motion/sanitizeLogoSvg';
import { separateStudioLogoParts } from './studioLogoParts';
import { buildStudioLogoPieceMotion } from './studioLogoPieceMotion';

// Legacy three-stroke example, separated into editable components. Uploaded
// identities retain their own artwork; the app brand uses the supplied PNG.
export const AUTOPROMOTE_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f5f1ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 25 16 7"/><path d="M16 7 27 25"/><path d="M10 21h12"/></svg>';
const EASE = [.16, 1, .3, 1], SOFT = [.65, 0, .35, 1];
const tick = t => Math.round(t * 90000) / 90000;

function splitLogo(markup) {
  if (typeof markup !== 'string' || markup.length > 100000) throw Error('Choose an SVG logo smaller than 100 KB.');
  const clean = sanitizeLogoSvg(markup), doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.documentElement;
  const visible = Array.from(root.children).filter(e => !['defs','title','desc','metadata'].includes(e.localName));
  if (!visible.length || visible.length > 8) throw Error('Use a logo with 1–8 top-level shapes or groups.');
  if (!root.getAttribute('viewBox')) {
    const w = Number(root.getAttribute('width')), h = Number(root.getAttribute('height'));
    if (!(w > 0 && h > 0)) throw Error('The SVG needs a viewBox or numeric width and height.');
    root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }
  root.setAttribute('width','1024'); root.setAttribute('height','1024');
  root.setAttribute('preserveAspectRatio','xMidYMid meet');
  const parts = visible.map((_, i) => {
    const part = root.cloneNode(true);
    Array.from(part.children).filter(e => !['defs','title','desc','metadata'].includes(e.localName))
      .forEach((e,j) => { if (i !== j) e.remove(); });
    return new XMLSerializer().serializeToString(part);
  });
  return {parts,full:new XMLSerializer().serializeToString(root)};
}

export function buildStudioLogoMotion({ svg = AUTOPROMOTE_LOGO_SVG, bitmap, brandName = 'AutoPromote',
  accent = '#a855f7', duration = 10, programmeDuration, width = 1280, height = 720,
  includeBackground = true, separateBitmap = false, symbolWidth = 28, measure, pieceConstruction = false, pieceColumns = 11, pieceStyle = 'spring', encodeCrop }) {
  if (!Number.isFinite(programmeDuration) || !Number.isFinite(duration) || duration < 8 || duration > 14 || duration > programmeDuration)
    throw Error('Use an 8–14 second intro that fits this programme.');
  if (![width,height].every(v => Number.isFinite(v) && v >= 16 && v <= 4096)) throw Error('Invalid programme dimensions.');
  if (!/^#[\da-f]{6}$/i.test(accent)) throw Error('Choose a six-digit accent colour.');
  if (typeof brandName !== 'string' || !brandName.trim() || [...brandName].length > 24 || /[<>\r\n]/.test(brandName))
    throw Error('Use a single-line brand name with 1–24 characters.');
  if (typeof measure !== 'function') throw Error('The brand font must be measured before building its motion.');
  let source;
  if (bitmap) {
    const {dataUrl,width:w,height:h,bounds:b}=bitmap;
    if (typeof dataUrl !== 'string' || dataUrl.length > 340000 || !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) ||
      ![w,h].every(v=>Number.isFinite(v)&&v>0&&v<=4096) || !Array.isArray(b) || b.length!==4 ||
      !b.every(Number.isFinite) || b[0]<0 || b[1]<0 || b[2]<=0 || b[3]<=0 || b[0]+b[2]>w || b[1]+b[3]>h || b[2]/b[3]<.2 || b[2]/b[3]>8)
      throw Error('Choose a local logo image up to 250 KB with valid visible bounds.');
    const full=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.round(1200*b[3]/b[2])}" viewBox="${b.join(' ')}"><image width="${w}" height="${h}" href="${dataUrl}"/></svg>`;
    source={parts:[full,full,full],full};
  } else source=splitLogo(svg);
  const {parts,full}=source, layers = [], markIds = [], typeIds = [], ratio = width / height;
  if (ratio < .5 || ratio > 2) throw Error('Use a portrait, square or landscape programme between 1:2 and 2:1.');
  if(pieceConstruction){
    if(!bitmap||!separateBitmap)throw Error('Choose a bitmap and separate its symbol before constructing words from pieces.');
    return buildStudioLogoPieceMotion({bitmap,brandName,accent,duration,programmeDuration,width,height,includeBackground,measure,pieceColumns,pieceStyle,encodeCrop,symbolWidth});
  }
  const time = v => tick(v * duration / 10), paper = bitmap?'#24133e':'#f5f1ff', dark = bitmap&&!separateBitmap?'#f5f3ff':'#090714';
  const markWidth=bitmap?Math.min(82,42/ratio*bitmap.bounds[2]/bitmap.bounds[3]):34;
  const markHeight=bitmap?markWidth*ratio*bitmap.bounds[3]/bitmap.bounds[2]:Math.min(100,34*ratio);
  const add = (name, a, b, fields = {}) => {
    const item = {id:`logo-${layers.length}`,name,startTime:time(a),duration:tick(time(b)-time(a)),
      x:50,y:50,width:100,scale:1,rotation:0,opacity:1,keys:[],...fields}; layers.push(item); return item;
  };
  const key = (item, property, points, curve = EASE) => {
    points.forEach(([t,value,easing='bezier']) => item.keys.push({property,time:time(t),value,easing,
      ...(easing === 'bezier' ? {curve} : {})})); return item;
  };
  const fade = (item,a,b,attack=.08,release=.16) => key(item,'opacity',[[a,0],[a+attack,1],[b-release,1],[b,0]]);
  const art = (name,a,b,svg,w,h,fields={}) => add(name,a,b,{type:'artwork',svg,width:w,height:h,...fields});
  const shape = (name,a,b,body,w,h,fields={}) => art(name,a,b,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(2,Math.round(w*12.8))}" height="${Math.max(2,Math.round(h*7.2))}" viewBox="0 0 1280 720" preserveAspectRatio="none">${body}</svg>`,w,h,fields);
  const rect = (name,a,b,color,w,h,fields={}) => shape(name,a,b,`<rect width="1280" height="720" fill="${color}"/>`,w,h,fields);
  if (includeBackground) rect('Stage / midnight',0,10,dark,100,100);

  if(bitmap&&separateBitmap){
    const [symbol,wordmark]=separateStudioLogoParts(bitmap,symbolWidth),[bx,by,bw,bh]=bitmap.bounds;
    const geometry=part=>({width:markWidth*part.bounds[2]/bw,height:markHeight*part.bounds[3]/bh,
      x:50-markWidth/2+(part.bounds[0]-bx+part.bounds[2]/2)*markWidth/bw,
      y:48-markHeight/2+(part.bounds[1]-by+part.bounds[3]/2)*markHeight/bh});
    const sg=geometry(symbol),wg=geometry(wordmark);
    // Native masked components carry the source pixels. They are assembled
    // separately, then replaced by the continuous source before camera travel.
    const heroWidth=43,heroHeight=Math.min(94,heroWidth*ratio*symbol.bounds[3]/symbol.bounds[2]);
    if(includeBackground){
      const atmosphere=shape('Stage / violet atmosphere',0,4.35,
        '<defs><radialGradient id="a"><stop stop-color="#6524d9" stop-opacity=".6"/><stop offset="1" stop-color="#090714" stop-opacity="0"/></radialGradient></defs><ellipse cx="640" cy="410" rx="560" ry="320" fill="url(#a)"/>',100,100);
      key(atmosphere,'scale',[[0,.7],[2,1.12],[4.35,1.6]],SOFT);fade(atmosphere,0,4.35,.15,.4);
    }
    // Three forward routes follow the direction of the mark's arrow. Their
    // broad leading streak and fine tail give the acceleration a visible arc.
    for(let i=0;i<3;i++){
      const a=2.25+i*.14,b=3.95+i*.06;
      const route=shape(`Momentum / forward route ${i+1}`,a,b,
        `<defs><linearGradient id="r"><stop stop-color="#6723e9" stop-opacity="0"/><stop offset=".65" stop-color="${accent}"/><stop offset="1" stop-color="#00d7fa"/></linearGradient></defs><path d="M-200 ${650+i*65} C260 ${650+i*40},550 ${490+i*20},1480 ${-100+i*95}" fill="none" stroke="url(#r)" stroke-width="${24-i*8}" stroke-linecap="round"/>`,100,100);
      key(route,'x',[[a,38],[b,66]],SOFT);key(route,'y',[[a,58],[b,35]],SOFT);
      key(route,'scale',[[a,.65],[b,1.4]],SOFT);fade(route,a,b,.2,.35);
    }
    const impact=shape('Assembly / impact ring',1.45,2.25,
      '<circle cx="640" cy="360" r="280" fill="none" stroke="#8e5dff" stroke-width="4"/>',70,70);
    key(impact,'scale',[[1.45,.55],[2.25,1.5]]);key(impact,'opacity',[[1.45,0],[1.55,.6],[2.25,0]]);
    if(includeBackground){
      const paperField=shape('Stage / light resolve',3.75,10,
        '<circle cx="640" cy="360" r="640" fill="#f5f3ff"/>',100,100,{x:65,y:38});
      key(paperField,'scale',[[3.75,.1],[4.23,2],[10,2]],SOFT);
    }
    const masks=[
      'polygon(0% 0%,60% 0%,70% 38%,0% 86%)',
      'polygon(60% 0%,100% 0%,100% 100%,0% 100%,0% 86%,70% 38%)',
      'polygon(0% 80%,100% 15%,100% 50%,0% 100%)',
    ];
    const starts=[0,.22,.48],fromX=[22,79,21],fromY=[76,72,76],turn=[-38,30,-16];
    masks.forEach((path,i)=>{
      const a=starts[i],part=art(`Construction / symbol ribbon ${i+1}`,a,1.88,symbol.svg,heroWidth,heroHeight,
        {mask:{enabled:true,shape:'polygon',path,feather:0,inverted:false}});
      key(part,'x',[[a,fromX[i]],[1.12+i*.1,50],[1.88,50]]);
      key(part,'y',[[a,fromY[i]],[1.12+i*.1,48],[1.88,48]]);
      key(part,'scale',[[a,i===0?2.5:1.55],[1.12+i*.1,1.04],[1.65,1],[1.88,1]]);
      key(part,'rotation',[[a,turn[i]],[1.12+i*.1,i===1?-3:2],[1.65,0],[1.88,0]]);
      key(part,'opacity',[[a,1],[1.68,1],[1.88,0]]);markIds.push(part.id);
    });
    const mark=art('Mark / gradient symbol',1.58,6.15,symbol.svg,heroWidth,heroHeight);
    key(mark,'x',[[1.58,50],[2.25,50],[3.1,54],[3.86,64],[4.22,48],[5.2,sg.x],[6.15,sg.x]]);
    key(mark,'y',[[1.58,48],[2.25,48],[3.1,45],[3.86,35],[4.22,45],[5.2,sg.y],[6.15,sg.y]]);
    key(mark,'scale',[[1.58,1],[2.25,1],[3.1,1.16],[3.86,3.8],[4.22,1.15],[5.05,sg.width/heroWidth*.97],[5.3,sg.width/heroWidth],[6.15,sg.width/heroWidth]]);
    key(mark,'rotation',[[1.58,0],[2.25,0],[3.1,-7],[3.86,12],[4.22,-4],[5.2,0],[6.15,0]]);
    key(mark,'opacity',[[1.58,0],[1.72,1],[5.95,1],[6.15,0]]);markIds.push(mark.id);
    const word=art('Mark / original gradient wordmark',4.48,6.15,wordmark.svg,wg.width,wg.height,{x:wg.x,y:wg.y});
    key(word,'x',[[4.48,wg.x+13],[5.35,wg.x-.5],[5.65,wg.x],[6.15,wg.x]]);
    key(word,'y',[[4.48,wg.y+18],[5.35,wg.y-1],[5.65,wg.y],[6.15,wg.y]]);
    key(word,'scale',[[4.48,.8],[5.35,1.02],[5.65,1],[6.15,1]]);
    key(word,'rotation',[[4.48,8],[5.35,-1],[5.65,0],[6.15,0]]);
    key(word,'opacity',[[4.48,0],[4.78,1],[5.95,1],[6.15,0]]);markIds.push(word.id);
    const original=art('Mark / continuous original lockup',5.92,10,full,markWidth,markHeight,{y:48});
    key(original,'opacity',[[5.92,0],[6.08,1],[10,1]]);markIds.push(original.id);
  } else {

  // A huge fragment crosses the opening frame, then the identity is assembled.
  for (let i=0;i<Math.min(parts.length,bitmap?2:3);i++) {
    const a=i*.07, item=art(`Signal / macro ${bitmap?'slice':'stroke'} ${i+1}`,a,1.05,parts[i],bitmap?markWidth:48,bitmap?markHeight:Math.min(96,48*ratio),
      bitmap?{mask:{enabled:true,shape:'polygon',path:`polygon(0% ${i*50}%,100% ${i*50}%,100% ${(i+1)*50}%,0% ${(i+1)*50}%)`,feather:0,inverted:false}}:{});
    key(item,'scale',[[a,4.3],[.52,2.5],[1.05,.7]]);
    key(item,'x',[[a,26+i*24],[.58,50],[1.05,50]]);
    key(item,'rotation',[[a,-38+i*38],[1.05,0]]); fade(item,a,1.05,.05,.3);
  }
  // Sparse trailing outlines amplify the silhouette without covering it.
  for (let i=0;i<(bitmap?0:4);i++) {
    const a=.65+i*.08;
    const item=art(`Signal / echo ${i+1}`,a,3.5,full,34,Math.min(100,34*ratio),{opacity:.2});
    key(item,'scale',[[a,.35],[1.5+i*.11,1.2+i*.28],[3.5,1.5+i*.35]],SOFT);
    key(item,'rotation',[[a,-28-i*12],[2.1,0],[3.5,0]]);
    key(item,'opacity',[[a,0],[a+.15,.08+i*.025],[2.5,.06],[3.5,0]]);
  }
  // Each logo component remains an independently editable image layer.
  parts.forEach((svg,i) => {
    const a=.82+i*.16, low=Math.max(0,i*100/3-.6), high=Math.min(100,(i+1)*100/3+.6);
    const item=art(`Mark / ${bitmap?'image band':'component'} ${i+1}`,a,bitmap?2.6:10,svg,markWidth,markHeight,
      bitmap?{mask:{enabled:true,shape:'polygon',path:`polygon(0% ${low}%,100% ${low}%,100% ${high}%,0% ${high}%)`,feather:0,inverted:false}}:{});
    const side=i%2 ? 1 : -1;
    key(item,'x',bitmap?[[a,50+side*22],[1.75+i*.12,50],[2.6,50]]:[[a,50+side*22],[1.75+i*.12,50],[4.45,50],[5.7,24],[10,24]]);
    key(item,'y',bitmap?[[a,18+i*13],[1.75+i*.12,49],[2.6,49]]:[[a,18+i*13],[1.75+i*.12,49],[4.45,49],[5.7,48],[10,48]]);
    key(item,'scale',bitmap?[[a,.25],[1.55+i*.12,1.08],[1.9+i*.12,1],[2.6,1]]:[[a,.25],[1.55+i*.12,1.08],[1.9+i*.12,1],[4.45,1],[5.7,.67],[10,.67]]);
    key(item,'rotation',[[a,side*48],[1.65+i*.12,side*-3],[1.95+i*.12,0],[bitmap?2.6:10,0]]);
    key(item,'opacity',bitmap?[[a,0],[a+.15,1],[2.45,1],[2.6,0]]:[[a,0],[a+.15,1],[10,1]]); markIds.push(item.id);
  });
  if(bitmap){
    // Complete the reveal with one unmasked original image. Mask boundaries
    // never remain across the settled identity or its original lettering.
    const item=art('Mark / continuous original lockup',2.4,10,full,markWidth,markHeight,{y:49});
    key(item,'opacity',[[2.4,0],[2.55,1],[10,1]]);
    key(item,'y',[[2.4,49],[4.45,49],[5.7,48],[10,48]]);
    key(item,'scale',[[2.4,1],[4.45,1],[5.7,1.05],[10,1.05]]);markIds.push(item.id);
  }
  }
  if(!(bitmap&&separateBitmap)){
  // The pulse travels around the real mark, then clears for the lockup.
  for (let i=0;i<8;i++) {
    const a=1.9+i*.06, angle=i*Math.PI/4;
    const item=shape(`Broadcast / pulse ${i+1}`,a,3.65,
      `<rect y="126" width="1280" height="468" rx="180" fill="${i%2 ? paper : accent}"/>`,2.2,1,
      {rotation:i*45>180?i*45-360:i*45,x:50+Math.cos(angle)*10,y:49+Math.sin(angle)*10*ratio});
    key(item,'x',[[a,item.x],[3.65,50+Math.cos(angle)*28]]);
    key(item,'y',[[a,item.y],[3.65,49+Math.sin(angle)*23*ratio]]);
    key(item,'scale',[[a,.15],[a+.24,1],[3.65,.1]]); fade(item,a,3.65,.08,.5);
  }
  const ring=shape('Broadcast / orbit',1.75,4.7,
    `<circle cx="640" cy="360" r="300" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="180 150 60 210"/>`,48,48);
  key(ring,'rotation',[[1.75,-90],[4.7,95]],SOFT);key(ring,'scale',[[1.75,.5],[3,1.15],[4.7,1.4]]);fade(ring,1.75,4.7,.2,.6);
  const sweep=rect('Transition / violet sweep',3.85,5.15,accent,10,100,{x:5,rotation:-15});
  key(sweep,'x',[[3.85,5],[5.15,95]],SOFT);key(sweep,'scale',[[3.85,.3],[4.4,2.1],[5.15,.3]]);fade(sweep,3.85,5.15,.06,.15);

  }

  // Measured native Inter letters, with kerning retained in their centres.
  const chars=bitmap?[]:[...brandName], total=measure(brandName), layoutWidth=720*ratio;
  if (!(Number.isFinite(total) && total > 0)) throw Error('The brand name could not be measured.');
  const scale=Math.min(2.15,layoutWidth*.51/total), left=39;
  chars.forEach((char,i) => {
    if (/\s/.test(char)) return;
    const start=5.05+i*.065, centre=measure(chars.slice(0,i).join(''))+measure(char)/2;
    const x=left+centre*scale/layoutWidth*100;
    const item=add(`Wordmark / ${char} ${i+1}`,start,10,{type:'text',text:char,fontWeight:800,textAlign:'center',color:paper,width:90,scale,x,y:49});
    key(item,'x',[[start,x+5],[start+.55,x],[10,x]]);
    key(item,'y',[[start,66],[start+.55,49],[10,49]]);
    key(item,'rotation',[[start,-12],[start+.55,0],[10,0]]);key(item,'opacity',[[start,0],[start+.25,1],[10,1]]);
    typeIds.push(item.id);
  });
  const line=shape('Lockup / accent rule',6.15,10,`<rect y="198" width="1280" height="324" fill="${accent}"/>`,48,1,{x:bitmap?50:64.5,y:bitmap?(separateBitmap?66:72):62});
  key(line,'scale',[[6.15,.1],[7.1,1],[10,1]]); key(line,'opacity',[[6.15,0],[6.35,1],[10,1]]);
  const tagline=add('Lockup / Create. Publish. Move forward.',6.6,10,{type:'text',text:'Create. Publish. Move forward.',fontWeight:600,textAlign:'center',color:paper,scale:bitmap&&separateBitmap?.9:.57,width:90,x:bitmap?50:64.5,y:bitmap?(separateBitmap?75:79):68});
  key(tagline,'y',[[6.6,bitmap?(separateBitmap?81:84):72],[7.3,bitmap?(separateBitmap?75:79):68],[10,bitmap?(separateBitmap?75:79):68]]);key(tagline,'opacity',[[6.6,0],[7.2,.75],[10,.75]]);
  return {format:'autopromote-graphics',version:1,name:`${brandName} / Signal identity`,width,height,
    duration:programmeDuration,layers,groups:[
      {id:'mark',name:'Logo / editable components',startTime:0,duration,layerIds:markIds,keys:[]},
      ...(typeIds.length?[{id:'wordmark',name:'Wordmark / editable letters',startTime:0,duration,layerIds:typeIds,keys:[]}]:[]),
    ]};
}
