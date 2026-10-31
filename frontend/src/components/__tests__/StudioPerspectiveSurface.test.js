import React from 'react';
import { render, screen } from '@testing-library/react';
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
