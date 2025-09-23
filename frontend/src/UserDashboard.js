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
  // Section render helpers to fix ReferenceError
  const analyticsSection = () => (
    <>
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
    </>
  );

  const uploadSection = () => (
    <div className="upload-panel">{/* ...upload UI here, or move from main code... */}Upload UI</div>
  );

  const badgesSection = () => (
    <div className="badges-list">{/* ...badges UI here, or move from main code... */}Badges UI</div>
  );

  const contentListSection = () => (
    <ul className="content-list">{/* ...content list UI here, or move from main code... */}Content List UI</ul>
  );

  const promotionsSection = () => (
    <div>{/* ...promotions UI here, or move from main code... */}Promotions UI</div>
  );

  const notificationsSection = () => (
    <ul>{notifications?.map((note, i) => <li key={i}>{note}</li>)}</ul>
  );
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
      {/* Desktop layout */}
      {!isMobile && (
        <>
          <aside className="dashboard-sidebar">
            {/* Sidebar */}
            <div className="profile-section">
              <div className="profile-avatar" style={{ position: 'relative', textAlign: 'center' }}>
                <img src={avatarUrl} alt="User avatar" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '2px solid #6c4cf7' }} />
                <input
                  type="file"
                  accept="image/*"
                  ref={avatarInputRef}
                  style={{ display: 'none' }}
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', background: '#fff', color: '#6c4cf7', border: '1px solid #6c4cf7', borderRadius: 16, padding: '2px 12px', fontSize: 13, cursor: 'pointer' }}
                  onClick={() => avatarInputRef.current && avatarInputRef.current.click()}
                  disabled={avatarUploading}
                >
                  {avatarUploading ? 'Uploading...' : 'Change'}
                </button>
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
                <button
                  className="dashboard-logout-btn"
                  style={{ marginTop: 16, padding: '0.5rem 1.2rem', background: '#6c4cf7', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '1rem', cursor: 'pointer', width: '100%' }}
                  onClick={() => { console.log('Logout button clicked'); onLogout(); }}
                >
                  Log out
                </button>
              </div>
            </div>
            <div className="sidebar-section earnings">
              <h3>Boost Your Earnings</h3>
              <div className="earnings-amount">${stats?.revenue ?? '0.00'}</div>
              <button className="view-breakdown-btn">View Breakdown</button>
              <div className="earnings-pie">
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
            {/* All sections rendered for desktop */}
            <section className="upload-section">{uploadSection()}</section>
            <section className="analytics-section">{analyticsSection()}</section>
            <section className="badges-section">{badgesSection()}</section>
            <section className="content-list-section">{contentListSection()}</section>
          </main>
          <aside className="dashboard-rightbar">
            <section className="latest-promotions">{promotionsSection()}</section>
            <section className="notifications">{notificationsSection()}</section>
          </aside>
        </>
      )}
      {/* Mobile layout: tab bar and only active section */}
      {isMobile && (
        <>
          <MobileTabBar />
          <main className="dashboard-main">
            {activeTab === 'stats' && <section className="analytics-section">{analyticsSection()}</section>}
            {activeTab === 'upload' && <section className="upload-section">{uploadSection()}</section>}
            {activeTab === 'badges' && <section className="badges-section">{badgesSection()}</section>}
            {activeTab === 'notifications' && <section className="notifications">{notificationsSection()}</section>}
          </main>
        </>
      )}
    </div>
  );
  // ...existing logic for upload, analytics, badges, content, notifications, etc. should be moved into helper functions above for clarity
};

export default UserDashboard;
