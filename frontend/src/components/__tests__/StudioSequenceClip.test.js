import React from 'react';
import {render,screen,fireEvent} from '@testing-library/react';
import StudioSequenceClip from '../StudioSequenceClip';
import StudioProTimeline from '../StudioProTimeline';

const point = (element,type,x) => fireEvent(element,new MouseEvent(type,{bubbles:true,button:0,clientX:x}));
const props = {item:{id:'clip'},index:0,start:2,duration:4,safeDuration:10,displayRate:1,
  label:'Source',ranges:[{id:'clip',start:0,end:360000}],frameStep:1/24};
test.each([['ripple','end'],['roll','start'],['slip',null],['slide',null]])('%s commits one source gesture on pointer-up', (tool,edge) => {
  const edit=jest.fn();
  render(<div className="pro-track-lane"><StudioSequenceClip {...props} editTool={tool} onEdit={edit} canRollStart canRollEnd /></div>);
  const clip=screen.getByTestId('pro-video-clip-1');
  clip.parentElement.getBoundingClientRect=()=>({width:500});
  const target=edge ? screen.getByTestId(`source-trim-${edge}-clip`) : clip.querySelector('.pro-sequence-body');
  point(target,'pointerdown',100);point(target,'pointermove',125);point(target,'pointermove',150);
  expect(edit).not.toHaveBeenCalled();point(target,'pointerup',150);
  expect(edit).toHaveBeenCalledTimes(1);
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({clipId:'clip',mode:tool,edge,delta:1,expectedRanges:props.ranges}));
});
test('cancelled and locked source drags cannot mutate the edit', () => {
  const edit=jest.fn();const {rerender}=render(<div className="pro-track-lane"><StudioSequenceClip {...props} editTool="slip" onEdit={edit}/></div>);
  let body=screen.getByRole('button',{name:'Source'});body.closest('.pro-track-lane').getBoundingClientRect=()=>({width:500});
  point(body,'pointerdown',100);point(body,'pointermove',150);point(body,'pointercancel',150);point(body,'pointerup',150);
  expect(edit).not.toHaveBeenCalled();
  rerender(<div className="pro-track-lane"><StudioSequenceClip {...props} editTool="slip" onEdit={edit} locked/></div>);
  body=screen.getByRole('button',{name:'Source'});point(body,'pointerdown',100);point(body,'pointermove',150);point(body,'pointerup',150);
  expect(edit).not.toHaveBeenCalled();
});
test('one-frame keyboard source edits respect delivery rate', () => {
  const edit=jest.fn();render(<StudioSequenceClip {...props} editTool="ripple" onEdit={edit}/>);
  fireEvent.keyDown(screen.getByTestId('source-trim-end-clip'),{key:'ArrowRight'});
  expect(edit.mock.calls[0][0].delta).toBe(1/24);
});
test('Hand pans the actual scroll surface without seeking or editing source clips', () => {
  const seek=jest.fn(),edit=jest.fn();
  const {container}=render(<StudioProTimeline duration={10} editTool="hand" onSeek={seek} onSequenceEdit={edit} zoom={4} trackStates={{}}/>);
  const scroll=container.querySelector('.pro-timeline-scroll');scroll.scrollLeft=100;
  point(scroll,'pointerdown',200);point(scroll,'pointermove',150);point(scroll,'pointerup',150);
  expect(scroll.scrollLeft).toBe(150);
  fireEvent.keyDown(scroll,{key:'ArrowRight'});expect(scroll.scrollLeft).toBe(190);
  expect(seek).not.toHaveBeenCalled();expect(edit).not.toHaveBeenCalled();
});
