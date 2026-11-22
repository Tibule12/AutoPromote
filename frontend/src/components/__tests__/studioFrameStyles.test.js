import { STUDIO_FRAME_STYLES, buildStudioFramePlan, studioFrameBeatGrid } from '../studioFrameStyles';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { prepareStudioSceneActions, executeStudioSceneActions } from '../studioSceneActions';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';
const snapshot = () => {
  const s = { orderedClips: [{ id: 'clip', url: 'http://localhost/a', start: 0, end: 30 }], timeline: [{ id: 'occ', sourceClipId: 'clip', startRequest: 0, endRequest: 30 }],
    overlays: [], motionKeyframes: [], soundEffects: [], projectMedia: ['a','b','c'].map((id,i)=>({ id, duration: 30, url: `http://localhost/${id}`, storagePath: `owned/${id}`, contentHash: String(i+1).repeat(64), status: 'ready' })) };
  s.studioDocument=adaptStudioSnapshotToDocument({projectId:'frame-project',snapshot:s});return s;
};
const settings = { styleId:'museum',sourceIds:['a','b','c'],sourceStarts:[1,2,3],startTime:2,duration:3,width:1280,height:720,
  motion:'beat',motionAmount:.6,border:1.2,beatMode:'tempo',bpm:160,phase:0,snapStart:true,soundMode:'strong_beats',soundVolume:.2 };
const options = aspect => {let n=0;return { aspect, createId:p=>`${p}-${++n}`, rasterize:async()=>new File(['vector placeholder'],'art.png',{type:'image/png'}),createUrl:()=>`blob:frame-${++n}` };};

test.each(STUDIO_FRAME_STYLES.map(s=>s.id))('%s creates editable footage, artwork, sound and valid ordinary composition in landscape, portrait and square',async styleId=>{
  for(const [width,height]of[[1280,720],[720,1280],[720,720]]){
    const s=snapshot(),before=JSON.stringify(s),plan=buildStudioFramePlan(s,{...settings,styleId,width,height});
    const opt=options(width/height);const {snapshot:result}=await prepareStudioSceneActions(plan,s,opt.createId,opt);
    expect(compileStudioCompositionForRender(result.studioDocument)).toBeTruthy();
    const panels=result.overlays.filter(l=>l.type==='video');expect(panels).toHaveLength(STUDIO_FRAME_STYLES.find(s=>s.id===styleId).panels.length);
    expect(panels.every(l=>l.parentId&&l.mask.enabled&&l.layerShadow.enabled===false)).toBe(true);
    expect(result.overlays.filter(l=>l.vectorShape).every(l=>l.mediaFit==='stretch')).toBe(true);
    expect(result.soundEffects.length).toBeGreaterThan(0);
    for(const cue of result.soundEffects)expect(Math.abs(cue.startTime/.375-Math.round(cue.startTime/.375))).toBeLessThan(.0001);
    expect(JSON.stringify(s)).toBe(before);expect(plan.actions.length).toBeLessThanOrEqual(64);
  }
});
test('tempo origin and detected music timestamps remain explicit, distinct beat sources',()=>{
  expect(studioFrameBeatGrid({mode:'tempo',bpm:120,phase:.2,start:.3,end:1.3}).map(b=>b.time)).toEqual([.7,1.2]);
  expect(studioFrameBeatGrid({mode:'music',beats:[.1,.6,1.1],start:.3,end:1.3}).map(b=>b.time)).toEqual([.6,1.1]);
  expect(()=>buildStudioFramePlan(snapshot(),{...settings,beatMode:'music',beats:[]})).toThrow(/detect|music|tempo/i);
});
test('dense contact-sheet beats remain within the shared action/key budget',async()=>{
  const s=snapshot(),plan=buildStudioFramePlan(s,{...settings,styleId:'contact_35',duration:12,bpm:240,startTime:0});
  expect(plan.actions.length).toBeLessThanOrEqual(64);const opt=options(16/9);expect(await prepareStudioSceneActions(plan,s,opt.createId,opt)).toBeTruthy();
});
test.each([{sourceIds:['missing']},{sourceStarts:[29,0,0]},{duration:31},{border:NaN},{background:'red'},{caption:'<script>'},{motion:'magic'},{soundVolume:2},{tone:'missing'}])('invalid frame settings refuse without mutating the project: %j',patch=>{
  const s=snapshot(),before=JSON.stringify(s);expect(()=>buildStudioFramePlan(s,{...settings,...patch})).toThrow();expect(JSON.stringify(s)).toBe(before);
});
test('new media dimensions and original sounds use the existing scene executor with bounded fields',()=>{
  const s=snapshot();let n=0;const createId=p=>`${p}-${++n}`;
  const plan={format:'autopromote-scene-actions',version:1,projectId:s.studioDocument.projectId,baseRevision:s.studioDocument.revision,name:'Frame dimensions and sound',actions:[
    {type:'media_plane',id:'video',name:'Wide frame',sourceMediaId:'a',startTime:0,duration:3,width:82,height:46,mask:{enabled:true,shape:'rectangle',radius:0,feather:0,inverted:false}},
    {type:'sound_cue',id:'sound',name:'Original prism cue',tone:'prism_sweep',startTime:1,duration:.8,volume:.25},
  ]};const result=executeStudioSceneActions(plan,s,createId);expect(result.overlays[0].width).toBe(82);expect(result.overlays[0].height).toBe(46);expect(result.soundEffects[0].tone).toBe('prism_sweep');expect(result.soundEffects[0].startTime).toBe(1);
  plan.actions[1].tone='unavailable';expect(()=>executeStudioSceneActions(plan,s,createId)).toThrow();expect(s.soundEffects).toEqual([]);
});
test('the complete twelve-style sequence fits one ordinary project without dropping earlier layers or cues',async()=>{
  let state=snapshot();state.timeline[0].endRequest=45;state.orderedClips[0].end=45;state.studioDocument=adaptStudioSnapshotToDocument({projectId:'frame-project',snapshot:state});
  const opt=options(16/9);
  for(const [index,style]of STUDIO_FRAME_STYLES.entries()){
    const plan=buildStudioFramePlan(state,{...settings,styleId:style.id,startTime:index*3.75,duration:3.75,snapStart:false,bpm:128,soundMode:'entrance'});
    state=(await prepareStudioSceneActions(plan,state,opt.createId,opt)).snapshot;
  }
  expect(state.overlays.length).toBeLessThanOrEqual(128);expect(state.soundEffects).toHaveLength(12);
  expect(compileStudioCompositionForRender(state.studioDocument).layers.filter(l=>l.type==='video'&&l.id!=='main-video')).toHaveLength(STUDIO_FRAME_STYLES.reduce((sum,s)=>sum+s.panels.length,0));
});
