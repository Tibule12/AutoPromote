import { buildStudioGraphicsPackage, validateStudioGraphicsPackage } from '../studioGraphicsPackage';
import { buildMotionAutomationStyle } from '../studioAutomation';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';
import { TEXT_ANIMATOR_DEFAULT } from '../studioTextAnimator';

const spec = () => ({ format: 'autopromote-graphics', version: 1, name: 'Word choreography', width: 1280, height: 720, duration: 4,
  layers: [{ id: 'word', name: 'Word', type: 'text', text: 'BREAK', startTime: 0, duration: 4,
    x: 50, y: 50, scale: 2, rotation: 0, opacity: 1, width: 90, fontWeight: 900, textAlign: 'center', color: '#ff5436',
    keys: [{ property: 'x', time: 0, value: 10, easing: 'linear' }, { property: 'x', time: 1, value: 50, easing: 'bezier', curve: [.16, 1, .3, 1] }] }],
  groups: [{ id: 'group', name: 'Break', layerIds: ['word'], startTime: 0, duration: 4, keys: [] }] });
const artwork = id => ({ id, name: id, type: 'artwork', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#ff5436"/></svg>',
  startTime: 0, duration: 4, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, width: 20, height: 20, keys: [] });
const build = input => { let id = 0; return buildStudioGraphicsPackage({ input, overlays: [], keyframes: [], compounds: [], order: [],
  duration: 4, aspect: 16 / 9, createId: prefix => `${prefix}-${++id}` }); };

test('native import retains an editable single-title animator and remaps its ordinary progress keys', async () => {
  const input = spec();
  Object.assign(input.layers[0], { textAnimator: { ...TEXT_ANIMATOR_DEFAULT }, textProgress: 100,
    keys: [0, 2].map((time, i) => ({ property: 'textProgress', time, value: i * 100, easing: 'linear' })) });
  const result = await build(input);
  expect(result.layers).toHaveLength(1);
  expect(result.layers[0].text).toBe('BREAK');
  expect(result.layers[0].textAnimator).toEqual(TEXT_ANIMATOR_DEFAULT);
  expect(result.keys.every(k => k.targetId === result.layers[0].id)).toBe(true);
  expect(buildMotionAutomationStyle(result.keys, 1, result.layers[0]).textProgress).toBe(50);
  delete input.layers[0].textAnimator;
  expect(() => validateStudioGraphicsPackage(input, { duration: 4, aspect: 16 / 9 })).toThrow();
});

test('import creates ordinary independent IDs and the same evaluated and compiled keys without altering source layers', async () => {
  const input = spec(), before = JSON.stringify(input), result = await build(input);
  expect(JSON.stringify(input)).toBe(before); expect(result.layers[0].id).not.toBe('word');
  expect(result.groups[0].layerIds).toEqual([result.layers[0].id]);
  expect(buildMotionAutomationStyle(result.keys, 1, result.layers[0]).x).toBe(50);
  const snapshot = { timeline: [{ id: 'shot', sourceClipId: 'source', startRequest: 0, endRequest: 4, duration: 4 }],
    overlays: result.overlays, motionKeyframes: result.keyframes, compoundClips: result.compounds,
    compositionOrder: result.order, motionScenes: [], threeDScenes: [], reframeAspect: '16:9' };
  const document = adaptStudioSnapshotToDocument({ projectId: 'import', snapshot });
  const plan = compileStudioCompositionForRender(document);
  expect(plan.layers.find(layer => layer.id === result.layers[0].id).motion_keyframes).toEqual(result.keys.map(key => ({
    id: key.id, property: key.property, time: key.time, value: key.value, easing: key.easing, ...(key.curve ? { curve: key.curve } : {}) })));
  expect(plan.groups[0].layerIds).toEqual(result.groups[0].layerIds);
});

test('unknown fields, duplicate keys, out-of-range timing and foreign groups fail before mutation', () => {
  for (const mutate of [
    d => { d.layers[0].url = 'https://external.example/asset'; },
    d => { d.layers[0].height = 40; },
    d => { d.layers.push({ ...artwork('image'), color: '#ff0000' }); },
    d => { d.layers[0].keys.push({ ...d.layers[0].keys[0] }); },
    d => { d.layers[0].keys[1].time = 5; },
    d => { d.groups[0].layerIds.push('foreign'); },
    d => { d.layers[0].scale = Infinity; },
    d => { d.layers[0].fontWeight = 700; },
    d => { d.width = 720; d.height = 1280; },
  ]) {
    const input = spec(); mutate(input);
    expect(() => validateStudioGraphicsPackage(input, { duration: 4, aspect: 16 / 9 })).toThrow();
  }
});

test('exact end keys use canonical ticks while keys a tick outside remain invalid', async () => {
  const input = spec();
  Object.assign(input.layers[0], { startTime: 1.445, duration: 2.405,
    keys: [{ property: 'x', time: 3.85, value: 50, easing: 'linear' }] });
  const result = await build(input);
  expect(result.keys[0].time).toBe(3.85);
  for (const time of [1.445 - 1 / 90000, 3.85 + 1 / 90000, NaN, Infinity]) {
    input.layers[0].keys[0].time = time;
    expect(() => validateStudioGraphicsPackage(input, { duration: 4, aspect: 16 / 9 })).toThrow();
  }
});

test('SVG artwork uses the existing safe static sanitizer before decoding', () => {
  const input = spec(); input.layers.push({ ...artwork('safe'), svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><image href="https://external.example/track"/><circle cx="50" cy="50" r="20"/></svg>' });
  const validated = validateStudioGraphicsPackage(input, { duration: 4, aspect: 16 / 9 });
  expect(validated.layers[1].svg).not.toMatch(/script|https:\/\/external/);
});

test('embedded local logo artwork fits the per-layer bound while aggregate and oversize inputs stay rejected',()=>{
  const input=spec(),logo=artwork('local-logo');
  const svg=length=>'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><image href="data:image/png;base64,'+
    'A'.repeat(length)+'" width="100" height="100"/></svg>';
  logo.svg=svg(300000);input.layers.push(logo);
  expect(validateStudioGraphicsPackage(input,{duration:4,aspect:16/9}).layers[1].svg).toContain('data:image/png;base64,');
  logo.svg=svg(512*1024);
  expect(()=>validateStudioGraphicsPackage(input,{duration:4,aspect:16/9})).toThrow('bounded inline SVG');
  input.layers=Array.from({length:7},(_,i)=>({...artwork('logo-'+i),svg:svg(320000)}));
  input.groups=[];
  expect(()=>validateStudioGraphicsPackage(input,{duration:4,aspect:16/9})).toThrow('import budget');
});

test('a failed artwork decode releases every created URL and preserves all existing edits', async () => {
  const input = spec(); input.layers.push(artwork('one'), artwork('two'));
  const overlays = [{ id: 'existing' }], keyframes = [{ id: 'existing-key' }], revokeUrl = jest.fn(); let id = 0;
  const rasterize = jest.fn().mockResolvedValueOnce(new File(['png'], 'one.png')).mockRejectedValueOnce(Error('Decode failed'));
  await expect(buildStudioGraphicsPackage({ input, overlays, keyframes, compounds: [], order: ['existing'], duration: 4, aspect: 16 / 9,
    createId: () => `id-${++id}`, createUrl: () => 'blob:one', revokeUrl, rasterize })).rejects.toThrow('Decode failed');
  expect(revokeUrl).toHaveBeenCalledWith('blob:one'); expect(overlays).toEqual([{ id: 'existing' }]); expect(keyframes).toEqual([{ id: 'existing-key' }]);
});

test('editable outline color and width survive import and canonical compilation',async()=>{
  const input=spec();Object.assign(input.layers[0],{strokeWidth:3,strokeColor:'#f4efe6'});
  const result=await build(input);expect(result.layers[0]).toMatchObject({strokeWidth:3,strokeColor:'#f4efe6'});
  const document=adaptStudioSnapshotToDocument({projectId:'outline',snapshot:{timeline:[{id:'shot',sourceClipId:'source',startRequest:0,endRequest:4,duration:4}],overlays:result.overlays,motionKeyframes:result.keyframes}});
  expect(document.layers.find(layer=>layer.layerId===result.layers[0].id).parameters).toMatchObject({strokeWidth:3,strokeColor:'#f4efe6'});
  for(const invalid of [{strokeWidth:9},{strokeColor:'url(https://example.com)'}]) {
    Object.assign(input.layers[0],invalid);expect(()=>validateStudioGraphicsPackage(input,{duration:4,aspect:16/9})).toThrow();
    Object.assign(input.layers[0],{strokeWidth:3,strokeColor:'#f4efe6'});
  }
});

test('ordinary layer and group masks survive import into the existing render graph',async()=>{
  const input=spec(),mask={enabled:true,shape:'polygon',path:'polygon(0% 0%, 100% 0%, 100% 40%, 0% 40%)',feather:0,inverted:false};
  input.layers[0].mask=mask;input.groups[0].mask={enabled:true,shape:'rectangle',radius:0,feather:1};
  const result=await build(input);
  const document=adaptStudioSnapshotToDocument({projectId:'masks',snapshot:{timeline:[{id:'shot',sourceClipId:'source',startRequest:0,endRequest:4,duration:4}],
    overlays:result.overlays,motionKeyframes:result.keyframes,compoundClips:result.compounds,compositionOrder:result.order}});
  const plan=compileStudioCompositionForRender(document);
  expect(plan.layers.find(layer=>layer.id===result.layers[0].id).effects.mask).toEqual(mask);
  expect(plan.groups[0].mask).toEqual(input.groups[0].mask);
  for(const invalid of [{shape:'custom'},{path:'url(https://example.com)'},{feather:-1},{enabled:'yes'},{script:'x'}]){
    input.layers[0].mask={...mask,...invalid};expect(()=>validateStudioGraphicsPackage(input,{duration:4,aspect:16/9})).toThrow();
  }
});
