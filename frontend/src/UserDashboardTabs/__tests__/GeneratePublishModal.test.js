import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GeneratePublishModal from '../GeneratePublishModal';

global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ jobId: 'job1' }) }));

test('opens modal and starts generation', async () => {
  const onStarted = jest.fn();
  render(<GeneratePublishModal open={true} contentItem={{ id: 'c1', title: 'Video 1' }} onClose={() => {}} onStarted={onStarted} />);

  expect(screen.getByText(/Generate & Publish/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Confirm'));

  await waitFor(() => expect(onStarted).toHaveBeenCalled());
  expect(screen.getByText(/Processing/i)).toBeInTheDocument();
});
