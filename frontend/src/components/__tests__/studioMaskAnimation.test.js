import React from 'react';
import {render,fireEvent,screen} from '@testing-library/react';
import {buildMotionAutomationStyle} from '../studioAutomation';
import {studioMotionPropertiesForTarget} from '../studioMotionProperties';
import {validateStudioMaskAnimation,parseStudioMaskPolygon} from '../studioMaskGeometry';
import {adaptStudioSnapshotToDocument,projectStudioEditableStateToSnapshot} from '../studioProjectDocument';
import {compileStudioCompositionForRender} from '../studioRenderCompiler';
import {MotionInspector} from '../StudioAdvancedInspectors';

const layer={id:'roto',type:'video',name:'Roto',x:50,y:50,scale:1,opacity:1,width:100,height:100,
  mask:{enabled:true,shape:'polygon',path:'polygon(10% 10%, 90% 10%, 50% 90%)',feather:2,inverted:false}};
const keys=[{id:'a',targetId:'roto',property:'maskPoint0X',time:0,value:10,easing:'linear'},
  {id:'b',targetId:'roto',property:'maskPoint0X',time:1,value:30,easing:'bezier',curve:[0,0,1,1]}];

test('polygon vertices evaluate on the ordinary curve and keep raw geometry unchanged',()=>{
  const before=JSON.stringify(layer),pose=buildMotionAutomationStyle(keys,.5,layer);
  expect(pose.maskPoint0X).toBeCloseTo(20,5);
  expect(parseStudioMaskPolygon(pose.mask.path)[0][0]).toBeCloseTo(20,5);
  expect(pose.mask.feather).toBe(2);expect(JSON.stringify(layer)).toBe(before);
  expect(studioMotionPropertiesForTarget(layer).filter(p=>p.maskPoint)).toHaveLength(6);
});
test('native project projection and compiler retain vertex keys and static base geometry',()=>{
  const snapshot={orderedClips:[{id:'source',start:0,end:2}],timeline:[{id:'main',sourceClipId:'source',startRequest:0,endRequest:2}],
    overlays:[layer],motionKeyframes:keys};
  const doc=adaptStudioSnapshotToDocument({snapshot,projectId:'mask-project'});
  const reopened=projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(doc)),snapshot);
  expect(reopened.motionKeyframes).toEqual(keys);
  const compiled=compileStudioCompositionForRender(doc).layers.find(l=>l.id==='roto');
  expect(compiled.motion_keyframes).toEqual(keys.map(({targetId,...key})=>key));
  expect(compiled.effects.mask).toEqual(layer.mask);
});
test('bypassing an animated polygon retains its keys while an incompatible topology is rejected',()=>{
  expect(()=>validateStudioMaskAnimation({...layer,mask:{...layer.mask,enabled:false}},keys)).not.toThrow();
  expect(()=>validateStudioMaskAnimation({...layer,mask:{...layer.mask,shape:'ellipse'}},keys)).toThrow(/topology/);
});
test.each([{property:'maskPoint9X'},{property:'maskPoint-1X'},{value:NaN},{value:201},{time:-1}])('malformed point keys fail before exporting: %s',patch=>{
  expect(()=>validateStudioMaskAnimation(layer,[{...keys[0],...patch}])).toThrow();
});
test('the existing motion inspector edits and keys a vertex without writing a second animation store',()=>{
  const update=jest.fn(),toggle=jest.fn();
  render(<MotionInspector activeOverlay={layer} overlays={[layer]} playhead={.5} keyframes={keys}
    onUpdateOverlay={update} onTogglePropertyKeyframe={toggle} onSelectOverlay={()=>{}}
    onUpdateKeyframe={()=>{}} onRemoveKeyframe={()=>{}} onSeek={()=>{}} />);
  const input=screen.getByLabelText('Mask point 1 X');
  fireEvent.change(input,{target:{value:'24'}});fireEvent.blur(input);
  expect(update).toHaveBeenCalledWith('maskPoint0X',24);
  fireEvent.click(screen.getByRole('button',{name:'Toggle Mask point 1 X key at playhead'}));
  expect(toggle).toHaveBeenCalledWith('maskPoint0X');
});
