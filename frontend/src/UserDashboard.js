import React, { useState, useRef } from 'react';
import { storage, db, auth } from './firebaseClient';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import './UserDashboard.css';
import { API_BASE_URL } from './config';

const defaultPlatforms = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'facebook', label: 'Facebook' },
];

const UserDashboard = ({ user, content, stats, badges, notifications, onUpload, onPromoteToggle, onLogout }) => {
  // Avatar upload state and logic
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || user?.photoURL || '/default-avatar.png');
  const avatarInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const handleAvatarChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fileRef = storageRef(storage, `avatars/${user?.uid || 'unknown'}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setAvatarUrl(url);
      // Optionally update user profile in Firestore or Auth here
    } catch (err) {
      alert('Failed to upload avatar.');
    } finally {
      setAvatarUploading(false);
    }
  };
  // Restore all original section JSX directly in the return statement below
  // Mobile tab navigation state and helpers
  const [activeTab, setActiveTab] = useState('stats');
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 700;
  const MobileTabBar = () => (
    <nav className="mobile-tab-bar">
      <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>Stats</button>
      <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>Upload</button>
      <button className={activeTab === 'badges' ? 'active' : ''} onClick={() => setActiveTab('badges')}>Badges</button>
      <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>Notifications</button>
    </nav>
  );

  // ...existing hooks, handlers, and logic...

  // Only one return statement, with a single parent element
  return (
    <div className="dashboard-container">
          {/* Desktop layout: sidebar, main, rightbar */}
          {!isMobile && (
            <>
              {/* Sidebar */}
              <aside className="dashboard-sidebar">
                <section className="profile-section">
                  <div className="profile-avatar">
                    <img src={user?.avatarUrl || '/default-avatar.png'} alt="Avatar" />
                  </div>
                  <div className="profile-info">
                    <h2>{user?.name || 'User Name'}</h2>
                    <div className="profile-niche">{user?.niche || 'Niche'}</div>
                    <div className="profile-stats">
                      <div>
                        <span>{stats?.revenue ?? '0.00'}</span>
                        <small>Earnings</small>
                      </div>
                      <div>
                        <span>{stats?.views ?? 0}</span>
                        <small>Views</small>
                      </div>
                      <div>
                        <span>{stats?.ctr ?? 0}%</span>
                        <small>CTR</small>
                      </div>
                    </div>
                    <div className="profile-referral">Referral: {user?.referralCode || 'N/A'}</div>
                  </div>
                </section>
                <section className="sidebar-section badges">
                  <h4>Badges</h4>
                  <div className="badges-list">
                    {badges?.map((badge, i) => (
                      <span key={i} className={`badge badge-${badge.type}`}>{badge.label}</span>
                    ))}
                  </div>
                </section>
              </aside>
              {/* Main content */}
              <main className="dashboard-main">
                {/* Top navigation bar */}
                <nav className="dashboard-navbar">
                  <ul>
                    <li className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>Analytics</li>
                    <li className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>Upload</li>
                    <li className={activeTab === 'badges' ? 'active' : ''} onClick={() => setActiveTab('badges')}>Badges</li>
                    <li className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>Notifications</li>
                  </ul>
                </nav>
                {/* Analytics Card */}
                {activeTab === 'stats' && (
                  <section className="analytics-section">
                    <h3>Boost Your Earnings</h3>
                    <div className="earnings-amount">${stats?.revenue ?? '0.00'}</div>
                    <div className="analytics-chart">
                      {/* Chart code */}
                      <svg width="100%" height="120" viewBox="0 0 320 120">
                        {stats?.chart && stats.chart.length > 1 && (
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
                )}
                {/* Upload Section */}
                {activeTab === 'upload' && (
                  <section className="upload-section">
                    {/* Upload UI */}
                    {/* ...original upload JSX here... */}
                  </section>
                )}
                {/* Badges Section */}
                {activeTab === 'badges' && (
                  <section className="badges-section">
                    <h3>Badges & Rewards</h3>
                    <div className="badges-list">
                      {badges?.map((badge, i) => (
                        <span key={i} className={`badge badge-${badge.type}`}>{badge.label}</span>
                      ))}
                    </div>
                  </section>
                )}
                {/* Notifications Section */}
                {activeTab === 'notifications' && (
                  <section className="notifications">
                    <h4>Notifications</h4>
                    <ul>
                      {notifications?.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {/* Content List Section */}
                <section className="content-list-section">
                  <h4>Your Content</h4>
                  <ul className="content-list">
                    {contentList?.length ? contentList.map((item, idx) => (
                      <li key={idx} className="content-list-item">
                        <span className="content-title">{item.title}</span>
                        {/* Platform status */}
                        <div className="platform-status-list">
                          {item.platformStatus && Object.entries(item.platformStatus).map(([platform, statusObj]) => (
                            <div key={platform} className={`platform-status platform-${platform}`}>
                              <strong>{platform.charAt(0).toUpperCase() + platform.slice(1)}:</strong>{' '}
                              {statusObj.status === 'posted' && <span style={{ color: 'green' }}>Posted</span>}
                              {statusObj.status === 'failed' && <span style={{ color: 'red' }}>Failed: {statusObj.error}</span>}
                              {statusObj.status === 'pending' && <span style={{ color: 'orange' }}>Pending</span>}
                              {statusObj.status === 'scheduled' && <span style={{ color: 'blue' }}>Scheduled</span>}
                              {statusObj.status === 'posting' && <span style={{ color: '#888' }}>Posting...</span>}
                              {statusObj.postedAt && statusObj.status === 'posted' && (
                                <span style={{ color: '#888', marginLeft: 6 }}>(at {new Date(statusObj.postedAt).toLocaleString()})</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {item.landingPageUrl && (
                          <button
                            className="view-breakdown-btn"
                            onClick={() => window.open(item.landingPageUrl, '_blank')}
                          >
                            Preview
                          </button>
                        )}
                      </li>
                    )) : <li>No content uploaded yet.</li>}
                  </ul>
                </section>
              </main>
              {/* Rightbar */}
              <aside className="dashboard-rightbar">
                <section className="latest-promotions">
                  <h4>Latest Promotions</h4>
                  {/* Promotions list placeholder or real data here */}
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
            </>
          )}
          {/* Mobile layout: tab bar and only active section */}
          {isMobile && (
            <>
              <MobileTabBar />
              <main className="dashboard-main">
                {activeTab === 'stats' && (
                  <section className="analytics-section">
                    <h3>Boost Your Earnings</h3>
                    <div className="earnings-amount">${stats?.revenue ?? '0.00'}</div>
                    <div className="analytics-chart">
                      <svg width="100%" height="120" viewBox="0 0 320 120">
                        {stats?.chart && stats.chart.length > 1 && (
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
                )}
                {activeTab === 'upload' && (
                  <section className="upload-section">
                    {/* Upload UI */}
                    {/* ...original upload JSX here... */}
                  </section>
                )}
                {activeTab === 'badges' && (
                  <section className="badges-section">
                    <h3>Badges & Rewards</h3>
                    <div className="badges-list">
                      {badges?.map((badge, i) => (
                        <span key={i} className={`badge badge-${badge.type}`}>{badge.label}</span>
                      ))}
                    </div>
                    {/* ...add streaks, perks, and rank UI here if needed... */}
                  </section>
                )}
                {activeTab === 'notifications' && (
                  <section className="notifications">
                    <h4>Notifications</h4>
                    <ul>
                      {notifications?.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </main>
            </>
          )}
        </div>
  );
  // ...existing logic for upload, analytics, badges, content, notifications, etc. should be moved into helper functions above for clarity
}

export default UserDashboard;
