import React from 'react';
import { act, render, screen } from '@testing-library/react';
import StudioPerspectiveSurface from '../StudioPerspectiveSurface';
import { PERSPECTIVE_LEFT, perspectiveCssMatrix } from '../studioPerspective';

test('the plane uses composition progress without starting another clock or mutating its parent', () => {
  const value = { version: 1, corners: PERSPECTIVE_LEFT };
  const view = render(<div data-testid="parent" style={{ left: '20%' }}>
    <StudioPerspectiveSurface value={value} progress={0}>picture</StudioPerspectiveSurface></div>);
  expect(screen.getByTestId('studio-perspective-surface').style.transform).toBe(perspectiveCssMatrix(value, 0, 1, 1));
  view.rerender(<div data-testid="parent" style={{ left: '20%' }}>
    <StudioPerspectiveSurface value={value} progress={50}>picture</StudioPerspectiveSurface></div>);
  expect(screen.getByTestId('studio-perspective-surface').style.transform).toBe(perspectiveCssMatrix(value, 50, 1, 1));
  expect(screen.getByTestId('parent').style.left).toBe('20%');
  view.rerender(<StudioPerspectiveSurface>legacy picture</StudioPerspectiveSurface>);
  expect(screen.queryByTestId('studio-perspective-surface')).toBeNull();
  expect(screen.getByText('legacy picture')).toBeTruthy();
});

test('the default native plane keeps its decoded clock and rebinds when the programme decoder changes', () => {
  const decoder = () => {
    const video = document.createElement('video'); let callback;
    for (const [name, value] of Object.entries({ paused: false, ended: false, seeking: false, readyState: 4, currentTime: 0 }))
      Object.defineProperty(video, name, { value, writable: true, configurable: true });
    video.requestVideoFrameCallback = jest.fn(fn => { callback = fn; return 1; });
    video.cancelVideoFrameCallback = jest.fn();
    video.frame = time => callback(0, { mediaTime: time });
    return video;
  };
  const first = decoder(), second = decoder(), clockRef = { current: first };
  const layer = { type: 'video', startTime: 1, duration: 2, perspective: { version: 1, corners: PERSPECTIVE_LEFT } };
  const props = { value: layer.perspective, progress: 100, clockRef, mapTime: time => time, layer, keyframes: [] };
  const view = render(<div data-testid="parent"><StudioPerspectiveSurface {...props}>picture</StudioPerspectiveSurface></div>);
  expect(screen.getByTestId('parent').style.visibility).toBe('hidden');
  act(() => first.frame(2)); expect(screen.getByTestId('parent').style.visibility).toBe('visible');
  clockRef.current = second;
  view.rerender(<div data-testid="parent"><StudioPerspectiveSurface {...props}>picture</StudioPerspectiveSurface></div>);
  expect(first.cancelVideoFrameCallback).toHaveBeenCalled();
  act(() => second.frame(3.1)); expect(screen.getByTestId('parent').style.visibility).toBe('hidden');
  view.unmount(); expect(second.cancelVideoFrameCallback).toHaveBeenCalled();
});
