import React from 'react';
import { act, render, screen } from '@testing-library/react';
import StudioProgrammeFrame from '../StudioProgrammeFrame';
import StudioPerspectiveSurface from '../StudioPerspectiveSurface';
import StudioGroupPreview from '../StudioGroupPreview';
import { buildMotionAutomationStyle } from '../studioAutomation';
import { PERSPECTIVE_LEFT, perspectiveCssMatrix } from '../studioPerspective';
import { watchStudioProgrammeFrames } from '../studioSourcePreview';

function decoder() {
  const video = document.createElement('video'), callbacks = new Map(); let id = 0;
  for (const [name, value] of Object.entries({ paused: false, ended: false, seeking: false, readyState: 4, currentTime: 0 }))
    Object.defineProperty(video, name, { value, writable: true, configurable: true });
  video.requestVideoFrameCallback = jest.fn(callback => { callbacks.set(++id, callback); return id; });
  video.cancelVideoFrameCallback = jest.fn(key => callbacks.delete(key));
  video.frame = (time, currentTime = time) => {
    video.currentTime = currentTime;
    const [key, callback] = callbacks.entries().next().value;
    callbacks.delete(key); callback(0, { mediaTime: time });
  };
  return video;
}

test('titles and projected media evaluate on the same presented picture between editor timeupdate events', () => {
  const video = decoder(), clockRef = { current: video }, picture = jest.fn();
  const stopPicture = watchStudioProgrammeFrames(video, picture);
  const value = { version: 1, corners: PERSPECTIVE_LEFT };
  const keys = [{ property: 'x', time: 0, value: 10 }, { property: 'x', time: 4, value: 90, easing: 'linear' },
    { property: 'perspectiveProgress', time: 0, value: 0 }, { property: 'perspectiveProgress', time: 4, value: 100, easing: 'linear' }];
  const layer = { id: 'title', type: 'image', perspective: value, startTime: 1, duration: 3 };
  const groups = [{ id: 'group', kind: 'graphic_group', layerIds: ['title'] }];
  const groupKeys = [{ targetId: 'group', property: 'x', time: 0, value: 0 },
    { targetId: 'group', property: 'x', time: 4, value: 20, easing: 'linear' }];
  const children = time => {
    const pose = buildMotionAutomationStyle(keys, time, { perspective: value });
    return <StudioGroupPreview compounds={groups} order={['title']} keyframes={groupKeys} time={time}>
      <div data-studio-layer-id="title" data-testid="title" data-time={time} style={{ left: `${pose.x}%` }}>
        <StudioPerspectiveSurface value={value} progress={pose.perspectiveProgress}>picture</StudioPerspectiveSurface>
      </div></StudioGroupPreview>;
  };
  const props = { clockRef, mapTime: t => t + 1, time: 0, layers: [layer], groups, keyframes: [...keys.map(key => ({ ...key, targetId: 'title' })), ...groupKeys] };
  const view = render(<StudioProgrammeFrame {...props}>{children}</StudioProgrammeFrame>);
  expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1);
  act(() => {
    video.frame(1, 1.2);
    // Must commit before the presented-frame callback returns, even while
    // React is batching an editor event. The previous deferred update lagged.
    expect(screen.getByTestId('title').dataset.programmeTime).toBe('2');
  });
  expect(picture).toHaveBeenLastCalledWith(1);
  expect(screen.getByTestId('title').dataset.programmeTime).toBe('2');
  expect(screen.getByTestId('title').style.left).toBe('50%');
  expect(JSON.parse(screen.getByTestId('title').parentElement.dataset.studioGroupPose).x).toBe(10);
  expect(screen.getByTestId('studio-perspective-surface').style.transform).toBe(perspectiveCssMatrix(value, 50, 1, 1));
  view.rerender(<StudioProgrammeFrame {...props} time={.5}>{children}</StudioProgrammeFrame>);
  expect(screen.getByTestId('title').dataset.programmeTime).toBe('2');
  view.unmount(); stopPicture();
  expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
});

test('normal pause, seek, play and ref promotion stop the former shot and rebind the next decoder', () => {
  const first = decoder(), second = decoder(), clockRef = { current: first };
  const children = () => <div data-testid="time" data-studio-layer-id="layer" />;
  const props = { clockRef, mapTime: time => time, time: 0, layers: [{ id: 'layer', type: 'text', startTime: 0, duration: 20 }] };
  const view = render(<StudioProgrammeFrame {...props}>{children}</StudioProgrammeFrame>);
  act(() => { first.paused = true; first.currentTime = 2; first.dispatchEvent(new Event('pause')); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('2');
  act(() => { first.currentTime = 3; first.dispatchEvent(new Event('seeked')); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('3');
  act(() => { first.paused = false; first.dispatchEvent(new Event('play')); first.frame(3.1); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('3.1');
  clockRef.current = second;
  view.rerender(<StudioProgrammeFrame {...props} mapTime={time => time + 4}>{children}</StudioProgrammeFrame>);
  act(() => second.frame(.5));
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('4.5');
  act(() => { first.currentTime = 9; first.dispatchEvent(new Event('seeked')); });
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('4.5');
  view.rerender(<StudioProgrammeFrame {...props} enabled={false}>{children}</StudioProgrammeFrame>);
  expect(screen.getByTestId('time').dataset.programmeTime).toBe('4.5');
  view.unmount(); expect(second.cancelVideoFrameCallback).toHaveBeenCalledTimes(1);
});
