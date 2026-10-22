import { editStudioKeyframeSelection } from '../studioKeyframeSelection';
const keys = [{id:'a',targetId:'g',property:'x',time:1,value:5,easing:'bezier',curve:[.1,0,.7,1]},
  {id:'b',targetId:'g',property:'opacity',time:2,value:.8,easing:'hold'},
  {id:'c',targetId:'title',property:'scale',time:3,value:1.2,easing:'linear'}];
test('batch movement clamps the whole selection, retaining spacing, values, curves and foreign keys',()=>{
  const result=editStudioKeyframeSelection(keys,['a','b'],'move',{value:-10,duration:5});
  expect(result.keys.map(k=>k.time)).toEqual([0,1,3]);
  expect(result.keys[0]).toEqual({...keys[0],time:0});expect(result.keys[2]).toBe(keys[2]);
  expect(editStudioKeyframeSelection(keys,['a','b'],'move',{value:10,duration:5}).keys.map(k=>k.time)).toEqual([4,5,3]);
});
test('time scaling anchors the first selected key; interpolation and clipboard preserve individual property data',()=>{
  expect(editStudioKeyframeSelection(keys,['a','b'],'scale',{value:2,duration:5}).keys.map(k=>k.time)).toEqual([1,3,3]);
  const eased=editStudioKeyframeSelection(keys,['a','b'],'easing',{value:'ease_in_out',duration:5});
  expect(eased.keys[0].curve).toEqual(keys[0].curve);expect(eased.keys[2]).toBe(keys[2]);
  let count=0;const pasted=editStudioKeyframeSelection(keys,[],'paste',{value:3,clipboard:keys.slice(0,2),duration:5,createId:()=>`p${count++}`});
  expect(pasted.keys.slice(-2)).toEqual([{...keys[0],id:'p0',time:3},{...keys[1],id:'p1',time:4}]);
  expect(pasted.keys.at(-2).curve).not.toBe(keys[0].curve);
  expect(pasted.selectedIds).toEqual(['p0','p1']);
});
test('collisions and out-of-range scaling fail atomically; deleting a selection retains other channels',()=>{
  expect(()=>editStudioKeyframeSelection(keys,['a','b'],'scale',{value:10,duration:5})).toThrow('inside');
  expect(()=>editStudioKeyframeSelection(keys,[],'paste',{value:1,clipboard:[keys[0]],duration:5,createId:()=> 'copy'})).toThrow('already occupies');
  expect(editStudioKeyframeSelection(keys,['a','b'],'delete',{duration:5}).keys).toEqual([keys[2]]);
  expect(keys[0].time).toBe(1);
});

test('cross-layer paste keeps spacing, values and Bezier data while assigning new owners and identities', () => {
  let id = 0;
  const result = editStudioKeyframeSelection(keys, [], 'paste', { value: 3, clipboard: keys.slice(0, 2),
    pasteTarget: { id: 'destination', type: 'text' }, duration: 5, createId: () => `copy-${id++}` });
  expect(result.keys.slice(-2)).toEqual(keys.slice(0, 2).map((key, index) => ({ ...key,
    id: `copy-${index}`, targetId: 'destination', time: key.time + 2 })));
  expect(result.keys.slice(0, 3)).toEqual(keys);
  expect(result.keys.at(-2).curve).not.toBe(keys[0].curve);
});

test('incompatible properties, destination bounds, multiple owners and destination collisions reject the whole paste', () => {
  const paste = (clipboard, pasteTarget) => editStudioKeyframeSelection(keys, [], 'paste', {
    clipboard, pasteTarget, value: 1, duration: 5, createId: () => 'copy' });
  expect(() => paste([{ ...keys[0], property: 'cropX' }], { id: 'text', type: 'text' })).toThrow('does not support');
  expect(() => paste([{ ...keys[0], value: -8 }], { id: 'text', type: 'text' })).toThrow('between 0 and 100');
  expect(() => paste(keys, { id: 'text', type: 'text' })).toThrow('one layer');
  expect(() => paste([keys[0]], { id: 'g', kind: 'graphic_group' })).toThrow('already occupies');
  expect(keys).toHaveLength(3);
});

test('paste rejects a collision within the editor half-frame tolerance after playhead snapping', () => {
  expect(() => editStudioKeyframeSelection(keys, [], 'paste', { value: 1 + 1 / 60, clipboard: [keys[0]],
    duration: 5, timeTolerance: 1 / 48, createId: () => 'copy' })).toThrow('already occupies');
});
