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
