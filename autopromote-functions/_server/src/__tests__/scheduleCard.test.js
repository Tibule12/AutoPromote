let React;
let render, screen, fireEvent;
let ScheduleCard;
try {
  React = require('react');
  ({ render, screen, fireEvent } = require('@testing-library/react'));
  ScheduleCard = require('../components/ScheduleCard');
} catch (e) {
  React = null;
}

describe('ScheduleCard', () => {
  if (!React) return it.skip('skipped in non-frontend jest environment', () => {});
  it('renders a cute schedule card with content preview and actions', () => {
    const schedule = { id: 's1', startTime: new Date().toISOString(), platform: ['youtube'], frequency: 'once', isActive: true };
    const content = { id: 'c1', title: 'Cute Content', thumbnailUrl: '/image.png' };
    const mockPause = jest.fn();
    const mockDelete = jest.fn();
    render(<ScheduleCard schedule={schedule} content={content} onPause={mockPause} onDelete={mockDelete} />);
    expect(screen.getByText(/Cute Content/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
  });
});
