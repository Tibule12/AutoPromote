import { buildStudioGraphicsPackage, validateStudioGraphicsPackage } from '../studioGraphicsPackage';
import { buildMotionAutomationStyle } from '../studioAutomation';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const spec = () => ({ format: 'autopromote-graphics', version: 1, name: 'Word choreography', width: 1280, height: 720, duration: 4,
  layers: [{ id: 'word', name: 'Word', type: 'text', text: 'BREAK', startTime: 0, duration: 4,
    x: 50, y: 50, scale: 2, rotation: 0, opacity: 1, width: 90, fontWeight: 900, textAlign: 'center', color: '#ff5436',
    keys: [{ property: 'x', time: 0, value: 10, easing: 'linear' }, { property: 'x', time: 1, value: 50, easing: 'bezier', curve: [.16, 1, .3, 1] }] }],
  groups: [{ id: 'group', name: 'Break', layerIds: ['word'], startTime: 0, duration: 4, keys: [] }] });
const artwork = id => ({ id, name: id, type: 'artwork', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#ff5436"/></svg>',
  startTime: 0, duration: 4, x: 50, y: 50, scale: 1, rotation: 0, opacity: 1, width: 20, height: 20, keys: [] });
const build = input => { let id = 0; return buildStudioGraphicsPackage({ input, overlays: [], keyframes: [], compounds: [], order: [],
  duration: 4, aspect: 16 / 9, createId: prefix => `${prefix}-${++id}` }); };

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
    d => { d.width = 720; d.height = 1280; },
  ]) {
    const input = spec(); mutate(input);
    expect(() => validateStudioGraphicsPackage(input, { duration: 4, aspect: 16 / 9 })).toThrow();
  }
});

test('SVG artwork uses the existing safe static sanitizer before decoding', () => {
  const input = spec(); input.layers.push({ ...artwork('safe'), svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script><image href="https://external.example/track"/><circle cx="50" cy="50" r="20"/></svg>' });
  const validated = validateStudioGraphicsPackage(input, { duration: 4, aspect: 16 / 9 });
  expect(validated.layers[1].svg).not.toMatch(/script|https:\/\/external/);
});

test('a failed artwork decode releases every created URL and preserves all existing edits', async () => {
  const input = spec(); input.layers.push(artwork('one'), artwork('two'));
  const overlays = [{ id: 'existing' }], keyframes = [{ id: 'existing-key' }], revokeUrl = jest.fn(); let id = 0;
  const rasterize = jest.fn().mockResolvedValueOnce(new File(['png'], 'one.png')).mockRejectedValueOnce(Error('Decode failed'));
  await expect(buildStudioGraphicsPackage({ input, overlays, keyframes, compounds: [], order: ['existing'], duration: 4, aspect: 16 / 9,
    createId: () => `id-${++id}`, createUrl: () => 'blob:one', revokeUrl, rasterize })).rejects.toThrow('Decode failed');
  expect(revokeUrl).toHaveBeenCalledWith('blob:one'); expect(overlays).toEqual([{ id: 'existing' }]); expect(keyframes).toEqual([{ id: 'existing-key' }]);
});
