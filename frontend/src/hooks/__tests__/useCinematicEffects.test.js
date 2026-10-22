import { act, renderHook } from '@testing-library/react';
import useCinematicEffects from '../useCinematicEffects';

describe('Finish Rack programme clock', () => {
  let callbacks, previousRaf, previousCancel;
  beforeEach(() => {
    callbacks = [];
    previousRaf = window.requestAnimationFrame;
    previousCancel = window.cancelAnimationFrame;
    window.requestAnimationFrame = callback => { callbacks.push(callback); return callbacks.length; };
    window.cancelAnimationFrame = jest.fn();
  });
  afterEach(() => {
    window.requestAnimationFrame = previousRaf;
    window.cancelAnimationFrame = previousCancel;
  });
  const tick = () => act(() => { const callback = callbacks.shift(); expect(callback).toBeDefined(); callback(); });

  test('paused cuts use the programme clock while the old decoder remains at zero', () => {
    const clockRef = { current: { currentTime: 18, duration: 20 } };
    const { result } = renderHook(() => useCinematicEffects({ clockRef }));
    act(() => {
      result.current.attachVideo({ currentTime: 0, duration: 12 });
      result.current.replaceFx({ fadeIn: .08, fadeOut: 1, blur: 6, blurMode: 'edge', blurStart: 1, blurEnd: 2 });
    });
    tick();
    expect(result.current.fadeStyle).toBeNull();
    expect(result.current.edgeBlurStyle).toBeNull();
    clockRef.current = { currentTime: 1.5, duration: 20 };
    tick();
    expect(result.current.fadeStyle).toBeNull();
    expect(result.current.edgeBlurStyle).not.toBeNull();
    clockRef.current = { currentTime: 19.5, duration: 20 };
    tick();
    expect(result.current.fadeStyle.opacity).toBeCloseTo(.5);
    clockRef.current = { currentTime: 0, duration: 20 };
    tick();
    expect(result.current.fadeStyle.opacity).toBe(1);
  });

  test('other editors retain their attached native video clock', () => {
    const video = { currentTime: .04, duration: 12 };
    const { result } = renderHook(() => useCinematicEffects());
    act(() => { result.current.attachVideo(video); result.current.updateFx('fadeIn', .08); });
    tick();
    expect(result.current.fadeStyle.opacity).toBeCloseTo(.5);
    video.currentTime = 5;
    tick();
    expect(result.current.fadeStyle).toBeNull();
  });
});
