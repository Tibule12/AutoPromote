// Version 1 texture coordinates and noise are shared with the CPU export
// filter. Integer arithmetic makes paused inspection repeatable at every seek.
export function applyStudioFinishTexture(data,width,height,fx,time=0,fps=30,units=1) {
  const grain=Math.max(0,Math.min(1,Number(fx.filmGrain)||0));
  const chromatic=Math.max(0,Math.min(1,Number(fx.chromaticAberration)||0));
  if(grain<=.005&&chromatic<=.005)return data;
  const input=chromatic>.005?new Uint8ClampedArray(data):data;
  const shift=chromatic>.005?Math.max(1,Math.floor(chromatic*9+.5))*units:0;
  const frame=Math.max(0,Math.floor(time*(Number(fps)||30)+.0001));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,xx=Math.floor(x/units),yy=Math.floor(y/units);
    const hash=(((xx*73856093+yy*19349663+frame*83492791)%65521)*25173+13849)%65521;
    const noise=grain>.005?(hash/65520-.5)*grain*26:0;
    const left=Math.max(0,Math.min(width-1,Math.round(x-shift))),right=Math.max(0,Math.min(width-1,Math.round(x+shift)));
    data[i]=Math.floor(Math.max(0,Math.min(255,input[(y*width+left)*4]+noise))+.5);
    data[i+1]=Math.floor(Math.max(0,Math.min(255,input[i+1]+noise))+.5);
    data[i+2]=Math.floor(Math.max(0,Math.min(255,input[(y*width+right)*4+2]+noise))+.5);
  }
  return data;
}
