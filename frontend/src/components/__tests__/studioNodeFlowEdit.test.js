import { validateStudioNodeFlowEdit } from '../studioNodeFlowEdit';
import { evaluateWorldLayerPose, bakeLayerMotionToKeyframes, validateStudioParameterLinks, removeStudioLayerSafely } from '../studioCompRigging';

const before=()=>({overlays:[{id:'a',type:'text',x:50,y:50,scale:1,rotation:0,opacity:.6,startTime:0,duration:3}],
 mainTransform:{x:50,y:50,scale:1,rotation:0},motionKeyframes:[],finishKeyframes:[],finishFx:{},compositionOrder:['a']});

test('node transaction rejects removal of a locked layer before any mutation',()=>{
 const state=before();expect(()=>validateStudioNodeFlowEdit(state,{overlays:[]},{graphics:{locked:true}})).toThrow(/Unlock/);
 expect(state.overlays).toHaveLength(1);
});

test('individual layer locks also protect edits and removal from Node Flow',()=>{
 const state=before();state.overlays[0].locked=true;
 expect(()=>validateStudioNodeFlowEdit(state,{overlays:[]})).toThrow(/Unlock this layer/);
 expect(()=>validateStudioNodeFlowEdit(state,{motionKeyframes:[{id:'k',targetId:'a',property:'x',time:0,value:10}]})).toThrow(/Unlock this layer/);
});

test('deleting an expression source detaches the link at its actual sampled value',()=>{
 const source={id:'source',type:'text',x:70,y:50,scale:1,opacity:1};
 const target={...before().overlays[0],parameterLinks:{x:{sourceLayerId:'source',sourceProperty:'x',multiplier:.5,offset:3}}};
 const result=removeStudioLayerSafely({overlays:[source,target],motionKeyframes:[]},'source',1);
 expect(result.overlays[0].x).toBe(38);expect(result.overlays[0].parameterLinks).toBeUndefined();
 expect(()=>validateStudioParameterLinks(result.overlays)).not.toThrow();
});
test('a locked source transform prevents a compound graph mutation, while graph positioning is allowed',()=>{
 const state=before();expect(()=>validateStudioNodeFlowEdit(state,{overlays:[],mainTransform:{scale:2}},{video:{locked:true}})).toThrow(/Unlock/);
 expect(()=>validateStudioNodeFlowEdit(state,{nodeFlow:{positions:{MediaOut:{x:50,y:50}}}},{video:{locked:true},graphics:{locked:true}})).not.toThrow();
});
test('lock applies to keys and adjustment nodes as well as layer controls',()=>{
 const state=before();expect(()=>validateStudioNodeFlowEdit(state,{motionKeyframes:[{id:'k',targetId:'a',property:'x',time:1,value:60}]},{graphics:{locked:true}})).toThrow(/Unlock/);
 expect(()=>validateStudioNodeFlowEdit(state,{adjustmentLayers:[{id:'grade'}]},{adjustment:{locked:true}})).toThrow(/Unlock/);
});
test('invalid parent cycles and link cycles cannot enter the native edit',()=>{
 const state=before();expect(()=>validateStudioNodeFlowEdit(state,{overlays:[{...state.overlays[0],parentId:'a'}]})).toThrow();
 expect(()=>validateStudioParameterLinks([{id:'a',parameterLinks:{x:{sourceLayerId:'b',sourceProperty:'x'}}},{id:'b',parameterLinks:{x:{sourceLayerId:'a',sourceProperty:'x'}}}])).toThrow(/cycle/);
});
test('parameter links follow source keyframes and subsequent edits in preview and render baking',()=>{
 const source={id:'source',type:'text',x:10,y:50,scale:1,opacity:1,startTime:0,duration:3};
 const target={...before().overlays[0],parameterLinks:{x:{enabled:true,sourceLayerId:'source',sourceProperty:'x',multiplier:.5,offset:3}}};
 const keys=[{id:'a',targetId:'source',property:'x',time:0,value:10,easing:'linear'},{id:'b',targetId:'source',property:'x',time:2,value:50,easing:'linear'}];
 expect(evaluateWorldLayerPose(target,[source,target],keys,1).x).toBeCloseTo(18);
 expect(evaluateWorldLayerPose(target,[{...source,x:70},target],[],1).x).toBeCloseTo(38);
 const baked=bakeLayerMotionToKeyframes({layer:target,overlays:[source,target],motionKeyframes:keys,programmeDuration:3,fps:30});
 expect(baked.keyframes.some(k=>k.property==='x'&&k.value>20)).toBe(true);
});
