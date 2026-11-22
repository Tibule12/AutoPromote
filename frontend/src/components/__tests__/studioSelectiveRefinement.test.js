import {buildMaterialCube,materialAlpha,newMaterialQualifier} from '../studioMaterialQualifier';
import {newSelectiveMask,selectiveMaskCoverage,keySelectiveMask,selectiveMaskAt,applySelectiveClone} from '../studioSelectiveMask';
import {applyRegionTracking,trackingTimes,inheritRegionMotion,trackRegionRange} from '../studioRegionTracking';
import {repairOffsetAt} from '../studioRepairMotion';
import {compileStudioAdjustmentGrade} from '../studioAdjustmentGrade';
import {adaptStudioSnapshotToDocument,projectStudioEditableStateToSnapshot} from '../studioProjectDocument';

test('material matte protects neutral highlights, other hues and hue wrap',()=>{
  const spec={...newMaterialQualifier(),samples:['#dd2222'],hueRange:.08};
  expect(materialAlpha(spec,221,34,34)).toBeGreaterThan(.98);
  expect(materialAlpha(spec,34,80,221)).toBe(0);
  expect(materialAlpha(spec,250,250,250)).toBe(0);
  expect(materialAlpha({...spec,samples:['#dd2230']},221,48,34)).toBeGreaterThan(.9);
  expect(()=>buildMaterialCube({...spec,samples:[]})).toThrow();
});

test('exclusions follow parent pose and inversion retains protected details',()=>{
  const mask={...newSelectiveMask(),width:.6,height:.6,feather:0,subtract:[{...newSelectiveMask(),width:.3,height:.3,feather:0}]};
  const moved=keySelectiveMask(keySelectiveMask(mask,0),1,{x:.7,rotation:20});
  const a=selectiveMaskCoverage(moved,100,100,1),inverse=selectiveMaskCoverage({...moved,inverted:true},100,100,1);
  expect(a[50*100+70]).toBe(0);
  expect(inverse[50*100+70]).toBe(1);
  expect(a[50*100+55]).toBe(1);
  a.forEach((value,i)=>expect(value+inverse[i]).toBeCloseTo(1,5));
});

test('outline keys deform at individual frames, survive canonical save and compile to programme time',()=>{
  const base={...newSelectiveMask(),shape:'polygon',points:[[0,0],[1,0],[1,1],[0,1]]};
  const mask=keySelectiveMask(keySelectiveMask(base,0),2,{points:[[0,0],[1,.2],[1,.8],[0,1]]});
  expect(selectiveMaskAt(mask,1).points[1][1]).toBeCloseTo(.1);
  const layer={id:'shirt',name:'Shirt',startTime:1,duration:3,mask,finishFx:{clonePatch:{enabled:true,dx:.1,dy:0,strength:.8,mode:'heal',radius:.02}}};
  const timeline=[{id:'clip',sourceClipId:'s',url:'https://example.test/source.mp4',startRequest:0,endRequest:5}];
  const doc=adaptStudioSnapshotToDocument({snapshot:{timeline,adjustmentLayers:[layer]},projectId:'selective-refinement'});
  const restored=projectStudioEditableStateToSnapshot(doc,{timeline});
  expect(restored.adjustmentLayers[0].mask).toEqual(mask);
  const compiled=compileStudioAdjustmentGrade(layer);
  expect(compiled.effects.selective_mask.keyframes.map(k=>k.time)).toEqual([1,3]);
  expect(compiled.effects.clone_patch.mode).toBe('heal');
});

test('heal borrows fine texture without copying the source brightness',()=>{
  const width=40,height=30,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const value=80+x*3+((x+y)%2)*8;
    for(let c=0;c<3;c++)data[(y*width+x)*4+c]=value;
    data[(y*width+x)*4+3]=255;
  }
  for(let y=14;y<16;y++)for(let x=9;x<11;x++)for(let c=0;c<3;c++)data[(y*width+x)*4+c]=25;
  const spec={enabled:true,dx:.3,dy:0,strength:1,radius:.08};
  const mask={...newSelectiveMask(),x:.25,y:.5,width:.22,height:.3,feather:.02};
  const clone={width,height,data:data.slice()},heal={width,height,data:data.slice()};
  applySelectiveClone(clone,spec,mask);applySelectiveClone(heal,{...spec,mode:'heal'},mask);
  expect(clone.data[(15*width+10)*4]-heal.data[(15*width+10)*4]).toBeGreaterThan(12);
  expect(heal.data[(15*width+10)*4]).toBeGreaterThan(70);
});

test('tracking stops visibility at lost samples and does not continue into unobserved time',()=>{
  const mask=newSelectiveMask(),layer={id:'area',startTime:0,duration:8,mask};
  const pose={x:.5,y:.5,width:.25,height:.3,rotation:0};
  const result={version:1,engine:'test',stopReason:'cut',observations:[],keyframes:[{time:1,...pose,opacity:1},{time:2,...pose,x:.6,opacity:1},{time:2.125,...pose,x:.6,opacity:0}]};
  const next=applyRegionTracking(layer,result,1,3);
  expect(selectiveMaskAt(next.mask,1.5).x).toBeCloseTo(.55);
  expect(selectiveMaskAt(next.mask,2.1).opacity).toBe(1);
  expect(selectiveMaskAt(next.mask,2.2).opacity).toBe(0);
  expect(selectiveMaskAt(next.mask,5).opacity).toBe(0);
  expect(trackingTimes(1,2,-1)).toEqual([2,1.875,1.75,1.625,1.5,1.375,1.25,1.125,1]);
});

test('deforming facial outlines survive canonical recovery and final compilation',()=>{
  const original={id:'face',startTime:0,duration:2,enabled:true,mask:newSelectiveMask(),finishFx:{precisionGrade:true,advancedColor:{saturation:.8}}};
  const pose={x:.4,y:.3,width:.2,height:.3,rotation:0,opacity:1};
  const points=[[0,.5],[.5,0],[1,.5],[.5,1]],changed=[[0,.5],[.5,0],[1,.5],[.5,.8]];
  const next=applyRegionTracking(original,{version:1,engine:'programme-face-mesh-v1',shape:'polygon',keyframes:[{time:0,...pose,points},{time:2,...pose,points:changed}]},0,2);
  expect(next.mask.shape).toBe('polygon');
  expect(selectiveMaskAt(next.mask,1).points[3][1]).toBeCloseTo(.9);
  const timeline=[{id:'occurrence',sourceClipId:'source',url:'https://example.test/source.mp4',startRequest:0,endRequest:2}];
  const doc=adaptStudioSnapshotToDocument({snapshot:{timeline,adjustmentLayers:[next]},projectId:'face-mesh'});
  const recovered=projectStudioEditableStateToSnapshot(doc,{timeline}).adjustmentLayers[0];
  expect(recovered.mask).toEqual(next.mask);
  expect(compileStudioAdjustmentGrade(recovered).effects.selective_mask.keyframes[1].points).toEqual(changed);
  expect(original.mask.shape).toBe('ellipse');
});

test('face mode refuses an older worker and does not replace the authored selection',async()=>{
  const layer={id:'face',startTime:0,duration:2,mask:newSelectiveMask()};
  const oldResult={version:1,engine:'programme-lk-ransac-v1',keyframes:[{time:0,x:.5,y:.5,width:.2,height:.3,rotation:0}]};
  await expect(trackRegionRange({layer,start:0,end:2,target:'face',isCurrent:()=>true,capture:async()=>new Blob(),analyze:async()=>oldResult})).rejects.toThrow('does not support facial outlines');
  expect(layer.mask.keyframes).toEqual([]);
});

test('facial contour refuses a worker that only supports the authored outline',async()=>{
  const layer={id:'face',startTime:0,duration:2,mask:newSelectiveMask()};
  const old={version:1,engine:'programme-face-mesh-v1',shape:'polygon',keyframes:[{time:0,x:.5,y:.5,width:.2,height:.3,rotation:0,points:[[0,0],[1,0],[1,1]]}]};
  await expect(trackRegionRange({layer,start:0,end:2,target:'face',faceContour:true,isCurrent:()=>true,capture:async()=>new Blob(),analyze:async()=>old})).rejects.toThrow('does not support the facial contour');
});

test('small repairs reuse a larger tracked area while preserving their local offset and size',()=>{
  const reference={id:'face',startTime:0,duration:2,mask:keySelectiveMask(keySelectiveMask(newSelectiveMask(),0),2,{x:.6,y:.55,width:.5,height:.6})};
  const child={id:'repair',startTime:0,duration:2,mask:{...newSelectiveMask(),x:.55,y:.5,width:.01,height:.02}};
  const next=inheritRegionMotion(child,reference,0,16/9),last=selectiveMaskAt(next.mask,2);
  expect(last.x).toBeCloseTo(.7);expect(last.y).toBeCloseTo(.55);expect(last.width).toBeCloseTo(.02);
  expect(next.tracking.referenceId).toBe('face');
});

test('clean source follows rotation and size in picture coordinates',()=>{
  const patch={dx:.05,dy:0,follow:{width:.1,height:.2,rotation:0}};
  const offset=repairOffsetAt(patch,{width:.2,height:.4,rotation:90},320,180);
  expect(offset.dx).toBeCloseTo(0);expect(offset.dy*180).toBeCloseTo(32);
  expect(repairOffsetAt({dx:.05,dy:0},{width:.2,height:.4,rotation:90},320,180)).toEqual({dx:.05,dy:0});
});

test('long video tracking joins bounded passes without losing the earlier path',async()=>{
  const layer={id:'face',startTime:0,duration:21,mask:newSelectiveMask()},ranges=[];
  const next=await trackRegionRange({layer,start:0,end:20,capture:async segment=>{ranges.push([segment.start,segment.end]);return segment;},
    analyze:async segment=>({version:1,engine:'test',trackedSamples:81,observations:[],keyframes:trackingTimes(segment.start,segment.end).map(t=>({time:t,x:.5+t*.001,y:.5,width:.25,height:.3,rotation:t,opacity:1}))}),isCurrent:()=>true});
  expect(ranges).toEqual([[0,10],[10,20]]);
  expect(next.mask.keyframes.length).toBeGreaterThan(128);
  expect(selectiveMaskAt(next.mask,15).x).toBeCloseTo(.515);
  expect(layer.mask.keyframes).toEqual([]);
  let current=true;
  await expect(trackRegionRange({layer,start:0,end:20,capture:async s=>s,analyze:async()=>{current=false;return{};},isCurrent:()=>current})).rejects.toThrow(/changed|cancelled/);
  expect(layer.mask.keyframes).toEqual([]);
});
