import {PERSPECTIVE_IDENTITY,PERSPECTIVE_LEFT,perspectiveCorners,perspectiveHomography,validateStudioPerspective,validateStudioPerspectiveLayer} from '../studioPerspective';
import {buildMotionAutomationStyle} from '../studioAutomation';
import {adaptStudioSnapshotToDocument,projectStudioEditableStateToSnapshot} from '../studioProjectDocument';
import {compileStudioCompositionForRender} from '../studioRenderCompiler';

const plane=corners=>({version:1,corners});
test('rectangle, oblique endpoint and animated midpoint retain their four corners',()=>{
  for(const progress of [0,50,100]){
    const corners=perspectiveCorners(plane(PERSPECTIVE_LEFT),progress);
    const m=perspectiveHomography(corners);
    for(const [i,[x,y]] of [[0,0],[1,0],[1,1],[0,1]].entries()){
      const d=m[6]*x+m[7]*y+1;
      expect((m[0]*x+m[1]*y+m[2])/d).toBeCloseTo(corners[i][0],10);
      expect((m[3]*x+m[4]*y+m[5])/d).toBeCloseTo(corners[i][1],10);
    }
  }
  expect(perspectiveCorners(plane(PERSPECTIVE_LEFT),0)).toEqual(PERSPECTIVE_IDENTITY.map(p=>p.map(n=>n/100)));
});
test.each([
  [[0,0],[100,100],[100,0],[0,100]],
  [[0,0],[100,0],[50,2],[0,100]],
  [[0,0],[100,0],[100,1],[0,1]],
  [[0,0],[NaN,0],[100,100],[0,100]],
  [[0,0],[101,0],[100,100],[0,100]],
].map(corners=>[corners]))('crossed, concave, near-flat and nonfinite planes reject (%j)',corners=>{
  expect(()=>validateStudioPerspective(plane(corners))).toThrow();
});
test('unsupported layer combinations reject rather than silently discard projection',()=>{
  const base={id:'recording',type:'video',perspective:plane(PERSPECTIVE_LEFT)};
  expect(()=>validateStudioPerspectiveLayer(base)).not.toThrow();
  expect(()=>validateStudioPerspectiveLayer(base,[{property:'cropX',value:0},{property:'cropY',value:0}])).not.toThrow();
  expect(()=>validateStudioPerspectiveLayer(base,[{property:'cropX',value:1}])).toThrow();
  for(const other of [{type:'text'},{id:'main-video'},{mask:{enabled:true}},{motionBlur:{enabled:true}},{cropX:1}])
    expect(()=>validateStudioPerspectiveLayer({...base,...other})).toThrow();
  expect(()=>validateStudioPerspectiveLayer(base,[],true)).toThrow();
  expect(()=>validateStudioPerspectiveLayer(base,[{property:'perspectiveProgress',value:101}])).toThrow();
});
test('existing native interpolation evaluates identity, midpoint and settled perspective',()=>{
  const layer={perspective:plane(PERSPECTIVE_LEFT)};
  const keys=[{property:'perspectiveProgress',time:0,value:0},{property:'perspectiveProgress',time:2,value:100,easing:'linear'}];
  expect([0,1,2].map(time=>buildMotionAutomationStyle(keys,time,layer).perspectiveProgress)).toEqual([0,50,100]);
});
test('save, reopen and canonical compilation preserve the video plane and its edit-clock keys',()=>{
  const snapshot={orderedClips:[{id:'source',start:0,end:2}],selectedClipId:'source',
    timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:2}],
    overlays:[{id:'recording',type:'video',width:80,height:80,sourceStartTime:0,
      perspective:plane(PERSPECTIVE_LEFT),perspectiveProgress:0}],
    motionKeyframes:[{id:'quad-0',targetId:'recording',property:'perspectiveProgress',time:0,value:0,easing:'linear'},
      {id:'quad-1',targetId:'recording',property:'perspectiveProgress',time:2,value:100,easing:'linear'}]};
  const document=adaptStudioSnapshotToDocument({projectId:'perspective-proof',snapshot});
  const reopened=JSON.parse(JSON.stringify(document));
  expect(projectStudioEditableStateToSnapshot(reopened,snapshot).overlays[0].perspective).toEqual(plane(PERSPECTIVE_LEFT));
  const layer=compileStudioCompositionForRender(reopened).layers.find(l=>l.id==='recording');
  expect(layer.perspective).toEqual(plane(PERSPECTIVE_LEFT.flat()));
  expect(layer.base_transform.perspective_progress).toBe(0);
  expect(layer.motion_keyframes.map(k=>[k.property,k.time,k.value])).toEqual([['perspectiveProgress',0,0],['perspectiveProgress',2,100]]);
});
