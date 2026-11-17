// Logo motion is authored into ordinary Studio graphics and property keys.
// History, preview, grouping and export keep using the canonical editor.
import { sanitizeLogoSvg } from './motion/sanitizeLogoSvg';
import { separateStudioLogoParts } from './studioLogoParts';
import { buildStudioLogoPieceMotion } from './studioLogoPieceMotion';

// Legacy three-stroke example, separated into editable components. Uploaded
// identities retain their own artwork; the app brand uses the supplied PNG.
export const AUTOPROMOTE_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#f5f1ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 25 16 7"/><path d="M16 7 27 25"/><path d="M10 21h12"/></svg>';

export const STUDIO_CREATIVE_LOGO_SVGS = Object.freeze([
  {
    id: 'autopromote_apex',
    label: 'Apex Signal (3 Strokes)',
    svg: AUTOPROMOTE_LOGO_SVG,
  },
  {
    id: 'quantum_nexus',
    label: 'Quantum Nexus (6-Part Orbit)',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#f5f1ff" stroke-width="3" stroke-linecap="round"><ellipse cx="32" cy="32" rx="26" ry="11" transform="rotate(-30 32 32)" stroke="#a855f7"/><ellipse cx="32" cy="32" rx="26" ry="11" transform="rotate(30 32 32)" stroke="#00d7fa"/><circle cx="32" cy="32" r="22" stroke="#f5f1ff" stroke-dasharray="14 10"/><polygon points="32,18 44,32 32,46 20,32" fill="#a855f7" stroke="none"/><circle cx="32" cy="32" r="5" fill="#00d7fa" stroke="none"/></svg>',
  },
  {
    id: 'prism_vanguard',
    label: 'Prism Vanguard (5-Facet 3D)',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><polygon points="32,6 56,22 32,34 8,22" fill="#a855f7"/><polygon points="8,25 30,37 30,58 8,44" fill="#6d28d9"/><polygon points="34,37 56,25 56,44 34,58" fill="#00d7fa"/><polygon points="32,14 46,23 32,30 18,23" fill="#f5f1ff"/><circle cx="32" cy="34" r="4" fill="#ffffff"/></svg>',
  },
  {
    id: 'sonic_pulse',
    label: 'Sonic Pulse (6-Bar Wave)',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke-linecap="round"><path d="M10 38V26" stroke="#00d7fa" stroke-width="5"/><path d="M19 46V18" stroke="#a855f7" stroke-width="5"/><path d="M28 54V10" stroke="#f5f1ff" stroke-width="5"/><path d="M37 48V16" stroke="#a855f7" stroke-width="5"/><path d="M46 42V22" stroke="#00d7fa" stroke-width="5"/><path d="M55 36V28" stroke="#f5f1ff" stroke-width="5"/></svg>',
  },
  {
    id: 'crown_dynasty',
    label: 'Sovereign Crest (5-Part Crown)',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><polygon points="32,8 42,28 32,42 22,28" fill="#f59e0b"/><polygon points="8,18 22,30 28,44 12,44" fill="#a855f7"/><polygon points="56,18 52,44 36,44 42,30" fill="#00d7fa"/><rect x="12" y="48" width="40" height="7" rx="3" fill="#f5f1ff"/><circle cx="32" cy="18" r="3.5" fill="#ffffff"/></svg>',
  },
  {
    id: 'cyber_hex',
    label: 'Cyber Hex Portal (6-Part)',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M32 6 L54 19 L54 32" stroke="#00d7fa"/><path d="M54 32 L54 45 L32 58" stroke="#a855f7"/><path d="M32 58 L10 45 L10 32" stroke="#00d7fa"/><path d="M10 32 L10 19 L32 6" stroke="#f5f1ff"/><polygon points="32,16 46,24 46,40 32,48 18,40 18,24" fill="none" stroke="#a855f7" stroke-width="2.5"/><circle cx="32" cy="32" r="7" fill="#00d7fa" stroke="none"/></svg>',
  },
]);

export const STUDIO_LOGO_CHOREOGRAPHIES = Object.freeze([
  {
    id: 'signal',
    label: 'Signal Identity (Broadcast Orbit)',
    description: 'Macro slices, echo silhouettes, 8-petal radial pulse & orbit ring',
  },
  {
    id: 'cyber_laser',
    label: 'Cyber Laser Vault & Hologram Grid',
    description: 'Perspective laser grid, dual counter-rotating reticles & hologram echoes',
  },
  {
    id: 'solar_supernova',
    label: 'Solar Supernova & Shockwave Bloom',
    description: 'Concentric plasma shockwaves, 12 radial corona rays & spiral lockup',
  },
  {
    id: 'architect_monolith',
    label: '3D Isometric Monolith & Blueprint',
    description: 'Precision CAD crosshairs, golden-ratio construction rings & shutter docking',
  },
  {
    id: 'liquid_aurora',
    label: 'Liquid Aurora Ribbon & Elastic Morph',
    description: 'Multi-wave aurora ribbons, fluid spring overshoot & wave typography',
  },
]);

const ALLOWED_CHOREOGRAPHIES = STUDIO_LOGO_CHOREOGRAPHIES.map(c => c.id);
const EASE = [.16, 1, .3, 1], SOFT = [.65, 0, .35, 1], SPRING = [.2, 1.35, .35, 1];
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

export function buildStudioLogoMotion({
  svg = AUTOPROMOTE_LOGO_SVG,
  bitmap,
  brandName = 'AutoPromote',
  accent = '#a855f7',
  secondaryAccent = '#00d7fa',
  tagline = 'Create. Publish. Move forward.',
  choreography = 'signal',
  anamorphicStreak = false,
  particleBurst = false,
  duration = 10,
  programmeDuration,
  width = 1280,
  height = 720,
  includeBackground = true,
  separateBitmap = false,
  symbolWidth = 28,
  measure,
  pieceConstruction = false,
  pieceColumns = 11,
  pieceStyle = 'spring',
  encodeCrop,
}) {
  if (!Number.isFinite(programmeDuration) || !Number.isFinite(duration) || duration < 8 || duration > 14 || duration > programmeDuration)
    throw Error('Use an 8–14 second intro that fits this programme.');
  if (![width,height].every(v => Number.isFinite(v) && v >= 16 && v <= 4096)) throw Error('Invalid programme dimensions.');
  if (!/^#[\da-f]{6}$/i.test(accent)) throw Error('Choose a six-digit accent colour.');
  if (secondaryAccent !== undefined && !/^#[\da-f]{6}$/i.test(secondaryAccent)) throw Error('Choose a six-digit secondary accent colour.');
  if (!ALLOWED_CHOREOGRAPHIES.includes(choreography)) throw Error('Choose a supported logo choreography.');
  if (typeof brandName !== 'string' || !brandName.trim() || [...brandName].length > 24 || /[<>\r\n]/.test(brandName))
    throw Error('Use a single-line brand name with 1–24 characters.');
  if (typeof tagline !== 'string' || !tagline.trim() || [...tagline].length > 48 || /[<>\r\n]/.test(tagline))
    throw Error('Use a single-line tagline with 1–48 characters.');
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
  const HDR_GLOW = '<defs><filter id="hdrglow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="16" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  const sweepBeam = (name, a, b, beamColor, w = 24, rotation = -15) => {
    const beam = shape(
      name,
      a,
      b,
      `<defs><linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${beamColor}" stop-opacity="0"/><stop offset=".3" stop-color="${beamColor}" stop-opacity=".48"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".7" stop-color="${beamColor}" stop-opacity=".48"/><stop offset="1" stop-color="${beamColor}" stop-opacity="0"/></linearGradient></defs><rect width="1280" height="720" fill="url(#beam)"/>`,
      w,
      100,
      { x: 6, rotation }
    );
    key(beam, 'x', [[a, 6], [b, 94]], SOFT);
    key(beam, 'scale', [[a, 0.35], [(a + b) / 2, 1.35], [b, 0.35]]);
    fade(beam, a, b, 0.08, 0.18);
    return beam;
  };
  if (includeBackground) {
    shape(
      'Stage / midnight',
      0,
      10,
      `<defs><radialGradient id="stageSpot" cx="50%" cy="42%" r="54%"><stop offset="0" stop-color="${accent}" stop-opacity=".32"/><stop offset=".48" stop-color="#2c1258" stop-opacity=".22"/><stop offset="1" stop-color="${dark}" stop-opacity="0"/></radialGradient><linearGradient id="coneG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${secondaryAccent}" stop-opacity=".2"/><stop offset=".65" stop-color="${accent}" stop-opacity=".06"/><stop offset="1" stop-color="${dark}" stop-opacity="0"/></linearGradient><radialGradient id="gridMask" cx="50%" cy="86%" r="58%"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><mask id="gm"><rect width="1280" height="720" fill="url(#gridMask)"/></mask><radialGradient id="stageFloor" cx="50%" cy="94%" r="58%"><stop offset="0" stop-color="${secondaryAccent}" stop-opacity=".16"/><stop offset=".55" stop-color="${accent}" stop-opacity=".07"/><stop offset="1" stop-color="${dark}" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="${dark}"/><rect width="1280" height="720" fill="url(#stageSpot)"/><polygon points="180,0 420,0 740,720 460,720" fill="url(#coneG)"/><polygon points="860,0 1100,0 820,720 540,720" fill="url(#coneG)"/><g mask="url(#gm)" stroke="${secondaryAccent}" stroke-opacity=".22" stroke-width="1.2" fill="none"><line x1="640" y1="360" x2="-120" y2="720"/><line x1="640" y1="360" x2="180" y2="720"/><line x1="640" y1="360" x2="420" y2="720"/><line x1="640" y1="360" x2="640" y2="720"/><line x1="640" y1="360" x2="860" y2="720"/><line x1="640" y1="360" x2="1100" y2="720"/><line x1="640" y1="360" x2="1400" y2="720"/><line x1="0" y1="530" x2="1280" y2="530"/><line x1="0" y1="585" x2="1280" y2="585"/><line x1="0" y1="650" x2="1280" y2="650"/></g><rect width="1280" height="720" fill="url(#stageFloor)"/>`,
      100,
      100
    );
  }

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
    if (choreography === 'solar_supernova' && !bitmap) {
      const angle = (i / Math.max(1, parts.length)) * Math.PI * 2;
      const ox = Math.max(8, Math.min(92, 50 + Math.cos(angle) * 34));
      const oy = Math.max(8, Math.min(92, 49 + Math.sin(angle) * 26));
      key(item,'x',[[a,ox],[1.8+i*.1,50],[4.45,50],[5.7,24],[10,24]],SPRING);
      key(item,'y',[[a,oy],[1.8+i*.1,49],[4.45,49],[5.7,48],[10,48]],SPRING);
      key(item,'scale',[[a,.12],[1.6+i*.1,1.22],[1.95+i*.1,1],[4.45,1],[5.7,.67],[10,.67]],SPRING);
      key(item,'rotation',[[a,side*140],[1.7+i*.1,side*-8],[1.95+i*.1,0],[10,0]],SPRING);
      key(item,'opacity',[[a,0],[a+.12,1],[10,1]]);
    } else if (choreography === 'liquid_aurora' && !bitmap) {
      key(item,'x',[[a,50+side*30],[1.65+i*.12,50-side*4],[1.95+i*.12,50],[4.45,50],[5.7,24],[10,24]],SPRING);
      key(item,'y',[[a,78],[1.65+i*.12,44],[1.95+i*.12,49],[4.45,49],[5.7,48],[10,48]],SPRING);
      key(item,'scale',[[a,.15],[1.55+i*.12,1.26],[1.95+i*.12,1],[4.45,1],[5.7,.67],[10,.67]],SPRING);
      key(item,'rotation',[[a,side*65],[1.65+i*.12,side*-9],[1.95+i*.12,0],[10,0]],SPRING);
      key(item,'opacity',[[a,0],[a+.15,1],[10,1]]);
    } else {
      key(item,'x',bitmap?[[a,50+side*22],[1.75+i*.12,50],[2.6,50]]:[[a,50+side*22],[1.75+i*.12,50],[4.45,50],[5.7,24],[10,24]]);
      key(item,'y',bitmap?[[a,18+i*13],[1.75+i*.12,49],[2.6,49]]:[[a,18+i*13],[1.75+i*.12,49],[4.45,49],[5.7,48],[10,48]]);
      key(item,'scale',bitmap?[[a,.25],[1.55+i*.12,1.08],[1.9+i*.12,1],[2.6,1]]:[[a,.25],[1.55+i*.12,1.08],[1.9+i*.12,1],[4.45,1],[5.7,.67],[7.8,.7],[10,.67]]);
      key(item,'rotation',[[a,side*48],[1.65+i*.12,side*-3],[1.95+i*.12,0],[bitmap?2.6:10,0]]);
      key(item,'opacity',bitmap?[[a,0],[a+.15,1],[2.45,1],[2.6,0]]:[[a,0],[a+.15,1],[10,1]]);
    }
    markIds.push(item.id);
  });
  if(bitmap){
    // Complete the reveal with one unmasked original image. Mask boundaries
    // never remain across the settled identity or its original lettering.
    const item=art('Mark / continuous original lockup',2.4,10,full,markWidth,markHeight,{y:49});
    key(item,'opacity',[[2.4,0],[2.55,1],[10,1]]);
    key(item,'y',[[2.4,49],[4.45,49],[5.7,48],[10,48]]);
    key(item,'scale',[[2.4,1],[4.45,1],[5.7,1.05],[7.8,1.07],[10,1.05]]);markIds.push(item.id);
  }
  }
  if(!(bitmap&&separateBitmap)){
    if (choreography === 'cyber_laser') {
      // Cyber Laser Vault: Horizon HDR laser scanlines + precision dual cyber HUD reticles + optical laser sweep
      for (let i = 0; i < 4; i++) {
        const a = 0.3 + i * 0.14, b = 4.2;
        const beamColor = i % 2 ? secondaryAccent : accent;
        const beam = shape(`Cyber / laser scanline ${i + 1}`, a, b,
          `${HDR_GLOW}<line x1="60" y1="360" x2="1220" y2="360" stroke="${beamColor}" stroke-width="34" stroke-opacity=".42" stroke-dasharray="280 90 140 120" filter="url(#hdrglow)"/><line x1="60" y1="360" x2="1220" y2="360" stroke="#ffffff" stroke-width="8" stroke-dasharray="280 90 140 120" filter="url(#hdrglow)"/>`, 92, 9,
          { y: 24 + i * 17 });
        key(beam, 'x', [[a, i % 2 ? 20 : 80], [b, 50]], SOFT);
        key(beam, 'scale', [[a, 0.3], [a + 0.5, 1.15], [b, 1]], SOFT);
        fade(beam, a, b, 0.1, 0.45);
      }
      for (let r = 0; r < 2; r++) {
        const a = 1.1 + r * 0.2, b = 4.85;
        const ringColor = r ? secondaryAccent : accent;
        const reticle = shape(`Cyber / reticle ring ${r + 1}`, a, b,
          `${HDR_GLOW}<circle cx="640" cy="360" r="${250 + r * 55}" fill="none" stroke="${ringColor}" stroke-width="7" stroke-dasharray="${r ? '90 70 30 70' : '160 110 45 110'}" filter="url(#hdrglow)"/><circle cx="640" cy="360" r="${225 + r * 55}" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="2" stroke-dasharray="14 28"/>`,
          46 + r * 8, 46 + r * 8);
        key(reticle, 'rotation', [[a, r ? 140 : -140], [b, r ? -80 : 110]], SOFT);
        key(reticle, 'scale', [[a, 0.4], [2.6, 1.12], [b, 1.35]]);
        fade(reticle, a, b, 0.15, 0.5);
      }
      sweepBeam('Transition / cyber laser gate', 3.75, 5.1, secondaryAccent, 28, -12);
    } else if (choreography === 'solar_supernova') {
      // Solar Supernova: Concentric HDR shockwaves + 12 luminous corona rays + optical flare sweep
      for (let w = 0; w < 3; w++) {
        const a = 1.2 + w * 0.22, b = 4.4 + w * 0.15;
        const wave = shape(`Supernova / shockwave ${w + 1}`, a, b,
          `${HDR_GLOW}<circle cx="640" cy="360" r="${240 + w * 40}" fill="none" stroke="${w === 1 ? secondaryAccent : accent}" stroke-width="${10 - w * 2}" filter="url(#hdrglow)"/>`,
          52, 52);
        key(wave, 'scale', [[a, 0.2], [b, 1.7 + w * 0.2]], SOFT);
        fade(wave, a, b, 0.12, 0.65);
      }
      for (let i = 0; i < 12; i++) {
        const a = 1.65 + i * 0.045, angle = (i * Math.PI) / 6;
        const ray = shape(`Supernova / corona ray ${i + 1}`, a, 3.85,
          `${HDR_GLOW}<rect y="200" width="1280" height="320" rx="160" fill="${i % 3 === 0 ? paper : i % 2 ? accent : secondaryAccent}" filter="url(#hdrglow)"/>`,
          3.4, 1.2,
          { rotation: i * 30 > 180 ? i * 30 - 360 : i * 30, x: 50 + Math.cos(angle) * 8, y: 49 + Math.sin(angle) * 8 * ratio });
        key(ray, 'x', [[a, ray.x], [3.85, 50 + Math.cos(angle) * 34]]);
        key(ray, 'y', [[a, ray.y], [3.85, 49 + Math.sin(angle) * 27 * ratio]]);
        key(ray, 'scale', [[a, 0.15], [a + 0.25, 1.25], [3.85, 0.1]]);
        fade(ray, a, 3.85, 0.08, 0.5);
      }
      sweepBeam('Transition / solar flare sweep', 3.85, 5.15, accent, 26, -18);
    } else if (choreography === 'architect_monolith') {
      // Architect Monolith: Technical CAD blueprint axes + golden ratio rings + shutter sweep
      const grid = shape('Blueprint / axis crosshair', 0.4, 4.6,
        `<g stroke="${secondaryAccent}" stroke-width="1.5" stroke-dasharray="12 12"><line x1="640" y1="40" x2="640" y2="680"/><line x1="120" y1="360" x2="1160" y2="360"/><rect x="360" y="140" width="560" height="440" fill="none"/></g>`,
        86, 78);
      key(grid, 'scale', [[0.4, 1.25], [2.2, 1], [4.6, 0.92]], SOFT);
      fade(grid, 0.4, 4.6, 0.18, 0.5);
      for (let i = 0; i < 2; i++) {
        const a = 1.15 + i * 0.25, b = 4.65;
        const compass = shape(`Blueprint / construction ring ${i + 1}`, a, b,
          `${HDR_GLOW}<circle cx="640" cy="360" r="${210 + i * 85}" fill="none" stroke="${i ? accent : paper}" stroke-width="3" stroke-dasharray="60 30" filter="url(#hdrglow)"/>`,
          44 + i * 10, 44 + i * 10);
        key(compass, 'rotation', [[a, i ? 90 : -90], [b, 0]], SOFT);
        key(compass, 'scale', [[a, 0.65], [b, 1.15]], SOFT);
        fade(compass, a, b, 0.16, 0.5);
      }
      sweepBeam('Transition / monolith shutter', 3.85, 5.15, accent, 24, 0);
    } else if (choreography === 'liquid_aurora') {
      // Liquid Aurora: 3 flowing HDR bezier aurora wave ribbons + orbital glow ring
      for (let i = 0; i < 3; i++) {
        const a = 0.55 + i * 0.18, b = 4.55 + i * 0.1;
        const ribbonColor = i === 0 ? accent : i === 1 ? secondaryAccent : '#763bff';
        const aurora = shape(`Aurora / liquid ribbon ${i + 1}`, a, b,
          `${HDR_GLOW}<path d="M-120 ${420 + i * 45} C 320 ${180 - i * 40}, 860 ${560 + i * 35}, 1400 ${260 - i * 30}" fill="none" stroke="${ribbonColor}" stroke-width="${24 - i * 5}" stroke-linecap="round" filter="url(#hdrglow)"/>`,
          96, 68);
        key(aurora, 'x', [[a, 34], [b, 66]], SOFT);
        key(aurora, 'y', [[a, 56 - i * 4], [b, 44 + i * 4]], SOFT);
        key(aurora, 'scale', [[a, 0.72], [2.5, 1.18], [b, 1.35]], SOFT);
        fade(aurora, a, b, 0.2, 0.55);
      }
      const ring = shape('Aurora / harmonic halo', 1.7, 4.7,
        `${HDR_GLOW}<circle cx="640" cy="360" r="290" fill="none" stroke="${secondaryAccent}" stroke-width="5" stroke-dasharray="220 120" filter="url(#hdrglow)"/>`, 48, 48);
      key(ring, 'rotation', [[1.7, -120], [4.7, 120]], SOFT);
      key(ring, 'scale', [[1.7, 0.45], [3.1, 1.18], [4.7, 1.42]]);
      fade(ring, 1.7, 4.7, 0.2, 0.6);
      sweepBeam('Transition / aurora wave', 3.85, 5.15, accent, 24, -15);
    } else {
      // Default "signal" choreography: The pulse travels around the real mark, then clears for the lockup.
      for (let i=0;i<8;i++) {
        const a=1.9+i*.06, angle=i*Math.PI/4;
        const item=shape(`Broadcast / pulse ${i+1}`,a,3.65,
          `${HDR_GLOW}<rect y="126" width="1280" height="468" rx="180" fill="${i%2 ? paper : accent}" filter="url(#hdrglow)"/>`,2.2,1,
          {rotation:i*45>180?i*45-360:i*45,x:50+Math.cos(angle)*10,y:49+Math.sin(angle)*10*ratio});
        key(item,'x',[[a,item.x],[3.65,50+Math.cos(angle)*28]]);
        key(item,'y',[[a,item.y],[3.65,49+Math.sin(angle)*23*ratio]]);
        key(item,'scale',[[a,.15],[a+.24,1],[3.65,.1]]); fade(item,a,3.65,.08,.5);
      }
      const ring=shape('Broadcast / orbit',1.75,4.7,
        `${HDR_GLOW}<circle cx="640" cy="360" r="300" fill="none" stroke="${accent}" stroke-width="4" stroke-dasharray="180 150 60 210" filter="url(#hdrglow)"/>`,48,48);
      key(ring,'rotation',[[1.75,-90],[4.7,95]],SOFT);key(ring,'scale',[[1.75,.5],[3,1.15],[4.7,1.4]]);fade(ring,1.75,4.7,.2,.6);
      sweepBeam('Transition / violet sweep', 3.85, 5.15, accent, 24, -15);
    }
  }

  // Optional Anamorphic Lens Flare Sweep across the settled lockup
  if (anamorphicStreak) {
    const streak = shape('Optics / anamorphic horizontal flare', 5.2, 9.6,
      `<defs><filter id="afglow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="20" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="afhalo"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".28" stop-color="${secondaryAccent}" stop-opacity=".65"/><stop offset=".68" stop-color="${accent}" stop-opacity=".28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><linearGradient id="afline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${secondaryAccent}" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity="1"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs><ellipse cx="640" cy="360" rx="620" ry="310" fill="url(#afhalo)"/><ellipse cx="640" cy="360" rx="640" ry="56" fill="url(#afline)" filter="url(#afglow)"/>`,
      96, 13, { x: 48, y: 49 });
    key(streak, 'x', [[5.2, 24], [6.6, 56], [9.6, 74]], SOFT);
    key(streak, 'scale', [[5.2, 0.35], [6.4, 1.35], [9.6, 0.55]], SOFT);
    fade(streak, 5.2, 9.6, 0.25, 0.8);
  }

  // Optional Kinetic Particle Burst at lockup impact
  if (particleBurst) {
    for (let p = 0; p < 6; p++) {
      const a = 5.05 + p * 0.05, b = 8.2, angle = (p * Math.PI) / 3 + 0.25;
      const sparkColor = p % 2 ? secondaryAccent : accent;
      const spark = shape(`Particles / kinetic spark ${p + 1}`, a, b,
        `<defs><filter id="spglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="sp"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".45" stop-color="${sparkColor}" stop-opacity=".9"/><stop offset="1" stop-color="${sparkColor}" stop-opacity="0"/></radialGradient></defs><circle cx="640" cy="360" r="340" fill="url(#sp)"/><polygon points="640,40 730,270 1160,360 730,450 640,680 550,450 120,360 550,270" fill="#ffffff" filter="url(#spglow)"/>`,
        4.6, 4.6, { x: 26, y: 48 });
      key(spark, 'x', [[a, 26], [b, Math.max(6, Math.min(94, 26 + Math.cos(angle) * 28))]], SOFT);
      key(spark, 'y', [[a, 48], [b, Math.max(6, Math.min(94, 48 + Math.sin(angle) * 24 * ratio))]], SOFT);
      key(spark, 'scale', [[a, 0.25], [a + 0.35, 1.35], [b, 0.1]]);
      key(spark, 'rotation', [[a, 0], [b, p % 2 ? 135 : -135]]);
      fade(spark, a, b, 0.06, 0.65);
    }
  }

  // Luminous hero aura & mirror floor glint beneath the settled identity
  if (!(bitmap && separateBitmap)) {
    const heroAura = shape('Aura / emblem backlight glow', 1.5, 10,
      `<defs><radialGradient id="ha"><stop offset="0" stop-color="${secondaryAccent}" stop-opacity=".55"/><stop offset=".45" stop-color="${accent}" stop-opacity=".28"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs><circle cx="640" cy="360" r="350" fill="url(#ha)"/>`,
      42, 42, { x: 50, y: 49 });
    key(heroAura, 'x', [[1.5, 50], [4.45, 50], [5.7, 24], [10, 24]], SOFT);
    key(heroAura, 'scale', [[1.5, 0.3], [2.4, 1.15], [5.7, 0.92], [8.2, 1.06], [10, 0.96]], SOFT);
    key(heroAura, 'opacity', [[1.5, 0], [2.1, 0.75], [5.7, 0.85], [10, 0.72]]);
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
    key(item,'x',[[start,x+6],[start+.55,x],[10,x]]);
    key(item,'y',[[start,62],[start+.35,47],[start+.65,49],[8.2,48.4],[10,49]]);
    key(item,'scale',[[start,scale*.5],[start+.35,scale*1.16],[start+.65,scale],[8.2,scale*1.03],[10,scale]],SPRING);
    key(item,'rotation',[[start,-14],[start+.55,0],[10,0]]);key(item,'opacity',[[start,0],[start+.22,1],[10,1]]);
    typeIds.push(item.id);
  });
  const line=shape('Lockup / accent rule',6.15,10,`<defs><linearGradient id="rule"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${secondaryAccent}"/></linearGradient></defs><rect y="198" width="1280" height="324" rx="162" fill="url(#rule)"/>`,48,1,{x:bitmap?50:64.5,y:bitmap?(separateBitmap?66:72):62});
  key(line,'scale',[[6.15,.1],[7.1,1],[8.4,1.03],[10,1]]); key(line,'opacity',[[6.15,0],[6.35,1],[8.4,.75],[10,1]]);
  const taglineText = tagline.trim();
  const taglineLayer=add(`Lockup / ${taglineText}`,6.6,10,{type:'text',text:taglineText,fontWeight:600,textAlign:'center',color:paper,scale:bitmap&&separateBitmap?.9:.57,width:90,x:bitmap?50:64.5,y:bitmap?(separateBitmap?75:79):68});
  key(taglineLayer,'y',[[6.6,bitmap?(separateBitmap?81:84):72],[7.3,bitmap?(separateBitmap?75:79):68],[10,bitmap?(separateBitmap?75:79):68]]);key(taglineLayer,'opacity',[[6.6,0],[7.2,.75],[10,.75]]);
  const choreographySuffix = choreography === 'signal' ? 'Signal identity' : STUDIO_LOGO_CHOREOGRAPHIES.find(c => c.id === choreography)?.label.split(' (')[0] || 'Signal identity';
  return {format:'autopromote-graphics',version:1,name:`${brandName} / ${choreographySuffix}`,width,height,
    duration:programmeDuration,layers,groups:[
      {id:'mark',name:'Logo / editable components',startTime:0,duration,layerIds:markIds,keys:[]},
      ...(typeIds.length?[{id:'wordmark',name:'Wordmark / editable letters',startTime:0,duration,layerIds:typeIds,keys:[]}]:[]),
    ]};
}
