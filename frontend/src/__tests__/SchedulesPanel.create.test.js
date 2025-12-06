import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SchedulesPanel from '../UserDashboardTabs/SchedulesPanel';

describe('SchedulesPanel create schedule', () => {
  test('Calls onCreate with contentId and platforms', async () => {
    const mockOnCreate = jest.fn(async () => {});
    const contentList = [{ id: 'c1', title: 'Content 1' }, { id: 'c2', title: 'Content 2' }];
    render(<SchedulesPanel schedulesList={[]} contentList={contentList} onCreate={mockOnCreate} onPause={() => {}} onResume={() => {}} onReschedule={() => {}} onDelete={() => {}} />);

    // Choose content
    // The content select has an aria-label of "Select content"
    fireEvent.change(screen.getByRole('combobox', { name: /Select content/i }), { target: { value: 'c1' } });
    // Set a when
    fireEvent.change(screen.getByLabelText(/When/i), { target: { value: '2030-01-01T12:00' } });
    expect(screen.getByLabelText(/When/i).value).toBe('2030-01-01T12:00');
    // Ensure combobox value changed
    const combo = screen.getByRole('combobox', { name: /Select content/i });
    expect(combo.value).toBe('c1');
    // select one platform
    fireEvent.click(screen.getByLabelText(/youtube/i));
    // checkbox should be checked
    expect(screen.getByLabelText(/youtube/i).checked).toBe(true);
    // Submit
    const createBtn = screen.getByRole('button', { name: /Create Schedule/i });
    const form = createBtn.closest('form');
    fireEvent.submit(form);

    // Wait for async onCreate to be invoked and the state updates to complete
    await waitFor(() => expect(mockOnCreate).toHaveBeenCalled());
    const payload = mockOnCreate.mock.calls[0][0];
    expect(payload.contentId).toBe('c1');
    expect(Array.isArray(payload.platforms)).toBe(true);
    expect(payload.platforms).toContain('youtube');
  });
});

export {};
