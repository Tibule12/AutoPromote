import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StudioMotionPathEditor from '../StudioMotionPathEditor';
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
