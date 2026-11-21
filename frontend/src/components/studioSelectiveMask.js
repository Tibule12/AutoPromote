import {buildAdvancedColorCube,applyColorCube,sampleColorCube} from './studioColorCube';
import {healTexture,coverageBounds,healRadius} from './studioTextureHeal';
import {materialSampler,validateMaterialQualifier} from './studioMaterialQualifier';
// Programme-space masks for ordinary timed colour adjustments. The same
// signed-distance coverage is evaluated by studio_selective_mask.py.
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const fields = ['x','y','width','height','rotation'];
export function validateSelectiveMask(input) {
  if (!input || input.space !== 'programme' || input.version !== 1 || !['ellipse','rectangle','polygon'].includes(input.shape)) throw Error('Choose a valid selected-area mask.');
  const ranges={x:[-1,2],y:[-1,2],width:[.002,3],height:[.002,3],rotation:[-360,360],feather:[0,.25]};
  for(const [key,[lo,hi]] of Object.entries(ranges)) if(typeof input[key]!=='number'||!Number.isFinite(input[key])||input[key]<lo||input[key]>hi)throw Error(`Invalid selected-area ${key}.`);
  if(typeof input.inverted!=='boolean')throw Error('Choose mask inside or outside.');
  if(input.shape==='polygon'&&(!Array.isArray(input.points)||input.points.length<3||input.points.length>64||input.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))))throw Error('Draw a closed outline with 3–64 points.');
  if(!Array.isArray(input.keyframes)||input.keyframes.length>128)throw Error('Use at most 128 mask position keys.');
  if(input.opacity!==undefined&&(!Number.isFinite(input.opacity)||input.opacity<0||input.opacity>1))throw Error('Invalid mask visibility.');
  validateMaterialQualifier(input.material);
  if(input.subtract!==undefined){
    if(!Array.isArray(input.subtract)||input.subtract.length>8)throw Error('Use up to eight exclusion outlines per region.');
    for(const child of input.subtract)validateSelectiveMask({...child,space:'programme',version:1,inverted:false,keyframes:[],subtract:undefined,material:undefined});
  }
  let previous=-1;
  for(const key of input.keyframes){if(typeof key.time!=='number'||!Number.isFinite(key.time)||key.time<0||key.time<=previous)throw Error('Mask keys need unique increasing programme times.');previous=key.time;for(const field of fields){const [lo,hi]=ranges[field];if(typeof key[field]!=='number'||!Number.isFinite(key[field])||key[field]<lo||key[field]>hi)throw Error('Invalid mask position key.');}if(key.hold!==undefined&&typeof key.hold!=='boolean')throw Error('Invalid mask key interpolation.');if(key.opacity!==undefined&&(!Number.isFinite(key.opacity)||key.opacity<0||key.opacity>1))throw Error('Invalid mask visibility key.');if(key.points!==undefined&&(input.shape!=='polygon'||!Array.isArray(key.points)||key.points.length!==input.points.length||key.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>1))))throw Error('Outline keys must keep matching points.');}
  return input;
}
export const newSelectiveMask = () => ({space:'programme',version:1,shape:'ellipse',x:.5,y:.5,width:.25,height:.3,rotation:0,feather:.008,inverted:false,keyframes:[]});
export function selectiveMaskAt(mask,time) {
  const keys=mask.keyframes||[];if(!keys.length)return mask;
  const left=[...keys].reverse().find(k=>k.time<=time)||keys[0],right=keys.find(k=>k.time>=time)||keys.at(-1);
  const p=left===right||left.hold?0:clamp((time-left.time)/(right.time-left.time),0,1);
  const lp=left.points||mask.points,rp=right.points||mask.points;
  return {...mask,...Object.fromEntries(fields.map(f=>[f,left[f]+(right[f]-left[f])*p])),opacity:(left.opacity??1)+((right.opacity??1)-(left.opacity??1))*p,...(lp?{points:lp.map((point,i)=>point.map((v,j)=>v+(rp[i][j]-v)*p))}:{})};
}
export function keySelectiveMask(mask,time,patch={}) {
  const pose={...selectiveMaskAt(mask,time),...patch,opacity:patch.opacity??1};
  return {...mask,keyframes:[...mask.keyframes.filter(k=>Math.abs(k.time-time)>.0001),{time,...Object.fromEntries(fields.map(f=>[f,pose[f]])),...(pose.points?{points:pose.points.map(p=>[...p])}:{}),...(pose.opacity!==undefined?{opacity:pose.opacity}:{})}].sort((a,b)=>a.time-b.time)};
}
export function selectiveMaskCoverage(mask,width,height,time=0,validated=false) {
  if(!validated)validateSelectiveMask(mask);const m=selectiveMaskAt(mask,time),unit=Math.min(width,height),rx=m.width*width/unit/2,ry=m.height*height/unit/2;
  const angle=m.rotation*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle),padding=m.feather*(m.shape==='ellipse'?Math.max(rx,ry)/Math.min(rx,ry):1),out=new Float32Array(width*height);
  const points=(m.points||[]).map(([x,y])=>[(x-.5)*rx*2,(y-.5)*ry*2]);
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const dx=((px+.5)/width-m.x)*width/unit,dy=((py+.5)/height-m.y)*height/unit,x=dx*cs+dy*sn,y=-dx*sn+dy*cs;
    if(Math.abs(dx)>Math.abs(rx*cs)+Math.abs(ry*sn)+padding||Math.abs(dy)>Math.abs(rx*sn)+Math.abs(ry*cs)+padding){out[py*width+px]=m.inverted?1:0;continue;}
    let distance;
    if(m.shape==='ellipse') distance=(Math.hypot(x/rx,y/ry)-1)*Math.min(rx,ry);
    else if(m.shape==='rectangle'){const qx=Math.abs(x)-rx,qy=Math.abs(y)-ry;distance=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0);}
    else {let inside=false,near=Infinity;for(let i=0,j=points.length-1;i<points.length;j=i++){
      const [ax,ay]=points[j],[bx,by]=points[i],vx=bx-ax,vy=by-ay,t=clamp(((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy||1),0,1);
      near=Math.min(near,Math.hypot(x-ax-t*vx,y-ay-t*vy));if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }distance=near*(inside?-1:1);}
    const t=m.feather?clamp(.5-distance/m.feather,0,1):(distance<=0?1:0),a=t*t*(3-2*t);out[py*width+px]=m.inverted?1-a:a;
  }
  if(m.subtract?.length){
    // Exclusions live in the parent's local coordinates and follow its motion.
    for(const child of m.subtract){
      const a=(child.rotation+m.rotation)*Math.PI/180;
      const localX=(child.x-.5)*m.width*width,localY=(child.y-.5)*m.height*height;
      const transformed={...child,space:'programme',version:1,inverted:false,keyframes:[],
        x:m.x+(localX*cs-localY*sn)/width,y:m.y+(localX*sn+localY*cs)/height,
        width:child.width*m.width,height:child.height*m.height,rotation:a*180/Math.PI,
        feather:child.feather*Math.min(m.width*width,m.height*height)/unit};
      const exclusion=selectiveMaskCoverage(transformed,width,height,0,true);
      for(let i=0;i<out.length;i++)out[i]=m.inverted?1-(1-out[i])*(1-exclusion[i]):out[i]*(1-exclusion[i]);
    }
  }
  if(m.opacity!==undefined)for(let i=0;i<out.length;i++)out[i]*=m.opacity;
  return out;
}
const cache=new Map();
function cachedCoverage(mask,width,height,time) {const pose=selectiveMaskAt(mask,time),id=JSON.stringify([width,height,{...pose,keyframes:[],material:undefined}]);
  let coverage=cache.get(id);if(!coverage){coverage=selectiveMaskCoverage(mask,width,height,time);if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(id,coverage);}
  return coverage;
}
export function blendSelectiveGrade(context, original, mask, time=0) {
  const {width,height}=original,coverage=cachedCoverage(mask,width,height,time);
  const image=context.getImageData(0,0,width,height),scratch=[0,0,0],qualify=materialSampler(mask.material);
  for(let p=0;p<coverage.length;p++){const i=p*4,a=coverage[p]*(coverage[p]?qualify(original.data[i],original.data[i+1],original.data[i+2],scratch):0);for(let c=0;c<3;c++){const i=p*4+c;image.data[i]=original.data[i]+(image.data[i]-original.data[i])*a;}image.data[p*4+3]=original.data[p*4+3];}
  context.putImageData(image,0,0);
}
// A clean same-frame patch, offset with the region, preserves texture. It is an
// explicit clone tool, not an automatic face reconstruction/beautification model.
export function applySelectiveClone(image, patch, mask=null, time=0) {
  if(!patch?.enabled)return image;
  const {width:w,height:h,data}=image,source=data.slice(),amount=clamp(Number(patch.strength??1),0,1),dx=patch.dx*w,dy=patch.dy*h;
  const coverage=mask?cachedCoverage(mask,w,h,time):null;
  const bounds=coverageBounds(coverage,w,h,patch.mode==='heal'?healRadius(patch,w,h):0);
  for(let y=bounds.y0;y<bounds.y1;y++)for(let x=bounds.x0;x<bounds.x1;x++){
    if(patch.mode!=='heal'&&coverage&&!coverage[y*w+x])continue;
    const sx=clamp(x+dx,0,w-1),sy=clamp(y+dy,0,h-1),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=sx-x0,fy=sy-y0;
    for(let c=0;c<3;c++){const value=(source[(y0*w+x0)*4+c]*(1-fx)+source[(y0*w+x1)*4+c]*fx)*(1-fy)+(source[(y1*w+x0)*4+c]*(1-fx)+source[(y1*w+x1)*4+c]*fx)*fy,i=(y*w+x)*4+c;data[i]=patch.mode==='heal'?value:source[i]+(value-source[i])*amount;}
  }
  if(patch.mode==='heal')return healTexture(image,source,data.slice(),patch,coverage);
  return image;
}

const recolorCubes=new Map();
export function applySelectiveRecolor(image,recolor,mask=null,time=0) {
 if(!recolor?.enabled||recolor.strength===0)return image;
 const id=JSON.stringify(recolor);let cube=recolorCubes.get(id);if(!cube){cube=buildAdvancedColorCube({recolor});if(recolorCubes.size>=8)recolorCubes.delete(recolorCubes.keys().next().value);recolorCubes.set(id,cube);}
 if(mask){const coverage=cachedCoverage(mask,image.width,image.height,time),data=image.data,out=[0,0,0];
   for(let p=0;p<coverage.length;p++)if(coverage[p]){const i=p*4;sampleColorCube(cube,data[i]/255,data[i+1]/255,data[i+2]/255,out);data[i]=out[0]*255;data[i+1]=out[1]*255;data[i+2]=out[2]*255;}
 }else applyColorCube(image.data,cube);return image;
}
