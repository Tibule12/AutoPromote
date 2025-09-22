import React, { useState } from 'react';
import './UserDashboard.css';

const defaultPlatforms = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'facebook', label: 'Facebook' },
];

const UserDashboard = ({ user, content, stats, badges, notifications, onUpload, onPromoteToggle }) => {
  const [selectedPlatforms, setSelectedPlatforms] = useState(defaultPlatforms.map(p => p.key));
  const [uploading, setUploading] = useState(false);

  const handlePlatformToggle = (platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
    if (onPromoteToggle) onPromoteToggle(platform);
  };

  const handleFileChange = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    setUploading(true);
    const file = e.target.files[0];
    // Pass file and selected platforms to parent handler
    await onUpload({ file, platforms: selectedPlatforms });
    setUploading(false);
  };

  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
        <div className="profile-section">
          <div className="profile-avatar">
            <img src="/avatar-default.png" alt="User avatar" />
          </div>
          <div className="profile-info">
            <h2>{user?.name || 'User'}</h2>
            <span className="profile-niche">{user?.niche || 'Niche'}</span>
            <div className="profile-stats">
              <div><span>{stats?.views ?? '0'}</span><small>views</small></div>
              <div><span>${stats?.revenue ?? '0.00'}</span><small>revenue</small></div>
              <div><span>{stats?.ctr ?? '0'}%</span><small>CTR</small></div>
            </div>
            <div className="profile-referral">
              <span>{user?.referralLink || 'autopromote.com/yourref'}</span>
            </div>
          </div>
        </div>
        <div className="sidebar-section earnings">
          <h3>Boost Your Earnings</h3>
          <div className="earnings-amount">${stats?.revenue ?? '0.00'}</div>
          <button className="view-breakdown-btn">View Break~~</button>
          <div className="earnings-pie">
            {/* Pie chart placeholder */}
            <div className="pie-chart"></div>
            <ul>
              <li>Ad Revenue</li>
              <li>Artillate</li>
              <li>Auto-Schedule</li>
            </ul>
          </div>
        </div>
      </aside>
      <main className="dashboard-main">
        <section className="upload-section">
          <h3>Create and Promote Content</h3>
          <div className="upload-panel">
            <input type="file" id="upload-input" style={{ display: 'none' }} onChange={handleFileChange} />
            <label htmlFor="upload-input" className="upload-drop">
              <span>Drag and drop a file = ubabdding content</span>
              <button type="button" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload is'}</button>
            </label>
            <div className="content-quality">
              <span>Score: 54 • Burry</span>
            </div>
            <div className="platform-toggles">
              {defaultPlatforms.map((p) => (
                <label key={p.key}>
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p.key)}
                    onChange={() => handlePlatformToggle(p.key)}
                  />
                  {p.label}
                </label>
              ))}
            </div>
            <input className="content-link" value={user?.referralLink || 'autopromote.com/yourref'} readOnly />
          </div>
        </section>
        <section className="analytics-section">
          <h3>Boost Your Earnings</h3>
          <div className="earnings-amount">${stats?.revenue ?? '0.00'}</div>
          <div className="analytics-chart">
            {/* Simple chart rendering */}
            <svg width="100%" height="120" viewBox="0 0 320 120">
              {stats.chart && stats.chart.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#4f2ff7"
                  strokeWidth="3"
                  points={stats.chart.map((d, i) => `${10 + i * (300 / (stats.chart.length - 1))},${110 - (d.views / Math.max(...stats.chart.map(c => c.views || 1)) * 100)}`).join(' ')}
                />
              )}
            </svg>
          </div>
          <div className="daily-stats">
            <span>Views</span>
            <span>{stats?.views ?? 0}</span>
            <span>CTR</span>
            <span>{stats?.ctr ?? 0}%</span>
          </div>
        </section>
        <section className="badges-section">
          <h3>Badges</h3>
          <div className="badges-list">
            {badges?.map((badge, i) => (
              <span key={i} className={`badge badge-${badge.type}`}>{badge.label}</span>
            ))}
          </div>
          <button className="earn-more-btn">Earn More!</button>
        </section>
      </main>
      <aside className="dashboard-rightbar">
        <section className="latest-promotions">
          <h4>Latest Promotions</h4>
          {/* Promotions list placeholder */}
        </section>
        <section className="notifications">
          <h4>Notifications</h4>
          <ul>
            {notifications?.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
};

export default UserDashboard;
