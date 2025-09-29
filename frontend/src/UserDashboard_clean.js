import React from 'react';
import './UserDashboard.css';

const UserDashboard = ({ user, stats, onLogout }) => {
  return (
    <div className="dashboard-root">
      <aside className="dashboard-sidebar">
        <div className="profile-section">
          <img className="profile-avatar" src={user?.avatarUrl || '/default-avatar.png'} alt="Avatar" />
          <h2>{user?.name || 'User Name'}</h2>
          <div className="profile-referral">
            Referral: <span className="referral-link">{user?.referralCode || 'N/A'}</span>
            <button className="copy-referral" onClick={() => navigator.clipboard.writeText(user?.referralCode || '')}>Copy</button>
          </div>
          <div className="profile-stats">
            <div><strong>Views:</strong> {stats?.views ?? 0}</div>
            <div><strong>Clicks:</strong> {stats?.clicks ?? 0}</div>
            <div><strong>CTR:</strong> {stats?.ctr ?? 0}%</div>
            <div><strong>Revenue:</strong> ${stats?.revenue ?? '0.00'}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </aside>
      <main className="dashboard-main">
        <section className="profile-details">
          <h3>Welcome to your dashboard!</h3>
        </section>
      </main>
    </div>
  );
};

export default UserDashboard;
