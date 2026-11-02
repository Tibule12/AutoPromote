import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { executeStudioSceneActions, prepareStudioSceneActions, buildStudioEvidenceScenePlan } from '../studioSceneActions';

const snapshot = () => {
  const state = { orderedClips: [{ id: 'source', url: 'http://127.0.0.1/source.mp4', start: 0, end: 8 }],
    timeline: [{ id: 'occ', sourceClipId: 'source', startRequest: 0, endRequest: 8 }], overlays: [], motionKeyframes: [],
    projectMedia: [{ id: 'media', name: 'Presenter', status: 'ready', duration: 8,
      storagePath: 'users/local/source.mp4', url: 'http://127.0.0.1/source.mp4' }] };
  state.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'local-project', snapshot: state });
  return state;
};
const factory = () => { let n = 0; return prefix => `${prefix}-${++n}`; };
test('reviewed evidence recipe compiles into ordinary editable perspective media and keys', () => {
  const state = snapshot(), before = JSON.stringify(state);
  const plan = buildStudioEvidenceScenePlan(state, 'media', 2);
  const result = executeStudioSceneActions(plan, state, factory());
  expect(result.overlays).toHaveLength(1); expect(result.motionKeyframes).toHaveLength(6);
  expect(result.overlays[0].sourceStoragePath).toBe('users/local/source.mp4');
  expect(result.overlays[0].sourceDuration).toBe(8);
  expect(result.overlays[0].perspective.corners).toHaveLength(4);
  expect(result.studioDocument.projectId).toBe('local-project');
  expect(JSON.stringify(state)).toBe(before);
});
test.each(['stale', 'missing-media', 'unsupported', 'invalid-curve', 'overrun'])(
  '%s scene plan rejects atomically before any current state is mutated', mode => {
    const state = snapshot(), before = JSON.stringify(state);
    const plan = buildStudioEvidenceScenePlan(state, 'media', 2);
    if (mode === 'stale') plan.baseRevision += 1;
    if (mode === 'missing-media') plan.actions[0].sourceMediaId = 'missing';
    if (mode === 'unsupported') plan.actions.push({ type: 'remote-script', text: 'run' });
    if (mode === 'invalid-curve') plan.actions[1].keys[1].curve[0] = Infinity;
    if (mode === 'overrun') plan.actions[0].sourceStart = 7;
    expect(() => executeStudioSceneActions(plan, state, factory())).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  }
);

const composition = () => ({ format:'autopromote-graphics',version:1,name:'Editable Director composition',width:1280,height:720,duration:8,
  layers:[{id:'headline',name:'Headline',type:'text',text:'INTENTIONAL',startTime:0,duration:8,x:50,y:50,
    scale:1,rotation:0,opacity:1,width:90,fontWeight:900,textAlign:'center',color:'#ffffff',keys:[]}],
  groups:[{id:'reveal',name:'Reveal mask',layerIds:['headline'],startTime:0,duration:8,
    mask:{enabled:true,shape:'rectangle',feather:0,radius:0,inverted:false},keys:[]}] });
const scenePlan = state => ({format:'autopromote-scene-actions',version:1,projectId:state.studioDocument.projectId,
  baseRevision:state.studioDocument.revision,name:'Combined scene',graphics:composition(),actions:[
    {type:'keys',targetId:'headline',keys:[{property:'opacity',time:0,value:0,easing:'linear'},{property:'opacity',time:1,value:1,easing:'linear'}]},
  ]});
test('a reviewed composition uses native groups and remapped layer keys in one canonical result',async()=>{
  const state=snapshot(),before=JSON.stringify(state),result=await prepareStudioSceneActions(scenePlan(state),state,factory(),{aspect:16/9});
  expect(result.snapshot.overlays[0].id).not.toBe('headline');
  expect(result.snapshot.compoundClips[0].layerIds).toEqual([result.snapshot.overlays[0].id]);
  expect(result.snapshot.motionKeyframes.every(key=>key.targetId===result.snapshot.overlays[0].id)).toBe(true);
  expect(result.snapshot.studioDocument.layers.some(layer=>layer.layerId===result.snapshot.overlays[0].id)).toBe(true);
  expect(JSON.stringify(state)).toBe(before);
});
test.each(['stale','collision','invalid-action','changed-during-artwork'])('combined plan %s cannot partially mutate a project or retain prepared URLs',async mode=>{
  const state=snapshot(),before=JSON.stringify(state),plan=scenePlan(state),revokeUrl=jest.fn();let current=true;
  if(mode==='stale')plan.baseRevision++;
  if(mode==='collision')plan.graphics.layers[0].id='main-video';
  if(mode==='invalid-action')plan.actions[0].targetId='missing';
  if(mode==='changed-during-artwork')plan.graphics.layers.push({id:'art',name:'Art',type:'artwork',
    svg:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ffffff"/></svg>',
    startTime:0,duration:8,x:50,y:50,scale:1,rotation:0,opacity:1,width:100,height:100,keys:[]});
  await expect(prepareStudioSceneActions(plan,state,factory(),{aspect:16/9,revokeUrl,isCurrent:()=>current,
    rasterize:async()=>{current=false;return new File(['image'],'art.png',{type:'image/png'});},createUrl:()=> 'blob:prepared-scene'})).rejects.toThrow();
  expect(JSON.stringify(state)).toBe(before);
  if(mode==='changed-during-artwork')expect(revokeUrl).toHaveBeenCalledWith('blob:prepared-scene');
});

test('the reviewed episode compiles its real typography, masks, rigs, grade and video planes together',async()=>{
  const template=require('../../../../reports/studio-cinematic-episode-20261101/episode-plan-template.json');
  const state=snapshot();state.timeline[0].endRequest=36;state.orderedClips[0].end=36;
  state.projectMedia=['City','Coast'].map(name=>({id:name,name,status:'ready',duration:12,
    storagePath:`studio/sources/owner/${name}.mp4`,url:`http://127.0.0.1/${name}.mp4`}));
  state.studioDocument=adaptStudioSnapshotToDocument({projectId:'episode',snapshot:state});
  let serial=0;
  const result=await prepareStudioSceneActions({format:'autopromote-scene-actions',version:1,
    projectId:'episode',baseRevision:state.studioDocument.revision,...template},state,factory(),{
    aspect:16/9,rasterize:async()=>new File(['fixture'],'art.png',{type:'image/png'}),createUrl:()=>`blob:art-${++serial}`,revokeUrl:()=>{},
  });
  expect(result.snapshot.overlays).toHaveLength(template.graphics.layers.length+4);
  expect(result.snapshot.compoundClips).toHaveLength(12);
  expect(result.snapshot.overlays.find(layer=>layer.name==='05 / Feathered moving sea').mask.shape).toBe('ellipse');
  expect(result.snapshot.adjustmentLayers).toHaveLength(1);
});

test.each(['typography','tracked','composite'])('the %s composition uses the ordinary shared graph, including actual point channels',async variant=>{
  const template=require(`../../../../reports/studio-cinematic-episode-20261101/advanced-${variant}-plan.json`);
  const state=snapshot();state.projectMedia=['Coast','Autumn'].map(name=>({id:name,name,status:'ready',duration:12,storagePath:`studio/sources/owner/${name}.mp4`,url:`http://127.0.0.1/${name}.mp4`}));
  state.studioDocument=adaptStudioSnapshotToDocument({projectId:'advanced',snapshot:state});let serial=0;
  const result=await prepareStudioSceneActions({format:'autopromote-scene-actions',version:1,projectId:'advanced',baseRevision:state.studioDocument.revision,...template},state,factory(),{
    aspect:16/9,rasterize:async()=>new File(['fixture'],'art.png',{type:'image/png'}),createUrl:()=>`blob:art-${++serial}`,revokeUrl:()=>{},
  });
  expect(JSON.parse(JSON.stringify(result.snapshot.studioDocument)).projectId).toBe('advanced');
  expect(result.snapshot.overlays.length).toBeGreaterThan(template.graphics.layers.length);
  if(variant==='typography')expect(result.snapshot.motionKeyframes.filter(k=>k.property.startsWith('maskPoint'))).toHaveLength(2940);
});
