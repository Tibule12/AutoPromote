import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { editStudioGroupTiming, studioGroupTimingRows, rippleStudioGroupTiming, clipStudioGroupMotionCues } from '../studioGroupTiming';
import { GROUP_KIND, studioGroupTree } from '../studioGroups';
import StudioGroupTimelineClip from '../StudioGroupTimelineClip';
import StudioGroupPreview from '../StudioGroupPreview';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';
const group=(id,layerIds,timing)=>({id,name:id,kind:GROUP_KIND,layerIds,...(timing?{timing}:{})});
const state=()=>({compounds:[group('inner',['title','scene'],{startTime:1,duration:4}),group('outer',['inner','video'])],order:['title','scene','video','other'],
 overlays:[{id:'title',type:'text',startTime:1,duration:4},{id:'video',type:'video',startTime:2,duration:2,sourceStartTime:3},{id:'other',type:'text',startTime:0,duration:8}],
 motionScenes:[{id:'scene',startTime:1.5,duration:2,soundOffset:.5}],threeDScenes:[],
 motionKeyframes:[{id:'child',targetId:'title',property:'x',time:1,value:30},{id:'parent',targetId:'outer',property:'opacity',time:1,value:.8},{id:'foreign',targetId:'other',property:'x',time:2,value:60}],trackStates:{},frameStep:1/24});

test('one nested group move shifts owned clips and keys once, retaining source phase and foreign edits',()=>{
 const original=state(), moved=editStudioGroupTiming(original,'outer','move',2,8);
 expect(moved.overlays.map(o=>o.startTime)).toEqual([2,3,0]);expect(moved.overlays[1].sourceStartTime).toBe(3);
 expect(moved.motionScenes[0]).toMatchObject({startTime:2.5,duration:2,soundOffset:.5});
 expect(moved.motionKeyframes.map(k=>k.time)).toEqual([2,2,2]);expect(moved.compounds[0].timing).toEqual({startTime:2,duration:4});
 expect(moved.compounds[1].timing).toEqual({startTime:2,duration:4});expect(original.overlays[0].startTime).toBe(1);
});
test('trim preserves clips, hidden keys and phases; late moves clamp to project and early moves protect existing keys',()=>{
 const original=state(), trimmed=editStudioGroupTiming(original,'outer','trim-start',2,8);
 expect(trimmed.compounds[1].timing).toEqual({startTime:2,duration:3});expect(trimmed.overlays).toBe(original.overlays);
 expect(trimmed.motionKeyframes).toBe(original.motionKeyframes);
 const late=editStudioGroupTiming(original,'outer','move',7,8);expect(late.compounds[1].timing).toEqual({startTime:4,duration:4});
 const early=editStudioGroupTiming(trimmed,'outer','move',0,8);expect(early.compounds[1].timing.startTime).toBe(1);
 expect(early.motionKeyframes[0].time).toBe(0);
});
test('all descendant track locks block the atomic operation, even in a nested group',()=>{
 for(const track of ['graphics','motion','broll']) {
  const s=state();s.trackStates[track]={locked:true};expect(studioGroupTimingRows({...s,duration:8}).find(g=>g.id==='outer').locked).toBe(true);
  expect(()=>editStudioGroupTiming(s,'outer','move',2,8)).toThrow(/Unlock/);
 }
});
test('3D scene keys move in the same transaction while source and resolved asset identity stay unchanged',()=>{
 const s=state();s.threeDScenes=[{id:'scene',startTime:1.5,duration:2,endTime:3.5,assetStoragePath:'owned/alpha.mov',revision:4,keyframes:[{id:'pose',time:2,x:10}]}];s.motionScenes=[];
 const moved=editStudioGroupTiming(s,'outer','move',2,8);
 expect(moved.threeDScenes[0]).toMatchObject({startTime:2.5,endTime:4.5,revision:4,assetStoragePath:'owned/alpha.mov'});
 expect(moved.threeDScenes[0].keyframes[0]).toEqual({id:'pose',time:3,x:10});
});
test('ripple maps explicit windows, including a completely deleted window, without widening child visibility',()=>{
 const groups=[group('one',['a'],{startTime:1,duration:4}),group('gone',['b'],{startTime:2,duration:1})];
 expect(rippleStudioGroupTiming(groups,1.5,3.5).map(g=>g.timing)).toEqual([{startTime:1,duration:2},{startTime:1.5,duration:0}]);
});
test('nested visibility limits derived motion sound cues in the same clock and preserves the clipped source offset',()=>{
 const groups=[group('inner',['scene'],{startTime:1.2,duration:1}),group('outer',['inner'],{startTime:1,duration:.7})];
 const cues=[{id:'motion-sfx-scene',startTime:1,duration:1,trimStart:.1},{id:'motion-sfx-other',startTime:0,duration:.5}];
 expect(clipStudioGroupMotionCues(cues,groups)).toEqual([{...cues[0],startTime:1.2,duration:.5,trimStart:.3},cues[1]]);
 groups[1].timing.duration=0;expect(clipStudioGroupMotionCues(cues,groups)).toEqual([cues[1]]);
});
test('save/reopen and shared compilation retain group timing independently of leaf and key timing',()=>{
 const s=editStudioGroupTiming(state(),'outer','trim-end',4,8);
 const doc=adaptStudioSnapshotToDocument({projectId:'timed',snapshot:{compoundClips:s.compounds,compositionOrder:s.order,overlays:s.overlays,
 motionScenes:s.motionScenes,threeDScenes:[],motionKeyframes:s.motionKeyframes,orderedClips:[{id:'source',start:0,end:8}],timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:8}]}});
 const plan=compileStudioCompositionForRender(JSON.parse(JSON.stringify(doc)));
 expect(plan.groups[1].timing).toEqual({startTime:1,duration:3});expect(plan.layers[1].motion_keyframes[0].time).toBe(1);
});
test('preview hides a whole nested group at its half-open end without removing editable descendants',()=>{
 const groups=[group('inner',['title']),group('outer',['inner'],{startTime:1,duration:1})];
 const {container,rerender}=render(<StudioGroupPreview compounds={groups} order={['title']} time={1}><div data-studio-layer-id="title">Words</div></StudioGroupPreview>);
 expect(container.querySelector('[data-studio-group-id="outer"]').style.display).toBe('');
 rerender(<StudioGroupPreview compounds={groups} order={['title']} time={2}><div data-studio-layer-id="title">Words</div></StudioGroupPreview>);
 expect(container.querySelector('[data-studio-group-id="outer"]').style.display).toBe('none');expect(screen.getByText('Words')).toBeInTheDocument();
});
test('group keyboard move and trim use delivery-frame increments; locks permit selection but reject edits',()=>{
 const edit=jest.fn(), select=jest.fn(), item={id:'whole',name:'Intro',startTime:1,duration:3,childCount:2};
 const {rerender}=render(<StudioGroupTimelineClip item={item} duration={8} frameStep={1/24} onEdit={edit} onSelect={select}/>);
 fireEvent.keyDown(screen.getByRole('button',{name:'Select Intro group clip'}),{key:'ArrowRight'});expect(edit.mock.lastCall.slice(0,2)).toEqual(['whole','move']);expect(edit.mock.lastCall[2]).toBeCloseTo(25/24);
 fireEvent.keyDown(screen.getByRole('button',{name:'Trim Intro out'}),{key:'ArrowLeft',shiftKey:true});expect(edit.mock.lastCall[1]).toBe('trim-end');expect(edit.mock.lastCall[2]).toBeCloseTo(4-10/24);
 rerender(<StudioGroupTimelineClip item={{...item,locked:true}} duration={8} frameStep={1/24} onEdit={edit} onSelect={select}/>);
 fireEvent.click(screen.getByRole('button',{name:'Select Intro group clip'}));expect(select).toHaveBeenCalledWith('whole');
 fireEvent.keyDown(screen.getByRole('button',{name:'Select Intro group clip'}),{key:'ArrowRight'});expect(edit).toHaveBeenCalledTimes(2);
});
test('drag samples remain local until pointer-up commits one move, and cancelling leaves the graph unchanged',()=>{
 const originalPointerEvent=window.PointerEvent;window.PointerEvent=MouseEvent;
 const edit=jest.fn(), item={id:'whole',name:'Intro',startTime:1,duration:3,childCount:2};
 const {container}=render(<div className="pro-track-lane"><StudioGroupTimelineClip item={item} duration={8} frameStep={1/24} onEdit={edit}/></div>);
 container.firstChild.getBoundingClientRect=()=>({width:800});const button=screen.getByRole('button',{name:'Select Intro group clip'});
 fireEvent.pointerDown(button,{button:0,clientX:100});fireEvent.pointerMove(button,{clientX:150});fireEvent.pointerMove(button,{clientX:200});expect(edit).not.toHaveBeenCalled();
 fireEvent.pointerUp(button,{clientX:200});expect(edit).toHaveBeenCalledTimes(1);expect(edit).toHaveBeenCalledWith('whole','move',2);
 fireEvent.pointerDown(button,{button:0,clientX:100});fireEvent.pointerMove(button,{clientX:300});fireEvent.pointerCancel(button);expect(edit).toHaveBeenCalledTimes(1);
 window.PointerEvent=originalPointerEvent;
});
test.each([null,{startTime:-1,duration:2},{startTime:0,duration:NaN},{startTime:0,duration:1,sourceOffset:2}])('malformed group timing fails preflight',timing=>{
 expect(()=>studioGroupTree([group('g',['a'],timing===null?undefined:timing)].map(g=>({...g,timing})),['a'])).toThrow(/timing/);
});
