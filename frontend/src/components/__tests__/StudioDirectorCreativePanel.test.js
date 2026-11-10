import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StudioDirectorCreativePanel from '../StudioDirectorCreativePanel';
import { studioCreativePlannerStatus, requestStudioCreativePlan } from '../studioDirectorCreativeClient';
import { measureDirectorSources } from '../studioDirectorComposition';
import { getAuth } from 'firebase/auth';

jest.mock('../studioDirectorComposition', () => ({
  ...jest.requireActual('../studioDirectorComposition'),
  measureDirectorSources: jest.fn(async context => ({
    ...context,
    pixelEvidence: context.media.map(m => ({
      id: m.id,
      contentHash: m.contentHash,
      method: 'decoded_rgb_96x54_three_samples_v1',
      samples: [1, 4, 7].map(time => ({
        time,
        meanRgb: [108, 92, 74],
        luma: 95,
        tonalEntropy: 2.9,
        frameDifference: 22,
        motionCentroid: [52, 46],
      })),
    })),
  })),
}));
jest.mock('../studioDirectorCreativeClient', () => ({
  studioCreativePlannerStatus: jest.fn(),
  requestStudioCreativePlan: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ getAuth: jest.fn() }));

const state = () => ({
  studioDocument: {
    projectId: 'project',
    revision: 2,
    outputTimeMap: [{ outputRange: { endTick: 1080000 } }],
  },
  projectMedia: [
    {
      id: 'city',
      name: 'City.mp4',
      duration: 15,
      status: 'ready',
      storagePath: 'owned/source',
      contentHash: 'a'.repeat(64),
      url: 'http://localhost/source.mp4',
    },
  ],
});

const proposal = () => ({
  version: 1,
  projectId: 'project',
  baseRevision: 2,
  brief: 'Make it move.',
  duration: 12,
  sourceEvidence: [{ id: 'city', contentHash: 'a'.repeat(64) }],
  fingerprint: 'a'.repeat(64),
  provenance: { automaticModelPlanning: true },
  storyboard: {
    name: 'Motion study',
    shots: [
      {
        sourceMediaId: 'city',
        sourceStart: 0,
        duration: 12,
        treatment: 'time_weave',
        reason: 'Build a visual rhythm.',
      },
    ],
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  measureDirectorSources.mockImplementation(async context => ({
    ...context,
    pixelEvidence: context.media.map(m => ({
      id: m.id,
      contentHash: m.contentHash,
      method: 'decoded_rgb_96x54_three_samples_v1',
      samples: [1, 4, 7].map(time => ({
        time,
        meanRgb: [108, 92, 74],
        luma: 95,
        tonalEntropy: 2.9,
        frameDifference: 22,
        motionCentroid: [52, 46],
      })),
    })),
  }));
  getAuth.mockReturnValue({ currentUser: { uid: 'owner', getIdToken: async () => 'emulator-token' } });
  studioCreativePlannerStatus.mockResolvedValue({ available: true });
  requestStudioCreativePlan.mockResolvedValue(proposal());
});

async function prepare() {
  fireEvent.change(screen.getByLabelText('Director creative brief'), {
    target: { value: 'Make it move.' },
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create my motion edit' }).disabled).toBe(false)
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create my motion edit' }));
}

test('brief creates a reviewable storyboard and only explicit Apply changes the ordinary editor', async () => {
  const getSnapshot = jest.fn(state);
  const onApply = jest.fn().mockResolvedValue();
  render(<StudioDirectorCreativePanel getSnapshot={getSnapshot} onApply={onApply} />);
  expect(getSnapshot).not.toHaveBeenCalled();
  await prepare();
  await screen.findByRole('button', { name: 'Apply Director edit' });
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Director storyboard').textContent).toMatch(/City.mp4/);
  fireEvent.click(screen.getByRole('button', { name: 'Apply Director edit' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  expect(onApply.mock.calls[0][0].actions.filter(a => a.type === 'media_plane')).toHaveLength(6);
});

test('Discard preserves the timeline', async () => {
  const onApply = jest.fn();
  render(<StudioDirectorCreativePanel getSnapshot={state} onApply={onApply} />);
  await prepare();
  await screen.findByRole('button', { name: 'Discard plan' });
  fireEvent.click(screen.getByRole('button', { name: 'Discard plan' }));
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Apply Director edit' })).toBeNull();
});

test('a changed revision or sign-in refuses Apply', async () => {
  const current = state();
  const onApply = jest.fn();
  render(<StudioDirectorCreativePanel getSnapshot={() => current} onApply={onApply} />);
  await prepare();
  await screen.findByRole('button', { name: 'Apply Director edit' });
  current.studioDocument.revision = 3;
  fireEvent.click(screen.getByRole('button', { name: 'Apply Director edit' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/project changed/));
  expect(onApply).not.toHaveBeenCalled();
});

test('an unavailable planner does not pretend to plan or silently fall back to a recipe', async () => {
  studioCreativePlannerStatus.mockResolvedValue({ available: false });
  render(<StudioDirectorCreativePanel getSnapshot={state} onApply={jest.fn()} />);
  await screen.findByText('Director planning is not enabled in this environment.');
  expect(screen.getByRole('button', { name: 'Create my motion edit' }).disabled).toBe(true);
  expect(requestStudioCreativePlan).not.toHaveBeenCalled();
});

test('changing the signed-in owner after review refuses Apply', async () => {
  const onApply = jest.fn();
  render(<StudioDirectorCreativePanel getSnapshot={state} onApply={onApply} />);
  await prepare();
  await screen.findByRole('button', { name: 'Apply Director edit' });
  getAuth.mockReturnValue({
    currentUser: { uid: 'different-owner', getIdToken: async () => 'different' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Apply Director edit' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/sign-in changed/));
  expect(onApply).not.toHaveBeenCalled();
});

test('Choreograph Source-Bound Cinema Graph builds Null Rigs, Track Mattes, Motion Drivers, animated mask keys and 3D LUT Color Grade from measured clip telemetry', async () => {
  const onApply = jest.fn().mockResolvedValue();
  render(<StudioDirectorCreativePanel getSnapshot={state} onApply={onApply} />);
  fireEvent.change(screen.getByLabelText('Director creative brief'), {
    target: { value: 'Neon cyberpunk portal with whip pan and beat grade pulses' },
  });
  fireEvent.change(screen.getByTestId('director-look-select'), {
    target: { value: 'neon_cyber' },
  });
  fireEvent.click(screen.getByTestId('director-choreograph-btn'));
  await screen.findByRole('button', { name: 'Apply Director edit' });
  const topology = screen.getByTestId('director-topology-summary');
  expect(topology.textContent).toMatch(/Rigs: 1/);
  expect(topology.textContent).toMatch(/Mattes: 1/);
  expect(topology.textContent).toMatch(/Drivers: 2/);
  expect(topology.textContent).toMatch(/Look: Neon Cyberpunk/);
  fireEvent.click(screen.getByRole('button', { name: 'Apply Director edit' }));
  await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  const appliedPlan = onApply.mock.calls[0][0];
  expect(appliedPlan.actions.some(a => a.type === 'null' && a.motionDrivers)).toBe(true);
  expect(appliedPlan.actions.some(a => a.type === 'finish_grade')).toBe(true);
});
