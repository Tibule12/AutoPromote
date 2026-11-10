import { buildStudioSubjectCirclePlan } from '../studioSubjectCircle';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { prepareStudioSceneActions } from '../studioSceneActions';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const fixture = () => {
  const snapshot = { orderedClips: [{ id: 'source', url: 'http://localhost/source', start: 0, end: 8 }],
    timeline: [{ id: 'occ', sourceClipId: 'source', startRequest: 0, endRequest: 8 }],
    overlays: [], motionKeyframes: [], projectMedia: ['foreground', 'matte'].map((id, i) => ({ id,
      name: id, duration: 8, status: 'ready', url: `http://localhost/${id}`, storagePath: `owned/${id}`, contentHash: String(i + 1).repeat(64) })) };
  snapshot.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'circle', snapshot }); return snapshot;
};
const settings = { count: 8, delay: .12, opacity: 1, sourceStart: 0, matteStart: 0, startTime: 0,
  duration: 8, width: 576, height: 1024, circleX: 53, circleY: 73, radiusX: 32, radiusY: 9,
  anchorX: 62, anchorY: 70, sourceMediaId: 'foreground', matteMediaId: 'matte' };
test('the complete circle compiles native moving source/matte pairs with depth order and valid clocks', async () => {
  const state=fixture(), original=JSON.stringify(state), plan=buildStudioSubjectCirclePlan(state,settings);
  expect(plan.actions.length).toBeLessThanOrEqual(64);let id=0;
  const {snapshot}=await prepareStudioSceneActions(plan,state,prefix=>`${prefix}-${++id}`,{
    aspect:576/1024,rasterize:async()=>new File(['pixels'],'circle.png',{type:'image/png'}),createUrl:()=>`blob:${++id}`});
  const pictures=snapshot.overlays.filter(layer=>layer.trackMatte);
  expect(pictures).toHaveLength(9);expect(compileStudioCompositionForRender(snapshot.studioDocument)).toBeTruthy();
  for(const picture of pictures){
    const matte=snapshot.overlays.find(layer=>layer.id===picture.trackMatte.sourceLayerId);
    expect(matte.sourceStartTime).toBe(picture.sourceStartTime);expect(matte.startTime).toBe(picture.startTime);
    expect(picture.sourceStartTime).toBeGreaterThanOrEqual(0);
    expect(picture.sourceStartTime+picture.duration).toBeLessThanOrEqual(8.001);
    for(const property of ['x','y','scale']){
      const keys=layer=>snapshot.motionKeyframes.filter(k=>k.targetId===layer.id&&k.property===property).map(({id,targetId,...key})=>key);
      expect(keys(matte)).toEqual(keys(picture));
    }
  }
  const lead=pictures.find(layer=>layer.name.endsWith('original foreground'));
  const index=snapshot.compositionOrder.indexOf(lead.id);
  expect(pictures.filter(layer=>snapshot.compositionOrder.indexOf(layer.id)>index)).toHaveLength(2);
  expect(JSON.stringify(state)).toBe(original);
});
test.each([{count:3},{count:9},{count:4.5},{delay:NaN},{radiusY:0},{anchorY:99},{matteMediaId:'foreground'},{sourceStart:2}])('invalid geometry/source clocks are rejected atomically: %j', change=>{
  const state=fixture(), before=JSON.stringify(state);expect(()=>buildStudioSubjectCirclePlan(state,{...settings,...change})).toThrow();expect(JSON.stringify(state)).toBe(before);
});
