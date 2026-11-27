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
  const mode = key.mode || 'chroma', color = key.keyColor || key.color || '#00d455';
  const similarity = key.similarity ?? (key.tolerance == null ? undefined : Math.max(.02,finite(key.tolerance,32,0,100)/100));
  const spill = key.spillSuppression ?? (key.spill == null ? undefined : finite(key.spill,48,0,100)/100);
  if (!['chroma', 'luma', 'hsl_delta'].includes(mode) || !/^#[\da-f]{6}$/i.test(color)) throw new Error('Invalid keyer mode or screen colour.');
  return { version: 1,
    key: { enabled: key.enabled === true, mode, color,
      similarity: finite(similarity, .32, .02, 1), smoothness: finite(key.smoothness, .14, 0, 1),
      spill: finite(spill, .48, 0, 1), choke: finite(key.choke, 0, -20, 20), invert: key.invert === true },
    optical: { halation: finite(optical.halation, 0, 0, 1), streak: finite(optical.anamorphicStreak, 0, 0, 1) },
    warp: { enabled: warp.enabled === true, x: finite(warp.amountX, 8, 0, 40), y: finite(warp.amountY, 6, 0, 40), frequency: finite(warp.frequency, 2.2, .1, 10) },
    defocus: finite(layer.dofBlur, 0, 0, 20), depth: finite(layer.zDepth, 0, -100, 100),
  };
}
export const hasStudioNodeEffects = layer => Boolean(layer?.chromaKey?.enabled || layer?.displacementWarp?.enabled ||
  layer?.opticalFx?.halation || layer?.opticalFx?.anamorphicStreak || layer?.dofBlur);
export const hasStudioNodeSurface = layer => hasStudioNodeEffects(layer)||Boolean(layer?.perspective||layer?.glow?.enabled||layer?.layerShadow?.enabled||Number(layer?.blur)>0||layer?.lightWrap?.enabled||layer?.linearLight||layer?.motionBlur?.enabled||layer?.screenReplace?.enabled||layer?.meshWarp?.enabled);

export function applyKeyframedNodeSpec(spec, pose = null) {
  if (!spec || spec.version !== 1 || !pose) return spec;
  const key = { ...spec.key };
  if (Number.isFinite(Number(pose.keySimilarity))) key.similarity = Math.max(0.02, Math.min(1, Number(pose.keySimilarity)));
  if (Number.isFinite(Number(pose.keySmoothness))) key.smoothness = Math.max(0, Math.min(1, Number(pose.keySmoothness)));
  if (Number.isFinite(Number(pose.keySpill))) key.spill = Math.max(0, Math.min(1, Number(pose.keySpill)));
  if (Number.isFinite(Number(pose.keyChoke))) key.choke = Math.max(-20, Math.min(20, Number(pose.keyChoke)));
  return { ...spec, key };
}

export function applyEdgeLightWrapAndLinear(fgData, bgData, width, height, { intensity = 0.45, radius = 14, linearLight = false, units = 1 } = {}) {
  const n = width * height;
  if (!fgData || fgData.length < n * 4) return fgData;
  const r = Math.max(1, Math.min(60, Math.round(Number(radius || 14) * Math.max(0.25, units))));
  const wrapAmt = Math.max(0, Math.min(1, Number(intensity ?? 0.45)));
  if (wrapAmt > 0.005 && bgData && bgData.length >= n * 4) {
    const invAlpha = new Float64Array(n);
    const bgRgb = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) {
      const i = p * 4, j = p * 3;
      invAlpha[p] = 1 - fgData[i + 3] / 255;
      bgRgb[j] = bgData[i]; bgRgb[j + 1] = bgData[i + 1]; bgRgb[j + 2] = bgData[i + 2];
    }
    const softInv = boxMean(invAlpha, width, height, 1, r, r);
    const softBg = boxMean(bgRgb, width, height, 3, r, r);
    for (let p = 0; p < n; p++) {
      const a = fgData[p * 4 + 3] / 255;
      if (a <= 0.002) continue;
      const w = Math.max(0, Math.min(1, softInv[p] * wrapAmt));
      if (w <= 0.002) continue;
      const i = p * 4, j = p * 3;
      for (let c = 0; c < 3; c++) {
        const f = fgData[i + c] / 255;
        const b = softBg[j + c] / 255;
        const scr = 1 - (1 - f) * (1 - b);
        const mixed = linearLight
          ? Math.pow(Math.pow(Math.max(0, f), 2.2) * (1 - w) + Math.pow(Math.max(0, scr), 2.2) * w, 1 / 2.2)
          : f * (1 - w) + scr * w;
        fgData[i + c] = byte(mixed * 255);
      }
    }
  } else if (linearLight && bgData && bgData.length >= n * 4) {
    for (let p = 0; p < n; p++) {
      const i = p * 4, a = fgData[i + 3] / 255;
      if (a <= 0.002 || a >= 0.998) continue;
      for (let c = 0; c < 3; c++) {
        const fLin = Math.pow(fgData[i + c] / 255, 2.2);
        const bLin = Math.pow(bgData[i + c] / 255, 2.2);
        const outLin = (bLin * (1 - a) + fLin * a);
        fgData[i + c] = byte(Math.pow(Math.max(0, outLin), 1 / 2.2) * 255);
      }
    }
  }
  return fgData;
}

export function applyScreenGlareReflection(fgData, bgData, width, height, glarePreserve = 0.35) {
  const n = width * height;
  const gAmt = Math.max(0, Math.min(1, Number(glarePreserve ?? 0.35)));
  if (!fgData || !bgData || fgData.length < n * 4 || bgData.length < n * 4 || gAmt <= 0.005) return fgData;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (fgData[i + 3] < 4) continue;
    const br = bgData[i] / 255, bg = bgData[i + 1] / 255, bb = bgData[i + 2] / 255;
    const lum = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
    if (lum <= 0.65) continue;
    const hi = ((lum - 0.65) / 0.35) * gAmt;
    for (let c = 0; c < 3; c++) {
      const f = fgData[i + c] / 255;
      const glare = Math.max(0, Math.min(1, (bgData[i + c] / 255) * hi));
      fgData[i + c] = byte((1 - (1 - f) * (1 - glare)) * 255);
    }
  }
  return fgData;
}

export function applyMeshGridWarp(data, width, height, meshWarp = {}, time = 0, units = 1) {
  if (!meshWarp?.enabled || !data || width < 4 || height < 4) return data;
  const strength = Math.max(-1, Math.min(1, Number(meshWarp.strength ?? 0.35) || 0));
  const pinch = Math.max(-1, Math.min(1, Number(meshWarp.pinch ?? 0) || 0));
  const cols = Math.max(2, Math.min(8, Math.round(Number(meshWarp.cols ?? 4) || 4)));
  const rows = Math.max(2, Math.min(8, Math.round(Number(meshWarp.rows ?? 4) || 4)));
  if (Math.abs(strength) < 0.005 && Math.abs(pinch) < 0.005) return data;
  const src = new Uint8ClampedArray(data);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const amp = 14 * Math.max(0.25, units);
  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    const dyC = (y - cy) / Math.max(1, cy);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const dxC = (x - cx) / Math.max(1, cx);
      const r2 = Math.min(1.5, dxC * dxC + dyC * dyC);
      const gridShiftX = strength * amp * Math.sin(ny * Math.PI * rows + time * 1.1) * Math.sin(nx * Math.PI);
      const gridShiftY = strength * amp * Math.sin(nx * Math.PI * cols + time * 0.9) * Math.sin(ny * Math.PI);
      const pinchScale = 1 + pinch * 0.38 * (1 - r2);
      const sx = Math.max(0, Math.min(width - 1, Math.round(cx + (x - cx) * pinchScale + gridShiftX)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(cy + (y - cy) * pinchScale + gridShiftY)));
      const dIdx = (y * width + x) * 4;
      const sIdx = (sy * width + sx) * 4;
      data[dIdx] = src[sIdx];
      data[dIdx + 1] = src[sIdx + 1];
      data[dIdx + 2] = src[sIdx + 2];
      data[dIdx + 3] = src[sIdx + 3];
    }
  }
  return data;
}

export function blendCrossDissolveMorphRgba(frameA, frameB, width, height, progress = 0.5, warpAmount = 0.25) {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  const wAmt = Math.max(0, Math.min(1, Number(warpAmount) || 0));
  const out = new Uint8ClampedArray(frameA.length);
  const shiftA = t * wAmt * width * 0.08;
  const shiftB = (1 - t) * wAmt * width * 0.08;
  for (let y = 0; y < height; y += 1) {
    const wave = Math.sin((y / Math.max(1, height - 1)) * Math.PI * 2);
    for (let x = 0; x < width; x += 1) {
      const ax = Math.max(0, Math.min(width - 1, Math.round(x - shiftA * wave)));
      const bx = Math.max(0, Math.min(width - 1, Math.round(x + shiftB * wave)));
      const di = (y * width + x) * 4;
      const ai = (y * width + ax) * 4;
      const bi = (y * width + bx) * 4;
      for (let c = 0; c < 4; c += 1) {
        out[di + c] = Math.round(frameA[ai + c] * (1 - t) + frameB[bi + c] * t);
      }
    }
  }
  return out;
}
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
    const maxRgb=Math.max(...rgb),minRgb=Math.min(...rgb),hasMultiScreen=maxRgb>.01&&minRgb<.75*maxRgb;
    const screenChannels=hasMultiScreen?[0,1,2].filter(c=>rgb[c]>=.9*maxRgb):[];
    const nonScreenChannels=[0,1,2].filter(c=>!screenChannels.includes(c));
    for(let p=0;p<n;p++){const i=p*4,r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;let distance;
      if(key.mode==='luma') distance=.2126*r+.7152*g+.0722*b;
      else if(key.mode==='hsl_delta'){const hs=hue(r,g,b),dh=Math.abs(hs[0]-kh[0]),dv=Math.max(r,g,b)-maxRgb;distance=Math.hypot(Math.min(dh,1-dh)*2*Math.sqrt(.48),(hs[1]-kh[1])*Math.sqrt(.42),dv*Math.sqrt(.30))/Math.sqrt(1.2);}
      else distance=Math.hypot(cb(r,g,b)-cb(...rgb),cr(r,g,b)-cr(...rgb));
      const rawA=smooth(key.similarity,key.similarity+Math.max(.000001,key.smoothness),distance);
      alpha[p]=(key.invert?1-rawA:rawA)*data[i+3];
      // Despill foreground bounce & semi-transparent edges independently of invert.
      if(key.mode!=='luma'&&key.spill&&screenChannels.length&&nonScreenChannels.length){
        let other=0;for(let k=0;k<nonScreenChannels.length;k++)other=Math.max(other,data[i+nonScreenChannels[k]]);
        for(let k=0;k<screenChannels.length;k++){const ch=screenChannels[k];data[i+ch]=byte(data[i+ch]-Math.max(0,data[i+ch]-other)*key.spill);}
      }
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
export function paintStudioNodeSurface(canvas, source, layer, time=0, programmeHeight=720, pose=null) {
  const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx||!w||!h)return false;
  ctx.imageSmoothingQuality='high';
  ctx.clearRect(0,0,w,h);const sw=source.videoWidth||source.naturalWidth||source.width,sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return false;
  const stretch=layer.mediaFit==='stretch'||layer.perspective?.sourceRect,cover=layer.bRollMode==='fullscreen'||layer.mediaFit==='cover';const scale=cover?Math.max(w/sw,h/sh):Math.min(w/sw,h/sh),dw=stretch?w:sw*scale,dh=stretch?h:sh*scale;
  ctx.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);
  // Ordinary branch pictures need no CPU round trip. Keep their alpha on the
  // canvas until a pixel effect actually needs it.
  if(!hasStudioNodeEffects(layer))return true;
  const spec = applyKeyframedNodeSpec(compileStudioNodeEffects(layer), pose);
  const pixels=ctx.getImageData(0,0,w,h);applyStudioNodeEffects(pixels.data,w,h,spec,time,programmeHeight/720);ctx.putImageData(pixels,0,0);return true;
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
