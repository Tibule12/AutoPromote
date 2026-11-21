// Same-frame frequency-separated healing: retain the destination's broad
// lighting/colour and replace detail with the chosen clean source texture.
// The worker uses boxblur + mix on RGB planes for this identical operation.
export function healRadius(spec,width,height) {
  return Math.max(1,Math.min(80,Math.round((spec.radius??.012)*Math.min(width,height))));
}
export function boxBlurRgb(data,width,height,radius) {
  const horizontal=new Float32Array(width*height*3),out=new Float32Array(horizontal.length),span=radius*2+1;
  const mirror=(n,size)=>{if(size===1)return 0;const period=size*2;n=((n%period)+period)%period;return n<size?n:period-1-n;};
  for(let y=0;y<height;y++)for(let c=0;c<3;c++) {
    let sum=0;for(let x=-radius;x<=radius;x++)sum+=data[(y*width+mirror(x,width))*4+c];
    for(let x=0;x<width;x++){horizontal[(y*width+x)*3+c]=Math.round(sum/span);sum+=data[(y*width+mirror(x+radius+1,width))*4+c]-data[(y*width+mirror(x-radius,width))*4+c];}
  }
  for(let x=0;x<width;x++)for(let c=0;c<3;c++) {
    let sum=0;for(let y=-radius;y<=radius;y++)sum+=horizontal[(mirror(y,height)*width+x)*3+c];
    for(let y=0;y<height;y++){out[(y*width+x)*3+c]=Math.round(sum/span);sum+=horizontal[(mirror(y+radius+1,height)*width+x)*3+c]-horizontal[(mirror(y-radius,height)*width+x)*3+c];}
  }
  return out;
}

export function coverageBounds(coverage,width,height,pad=0) {
  if(!coverage)return {x0:0,y0:0,x1:width,y1:height};
  let x0=width,y0=height,x1=0,y1=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(coverage[y*width+x]>0){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1);}
  return {x0:Math.max(0,x0-pad),y0:Math.max(0,y0-pad),x1:Math.min(width,x1+pad),y1:Math.min(height,y1+pad)};
}

export function healTexture(image,source,cloned,spec,coverage) {
  const {width,height,data}=image,r=healRadius(spec,width,height),inner=Math.max(0,Math.floor(r/2));
  const {x0,y0,x1,y1}=coverageBounds(coverage,width,height,r),w=x1-x0,h=y1-y0;
  if(w<=0||h<=0)return image;
  const originalCrop=new Uint8ClampedArray(w*h*4),cleanCrop=new Uint8ClampedArray(originalCrop.length);
  for(let y=y0;y<y1;y++){
    const from=(y*width+x0)*4,to=((y-y0)*w)*4;
    originalCrop.set(source.subarray(from,from+w*4),to);cleanCrop.set(cloned.subarray(from,from+w*4),to);
  }
  const destinationLow=boxBlurRgb(originalCrop,w,h,r),sourceLow=boxBlurRgb(cleanCrop,w,h,r);
  const destinationInner=boxBlurRgb(originalCrop,w,h,inner),sourceInner=boxBlurRgb(cleanCrop,w,h,inner);
  const outerArea=(2*r+1)**2,innerArea=(2*inner+1)**2,outerWeight=outerArea/(outerArea-innerArea),innerWeight=innerArea/(outerArea-innerArea),amount=spec.strength??1;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
    const p=y*width+x;if(coverage&&!coverage[p])continue;
    const q=(y-y0)*w+x-x0;
    for(let c=0;c<3;c++) {
      const i=p*4+c,j=q*3+c;
      // The central defect is excluded from the lighting estimate. Averaging
      // through the blemish itself would leave a dark ghost in a healed patch.
      const correction=(destinationLow[j]-sourceLow[j])*outerWeight-(destinationInner[j]-sourceInner[j])*innerWeight;
      data[i]=source[i]+(cloned[i]+correction-source[i])*amount;
    }
  }
  return image;
}
