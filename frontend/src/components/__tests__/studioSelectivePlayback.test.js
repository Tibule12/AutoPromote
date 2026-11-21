import {newSelectiveMask,keySelectiveMask,applySelectiveClone,applySelectiveRecolor,blendSelectiveGrade,applySelectiveAdjustment} from '../studioSelectiveMask';
import {buildPrecisionGrade,applyPrecisionGrade,applyPrecisionVignette} from '../studioPrecisionGrade';
import {applyColorCube} from '../studioColorCube';
import {compileStudioAdjustmentGrade} from '../studioAdjustmentGrade';

function surface(width,height,pixels) {
  const data=pixels.slice();
  return {canvas:{width,height},getImageData:()=>({width,height,data:data.slice()}),
    putImageData(image,_x,_y,x0=0,y0=0,w=width,h=height){
      for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)data.set(image.data.subarray((y*width+x)*4,(y*width+x+1)*4),(y*width+x)*4);
    },pixels:data};
}

test.each([false,true])('bounded CPU playback preserves the canonical selected grade for invert=%s',inverted=>{
  const w=96,h=54,data=new Uint8ClampedArray(w*h*4);
  for(let p=0;p<w*h;p++){data.set([(p*37)%256,(p*71)%256,(p*19)%256,255],p*4);}
  const mask=keySelectiveMask(keySelectiveMask({...newSelectiveMask(),shape:'polygon',inverted,feather:.02,
    points:[[0,.1],[1,0],[.8,1],[0,.9]],subtract:[{...newSelectiveMask(),width:.2,height:.3}]},0),2,{x:.6,rotation:20});
  const layer=compileStudioAdjustmentGrade({id:'grade',startTime:0,duration:3,mask,finishFx:{precisionGrade:true,
    exposureStops:.3,saturation:.92,vignette:.12,advancedColor:{recolor:{enabled:true,color:'#21684e',strength:.6}}}});
  const expected=surface(w,h,data),actual=surface(w,h,data),original=expected.getImageData();
  const image=expected.getImageData();applyPrecisionGrade(image.data,buildPrecisionGrade(layer.effects.color),w,h);
  applyPrecisionVignette(image.data,w,h,layer.effects.color.vignette);
  if(layer.effects.color_cube)applyColorCube(image.data,layer.effects.color_cube);
  applySelectiveRecolor(image,layer.effects.recolor,mask,1);expected.putImageData(image,0,0);blendSelectiveGrade(expected,original,mask,1);
  expect(applySelectiveAdjustment(actual,layer,1)).toBe(true);
  expect(actual.pixels).toEqual(expected.pixels);
});

test('moving heal uses identical texture while CPU playback leaves unrelated pixels intact',()=>{
  const w=96,h=54,data=new Uint8ClampedArray(w*h*4);for(let p=0;p<w*h;p++)data.set([p%180,70+(p%80),90,255],p*4);
  const mask=keySelectiveMask(keySelectiveMask({...newSelectiveMask(),width:.08,height:.12},0),1,{x:.6,width:.1,height:.15,rotation:40});
  const layer=compileStudioAdjustmentGrade({id:'repair',startTime:0,duration:2,mask,finishFx:{precisionGrade:true,clonePatch:{enabled:true,mode:'heal',radius:.04,dx:.05,dy:0,strength:.8,follow:{width:.08,height:.12,rotation:0}}}});
  const expected=surface(w,h,data),actual=surface(w,h,data),original=expected.getImageData();
  expected.putImageData(applySelectiveClone(expected.getImageData(),layer.effects.clone_patch,mask,.5),0,0);
  blendSelectiveGrade(expected,original,mask,.5);applySelectiveAdjustment(actual,layer,.5);
  expect(actual.pixels).toEqual(expected.pixels);
});
