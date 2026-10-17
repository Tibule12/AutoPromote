import { separateStudioLogoParts } from '../studioLogoParts';
import { buildStudioLogoMotion } from '../studioLogoMotion';
import { validateStudioGraphicsPackage } from '../studioGraphicsPackage';

function identity(){
  const width=120,height=40,pixels=new Uint8ClampedArray(width*height*4);
  for(let y=2;y<38;y++)for(let x=0;x<29;x++)pixels[(y*width+x)*4+3]=255;
  for(let y=15;y<29;y++)for(let x=37;x<120;x++)pixels[(y*width+x)*4+3]=255;
  return {width,height,pixels,bounds:[0,2,120,36],dataUrl:'data:image/png;base64,aGVsbG8='};
}

test('a transparent seam separates the icon and wordmark without changing their encoded source',()=>{
  const bitmap=identity(),before=bitmap.pixels.slice(),parts=separateStudioLogoParts(bitmap);
  expect(parts.map(p=>p.bounds)).toEqual([[0,2,29,36],[37,15,83,14]]);
  expect(parts.every(p=>p.svg.includes(bitmap.dataUrl))).toBe(true);
  expect(bitmap.pixels).toEqual(before);
  for(const p of parts)expect(new DOMParser().parseFromString(p.svg,'image/svg+xml').querySelector('parsererror')).toBeNull();
});

test('connected artwork is rejected instead of cutting through an opaque logo',()=>{
  const bitmap=identity();bitmap.pixels.fill(255);
  expect(()=>separateStudioLogoParts(bitmap)).toThrow('No clear gap');
  expect(()=>separateStudioLogoParts(identity(),0)).toThrow('boundary');
  expect(()=>separateStudioLogoParts({...identity(),pixels:new Uint8ClampedArray(3)})).toThrow('decoded');
});

test('separated bitmap motion produces ordinary parts and one continuous final lockup within import limits',()=>{
  const spec=buildStudioLogoMotion({bitmap:identity(),separateBitmap:true,programmeDuration:10,measure:s=>s.length*20});
  validateStudioGraphicsPackage(spec,{duration:10,aspect:16/9});
  expect(spec.layers.find(l=>l.name==='Mark / gradient symbol')).toBeTruthy();
  expect(spec.layers.find(l=>l.name==='Mark / original gradient wordmark')).toBeTruthy();
  expect(spec.layers.find(l=>l.name==='Mark / continuous original lockup').mask).toBeUndefined();
  expect(spec.layers.some(l=>l.name.startsWith('Mark / image band'))).toBe(false);
});
