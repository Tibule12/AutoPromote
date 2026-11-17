import {studioPreviewScale,studioNextPreviewPaint,studioPreviewFrameDue,studioNextPreviewFrame} from '../studioPreviewBudget';

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
