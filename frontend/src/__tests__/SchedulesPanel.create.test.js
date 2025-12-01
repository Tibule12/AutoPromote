import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SchedulesPanel from '../UserDashboardTabs/SchedulesPanel';

describe('SchedulesPanel create schedule', () => {
  test('Calls onCreate with contentId and platforms', async () => {
    const mockOnCreate = jest.fn(async () => {});
    const contentList = [{ id: 'c1', title: 'Content 1' }, { id: 'c2', title: 'Content 2' }];
    render(<SchedulesPanel schedulesList={[]} contentList={contentList} onCreate={mockOnCreate} onPause={() => {}} onResume={() => {}} onReschedule={() => {}} onDelete={() => {}} />);

    // Choose content
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    // Set a when
    fireEvent.change(screen.getByLabelText(/datetime-local/i), { target: { value: '2030-01-01T12:00' } });
    // select one platform
    fireEvent.click(screen.getByLabelText(/youtube/i));
    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Create Schedule/i }));

    expect(mockOnCreate).toHaveBeenCalled();
    const payload = mockOnCreate.mock.calls[0][0];
    expect(payload.contentId).toBe('c1');
    expect(Array.isArray(payload.platforms)).toBe(true);
    expect(payload.platforms).toContain('youtube');
  });
});

export {};
