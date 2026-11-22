import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StudioStripTransitionPanel from '../StudioStripTransitionPanel';
import { adaptStudioSnapshotToDocument } from '../studioProjectDocument';

const snapshot = () => {
  const s = { timeline: [{ id: 'clip', startRequest: 0, endRequest: 12 }], orderedClips: [{ id: 'clip', start: 0, end: 12 }], overlays: [],
    projectMedia: [{ id: 'saved', name: 'Fashion.mp4', duration: 12, status: 'ready', url: 'http://localhost/video', storagePath: 'owned/video', contentHash: 'a'.repeat(64) }] };
  s.studioDocument = adaptStudioSnapshotToDocument({ projectId: 'panel-project', snapshot: s });
  return s;
};
test('legacy saved video, same-source moments and precise duration reach the shared scene operation', async () => {
  const state = snapshot(), onApply = jest.fn().mockResolvedValue(undefined);
  render(<StudioStripTransitionPanel getSnapshot={() => state} projectMedia={state.projectMedia} time={1} onApply={onApply} />);
  fireEvent.change(screen.getByLabelText('Outgoing footage'), { target: { value: 'saved' } });
  fireEvent.change(screen.getByLabelText('Incoming footage'), { target: { value: 'saved' } });
  fireEvent.change(screen.getByLabelText('Incoming source start (s)'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Transition duration (s)'), { target: { value: '1.75' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add editable strip transition' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  const plan = onApply.mock.calls[0][0];
  expect(plan.actions.find(a => a.id === 'strip_incoming_full').sourceStart).toBe(6.75);
  expect(plan.actions.find(a => a.id === 'strip_outgoing').startTime).toBe(1);
});
test('track locks disable the complete transition operation', () => {
  const state = snapshot();
  render(<StudioStripTransitionPanel getSnapshot={() => state} projectMedia={state.projectMedia} time={0} onApply={jest.fn()} locked />);
  expect(screen.getByLabelText('Outgoing footage')).toBeDisabled();
  expect(screen.getByLabelText('Transition duration (s)')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add editable strip transition' })).toBeDisabled();
});
