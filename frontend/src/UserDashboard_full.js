import React, { useState } from 'react';
import './UserDashboard.css';

const UserDashboard = ({ user, content, stats, badges, notifications, onLogout }) => {
  const [activeTab, setActiveTab] = useState('profile');
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
        <nav className="dashboard-navbar-vertical">
          <ul>
            <li className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>Profile</li>
            <li className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>Upload</li>
            <li className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setActiveTab('analytics')}>Analytics</li>
            <li className={activeTab === 'rewards' ? 'active' : ''} onClick={() => setActiveTab('rewards')}>Rewards</li>
            <li className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>Notifications</li>
          </ul>
        </nav>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </aside>
      <main className="dashboard-main">
        {activeTab === 'profile' && (
          <section className="profile-details">
            <div className="landing-preview">
              <h3>Landing Page Preview</h3>
              <img className="landing-thumbnail" src={content?.[0]?.thumbnailUrl || '/default-thumb.png'} alt="Landing Thumbnail" />
              <a href={content?.[0]?.landingPageUrl} target="_blank" rel="noopener noreferrer">View Landing Page</a>
              <div className="performance-summary">
                <div><strong>Views:</strong> {content?.[0]?.views ?? 0}</div>
                <div><strong>Clicks:</strong> {content?.[0]?.clicks ?? 0}</div>
                <div><strong>Conversions:</strong> {content?.[0]?.conversions ?? 0}</div>
              </div>
            </div>
          </section>
        )}
        {activeTab === 'upload' && (
          <section className="upload-panel">
            <h3>Upload Content</h3>
            <div className="upload-drag-drop">Drag & drop files here</div>
            <div className="platform-toggles">
              <label><input type="checkbox" /> TikTok</label>
              <label><input type="checkbox" /> YouTube</label>
              <label><input type="checkbox" /> Instagram</label>
              <label><input type="checkbox" /> Twitter</label>
              <label><input type="checkbox" /> Facebook</label>
            </div>
            <button className="check-quality">Check Quality</button>
            <div className="upload-history">
              <h4>Upload History</h4>
              <ul>
                {Array.isArray(content) ? content.map((item, idx) => (
                  <li key={idx}>
                    {typeof item.title === 'string' ? item.title : JSON.stringify(item.title)}
                    {' - '}
                    <span className={`status status-${typeof item.status === 'string' ? item.status : JSON.stringify(item.status)}`}>{typeof item.status === 'string' ? item.status : JSON.stringify(item.status)}</span>
                  </li>
                )) : null}
              </ul>
            </div>
          </section>
        )}
        {activeTab === 'analytics' && (
          <section className="analytics-panel">
            <h3>Analytics</h3>
            <div className="analytics-charts">
              <div className="chart">Views Over Time</div>
              <div className="chart">Click-through Rate (CTR)</div>
              <div className="chart">Conversion Rate</div>
            </div>
            <div className="analytics-filters">
              <label>Platform: <select><option>TikTok</option><option>YouTube</option></select></label>
              <label>Date Range: <input type="date" /> - <input type="date" /></label>
              <label>Content Type: <select><option>All</option></select></label>
            </div>
          </section>
        )}
        {activeTab === 'rewards' && (
          <section className="rewards-panel">
            <h3>Gamification & Rewards</h3>
            <div className="badges-list">
              {badges?.map((badge, i) => (
                <span key={i} className={`badge badge-${badge.type}`}>{badge.label}</span>
              ))}
            </div>
            <div className="rank">Current Rank: <strong>{user?.rank || 'Bronze'}</strong></div>
            <div className="streak">Streak: <strong>{user?.streak ?? 0}</strong> days</div>
            <div className="perks">Unlockable Perks: <span>{user?.perks?.join(', ') || 'None'}</span></div>
          </section>
        )}
        {activeTab === 'notifications' && (
          <section className="notifications-panel">
            <h3>Notifications</h3>
            <ul>
              {notifications?.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
};

export default UserDashboard;
