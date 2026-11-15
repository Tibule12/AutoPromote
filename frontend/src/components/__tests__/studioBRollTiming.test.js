import { brollSourceTime, advanceBRollSource, getOverlayVisibleDuration, getOverlayAudibleDuration, retimeBRollLayer, retargetBRollPreset } from '../studioBRollTiming';
import { splitStudioOverlayAtProgrammeTime } from '../studioTrimTransaction';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioOverlaysForRender } from '../studioRenderCompiler';

const shot={id:'shot',type:'video',src:'https://example.com/shot.mp4',sourceDuration:5,sourceStartTime:1,startTime:0,duration:10,bRollMode:'fullscreen'};
test.each(['return','hold','loop'])('%s keeps picture and audible ranges distinct',behavior=>{
 const layer={...shot,sourceEndBehavior:behavior};
 expect(getOverlayVisibleDuration(layer)).toBe(behavior==='return'?4:10);
 expect(getOverlayAudibleDuration(layer)).toBe(behavior==='loop'?10:4);
});
test('a split inside a later loop retains the original cycle instead of looping a shortened tail',()=>{
 const layer={...shot,sourceEndBehavior:'loop'};
 const split=splitStudioOverlayAtProgrammeTime({overlays:[layer]},'shot',6,'right');
 const right=split.overlays[1];expect(right.sourceStartTime).toBe(1);expect(right.sourceOffsetTime).toBe(6);
 for(const elapsed of [0,.5,1.9,2,3.9])expect(brollSourceTime(right,elapsed)).toBeCloseTo(brollSourceTime(layer,6+elapsed));
 const snapshot={...split,timeline:[{id:'main',url:'https://example.com/main.mp4',startRequest:0,endRequest:12}]};
 const doc=adaptStudioSnapshotToDocument({snapshot,projectId:'broll-phase'});
 expect(compileStudioOverlaysForRender(doc,snapshot).find(o=>o.id==='right').sourceOffsetTime).toBe(6);
});
test('trimming into a held picture keeps it visible and ends its audio',()=>{
 const layer={...shot,sourceEndBehavior:'hold',...advanceBRollSource({...shot,sourceEndBehavior:'hold'},6)};
 expect(getOverlayVisibleDuration(layer)).toBe(10);expect(getOverlayAudibleDuration(layer)).toBe(0);
 expect(brollSourceTime(layer,0)).toBeCloseTo(4.96);
});
test('return mode cannot replay the last frame after its source is exhausted',()=>{
 const layer={...shot,...advanceBRollSource(shot,6)};
 expect(getOverlayVisibleDuration(layer)).toBe(0);expect(getOverlayAudibleDuration(layer)).toBe(0);
});
test('extending the left edge can recover an earlier source moment and a loop phase',()=>{
 expect(advanceBRollSource({...shot,sourceStartTime:2},-1)).toEqual({sourceStartTime:1});
 const earlier={...shot,sourceEndBehavior:'loop',...advanceBRollSource({...shot,sourceEndBehavior:'loop'},-1)};
 expect(brollSourceTime(earlier,0)).toBeCloseTo(4);
 expect(brollSourceTime(earlier,1)).toBeCloseTo(1);
});
test('time entry bounds the complete layer and retimes its own animation',()=>{
 const keys=[{id:'a',targetId:'shot',property:'x',time:0,value:20},{id:'b',targetId:'shot',property:'x',time:10,value:80},{id:'other',targetId:'other',time:3}];
 const result=retimeBRollLayer(shot,keys,5,4,12);
 expect(result.layer).toMatchObject({startTime:5,duration:4});expect(result.keys.map(k=>k.time)).toEqual([5,9,3]);
 const bounded=retimeBRollLayer(shot,keys,99,20,12);expect(bounded.layer.startTime+bounded.layer.duration).toBeCloseTo(12);
});
test('layout presets move an existing animation with the new card position',()=>{
 const before={...shot,x:50,y:50};const result=retargetBRollPreset(before,{...before,x:75},[{targetId:'shot',property:'x',time:0,value:40}],12);
 expect(result.layer.x).toBe(75);expect(result.keys[0].value).toBe(65);
});
