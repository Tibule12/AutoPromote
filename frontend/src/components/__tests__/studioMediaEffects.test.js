import { studioMediaEffectFilter } from '../studioMediaEffects';

test.each(['image', 'video'])('%s effect lengths use the same programme-height scale as the native compositor', type => {
  const filter = studioMediaEffectFilter({ type, layerShadow: { enabled: true, x: 0, y: 10, blur: 24, opacity: .45 },
    glow: { enabled: true, radius: 12, intensity: .2 }, blur: 3 });
  expect(filter).toContain('0px calc(10px * var(--title-preview-scale, 1)) calc(24px * var(--title-preview-scale, 1))');
  expect(filter).toContain('calc(12px * var(--title-preview-scale, 1))');
  expect(filter).toContain('blur(calc(3px * var(--title-preview-scale, 1)))');
});

test('absent effects and zero-sized shadows retain their original meaning', () => {
  expect(studioMediaEffectFilter({ type: 'video' })).toBe('none');
  expect(studioMediaEffectFilter({ type: 'video', layerShadow: { enabled: true, x: 0, y: 0, blur: 0, opacity: 0 } }))
    .toContain('drop-shadow(0px 0px 0px');
});
