import {buildMotionAutomationStyle} from '../studioAutomation';
import {validateStudioPerspectiveLayer,encodeStudioPerspective,PERSPECTIVE_IDENTITY,perspectiveCorners,perspectiveCssMatrix} from '../studioPerspective';
import {adaptStudioSnapshotToDocument,projectStudioEditableStateToSnapshot} from '../studioProjectDocument';
import {compileStudioCompositionForRender} from '../studioRenderCompiler';
import {studioMotionPropertiesForTarget} from '../studioMotionProperties';

const layer={id:'plane',type:'video',perspective:{version:1,corners:PERSPECTIVE_IDENTITY,sourceRect:[25,0,50,100]}};
const cornerKeys=end=>PERSPECTIVE_IDENTITY.flatMap((p,i)=>p.flatMap((v,j)=>[
  {id:`${i}${j}a`,targetId:'plane',property:`planeCorner${i}${j?'Y':'X'}`,time:0,value:v,easing:'linear'},
  {id:`${i}${j}b`,targetId:'plane',property:`planeCorner${i}${j?'Y':'X'}`,time:2,value:end[i][j],easing:'linear'},
]));

test('a plane with valid endpoint poses but a collapsed interior is rejected before compilation',()=>{
  const keys=cornerKeys(PERSPECTIVE_IDENTITY.map(p=>p.map(v=>100-v)));
  expect(()=>validateStudioPerspectiveLayer(layer,keys)).toThrow(/between/);
  expect(()=>validateStudioPerspectiveLayer(layer,keys.map(k=>({...k,easing:'bezier'})))).toThrow(/Linear/);
});
test('combined progress and corner trajectories stay gated until that higher-order geometry is qualified',()=>{
 const keys=cornerKeys([[10,20],[90,0],[90,100],[10,80]]);
 expect(()=>validateStudioPerspectiveLayer({...layer,perspectiveProgress:50},keys)).toThrow(/progress at 100/);
 expect(()=>validateStudioPerspectiveLayer(layer,[...keys,{property:'perspectiveProgress',time:1,value:50,easing:'linear'}])).toThrow(/progress at 100/);
 expect(()=>validateStudioPerspectiveLayer(layer,[...keys,{property:'perspectiveProgress',time:1,value:100,easing:'linear'}])).not.toThrow();
});

test('sparse, unsorted corner channels retain their own times and hold jumps',()=>{
 const keys=[
  {property:'planeCorner0X',time:3,value:10,easing:'hold'},
  {property:'planeCorner2Y',time:2,value:90,easing:'linear'},
  {property:'planeCorner0X',time:0,value:0,easing:'linear'},
  {property:'planeCorner2Y',time:0,value:100,easing:'linear'},
 ];
 const input=JSON.stringify(keys);
 expect(()=>validateStudioPerspectiveLayer(layer,keys)).not.toThrow();
 expect(JSON.stringify(keys)).toBe(input);
 const collapsing=[...keys,{property:'planeCorner0X',time:1,value:100,easing:'linear'}];
 expect(()=>validateStudioPerspectiveLayer(layer,collapsing)).toThrow(/convex|between/);
});

test('crop regions reject empty, reversed, nonfinite and out-of-source coordinates',()=>{
  for(const sourceRect of [[0,0,0,100],[50,0,25,100],[0,0,101,100],[0,NaN,50,100],[true,0,50,100]])
    expect(()=>encodeStudioPerspective({...layer.perspective,sourceRect})).toThrow(/Source region/);
  expect(encodeStudioPerspective(layer.perspective).sourceRect).toEqual([25,0,50,100]);
});

test('explicit UV pieces allow narrow surfaces while keeping edge-collapse protection',()=>{
  const corners=[[10,5],[14,5],[14,95],[10,95]];
  expect(()=>validateStudioPerspectiveLayer({...layer,perspective:{...layer.perspective,corners}})).not.toThrow();
  expect(perspectiveCorners({...layer.perspective,corners},100)).toEqual(corners.map(p=>p.map(v=>v/100)));
  expect(perspectiveCssMatrix({...layer.perspective,corners},100,896,504)).toMatch(/^matrix3d/);
  expect(()=>validateStudioPerspectiveLayer({...layer,perspective:{version:1,corners}})).toThrow();
  expect(()=>validateStudioPerspectiveLayer({...layer,perspective:{...layer.perspective,corners:[[10,5],[11,5],[11,95],[10,95]]}})).toThrow();
});

test('all eight corner channels remain editable and survive canonical save/reopen/export',()=>{
  const keys=cornerKeys([[10,20],[90,0],[90,100],[10,80]]);
  validateStudioPerspectiveLayer(layer,keys);
  const snapshot={orderedClips:[{id:'source',start:0,end:2}],selectedClipId:'source',
    timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:2}],overlays:[layer],motionKeyframes:keys};
  const doc=adaptStudioSnapshotToDocument({projectId:'region',snapshot});
  const restored=projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(doc)),snapshot);
  expect(restored.overlays[0].perspective).toEqual(layer.perspective);
  const compiled=compileStudioCompositionForRender(doc).layers.find(l=>l.id==='plane');
  expect(compiled.perspective.sourceRect).toEqual([25,0,50,100]);
  expect(compiled.motion_keyframes).toHaveLength(16);
  expect(studioMotionPropertiesForTarget(layer).filter(p=>p.planeCorner)).toHaveLength(8);
  expect(buildMotionAutomationStyle(keys,1,layer).perspective.corners).toEqual([[5,10],[95,0],[95,100],[5,90]]);
});
