import React, { useMemo, useState } from 'react';
import './UserDashboard.css';

// Use PUBLIC_URL so assets resolve correctly on GitHub Pages and Render
const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ''}/image.png`;

const UserDashboard = ({ user, content, stats, badges, notifications, onLogout, onUpload }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);

  // Ensure content is an array to simplify rendering
  const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
  const firstItem = contentList[0] || {};
  const safeFirstThumb = firstItem?.thumbnailUrl || DEFAULT_IMAGE;
  const safeLandingUrl = typeof firstItem?.landingPageUrl === 'string' ? firstItem.landingPageUrl : undefined;

  const handleNav = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const togglePlatform = (name) => {
    setSelectedPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const handleUploadSubmit = async () => {
    if (!onUpload) return;
    await onUpload({ file: selectedFile, platforms: selectedPlatforms });
    setSelectedFile(null);
    setSelectedPlatforms([]);
  };

  return (
    <div className="dashboard-root">
      {/* Topbar with mobile hamburger */}
      <header className="dashboard-topbar" aria-label="Top navigation">
        <button
          className="hamburger"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">Your Dashboard</div>
        <div className="topbar-user">{user?.name || 'Guest'}</div>
      </header>

      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Sidebar">
        <div className="profile-section">
          <img className="profile-avatar" src={user?.avatarUrl || DEFAULT_IMAGE} alt="Avatar" />
          <h2>{user?.name || 'User Name'}</h2>
          <div className="profile-referral">
            Referral: <span className="referral-link">{user?.referralCode || 'N/A'}</span>
            <button
              className="copy-referral"
              onClick={() => navigator.clipboard.writeText(user?.referralCode || '')}
            >
              Copy
            </button>
          </div>
          <div className="profile-stats">
            <div><strong>Views:</strong> {stats?.views ?? 0}</div>
            <div><strong>Clicks:</strong> {stats?.clicks ?? 0}</div>
            <div><strong>CTR:</strong> {stats?.ctr ?? 0}%</div>
            <div><strong>Revenue:</strong> ${stats?.revenue ?? '0.00'}</div>
          </div>
        </div>
        <nav className="dashboard-navbar-vertical" role="navigation">
          <ul>
            <li className={activeTab === 'profile' ? 'active' : ''} onClick={() => handleNav('profile')}>Profile</li>
            <li className={activeTab === 'upload' ? 'active' : ''} onClick={() => handleNav('upload')}>Upload</li>
            <li className={activeTab === 'analytics' ? 'active' : ''} onClick={() => handleNav('analytics')}>Analytics</li>
            <li className={activeTab === 'rewards' ? 'active' : ''} onClick={() => handleNav('rewards')}>Rewards</li>
            <li className={activeTab === 'notifications' ? 'active' : ''} onClick={() => handleNav('notifications')}>Notifications</li>
          </ul>
        </nav>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </aside>

      {/* Backdrop for mobile when sidebar open */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <main className="dashboard-main">
        {activeTab === 'profile' && (
          <section className="profile-details">
            <h3>Landing Page Preview</h3>
            <div className="landing-preview">
              <img className="landing-thumbnail" src={safeFirstThumb} alt="Landing Thumbnail" />
              {safeLandingUrl ? (
                <a href={safeLandingUrl} target="_blank" rel="noopener noreferrer">View Landing Page</a>
              ) : (
                <span style={{ color: '#9aa4b2' }}>No landing page set</span>
              )}
            </div>
            <div className="performance-summary">
              <div><strong>Views:</strong> {firstItem?.views ?? 0}</div>
              <div><strong>Clicks:</strong> {firstItem?.clicks ?? 0}</div>
              <div><strong>Conversions:</strong> {firstItem?.conversions ?? 0}</div>
            </div>
          </section>
        )}

        {activeTab === 'upload' && (
          <section className="upload-panel">
            <h3>Upload Content</h3>
            <div className="upload-drag-drop">
              <input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              {selectedFile && <div style={{marginTop: '.5rem', color: '#9aa4b2'}}>Selected: {selectedFile.name}</div>}
            </div>
            <div className="platform-toggles">
              <label><input type="checkbox" checked={selectedPlatforms.includes('tiktok')} onChange={() => togglePlatform('tiktok')} /> TikTok</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('youtube')} onChange={() => togglePlatform('youtube')} /> YouTube</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('instagram')} onChange={() => togglePlatform('instagram')} /> Instagram</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('twitter')} onChange={() => togglePlatform('twitter')} /> Twitter</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('facebook')} onChange={() => togglePlatform('facebook')} /> Facebook</label>
            </div>
            <div style={{display: 'flex', gap: '.5rem'}}>
              <button className="check-quality" onClick={handleUploadSubmit} disabled={!selectedFile || selectedPlatforms.length === 0}>Upload</button>
              <button className="logout-btn" onClick={() => { setSelectedFile(null); setSelectedPlatforms([]); }}>Reset</button>
            </div>
            <div className="upload-history">
              <h4>Upload History</h4>
              <ul>
                {contentList.map((item, idx) => {
                  const titleText = typeof item?.title === 'string' ? item.title : (item?.title ? JSON.stringify(item.title) : 'Untitled');
                  const statusText = typeof item?.status === 'string' ? item.status : (item?.status ? JSON.stringify(item.status) : 'unknown');
                  const statusClass = typeof item?.status === 'string' ? item.status.toLowerCase().replace(/[^a-z0-9-]/g, '') : 'unknown';
                  return (
                    <li key={idx}>
                      {titleText} - <span className={`status status-${statusClass}`}>{statusText}</span>
                    </li>
                  );
                })}
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
            <div className="perks">Unlockable Perks: <span>{Array.isArray(user?.perks) ? user.perks.join(', ') : 'None'}</span></div>
          </section>
        )}

        {activeTab === 'notifications' && (
          <section className="notifications-panel">
            <h3>Notifications</h3>
            <ul>
              {notifications?.map((note, i) => (
                <li key={i}>{typeof note === 'string' ? note : JSON.stringify(note)}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
};

export default UserDashboard;
