import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudioSubjectEchoControls from '../StudioSubjectEchoControls';
import { buildStudioSubjectEchoPlan } from '../studioSubjectEcho';
jest.mock('../studioSubjectEcho', () => ({ buildStudioSubjectEchoPlan: jest.fn(() => ({ format: 'scene' })) }));
const media = ['footage', 'matte'].map(id => ({ id, name: id, status: 'ready', duration: 8, url: 'http://localhost/' + id, storagePath: 'owned/' + id }));
test('ordinary controls pass the chosen source, matching matte, playhead and dimensions to one undoable apply', async () => {
  const onApply = jest.fn().mockResolvedValue(), snapshot = {};
  render(<StudioSubjectEchoControls projectMedia={media} getSnapshot={() => snapshot} getSize={() => ({ width: 720, height: 1280 })} time={2} onApply={onApply} />);
  fireEvent.click(screen.getByText('Subject echoes & light arcs'));
  expect(screen.getByRole('button', { name: 'Apply subject echoes' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Subject footage'), { target: { value: 'footage' } });
  fireEvent.change(screen.getByLabelText('Matching subject matte'), { target: { value: 'matte' } });
  fireEvent.change(screen.getByLabelText('Echo appearance'), { target: { value: 'chroma' } });
  fireEvent.change(screen.getByLabelText('Delay per copy (s)'), { target: { value: '.2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply subject echoes' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  expect(buildStudioSubjectEchoPlan).toHaveBeenCalledWith(snapshot, expect.objectContaining({ sourceMediaId: 'footage', matteMediaId: 'matte', mode: 'chroma', delay: .2, startTime: 2, width: 720, height: 1280 }));
  expect(await screen.findByRole('status')).toHaveTextContent('Subject echoes applied');
});
test('track locks prevent building and applying an effect', () => {
  render(<StudioSubjectEchoControls locked projectMedia={media} getSnapshot={jest.fn()} getSize={jest.fn()} onApply={jest.fn()} />);
  fireEvent.click(screen.getByText('Subject echoes & light arcs'));
  expect(screen.getByLabelText('Subject footage')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Apply subject echoes' })).toBeDisabled();
});
