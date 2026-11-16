// Versioned media-node pixel operations. The canonical CPU compositor implements
// the same equations in studio_node_effects.py; units are 720px programme pixels.
const finite = (value, fallback, min, max) => {
  const n = Number(value ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Node effect value must be between ${min} and ${max}.`);
  return n;
};
export function compileStudioNodeEffects(layer = {}) {
  const key = layer.chromaKey || {}, optical = layer.opticalFx || {}, warp = layer.displacementWarp || {};
  if (key.enabled && !['image', 'video'].includes(layer.type)) throw new Error('Keying requires an image or video layer.');
  const mode = key.mode || 'chroma', color = key.keyColor || '#00d455';
  if (!['chroma', 'luma', 'hsl_delta'].includes(mode) || !/^#[\da-f]{6}$/i.test(color)) throw new Error('Invalid keyer mode or screen colour.');
  return { version: 1,
    key: { enabled: key.enabled === true, mode, color,
      similarity: finite(key.similarity, .32, .02, 1), smoothness: finite(key.smoothness, .14, 0, 1),
      spill: finite(key.spillSuppression, .48, 0, 1), choke: finite(key.choke, 0, -20, 20), invert: key.invert === true },
    optical: { halation: finite(optical.halation, 0, 0, 1), streak: finite(optical.anamorphicStreak, 0, 0, 1) },
    warp: { enabled: warp.enabled === true, x: finite(warp.amountX, 8, 0, 40), y: finite(warp.amountY, 6, 0, 40), frequency: finite(warp.frequency, 2.2, .1, 10) },
    defocus: finite(layer.dofBlur, 0, 0, 20), depth: finite(layer.zDepth, 0, -100, 100),
  };
}
export const hasStudioNodeEffects = layer => Boolean(layer?.chromaKey?.enabled || layer?.displacementWarp?.enabled ||
  layer?.opticalFx?.halation || layer?.opticalFx?.anamorphicStreak || layer?.dofBlur);
export const hasStudioNodeSurface = layer => hasStudioNodeEffects(layer)||Boolean(layer?.perspective||layer?.glow?.enabled||layer?.layerShadow?.enabled||Number(layer?.blur)>0);
export const studioDepthScale = layer => 1 / (1 - finite(layer?.zDepth, 0, -100, 100) / 200);
const clamp = x => Math.max(0, Math.min(1, x));
const byte = x => Math.max(0, Math.min(255, Math.floor(x + .5)));
const smooth = (a, b, x) => { const t = clamp((x - a) / Math.max(.000001, b - a)); return t * t * (3 - 2 * t); };
const hue = (r, g, b) => { const max = Math.max(r,g,b), min = Math.min(r,g,b), d=max-min;
  return [d ? (((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)/6)%1+1)%1 : 0, max ? d/max : 0]; };
// Separable edge-clamped box mean, rounded only at the end of each pass.
function boxMean(input, w, h, channels, rx, ry) {
  const work = new Float64Array(input.length), out = new Float64Array(input.length);
  for (let y=0;y<h;y++) for(let c=0;c<channels;c++) {
    let sum=0;for(let x=-rx;x<=rx;x++) sum+=input[(y*w+Math.max(0,Math.min(w-1,x)))*channels+c];
    for(let x=0;x<w;x++){work[(y*w+x)*channels+c]=sum/(rx*2+1);sum+=input[(y*w+Math.min(w-1,x+rx+1))*channels+c]-input[(y*w+Math.max(0,x-rx))*channels+c];}
  }
  for (let x=0;x<w;x++) for(let c=0;c<channels;c++) {
    let sum=0;for(let y=-ry;y<=ry;y++) sum+=work[(Math.max(0,Math.min(h-1,y))*w+x)*channels+c];
    for(let y=0;y<h;y++){out[(y*w+x)*channels+c]=sum/(ry*2+1);sum+=work[(Math.min(h-1,y+ry+1)*w+x)*channels+c]-work[(Math.max(0,y-ry)*w+x)*channels+c];}
  }return out;
}
function morphology(alpha,w,h,r,erode) {
  let src=alpha;
  for(const horizontal of [true,false]){
    const out=new Float64Array(src.length),length=horizontal?w:h,lines=horizontal?h:w;
    const queue=new Int32Array(length+2*r+1);
    for(let line=0;line<lines;line++){
      let head=0,tail=0;
      const at=k=>horizontal?line*w+Math.max(0,Math.min(w-1,k)):Math.max(0,Math.min(h-1,k))*w+line;
      for(let k=-r;k<length+r;k++){
        while(tail>head&&(erode?src[at(queue[tail-1])]>=src[at(k)]:src[at(queue[tail-1])]<=src[at(k)]))tail--;
        queue[tail++]=k;while(tail>head&&queue[head]<k-2*r)head++;
        const center=k-r;if(center>=0&&center<length)out[at(center)]=src[at(queue[head])];
      }
    }src=out;
  }return src;
}
export function applyStudioNodeEffects(data, width, height, spec, time=0, units=height/720) {
  if (!spec || spec.version !== 1) return data;
  const n=width*height,key=spec.key;
  if(key.enabled){const rgb=[1,3,5].map(i=>parseInt(key.color.slice(i,i+2),16)/255),kh=hue(...rgb),alpha=new Float64Array(n);
    const cb=(r,g,b)=>-.168736*r-.331264*g+.5*b, cr=(r,g,b)=>.5*r-.418688*g-.081312*b;
    const dominant=rgb.indexOf(Math.max(...rgb));
    for(let p=0;p<n;p++){const i=p*4,r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;let distance;
      if(key.mode==='luma') distance=.2126*r+.7152*g+.0722*b;
      else if(key.mode==='hsl_delta'){const hs=hue(r,g,b),dh=Math.abs(hs[0]-kh[0]);distance=Math.hypot(Math.min(dh,1-dh)*2,hs[1]-kh[1])/Math.SQRT2;}
      else distance=Math.hypot(cb(r,g,b)-cb(...rgb),cr(r,g,b)-cr(...rgb));
      let a=smooth(key.similarity,key.similarity+Math.max(.000001,key.smoothness),distance);if(key.invert)a=1-a;alpha[p]=a*data[i+3];
      if(key.mode!=='luma'&&key.spill){const other=Math.max(data[i+(dominant+1)%3],data[i+(dominant+2)%3]);data[i+dominant]=byte(data[i+dominant]-Math.max(0,data[i+dominant]-other)*key.spill*(1-a));}
    }
    const radius=Math.round(Math.abs(key.choke)*units),matte=radius?morphology(alpha,width,height,radius,key.choke>0):alpha;
    for(let p=0;p<n;p++)data[p*4+3]=byte(matte[p]);
  }
  if(spec.warp.enabled&&(spec.warp.x||spec.warp.y)){const src=new Uint8ClampedArray(data),f=spec.warp.frequency*2*Math.PI;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=x+spec.warp.x*units*Math.sin(y/height*f+time*1.7),sy=y+spec.warp.y*units*Math.sin(x/width*f+time*1.3),xx=Math.max(0,Math.min(width-1,Math.floor(sx+.5))),yy=Math.max(0,Math.min(height-1,Math.floor(sy+.5)));const d=(y*width+x)*4,s=(yy*width+xx)*4;for(let c=0;c<4;c++)data[d+c]=src[s+c];}
  }
  if(spec.defocus>0){const premul=new Float64Array(data.length);for(let p=0;p<n;p++){const i=p*4,a=data[i+3]/255;for(let c=0;c<3;c++)premul[i+c]=data[i+c]*a;premul[i+3]=data[i+3];}
    const r=Math.max(1,Math.round(spec.defocus*units)),blur=boxMean(premul,width,height,4,r,r);
    for(let p=0;p<n;p++){const i=p*4,a=blur[i+3];for(let c=0;c<3;c++)data[i+c]=byte(a>0?blur[i+c]*255/a:0);data[i+3]=byte(a);}
  }
  const op=spec.optical;
  if(op.halation||op.streak){const light=new Float64Array(n);for(let p=0;p<n;p++){const i=p*4;light[p]=Math.max(0,Math.max(data[i],data[i+1],data[i+2])-160)*data[i+3]/255;}
    const halo=op.halation?boxMean(light,width,height,1,Math.max(1,Math.round(12*units)),Math.max(1,Math.round(12*units))):null;
    const streak=op.streak?boxMean(light,width,height,1,Math.max(1,Math.round(48*units)),Math.max(0,Math.round(units))):null;
    for(let p=0;p<n;p++){const i=p*4,a=data[i+3]/255,h=(halo?.[p]||0)*op.halation,s=(streak?.[p]||0)*op.streak,alpha=Math.max(a,clamp((h+s)/255));
      for(let c=0;c<3;c++)data[i+c]=byte(alpha?(data[i+c]*a+h*[1,.3,.12][c]+s*[.65,.8,1][c])/alpha:0);data[i+3]=byte(alpha*255);}
  }return data;
}
export function paintStudioNodeSurface(canvas, source, layer, time=0, programmeHeight=720) {
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx||!w||!h)return false;
  ctx.imageSmoothingQuality='high';
  ctx.clearRect(0,0,w,h);const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return false;
  const stretch=layer.mediaFit==='stretch'||layer.perspective?.sourceRect,cover=layer.bRollMode==='fullscreen'||layer.mediaFit==='cover';const scale=cover?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh),dw=stretch?w:sw*scale,dh=stretch?h:sh*scale;
  ctx.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);
  // Ordinary branch pictures need no CPU round trip. Keep their alpha on the
  // canvas until a pixel effect actually needs it.
  if(!hasStudioNodeEffects(layer))return true;
  const pixels=ctx.getImageData(0,0,w,h);applyStudioNodeEffects(pixels.data,w,h,compileStudioNodeEffects(layer),time,programmeHeight/720);ctx.putImageData(pixels,0,0);return true;
}

export function studioNodeFilteredSurface(canvas,layer,units,clipToBox=false) {
  const shadow=layer.layerShadow||{},glow=layer.glow||{};
  const color=(hex,opacity)=>{const m=/^#([0-9a-f]{6})$/i.exec(hex||'');return m?`rgba(${[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)).join(',')},${opacity})`:hex;};
  const filters=[];let margin=0;
  if(shadow.enabled){filters.push(`drop-shadow(${Number(shadow.x||0)*units}px ${Number(shadow.y||0)*units}px ${Number(shadow.blur||0)*units}px ${color(shadow.color||'#000000',shadow.opacity??.55)})`);margin+=Math.max(Math.abs(Number(shadow.x||0)),Math.abs(Number(shadow.y||0)))+4*Number(shadow.blur||0);}
  if(glow.enabled){filters.push(`drop-shadow(0px 0px ${Number(glow.radius||0)*units}px ${color(glow.color||'#8b5cf6',glow.intensity??.5)})`);margin+=4*Number(glow.radius||0);}
  if(Number(layer.blur)>0){filters.push(`blur(${Number(layer.blur)*units}px)`);margin+=4*Number(layer.blur);}
  if(!filters.length)return {canvas,padding:0};
  const padding=clipToBox?0:Math.ceil(margin*units),result=document.createElement('canvas');result.width=canvas.width+padding*2;result.height=canvas.height+padding*2;
  const ctx=result.getContext('2d');ctx.filter=filters.join(' ');ctx.drawImage(canvas,padding,padding);return {canvas:result,padding};
}
