import { createNodePaletteAddition, toggleNodeFlowBypass, validateStudioNodeFlow, deleteNodeFromFlow, materializeLegacyNodeBypasses, restoreAllNodeFlowBypasses } from '../studioNodeFlow';
import { validateStudioPerspectiveLayer } from '../studioPerspective';
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot } from '../studioProjectDocument';

const state = () => ({overlays:[{id:'plate',type:'image',x:67,y:35,scale:1.3,rotation:12,opacity:.42,
  perspective:{version:1,corners:[[12,0],[100,10],[88,100],[0,90]]},perspectiveProgress:100,
  glow:{enabled:true,radius:15,intensity:.7},layerShadow:{enabled:false,blur:8},blur:4,
  opticalFx:{halation:.4},displacementWarp:{enabled:true,amountX:3,amountY:2}}],
  mainTransform:{x:60,y:40,scale:1.4,rotation:15},finishFx:{contrast:1.3,saturation:.8,filmGrain:.3,halation:.2},
  advancedColor:{curve:{shadows:.1}},adjustmentLayers:[],
  motionKeyframes:[{id:'px',targetId:'plate',property:'x',time:0,value:67},{id:'mx',targetId:'main-video',property:'scale',time:0,value:1.4}],
  finishKeyframes:[{id:'c',property:'contrast',time:0,value:1.3}],nodeFlow:{version:1,positions:{},bypassed:{}}});

test('new corner pin applies the full authored perspective, not one percent',()=>{
 const added=createNodePaletteAddition('add_corner_pin',{overlays:[{id:'p',type:'image'}],activeOverlayId:'p'});
 expect(added.overlays[0].perspectiveProgress).toBe(100);
});

test.each(['Transform:main-video','Transform:plate','CornerPin:plate','GlowBlur:plate','ColorCorrector:finish','GlowBlur:finish'])(
 '%s bypass changes the actual canonical effect and restores exact authored controls',id=>{
  const before=state(),copy=JSON.parse(JSON.stringify(before)),off=toggleNodeFlowBypass(before,id);
  expect(before).toEqual(copy);expect(off.nodeFlow.bypassed[id]).toBe(true);
  if(id==='Transform:main-video'){expect(off.mainTransform.scale).toBe(1);expect(off.motionKeyframes.some(k=>k.targetId==='main-video')).toBe(false)}
  if(id==='Transform:plate'){expect(off.overlays[0].x).toBe(50);expect(off.motionKeyframes.some(k=>k.targetId==='plate'&&k.property==='x')).toBe(false)}
  if(id==='CornerPin:plate'){expect(off.overlays[0].perspective).toBeUndefined();expect(()=>validateStudioPerspectiveLayer(off.overlays[0],[])).not.toThrow()}
  if(id==='GlowBlur:plate'){expect(off.overlays[0].glow.enabled).toBe(false);expect(off.overlays[0].blur).toBe(0);expect(off.overlays[0].opticalFx?.halation||0).toBe(0)}
  if(id==='ColorCorrector:finish'){expect(off.finishFx.contrast).toBe(1);expect(off.finishFx.filmGrain).toBe(.3);expect(off.advancedColor).toEqual({})}
  if(id==='GlowBlur:finish'){expect(off.finishFx.filmGrain).toBe(0);expect(off.finishFx.contrast).toBe(1.3)}
  expect(()=>validateStudioNodeFlow(off.nodeFlow)).not.toThrow();
  const on=toggleNodeFlowBypass(JSON.parse(JSON.stringify(off)),id);
  for(const field of ['overlays','mainTransform','finishFx','advancedColor','motionKeyframes','finishKeyframes'])expect(on[field]).toEqual(before[field]);
 });

test('bypassing glow retains an intentionally disabled shadow when restored',()=>{
 const before=state(),off=toggleNodeFlowBypass(before,'GlowBlur:plate'),on=toggleNodeFlowBypass(off,'GlowBlur:plate');
 expect(on.overlays[0].layerShadow.enabled).toBe(false);expect(on.overlays[0].opacity).toBe(.42);
});

test('deleting a corner pin also removes its owned corner animation keys',()=>{
 const before=state();before.motionKeyframes.push({id:'corner',targetId:'plate',property:'planeCorner0X',time:0,value:12});
 const after=deleteNodeFromFlow(before,'CornerPin:plate');
 expect(after.motionKeyframes.find(k=>k.id==='corner')).toBeUndefined();expect(after.motionKeyframes.find(k=>k.id==='px')).toBeDefined();
});

test('rapid additions retain unique native layer ids even in the same clock millisecond',()=>{
 const now=jest.spyOn(Date,'now').mockReturnValue(1000);
 try{const a=createNodePaletteAddition('add_title_node');const b=createNodePaletteAddition('add_title_node',{overlays:a.overlays});expect(new Set(b.overlays.map(l=>l.id)).size).toBe(2)}finally{now.mockRestore()}
});

test('node macro and expression metadata survive canonical serialization and reopening',()=>{
 const base={timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:4}],
  overlays:[{id:'rig',type:'text',isNullRig:true,isCompoundMacro:true,macroGroup:{memberIds:['a'],publishedControls:{macroScale:1.2}}},
   {id:'a',type:'text',text:'LINKED',startTime:0,duration:3,parentId:'rig',zDepth:40,dofBlur:2,parameterLinks:{x:{sourceLayerId:'main-video',sourceProperty:'x',multiplier:1,offset:2}}}],
  mainTransform:{x:50,y:50,scale:1,rotation:0},motionKeyframes:[],nodeFlow:{version:1}};
 const document=adaptStudioSnapshotToDocument({snapshot:base,projectId:'node-save'});
 const reopened=projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(document)),base);
 expect(reopened.overlays[0].isCompoundMacro).toBe(true);
 expect(reopened.overlays[0].macroGroup).toEqual(base.overlays[0].macroGroup);
 expect(reopened.overlays[1].parameterLinks).toEqual(base.overlays[1].parameterLinks);expect(reopened.overlays[1].zDepth).toBe(40);expect(reopened.overlays[1].dofBlur).toBe(2);
});
test('legacy bypass flags clear without inventing or discarding authored controls',()=>{
 const before=state();before.nodeFlow={version:1,bypassed:{'Transform:plate':true}};
 const after=toggleNodeFlowBypass(before,'Transform:plate');expect(after.nodeFlow.bypassed['Transform:plate']).toBe(false);expect(after.overlays).toEqual(before.overlays);
});
test('overlapping visibility bypasses restore original fractional opacity in either order',()=>{
 for(const order of [['MediaIn:plate','Merge:plate'],['Merge:plate','MediaIn:plate']]){
  const before=state();let current=toggleNodeFlowBypass(before,order[0]);current=toggleNodeFlowBypass(current,order[1]);current=toggleNodeFlowBypass(current,order[0]);expect(current.overlays[0].hidden).toBe(true);current=toggleNodeFlowBypass(JSON.parse(JSON.stringify(current)),order[1]);expect(current.overlays[0]).toEqual(before.overlays[0]);
 }
});

test('legacy projects materialise canonical bypass while retaining exact authored recovery',()=>{const before=state();before.nodeFlow={version:1,bypassed:{'Transform:plate':true}};const migrated=materializeLegacyNodeBypasses(before);expect(migrated.overlays[0].x).toBe(50);expect(migrated.nodeFlow.bypassState['Transform:plate']).toBeDefined();expect(toggleNodeFlowBypass(migrated,'Transform:plate').overlays).toEqual(before.overlays);});
test('default keyer/glow/pin/mask placement keeps node hit targets separate',()=>{
 const graph=require('../studioNodeFlow').deriveNodeFlowGraph(state());
 for(let i=0;i<graph.nodes.length;i++)for(let j=0;j<i;j++){const a=graph.nodes[i],b=graph.nodes[j];expect(Math.abs(a.x-b.x)>=166||Math.abs(a.y-b.y)>=82).toBe(true);}
});
test('warp-only and streak-only layers retain an operational FX node',()=>{
 const derive=require('../studioNodeFlow').deriveNodeFlowGraph;
 for(const fx of [{displacementWarp:{enabled:true,amountX:8}},{opticalFx:{anamorphicStreak:.5}}]){
  const data={overlays:[{id:'solo',type:'image',...fx}],nodeFlow:{version:1}};const node=derive(data).nodes.find(n=>n.id==='GlowBlur:solo');expect(node).toBeDefined();expect(node.bypassed).toBe(false);
 }
});
test('Transform bypass neutralises expression links and Finish FX bypass neutralises lens blur',()=>{
 const before=state();before.overlays[0].parameterLinks={scale:{sourceLayerId:'main-video',sourceProperty:'scale'}};before.finishFx.lensBlur=.4;
 const off=toggleNodeFlowBypass(before,'Transform:plate');expect(off.overlays[0].parameterLinks).toBeUndefined();expect(toggleNodeFlowBypass(off,'Transform:plate').overlays).toEqual(before.overlays);
 expect(toggleNodeFlowBypass(before,'GlowBlur:finish').finishFx.lensBlur).toBe(0);
});

test('Restore All restores canonical controls and keys rather than clearing flags',()=>{const before=state();let off=toggleNodeFlowBypass(before,'Transform:plate');off=toggleNodeFlowBypass(off,'GlowBlur:plate');off=toggleNodeFlowBypass(off,'ColorCorrector:finish');const restored=restoreAllNodeFlowBypasses(JSON.parse(JSON.stringify(off)));for(const field of ['overlays','motionKeyframes','finishFx','advancedColor'])expect(restored[field]).toEqual(before[field]);expect(Object.values(restored.nodeFlow.bypassed).some(Boolean)).toBe(false);});
