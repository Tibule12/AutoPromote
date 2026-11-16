import {applyStudioFinishTexture} from '../studioFinishTexture';
import {compileStudioAdjustmentGrade} from '../studioAdjustmentGrade';

test('a saved seek has identical grain and a later frame has fresh grain',()=>{
  const base=new Uint8ClampedArray(16*16*4).fill(128),fx={filmGrain:.7};
  const a=applyStudioFinishTexture(base.slice(),16,16,fx,.5,24);
  expect(a).toEqual(applyStudioFinishTexture(base.slice(),16,16,fx,.5,24));
  expect(a).not.toEqual(applyStudioFinishTexture(base.slice(),16,16,fx,.5+1/24,24));
  expect([...a].filter((_v,i)=>i%4===3).every(v=>v===128)).toBe(true);
});
test('chromatic shift repeats edge pixels and preserves green/alpha',()=>{
  const data=new Uint8ClampedArray([10,20,30,255,40,50,60,128,70,80,90,0]);
  expect([...applyStudioFinishTexture(data,3,1,{chromaticAberration:.1})]).toEqual([10,20,60,255,10,50,90,128,40,80,90,0]);
});
test('timed vignette compiles the same strength as the other adjustment controls',()=>{
  const result=compileStudioAdjustmentGrade({opacity:.5,intensity:50,finishFx:{vignette:.4}});
  expect(result.effects.color.vignette).toBeCloseTo(.1);
});
