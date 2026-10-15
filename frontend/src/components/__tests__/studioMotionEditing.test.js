import { editStudioPositionPose, studioPositionPath, studioCurveVelocity, editStudioCurveVelocity, studioPropertyVelocity } from '../studioMotionEditing';
import { studioGroupTree, studioGroupLocalPoint, studioGroupProgrammePoint } from '../studioGroups';

test('position edits retain authored time, identities and easing in one X/Y result; foreign keys stay intact', () => {
  const keys = [{id:'x',targetId:'art',property:'x',time:.775,value:12,easing:'bezier',curve:[.1,0,.2,1]},
    {id:'other',targetId:'other',property:'x',time:.775,value:4}];
  const next = editStudioPositionPose(keys,'art',.775,{x:30,y:70},()=> 'fresh-y');
  expect(next[0]).toEqual({...keys[0],value:30}); expect(next[1]).toBe(keys[1]);
  expect(next[2]).toEqual({id:'fresh-y',targetId:'art',property:'y',time:.775,value:70,easing:'ease_in_out'});
  expect(keys[0].value).toBe(12);
  expect(()=>editStudioPositionPose(keys,'art',.775,{x:-1,y:2},()=> 'bad')).toThrow('between');
});

test('path geometry samples evaluated curves and excludes non-position keys and temporary edits', () => {
  const keys=[{id:'x0',targetId:'art',property:'x',time:0,value:10},{id:'x1',targetId:'art',property:'x',time:2,value:90,easing:'ease_in'},
    {id:'y0',targetId:'art',property:'y',time:0,value:10},{id:'y1',targetId:'art',property:'y',time:2,value:90,easing:'ease_out'},
    {id:'o',targetId:'art',property:'opacity',time:1,value:.5}];
  const path=studioPositionPath(keys,{id:'art'}); expect(path.points.map(p=>p.time)).toEqual([0,2]);
  expect(path.samples[16]).toMatchObject({x:20,y:80,time:1});
  const draft=studioPositionPath(keys,{id:'art'},{time:2,x:50,y:40});expect(draft.points.at(-1)).toMatchObject({x:50,y:40});
  expect(keys[1].value).toBe(90);
});

test('velocity and influence convert to existing cubic handles with signed units and preserved endpoint speed', () => {
  const curve=[.25,.5,.75,.5]; expect(studioCurveVelocity(curve,10,50,2)).toMatchObject({start:40,end:40,startInfluence:25,endInfluence:25});
  const changed=editStudioCurveVelocity(curve,10,50,2,'startInfluence',40);
  expect(changed).toEqual([.4,.8,.75,.5]);expect(studioCurveVelocity(changed,10,50,2).start).toBeCloseTo(40);
  const reverse=editStudioCurveVelocity(curve,50,10,2,'end',-10);
  expect(studioCurveVelocity(reverse,50,10,2).end).toBeCloseTo(-10);
  expect(()=>editStudioCurveVelocity(curve,10,50,2,'start',1000)).toThrow('exceeds');
  expect(()=>editStudioCurveVelocity(curve,10,50,2,'endInfluence',0)).toThrow('between');
  expect(studioCurveVelocity([0,0,1,1],10,50,2)).toMatchObject({start:20,end:20});
  expect(studioCurveVelocity([0,1,1,0],10,50,2)).toMatchObject({start:null,end:null});
});

test('velocity plot samples the same scalar evaluator, including clamped group overshoot', () => {
  const keys=[{property:'x',time:0,value:10},{property:'x',time:2,value:90,easing:'ease_in'}];
  expect(studioPropertyVelocity(keys,'x',1,0,2)).toBeCloseTo(30,3);
  const overshoot=[{property:'scale',time:0,value:1},{property:'scale',time:2,value:2,easing:'bezier',curve:[.2,2,.8,2]}];
  expect(studioPropertyVelocity(overshoot,'scale',1,0,2,0,[.1,2])).toBe(0);
});

test('nested animated parent transforms map path points to the stage and back at each pose time', () => {
  const tree=studioGroupTree([{id:'outer',kind:'graphic_group',name:'Outer',layerIds:['inner'],transform:{x:6,y:-5,scale:.8,rotation:23}},
    {id:'inner',kind:'graphic_group',name:'Inner',layerIds:['art'],transform:{x:-12,y:8,scale:1.1,rotation:-18}}],['art']);
  const keys=[{id:'o0',targetId:'outer',property:'rotation',time:0,value:23},{id:'o1',targetId:'outer',property:'rotation',time:2,value:70,easing:'linear'}];
  for(const time of [0,1,2]){const screen=studioGroupProgrammePoint(tree,'art',30,67,1280,720,keys,time);
    const local=studioGroupLocalPoint(tree,'art',screen.x,screen.y,1280,720,keys,time);expect(local.x).toBeCloseTo(30,8);expect(local.y).toBeCloseTo(67,8);}
});
