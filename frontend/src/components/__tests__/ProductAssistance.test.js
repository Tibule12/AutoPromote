import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProductAssistance, { askProductAssistance, ProductAssistanceLauncher } from '../ProductAssistance';
import ProductHelpButton from '../ProductHelpButton';

const reply = (id = 'studio.keyframes', status = 'FUNCTIONAL') => ({
  answer: `${status}: scoped working path.`,
  features: [{ feature_id: id, name: 'Motion / Transform Keyframes', status, location: 'Studio → Motion', next_step: 'Select a layer.', how_to_use: ['Move the playhead.'], preview_behavior: 'Scoped preview', render_behavior: 'Existing render', limitations: ['Whole parity unqualified'], dependencies: [], common_errors: [] }],
  controls: [], tasks: [], documentation_gap: null,
  sources: { label: 'Based on AutoPromote documentation', knowledge_version: '1.0.0', product_version: '1.2.0', updated_at: '2026-10-13', documentation_url: '/api/product-assistance/docs/README.md' },
});
test('one icon launcher opens help and Escape restores keyboard focus', () => {
  render(<><ProductAssistanceLauncher className="topbar-icon-btn" /><ProductAssistance launcher={false} /></>);
  const launcher = screen.getByRole('button', { name: 'Ask AutoPromote' });
  expect(launcher).toHaveTextContent('');
  launcher.focus(); fireEvent.click(launcher);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByLabelText('Question'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
});
test('contextual button sends only stable feature context and displays grounded status/sources', async () => {
  const request = jest.fn().mockResolvedValue(reply());
  render(<><ProductHelpButton featureId="studio.keyframes" label="Keyframes" workspaceType="STUDIO" /><ProductAssistance request={request} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Help: Keyframes' }));
  await screen.findByText('FUNCTIONAL');
  expect(request.mock.calls[0][0]).toEqual({ question: 'What is this?', mode: 'EXPLAIN', context: { selected_feature_id: 'studio.keyframes', workspace_type: 'STUDIO' } });
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByText('Based on AutoPromote documentation')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'What do I do next?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][0].context.selected_feature_id).toBe('studio.keyframes');
});
test('global asking offers only three read-only modes and records a gap without project actions', async () => {
  const request = jest.fn().mockResolvedValue({ ...reply(), answer: 'This error is not documented yet.', features: [], documentation_gap: { reason: 'unknown_error_code' } });
  render(<ProductAssistance request={request} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask AutoPromote' }));
  expect(screen.getAllByRole('option').map(o => o.value)).toEqual(['EXPLAIN', 'GUIDE', 'DIAGNOSE']);
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'UNKNOWN_EXPORT_GLITCH' } });
  fireEvent.change(screen.getByLabelText('Help mode'), { target: { value: 'DIAGNOSE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true }));
  await screen.findByText('This error is not documented yet.');
  expect(screen.getByText(/documentation gap was recorded/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Apply|Render|Generate|Publish|Delete/ })).not.toBeInTheDocument();
});
test('close cancels a pending lookup and stale results cannot reopen or overwrite', async () => {
  let finish; const request = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  render(<ProductAssistance request={request} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask AutoPromote' }));
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Keyframes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask', exact: true }));
  fireEvent.keyDown(screen.getByLabelText('Question'), { key: 'Escape' });
  expect(request.mock.calls[0][1].aborted).toBe(true); finish(reply());
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
test('transport omits account credentials and sends no implicit project state', async () => {
  const old = global.fetch; global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => reply() });
  try {
    await askProductAssistance({ question: 'What are keyframes?', mode: 'EXPLAIN', context: {} });
    const options = global.fetch.mock.calls[0][1]; expect(options.credentials).toBe('omit');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(options.body)).toEqual({ question: 'What are keyframes?', mode: 'EXPLAIN', context: {} });
  } finally { global.fetch = old; }
});
