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
  expect(changed.mock.results[0].value).toBeCloseTo(position.outputTime + 1/24, 10);
  fireEvent.keyDown(input, { key: 'ArrowLeft' });
  expect(changed.mock.results[1].value).toBeCloseTo(position.outputTime, 10);
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
