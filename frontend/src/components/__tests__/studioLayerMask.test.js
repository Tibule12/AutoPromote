import { hasSoftStudioMask, studioLayerMaskSvg } from '../studioMaskGeometry';

test('ellipse feather uses programme pixels and keeps the crop precedence', () => {
  const svg = studioLayerMaskSvg({ enabled: true, shape: 'ellipse', feather: 20 }, 40, 40, 200, 100, .5);
  expect(svg).toContain('stdDeviation="10"');
  expect(svg).toContain('rx="96" ry="48"');
  expect(svg).not.toContain('mask="url(#region)"');
});
test('inverted polygon complements alpha with bounded geometry', () => {
  const svg = studioLayerMaskSvg({ enabled: true, shape: 'polygon', inverted: true }, 0, 0, 200, 100);
  expect(svg).toContain('100,0 200,38 164,100 36,100 0,38');
  expect(svg).toContain('slope="-1" intercept="1"');
  expect(svg).not.toContain('mask-type:luminance');
  expect(() => studioLayerMaskSvg({ enabled: true, shape: 'polygon', path: 'polygon(<script>)' }, 0, 0, 100, 100)).toThrow(/polygon/);
});
test('ordinary and disabled masks retain the existing hard clip path', () => {
  expect(hasSoftStudioMask({ enabled: false, inverted: true, feather: 30 })).toBe(false);
  expect(hasSoftStudioMask({ enabled: true, feather: 0, inverted: false })).toBe(false);
  expect(hasSoftStudioMask({ enabled: true, inverted: true })).toBe(true);
  expect(studioLayerMaskSvg({ enabled: false }, 0, 0, 100, 100)).toBeNull();
});
