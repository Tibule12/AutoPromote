import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { studioLayerEntries, moveStudioLayer, orderStudioCollection } from '../studioLayerOrder';
import StudioLayerStack from '../StudioLayerStack';
import { adaptStudioSnapshotToDocument, projectStudioEditableStateToSnapshot, reconcileStudioDocument } from '../studioProjectDocument';
import { compileStudioCompositionForRender } from '../studioRenderCompiler';

const snapshot = () => ({
  orderedClips: [{ id: 'source', start: 0, end: 3 }], selectedClipId: 'source',
  timeline: [{ id: 'main', sourceClipId: 'source', startRequest: 0, endRequest: 3 }],
  overlays: [{ id: 'image', type: 'image', name: 'Artwork', src: 'https://example.com/a.png' },
    { id: 'words', type: 'text', text: 'Words' }],
  motionScenes: [{ id: 'motion', text: 'Motion', preset: 'title', startTime: 0, duration: 3 }],
  threeDScenes: [{ id: 'depth', text: 'Depth', hqPreviewJobId: 'owned-job', hqPreviewRevision: 'owned-revision', startTime: 0, duration: 3 }],
});

test('canonical cross-family order owns cold projection and render independently of stale transport order', () => {
  const state = { ...snapshot(), compositionOrder: ['depth', 'image', 'motion', 'words'] };
  const document = adaptStudioSnapshotToDocument({ projectId: 'ordered', snapshot: state });
  expect(document.layers.map(layer => layer.layerId)).toEqual(state.compositionOrder);
  const reopened = projectStudioEditableStateToSnapshot(JSON.parse(JSON.stringify(document)), { ...snapshot(), compositionOrder: ['words'] });
  expect(reopened.compositionOrder).toEqual(state.compositionOrder);
  expect(reopened.overlays[0].src).toBe(state.overlays[0].src);
  expect(reopened.threeDScenes[0]).toMatchObject({ hqPreviewJobId: 'owned-job', hqPreviewRevision: 'owned-revision' });
  expect(compileStudioCompositionForRender(document).order).toEqual(state.compositionOrder);
});

test('older projects retain batched rendering and their unchanged canonical document', () => {
  const state = snapshot();
  const document = adaptStudioSnapshotToDocument({ projectId: 'legacy', snapshot: state });
  const reopened = projectStudioEditableStateToSnapshot(document, { ...state, compositionOrder: ['words'] });
  expect(reopened.compositionOrder).toBeUndefined();
  expect(compileStudioCompositionForRender(document).order).toBeUndefined();
  expect(reconcileStudioDocument({ projectId: 'legacy', snapshot: reopened, storedDocument: document })).toEqual(document);
});

test('new and deleted layers reconcile without losing active layers or accepting duplicate order IDs', () => {
  const state = snapshot(); state.overlays.push({ id: 'new', type: 'image' });
  expect(studioLayerEntries(state, ['deleted', 'words', 'motion', 'image', 'depth']).map(e => e.id))
    .toEqual(['words', 'motion', 'image', 'depth', 'new']);
  expect(() => studioLayerEntries(state, ['image', 'image'])).toThrow(/unique/);
  expect(orderStudioCollection([{ id: 'image' }, { id: 'caption', isCaption: true }, { id: 'words' }], ['words', 'image']))
    .toEqual([{ id: 'words' }, { id: 'caption', isCaption: true }, { id: 'image' }]);
});

test('stack controls cross media families and stop at the real front/back boundaries', () => {
  const entries = studioLayerEntries(snapshot());
  const move = jest.fn(); render(<StudioLayerStack entries={entries} onMove={move} />);
  expect(screen.getByRole('button', { name: 'Bring Depth forward' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Send Artwork backward' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Send Motion backward' }));
  expect(move).toHaveBeenCalledWith('motion', 'backward');
  expect(moveStudioLayer(entries, 'motion', 'backward')).toEqual(['image', 'motion', 'words', 'depth']);
});

test('a disabled 3D scene retains its editable place while the render names only enabled 3D assets', () => {
  const state = snapshot(); state.threeDScenes[0].enabled = false;
  state.compositionOrder = ['depth', 'motion', 'image', 'words'];
  const document = adaptStudioSnapshotToDocument({ projectId: 'disabled-depth', snapshot: state });
  expect(document.layers[0].layerId).toBe('depth');
  expect(compileStudioCompositionForRender(document).order).toEqual(['motion', 'image', 'words']);
});
