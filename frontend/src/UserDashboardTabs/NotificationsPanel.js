import React from 'react';

const NotificationsPanel = ({ notifs, onMarkAllRead }) => {
  return (
    <section className="notifications-panel">
      <h3>Notifications</h3>
      <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
        <button className="check-quality" onClick={onMarkAllRead}>Mark all read</button>
      </div>
      {(!notifs || notifs.length === 0) ? (
        <div style={{ color: '#9aa4b2' }}>No new notifications.</div>
      ) : (
        <ul style={{ marginTop: '.5rem' }}>
          {notifs.map((n, i) => (
            <li key={i}><strong>{n.title}</strong> - <span style={{ color: '#666' }}>{n.message || n.body}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default NotificationsPanel;
