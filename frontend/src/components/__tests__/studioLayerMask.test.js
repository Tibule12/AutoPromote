import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { hasSoftStudioMask, studioLayerMaskSvg } from '../studioMaskGeometry';
import StudioMaskPathEditor from '../StudioMaskPathEditor';

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

test('square rectangle corners preserve an explicit zero radius', () => {
  expect(studioLayerMaskSvg({ enabled: true, shape: 'rectangle', radius: 0, feather: 8 }, 0, 0, 200, 100))
    .toContain('rx="0" ry="0"');
});

test('polygon authoring retains the saved graph during incomplete typing and commits one valid path', () => {
  const update = jest.fn();
  function Editor() {
    const [mask, setMask] = React.useState({ enabled: true, shape: 'polygon', feather: 12, inverted: true });
    return <StudioMaskPathEditor mask={mask} onChange={next => { update(next); setMask(next); }} />;
  }
  render(<Editor />);
  const input = screen.getByLabelText('Mask polygon path');
  const saved = input.value;
  fireEvent.change(input, { target: { value: 'polygon(10% 20%)' } });
  expect(update).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByRole('alert')).toHaveTextContent('3 to 64');
  expect(update).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue(saved);
  const path = 'polygon(5% 10%, 95% 25%, 40% 90%)';
  fireEvent.change(input, { target: { value: path } });
  fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.blur(input);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith({ enabled: true, shape: 'polygon', feather: 12, inverted: true, path });
  expect(studioLayerMaskSvg(update.mock.calls[0][0], 0, 0, 200, 100)).toContain('10,10 190,25 80,90');
});
