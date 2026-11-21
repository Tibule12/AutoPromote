import {sampleColorCube} from './studioColorCube';
import {rgbToHsl,hexToHsl} from './studioColorScience';

const clamp = value => Math.max(0, Math.min(1, value));
export const newMaterialQualifier = () => ({enabled:true,samples:[],hueRange:.10,saturationRange:.35,lightnessRange:.35,softness:.35});

export function validateMaterialQualifier(material) {
  if (!material) return;
  if (typeof material.enabled !== 'boolean' || !Array.isArray(material.samples) ||
      material.samples.length > 8 || material.samples.some(s=>!/^#[a-f\d]{6}$/i.test(s)))
    throw Error('Pick up to eight material colours.');
  for (const [field,min,max] of [['hueRange',.01,.5],['saturationRange',.02,1],['lightnessRange',.02,1],['softness',.05,1]]) {
    if (typeof material[field]!=='number' || !Number.isFinite(material[field]) || material[field]<min || material[field]>max)
      throw Error(`Invalid material ${field}.`);
  }
  if (material.enabled && !material.samples.length) throw Error('Pick a material colour on the picture first.');
}

// An RGB cube keeps the preview and FFmpeg matte on the same trilinear grid.
// Always evaluate on the input picture, before the area's grade or retouch.
export function buildMaterialCube(material,size=33) {
  validateMaterialQualifier(material);
  if (!material?.enabled) return null;
  const samples=material.samples.map(hexToHsl),data=[];
  for(let b=0;b<size;b++)for(let g=0;g<size;g++)for(let r=0;r<size;r++) {
    const [h,s,l]=rgbToHsl(r/(size-1),g/(size-1),b/(size-1));
    let alpha=0;
    for(const [sh,ss,sl] of samples) {
      const hue=Math.min(Math.abs(h-sh),1-Math.abs(h-sh));
      const distance=Math.max(ss<.08?0:hue/material.hueRange,
        Math.abs(s-ss)/material.saturationRange,Math.abs(l-sl)/material.lightnessRange);
      const t=clamp((1-distance)/material.softness);
      alpha=Math.max(alpha,t*t*(3-2*t));
    }
    data.push(alpha,alpha,alpha);
  }
  return {size,data};
}
const cubes=new Map();
export function materialSampler(material) {
  if(!material?.enabled)return ()=>1;
  const id=JSON.stringify(material);let cube=cubes.get(id);
  if(!cube){cube=buildMaterialCube(material);if(cubes.size>=8)cubes.delete(cubes.keys().next().value);cubes.set(id,cube);}
  return (r,g,b,scratch=[0,0,0])=>sampleColorCube(cube,r/255,g/255,b/255,scratch)[0];
}
export function materialAlpha(material,r,g,b,scratch=[0,0,0]) {
  return materialSampler(material)(r,g,b,scratch);
}
