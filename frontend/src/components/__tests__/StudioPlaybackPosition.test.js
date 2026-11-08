import React, { useRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StudioPlaybackTime, StudioPlaybackRange, StudioTimelinePosition,
  useStudioPlayheadDisplay } from '../StudioPlaybackPosition';

test('clock subscribers update the position, readout and all lane markers without rendering their parent', () => {
  let position = { programmeTime: 0, outputTime: 0 };
  const listeners = new Set();
  const clock = { getSnapshot: () => position,
    subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); } };
  const parentRender = jest.fn();
  function Editor() {
    parentRender(); const ref = useRef(null); useStudioPlayheadDisplay(ref, clock, 8);
    return <div ref={ref} data-testid="timeline">
      <StudioPlaybackTime clock={clock} format={time => time.toFixed(3)} data-testid="time" />
      <StudioPlaybackRange clock={clock} aria-label="Position" type="range" min={0} max={4} step="any" onChange={() => {}} />
      <StudioTimelinePosition clock={clock} displayRate={2} framingItems={[]} format={time => time.toFixed(3)} />
      <b className="pro-playhead" style={{ left: 'var(--studio-playhead-position, 0%)' }} />
    </div>;
  }
  const view = render(<Editor />);
  act(() => { position = { programmeTime: 5.375, outputTime: 2.6875 }; listeners.forEach(cb => cb()); });
  expect(screen.getByTestId('time')).toHaveTextContent('2.688');
  expect(screen.getByLabelText('Position')).toHaveValue('2.6875');
  expect(screen.getByTestId('pro-current-edit')).toHaveTextContent('2.688');
  expect(screen.getByTestId('timeline').querySelector('.pro-playhead').style.left).toBe('67.1875%');
  expect(screen.getByTestId('timeline').style.getPropertyValue('--studio-playhead-position')).toBe('');
  expect(parentRender).toHaveBeenCalledTimes(1);
  view.unmount(); expect(listeners.size).toBe(0);
});

test('the displayed output position stays continuous while arrow keys retain frame steps', () => {
  const position = { programmeTime: 1.126667, outputTime: 1.126667 };
  const clock = { getSnapshot: () => position, subscribe: () => () => {} };
  const changed = jest.fn(event => Number(event.currentTarget.value));
  render(<StudioPlaybackRange clock={clock} aria-label="Clock position" type="range" min={0} max={8} step={1/24} onChange={changed} />);
  const input = screen.getByLabelText('Clock position');
  expect(input).toHaveAttribute('step', 'any');
  expect(input).toHaveValue('1.126667');
  fireEvent.keyDown(input, { key: 'ArrowRight' });
  expect(changed.mock.results[0].value).toBeCloseTo(28/24, 10);
  fireEvent.keyDown(input, { key: 'ArrowLeft' });
  expect(changed.mock.results[1].value).toBeCloseTo(27/24, 10);
});

test('frame steps after a fractional source cut retain the global delivery phase', () => {
  const clock = { getSnapshot: () => ({ programmeTime: 4.7, outputTime: 4.7 }), subscribe: () => () => {} };
  const changed = jest.fn(event => Number(event.currentTarget.value));
  render(<StudioPlaybackRange clock={clock} aria-label="Fractional cut" type="range"
    min={0} max={12} step={1/24} onChange={changed} />);
  const input = screen.getByLabelText('Fractional cut');
  for (let i = 0; i < 13; i++) fireEvent.keyDown(input, { key: 'ArrowRight' });
  expect(changed.mock.results[0].value).toBeCloseTo(113/24, 10);
  expect(changed.mock.results.at(-1).value).toBeCloseTo(125/24, 10);
  fireEvent.keyDown(input, { key: 'ArrowLeft' });
  expect(changed.mock.results.at(-1).value).toBeCloseTo(124/24, 10);
});

test('a fractional cut is not an acknowledgement of the next requested output frame', () => {
  let position={programmeTime:4.7,outputTime:4.7};const listeners=new Set();
  const clock={getSnapshot:()=>position,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const changed=jest.fn(event=>Number(event.currentTarget.value));
  render(<StudioPlaybackRange clock={clock} aria-label="Cut acknowledgement" type="range"
    min={0} max={12} step={1/24} onChange={changed} />);
  const input=screen.getByLabelText('Cut acknowledgement');
  fireEvent.keyDown(input,{key:'ArrowRight'});
  act(()=>{listeners.forEach(fn=>fn());});
  expect(input).toHaveValue(String(113/24));
  fireEvent.keyDown(input,{key:'ArrowRight'});
  expect(changed.mock.results.at(-1).value).toBeCloseTo(114/24,10);
  act(()=>{position={programmeTime:4.75,outputTime:4.75};listeners.forEach(fn=>fn());});
  expect(input).toHaveValue('4.75');
});

test('stepping backwards from a finished-frame interior selects the preceding picture',()=>{
  const clock={getSnapshot:()=>({programmeTime:125/24+1/90000,outputTime:125/24+1/90000}),subscribe:()=>()=>{}};
  const changed=jest.fn(e=>Number(e.currentTarget.value));
  render(<StudioPlaybackRange clock={clock} aria-label="Finished frame step" type="range" min={0} max={12} step={1/24} onChange={changed} />);
  fireEvent.keyDown(screen.getByLabelText('Finished frame step'),{key:'ArrowLeft'});
  expect(changed.mock.results.at(-1).value).toBeCloseTo(124/24,10);
});

test('native pointer and Home/End range input still seeks after imperative clock paints', () => {
  let position = { programmeTime: 1, outputTime: 1 };
  const listeners = new Set();
  const clock = { getSnapshot: () => position,
    subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); } };
  const changed = jest.fn(event => Number(event.currentTarget.value));
  render(<StudioPlaybackRange clock={clock} aria-label="Seek position" type="range"
    min={0} max={8} step={1/24} onChange={changed} />);
  const input = screen.getByLabelText('Seek position');
  act(() => { position = { programmeTime: 1.25, outputTime: 1.25 }; listeners.forEach(cb => cb()); });
  // Browsers and Playwright's native range path set .value before input. That
  // also updates React's tracker, so a synthetic onChange alone misses this.
  for (const value of ['2.5', '0', '8']) {
    input.value = value;
    fireEvent.input(input);
    fireEvent.change(input);
  }
  expect(changed.mock.results.map(result => result.value)).toEqual([2.5, 0, 8]);
  fireEvent.change(input, { target: { value: '4' } });
  expect(changed.mock.results.map(result => result.value)).toEqual([2.5, 0, 8, 4]);
});

test('a clock repaint between native input and change cannot seek back to the preceding frame', () => {
  let position = { programmeTime: 1, outputTime: 1 };
  const listeners = new Set();
  const clock = { getSnapshot: () => position,
    subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); } };
  const changed = jest.fn(event => Number(event.currentTarget.value));
  const view = render(<StudioPlaybackRange clock={clock} aria-label="Painted seek" type="range"
    min={0} max={8} step={1/24} onChange={changed} />);
  const input = screen.getByLabelText('Painted seek');
  fireEvent.input(input, { target: { value: '2.5' } });
  act(() => { position = { programmeTime: .75, outputTime: .75 }; listeners.forEach(cb => cb()); });
  fireEvent.change(input);
  expect(changed.mock.results.map(result => result.value)).toEqual([2.5]);
  fireEvent.change(input, { target: { value: '4' } });
  expect(changed.mock.results.map(result => result.value)).toEqual([2.5, 4]);
  view.unmount();
  fireEvent.input(input, { target: { value: '6' } });
  expect(changed).toHaveBeenCalledTimes(2);
});


test('rapid frame keys keep the latest user seek while stale decoder paints arrive', () => {
  let position = { programmeTime: 0, outputTime: 0 };
  const listeners = new Set();
  const clock = { getSnapshot: () => position, subscribe: cb => { listeners.add(cb); return () => listeners.delete(cb); } };
  const changed = jest.fn(event => Number(event.currentTarget.value));
  render(<StudioPlaybackRange clock={clock} aria-label="Rapid steps" type="range" min={0} max={12} step={1/30} onChange={changed} />);
  const input = screen.getByLabelText('Rapid steps');
  for (let i = 0; i < 24; i++) {
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    act(() => { position = { programmeTime: .01 * i, outputTime: .01 * i }; listeners.forEach(cb => cb()); });
  }
  expect(changed.mock.results.at(-1).value).toBeCloseTo(.8, 10);
  act(() => { position = { programmeTime: .8, outputTime: .8 }; listeners.forEach(cb => cb()); });
  expect(input).toHaveValue('0.8');
  fireEvent.blur(input);
  act(() => { position = { programmeTime: 2, outputTime: 2 }; listeners.forEach(cb => cb()); });
  expect(input).toHaveValue('2');
});

test('a Home seek cannot freeze the thumb after verified playback passes its exact target', () => {
  let position = { programmeTime: 4, outputTime: 4 }, advancing = false;
  const listeners = new Set();
  const clock = { getSnapshot: () => position, isAdvancing: () => advancing,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  render(<StudioPlaybackRange clock={clock} aria-label="Resumed seek" type="range"
    min={0} max={12} step={1/30} onChange={() => {}} />);
  const input = screen.getByLabelText('Resumed seek');
  fireEvent.input(input, { target: { value: '0' } });
  act(() => { listeners.forEach(listener => listener()); });
  expect(input).toHaveValue('0'); // Previous frame during the pending seek.
  act(() => { advancing = true; position = { programmeTime: .08, outputTime: .08 }; listeners.forEach(listener => listener()); });
  expect(input).toHaveValue('0.08');
  act(() => { position = { programmeTime: 4.5, outputTime: 4.5 }; listeners.forEach(listener => listener()); });
  expect(input).toHaveValue('4.5');
});
