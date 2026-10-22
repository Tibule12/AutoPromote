import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StudioMotionPathEditor from '../StudioMotionPathEditor';
import { editStudioSpatialPath } from '../studioMotionEditing';
const keys=[{id:'x0',targetId:'art',property:'x',time:0,value:10},{id:'x1',targetId:'art',property:'x',time:2,value:80,easing:'ease_in'},
  {id:'y0',targetId:'art',property:'y',time:0,value:20},{id:'y1',targetId:'art',property:'y',time:2,value:70,easing:'ease_out'}];
const pointer=(element,type,props)=>fireEvent(element,new MouseEvent(type,{bubbles:true,button:0,...props}));
test('a stage gesture previews path shape and commits one paired position; cancellation preserves the graph',()=>{
  const commit=jest.fn(),preview=jest.fn();render(<StudioMotionPathEditor target={{id:'art'}} keyframes={keys} time={1} onCommit={commit} onSeek={jest.fn()} onPreview={preview} />);
  const svg=screen.getByTestId('studio-motion-path'),point=screen.getByRole('button',{name:'Motion position at 2.000 seconds'});
  svg.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:500});
  pointer(point,'pointerdown',{clientX:800,clientY:350});pointer(svg,'pointermove',{clientX:500,clientY:250});
  expect(point).toHaveAttribute('cx','50');expect(commit).not.toHaveBeenCalled();
  expect(preview).toHaveBeenLastCalledWith({time:2,x:50,y:50});
  pointer(svg,'pointerup');expect(commit).toHaveBeenCalledTimes(1);expect(commit).toHaveBeenCalledWith(2,{x:50,y:50});
  commit.mockClear();pointer(point,'pointerdown',{clientX:800,clientY:350});pointer(svg,'pointermove',{clientX:400,clientY:200});
  fireEvent.keyDown(point,{key:'Escape'});pointer(svg,'pointerup');expect(commit).not.toHaveBeenCalled();expect(point).toHaveAttribute('cx','80');
  expect(preview).toHaveBeenLastCalledWith(null);
});
test('keyboard position nudges respect locks while pose seeking remains available',()=>{
  const commit=jest.fn(),seek=jest.fn(),props={target:{id:'art'},keyframes:keys,time:1,onCommit:commit,onSeek:seek};
  const {rerender}=render(<StudioMotionPathEditor {...props}/>);const point=screen.getByRole('button',{name:'Motion position at 2.000 seconds'});
  fireEvent.keyDown(point,{key:'ArrowUp',shiftKey:true});expect(commit).toHaveBeenCalledWith(2,{x:80,y:69});
  rerender(<StudioMotionPathEditor {...props} locked/>);commit.mockClear();fireEvent.keyDown(point,{key:'ArrowRight'});expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(point,{key:'Enter'});expect(seek).toHaveBeenCalledWith(2);
});

test('spatial handles preview ordinary keys, commit only on release, cancel cleanly and respect locks',()=>{
  const pathChange=jest.fn(), preview=jest.fn(), commit=jest.fn();
  const props={target:{id:'art'},keyframes:keys,time:1,onCommit:commit,onPathChange:pathChange,onSeek:jest.fn(),onPreview:preview};
  const {rerender}=render(<StudioMotionPathEditor {...props}/>);
  fireEvent.click(screen.getByRole('button',{name:'Curve path'}));
  expect(pathChange).toHaveBeenLastCalledWith(2,{enabled:true}); pathChange.mockClear();
  const curved=editStudioSpatialPath(keys,'art',2,{handle:0,position:{x:30,y:10}});
  rerender(<StudioMotionPathEditor {...props} keyframes={curved}/>);
  const svg=screen.getByTestId('studio-motion-path'),handle=screen.getByRole('button',{name:'Outgoing path handle at 0.000 seconds'});
  svg.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:500});
  pointer(handle,'pointerdown',{clientX:300,clientY:50});pointer(svg,'pointermove',{clientX:400,clientY:100});
  expect(pathChange).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();
  expect(preview.mock.calls.at(-1)[0].keys.find(key=>key.id==='x1').spatialCurve[0]).toBe(30);
  pointer(svg,'pointerup');expect(pathChange).toHaveBeenCalledTimes(1);
  expect(pathChange).toHaveBeenLastCalledWith(2,{handle:0,position:{time:0,x:40,y:20}});
  pathChange.mockClear();pointer(handle,'pointerdown',{clientX:300,clientY:50});pointer(svg,'pointermove',{clientX:500,clientY:150});
  fireEvent.keyDown(handle,{key:'Escape'});pointer(svg,'pointerup');expect(pathChange).not.toHaveBeenCalled();
  expect(preview).toHaveBeenLastCalledWith(null);
  fireEvent.keyDown(handle,{key:'ArrowDown',shiftKey:true});expect(pathChange).toHaveBeenLastCalledWith(2,{handle:0,position:{time:0,x:30,y:11}});
  pointer(handle,'pointerdown',{clientX:300,clientY:50});pointer(svg,'pointermove',{clientX:400,clientY:100});
  rerender(<StudioMotionPathEditor {...props} keyframes={curved} locked/>);pathChange.mockClear();
  expect(preview).toHaveBeenLastCalledWith(null);pointer(svg,'pointerup');expect(pathChange).not.toHaveBeenCalled();
  fireEvent.keyDown(handle,{key:'ArrowRight'});expect(pathChange).not.toHaveBeenCalled();
  expect(screen.getByRole('button',{name:'Straighten path'})).toBeDisabled();
});

test('keyboard spatial nudges stop at the same offset bounds as pointer gestures',()=>{
  const change=jest.fn(),curved=editStudioSpatialPath(keys,'art',2,{handle:0,position:{x:210,y:-180}});
  render(<StudioMotionPathEditor target={{id:'art'}} keyframes={curved} time={1}
    onPathChange={change} onSeek={jest.fn()} onCommit={jest.fn()}/>);
  const handle=screen.getByRole('button',{name:'Outgoing path handle at 0.000 seconds'});
  fireEvent.keyDown(handle,{key:'ArrowRight',shiftKey:true});
  expect(change).toHaveBeenLastCalledWith(2,{handle:0,position:{time:0,x:210,y:-180}});
  fireEvent.keyDown(handle,{key:'ArrowUp'});
  expect(change).toHaveBeenLastCalledWith(2,{handle:0,position:{time:0,x:210,y:-180}});
});
