import React, { useState, useRef } from 'react';
import { storage, db, auth } from './firebaseClient';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import './UserDashboard.css';
// Mobile tab navigation state
const [activeTab, setActiveTab] = useState('stats');

// Helper: is mobile
const isMobile = typeof window !== 'undefined' && window.innerWidth <= 700;

// Tab bar for mobile
const MobileTabBar = () => (
  <nav className="mobile-tab-bar">
    <button className={activeTab === 'stats' ? 'active' : ''} onClick={() => setActiveTab('stats')}>Stats</button>
    <button className={activeTab === 'upload' ? 'active' : ''} onClick={() => setActiveTab('upload')}>Upload</button>
    <button className={activeTab === 'badges' ? 'active' : ''} onClick={() => setActiveTab('badges')}>Badges</button>
    <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => setActiveTab('notifications')}>Notifications</button>
  </nav>
);
import { API_BASE_URL } from './config';

const defaultPlatforms = [
    {isMobile && <MobileTabBar />}
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'facebook', label: 'Facebook' },
];

const UserDashboard = ({ user, content, stats, badges, notifications, onUpload, onPromoteToggle, onLogout }) => {
  // Example streak and perks (replace with real data from backend if available)
  const streak = user?.streak || 0;
  const perks = user?.perks || ['Extra Slot', 'Priority Schedule'];
  const rank = user?.rank || 'Rising Star';
  const [selectedPlatforms, setSelectedPlatforms] = useState(defaultPlatforms.map(p => p.key));
  const [uploading, setUploading] = useState(false);
  const [qualityFeedback, setQualityFeedback] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [canUpload, setCanUpload] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '/avatar-default.png');
  // Update avatarUrl if user prop changes (e.g., after login)
  React.useEffect(() => {
    setAvatarUrl(user?.avatarUrl || '/avatar-default.png');
  }, [user]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef();
  // Handle avatar upload
  const handleAvatarChange = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    setAvatarUploading(true);
    const file = e.target.files[0];
    try {
      const userId = user?.uid || auth.currentUser?.uid;
      const fileRef = storageRef(storage, `avatars/${userId}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setAvatarUrl(url);
      // Update Firestore user doc
      if (userId) {
        await db.collection('users').doc(userId).update({ avatarUrl: url });
      }
    } catch (err) {
      alert('Failed to upload avatar.');
    }
    setAvatarUploading(false);
  };

  const handlePlatformToggle = (platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
    if (onPromoteToggle) onPromoteToggle(platform);
  };

  // Simple auto-caption/hashtag suggestion based on filename
  const suggestCaptionAndHashtags = (file) => {
    if (!file) return;
    const base = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    setCaption(`Check out my new upload: ${base}`);
    setHashtags(`#${base.split(' ').join(' #')}`);
  };

  const handleFileChange = async (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    setUploading(true);
    setQualityFeedback(null);
    setCanUpload(false);
    const file = e.target.files[0];
  setFileToUpload(file);
  suggestCaptionAndHashtags(file);
    // Send file to backend for quality check
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE_URL}/api/content/quality-check`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setQualityFeedback(data);
      setCanUpload(data.qualityScore >= 1); // Only allow upload if score is acceptable
    } catch (err) {
      setQualityFeedback({ error: 'Quality check failed' });
      setCanUpload(false);
    }
    setUploading(false);
  };

  const handleFinalUpload = async () => {
    if (!fileToUpload || !canUpload) return;
    setUploading(true);
    await onUpload({
      file: fileToUpload,
      platforms: selectedPlatforms,
      scheduledTime,
      caption,
      hashtags
    });
    setFileToUpload(null);
    setQualityFeedback(null);
    setCanUpload(false);
    setCaption('');
    setHashtags('');
    setScheduledTime('');
    setUploading(false);
  };

  return (
    <div className="dashboard-container">
      <aside className="dashboard-sidebar">
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
            <input
              type="file"
              id="upload-input"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              accept="video/*,image/*,audio/*"
            />
            <label
              htmlFor="upload-input"
              className="upload-drop"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: uploading ? 'not-allowed' : 'pointer', border: '2px dashed #6c4cf7', borderRadius: 12, padding: '1.2rem', background: '#f8f7ff', marginBottom: 12 }}
              onClick={e => {
                if (uploading) e.preventDefault();
                else document.getElementById('upload-input').click();
              }}
            >
              <span style={{ marginBottom: 8 }}>Drag and drop a file or</span>
              <button
                type="button"
                disabled={uploading}
                style={{ background: '#6c4cf7', color: '#fff', border: 'none', borderRadius: 8, padding: '0.5rem 1.5rem', fontWeight: 600, fontSize: '1rem', cursor: uploading ? 'not-allowed' : 'pointer' }}
              >
                {uploading ? 'Uploading...' : 'Select File'}
              </button>
              {fileToUpload && <span style={{ marginTop: 8, color: '#4f2ff7' }}>Selected: {fileToUpload.name}</span>}
            </label>
            {/* Scheduling, caption, and hashtags */}
            {fileToUpload && (
              <div className="upload-meta-fields" style={{ margin: '12px 0' }}>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Schedule Promotion:
                  <input
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    style={{ marginLeft: 8 }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Caption:
                  <input
                    type="text"
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    style={{ marginLeft: 8, width: 260 }}
                  />
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>
                  Hashtags:
                  <input
                    type="text"
                    value={hashtags}
                    onChange={e => setHashtags(e.target.value)}
                    style={{ marginLeft: 8, width: 260 }}
                  />
                </label>
              </div>
            )}
            {qualityFeedback && (
              <div className="content-quality">
                {qualityFeedback.error ? (
                  <span style={{ color: 'red' }}>{qualityFeedback.error}</span>
                ) : (
                  <>
                    <span>Resolution: {qualityFeedback.resolution || 'N/A'}</span><br />
                    <span>Video Bitrate: {qualityFeedback.videoBitrate || 'N/A'}</span><br />
                    <span>Audio Bitrate: {qualityFeedback.audioBitrate || 'N/A'}</span><br />
                    <span>Duration: {qualityFeedback.duration ? qualityFeedback.duration.toFixed(1) + 's' : 'N/A'}</span><br />
                    <span>Format: {qualityFeedback.format || 'N/A'}</span><br />
                    <span>Quality Score: {qualityFeedback.qualityScore}</span><br />
                    {Array.isArray(qualityFeedback.feedback) && qualityFeedback.feedback.length > 0 && (
                      <div style={{ margin: '8px 0' }}>
                        <strong>Feedback:</strong>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {qualityFeedback.feedback.map((msg, i) => (
                            <li key={i} style={{ color: '#ed6c02' }}>{msg}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {qualityFeedback.enhanced && qualityFeedback.enhancedFile && !canUpload && (
                      <button
                        className="view-breakdown-btn"
                        style={{ marginTop: 8, background: '#2e7d32', color: '#fff' }}
                        onClick={async () => {
                          setUploading(true);
                          // Download the enhanced file and set as fileToUpload
                          const response = await fetch(qualityFeedback.enhancedFile);
                          const blob = await response.blob();
                          const enhancedFile = new File([blob], 'enhanced_' + (fileToUpload?.name || 'upload.mp4'), { type: blob.type });
                          setFileToUpload(enhancedFile);
                          setCanUpload(true);
                          setUploading(false);
                        }}
                        disabled={uploading}
                      >
                        Use Enhanced File
                      </button>
                    )}
                    {canUpload ? (
                      <span style={{ color: 'green' }}>Quality is acceptable. You can upload.</span>
                    ) : (
                      <span style={{ color: 'orange' }}>Quality is low. Please select a higher quality file or use the enhanced file if available.</span>
                    )}
                  </>
                )}
              </div>
            )}
            {fileToUpload && canUpload && (
              <button className="view-breakdown-btn" onClick={handleFinalUpload} disabled={uploading} style={{ marginTop: 12 }}>
                {uploading ? 'Uploading...' : 'Upload Content'}
              </button>
            )}
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
          <h3>Badges & Rewards</h3>
          <div className="badges-list">
            {badges?.map((badge, i) => (
              <span key={i} className={`badge badge-${badge.type}`}>{badge.label}</span>
            ))}
          </div>
          <div className="streaks-perks" style={{ margin: '16px 0' }}>
            <div style={{ fontWeight: 600, color: '#4f2ff7' }}>🔥 Streak: {streak} days</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontWeight: 600 }}>Unlocked Perks:</span>
              {perks.length > 0 ? (
                <ul style={{ margin: '6px 0 0 18px', color: '#4f2ff7' }}>
                  {perks.map((perk, i) => <li key={i}>{perk}</li>)}
                </ul>
              ) : <span style={{ marginLeft: 8 }}>None yet</span>}
            </div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>
              Rank: <span style={{ color: '#7C4DFF' }}>{rank}</span>
            </div>
          </div>
          <button className="earn-more-btn">Earn More!</button>
        </section>
      <section className="content-list-section">
        <h3>Your Content</h3>
        <ul className="content-list">
          {content && content.length > 0 ? content.map((item, idx) => (
            <li key={item.id || idx} className="content-list-item">
              <span>{item.title || item.url || 'Untitled Content'}</span>
              {/* Platform posting status */}
              {item.platformStatus && (
                <div className="platform-status-list" style={{ marginTop: 6, marginBottom: 6 }}>
                  {Object.entries(item.platformStatus).map(([platform, statusObj]) => (
                    <div key={platform} className={`platform-status platform-${platform}`} style={{ fontSize: '0.92em', marginBottom: 2 }}>
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
              )}
              {item.landingPageUrl && (
                <button
                  className="view-breakdown-btn"
                  style={{ marginLeft: 12 }}
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
