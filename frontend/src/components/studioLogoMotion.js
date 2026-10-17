// Logo motion is authored into ordinary Studio graphics and property keys.
// History, preview, grouping and export keep using the canonical editor.
import { sanitizeLogoSvg } from './motion/sanitizeLogoSvg';
import { separateStudioLogoParts } from './studioLogoParts';

// Same geometry as LandingNavbar's public AutoPromote mark, separated into
// its three strokes so each can be edited and animated independently.
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
  includeBackground = true, separateBitmap = false, symbolWidth = 28, measure }) {
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
  const time = v => tick(v * duration / 10), paper = bitmap?'#24133e':'#f5f1ff', dark = bitmap?'#f5f3ff':'#090714';
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
    const heroWidth=45,heroHeight=heroWidth*ratio*symbol.bounds[3]/symbol.bounds[2];
    const macro=art('Signal / gradient symbol macro',0,.9,symbol.svg,heroWidth,Math.min(96,heroHeight));
    key(macro,'scale',[[0,2.3],[.5,1.6],[.9,.8]]);key(macro,'x',[[0,28],[.9,50]]);
    key(macro,'rotation',[[0,-32],[.9,0]]);fade(macro,0,.9,.03,.23);
    const echo=art('Signal / symbol afterimage',.4,2.3,symbol.svg,heroWidth,Math.min(96,heroHeight));
    key(echo,'scale',[[.4,.7],[1.1,1.25],[2.3,1.45]]);key(echo,'opacity',[[.4,0],[.8,.12],[2.3,0]]);
    const mark=art('Mark / gradient symbol',.65,6.2,symbol.svg,sg.width,sg.height);
    key(mark,'x',[[.65,50],[3.8,50],[5.55,sg.x],[6.2,sg.x]]);
    key(mark,'y',[[.65,55],[1.65,48],[3.8,48],[5.55,sg.y],[6.2,sg.y]]);
    key(mark,'scale',[[.65,.35],[1.35,2.05],[1.8,1.9],[3.8,1.9],[5.55,1],[6.2,1]]);
    key(mark,'rotation',[[.65,-30],[1.35,4],[1.8,0],[6.2,0]]);fade(mark,.65,6.2,.15,.25);markIds.push(mark.id);
    const word=art('Mark / original gradient wordmark',4.35,6.2,wordmark.svg,wg.width,wg.height,{x:wg.x,y:wg.y});
    key(word,'x',[[4.35,95],[5.65,wg.x],[6.2,wg.x]]);key(word,'y',[[4.35,wg.y+9],[5.65,wg.y],[6.2,wg.y]]);
    key(word,'rotation',[[4.35,7],[5.65,0],[6.2,0]]);fade(word,4.35,6.2,.35,.25);markIds.push(word.id);
    const original=art('Mark / continuous original lockup',5.85,10,full,markWidth,markHeight,{y:48});
    key(original,'opacity',[[5.85,0],[6.05,1],[10,1]]);markIds.push(original.id);
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

  // Measured native Inter letters, with kerning retained in their centres.
  const chars=bitmap?[]:[...brandName], total=measure(brandName), layoutWidth=720*ratio;
  if (!(Number.isFinite(total) && total > 0)) throw Error('The brand name could not be measured.');
  const scale=Math.min(2.15,layoutWidth*.51/total), left=39;
  chars.forEach((char,i) => {
    if (/\s/.test(char)) return;
    const start=5.05+i*.065, centre=measure(chars.slice(0,i).join(''))+measure(char)/2;
    const x=left+centre*scale/layoutWidth*100;
    const item=add(`Wordmark / ${char} ${i+1}`,start,10,{type:'text',text:char,fontWeight:700,textAlign:'center',color:paper,width:90,scale,x,y:49});
    key(item,'x',[[start,x+5],[start+.55,x],[10,x]]);
    key(item,'y',[[start,66],[start+.55,49],[10,49]]);
    key(item,'rotation',[[start,-12],[start+.55,0],[10,0]]);key(item,'opacity',[[start,0],[start+.25,1],[10,1]]);
    typeIds.push(item.id);
  });
  const line=shape('Lockup / accent rule',6.15,10,`<rect y="198" width="1280" height="324" fill="${accent}"/>`,48,1,{x:bitmap?50:64.5,y:bitmap?72:62});
  key(line,'scale',[[6.15,.1],[7.1,1],[10,1]]); key(line,'opacity',[[6.15,0],[6.35,1],[10,1]]);
  const tagline=add('Lockup / Create. Publish. Move forward.',6.6,10,{type:'text',text:'Create. Publish. Move forward.',fontWeight:600,textAlign:'center',color:paper,scale:.57,width:90,x:bitmap?50:64.5,y:bitmap?79:68});
  key(tagline,'y',[[6.6,bitmap?84:72],[7.3,bitmap?79:68],[10,bitmap?79:68]]);key(tagline,'opacity',[[6.6,0],[7.2,.75],[10,.75]]);
  return {format:'autopromote-graphics',version:1,name:`${brandName} / Signal identity`,width,height,
    duration:programmeDuration,layers,groups:[
      {id:'mark',name:'Logo / editable components',startTime:0,duration,layerIds:markIds,keys:[]},
      ...(typeIds.length?[{id:'wordmark',name:'Wordmark / editable letters',startTime:0,duration,layerIds:typeIds,keys:[]}]:[]),
    ]};
}
