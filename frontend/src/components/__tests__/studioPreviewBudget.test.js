import {studioPreviewScale,studioPreviewDimensions,normalizeStudioPreviewQuality,studioNextPreviewPaint,studioPreviewFrameDue,studioNextPreviewFrame} from '../studioPreviewBudget';

test('full detail cannot be lowered by an expensive frame and explicit choices remain stable',()=>{
  expect(normalizeStudioPreviewQuality(undefined)).toBe('full');
  expect(studioPreviewScale(240,true,'full')).toBe(1);
  expect(studioPreviewScale(240,true,'half')).toBe(.5);
  expect(studioPreviewScale(240,true,'quarter')).toBe(.25);
  expect(studioPreviewScale(240,true,'auto')).toBe(.25);
  expect(studioPreviewScale(240,false,'quarter')).toBe(1);
});

test('a small monitor retains project detail in Full and Auto uses its display budget',()=>{
  const monitor={width:270,height:480,referenceWidth:1080,pixelRatio:1};
  expect(studioPreviewDimensions({...monitor,quality:'full'})).toEqual({width:1080,height:1920});
  expect(studioPreviewDimensions({...monitor,quality:'half',scale:.5})).toEqual({width:540,height:960});
  expect(studioPreviewDimensions({...monitor,quality:'auto',scale:.5})).toEqual({width:135,height:240});
});

test('high-density and pathological source sizes stay bounded without distorting aspect',()=>{
  expect(studioPreviewDimensions({width:400,height:225,pixelRatio:2,referenceWidth:1920})).toEqual({width:1920,height:1080});
  const raster=studioPreviewDimensions({width:9000,height:16000,referenceWidth:12000,pixelRatio:4});
  expect(Math.max(raster.width,raster.height)).toBeLessThanOrEqual(4096);
  expect(raster.width/raster.height).toBeCloseTo(9/16,3);
});

test('paused inspection remains full resolution after an expensive moving frame',()=>{
  expect(studioPreviewScale(240,false)).toBe(1);
  expect(studioPreviewScale(0,true)).toBe(1);
  expect(studioPreviewScale(128,true)).toBe(.25);
  expect(studioPreviewScale(32,true)).toBe(.5);
});
test('frame cadence accounts for work already performed and never schedules a catch-up burst',()=>{
  expect(studioNextPreviewPaint(1000,1010,30)).toBeCloseTo(1033.333,2);
  expect(studioNextPreviewPaint(1000,1040,30)).toBe(1042);
  expect(studioNextPreviewPaint(1000,1010,24)).toBeCloseTo(1041.667,2);
});
test('24 fps preview on a 30 fps source retains its phase instead of falling to 15 fps',()=>{
  let deadline=0,painted=0;
  for(let n=0;n<300;n++){
    const now=1000+n*1000/30;
    if(now+1e-8<deadline)continue;
    painted++;deadline=studioNextPreviewPaint(now,now+8,24,deadline);
  }
  expect(painted).toBeGreaterThanOrEqual(239);
  expect(painted).toBeLessThanOrEqual(241);
});
test.each([[24,24,240],[25,25,250],[30,24,240],[60,30,300]])('decoded %s fps pictures retain %s fps phase', (sourceFps,targetFps,expected)=>{
  let deadline,painted=0;
  for(let n=0;n<sourceFps*10;n++){
    const time=Number((n/sourceFps).toFixed(6));
    if(!studioPreviewFrameDue(time,deadline))continue;
    painted++;deadline=studioNextPreviewFrame(time,targetFps,deadline);
  }
  expect(Math.abs(painted-expected)).toBeLessThanOrEqual(1);
});
