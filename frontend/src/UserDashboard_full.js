import React, { useMemo, useState } from 'react';
import './UserDashboard.css';

// Use PUBLIC_URL so assets resolve correctly on GitHub Pages and Render
const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ''}/image.png`;

const UserDashboard = ({ user, content, stats, badges, notifications, userDefaults, onSaveDefaults, onLogout, onUpload, mySchedules }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('video');
  const [scheduleMode, setScheduleMode] = useState('auto'); // 'auto' | 'manual'
  const [manualWhen, setManualWhen] = useState(''); // yyyy-MM-ddTHH:mm
  const [frequency, setFrequency] = useState('once'); // once | daily | weekly
  // Profile defaults local state
  const [tz, setTz] = useState(userDefaults?.timezone || 'UTC');
  const [defaultsPlatforms, setDefaultsPlatforms] = useState(Array.isArray(userDefaults?.defaultPlatforms) ? userDefaults.defaultPlatforms : []);
  const [defaultsFrequency, setDefaultsFrequency] = useState(userDefaults?.defaultFrequency || 'once');

  // Ensure content is an array to simplify rendering
  const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
  const schedulesList = useMemo(() => (Array.isArray(mySchedules) ? mySchedules : []), [mySchedules]);
  const firstItem = contentList[0] || {};
  const safeFirstThumb = firstItem?.thumbnailUrl || DEFAULT_IMAGE;
  const safeLandingUrl = typeof firstItem?.landingPageUrl === 'string' ? firstItem.landingPageUrl : undefined;
  const safeSmartLink = typeof firstItem?.smartLink === 'string' ? firstItem.smartLink : undefined;

  const handleNav = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const togglePlatform = (name) => {
    setSelectedPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const suggestNextTime = () => {
    // Very simple heuristic windows in local time
    const windows = {
      youtube: [[15, 0], [17, 0]],
      tiktok: [[19, 0], [21, 0]],
      instagram: [[11, 0], [13, 0]], // we'll also consider evening implicitly by overlap with tiktok
      facebook: [[9, 0], [11, 0]],
      twitter: [[8, 0], [10, 0]],
    };
    const now = new Date();
    let candidates = [];
    selectedPlatforms.forEach((p) => {
      const win = windows[p];
      if (!win) return;
      const [startH, startM] = win[0];
      const candidate = new Date(now);
      candidate.setHours(startH, startM, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
      candidates.push(candidate.getTime());
    });
    if (candidates.length === 0) {
      const fallback = new Date(now);
      fallback.setHours(now.getHours() + 2, 0, 0, 0);
      return fallback.toISOString();
    }
    const ts = Math.min(...candidates);
    return new Date(ts + 10 * 60 * 1000).toISOString(); // +10min jitter
  };

  const handleUploadSubmit = async () => {
    if (!onUpload) return;
    const whenIso = scheduleMode === 'manual' && manualWhen
      ? new Date(manualWhen).toISOString()
      : suggestNextTime();
    await onUpload({
      file: selectedFile,
      platforms: selectedPlatforms,
      title,
      description,
      type,
      schedule: { mode: scheduleMode, when: whenIso, frequency }
    });
    setSelectedFile(null);
    setSelectedPlatforms([]);
    setTitle('');
    setDescription('');
    setType('video');
    setScheduleMode('auto');
    setManualWhen('');
    setFrequency('once');
  };

  const toggleDefaultPlatform = (name) => {
    setDefaultsPlatforms((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const handleSaveDefaults = async () => {
    if (!onSaveDefaults) return;
    await onSaveDefaults({ timezone: tz, defaultPlatforms: defaultsPlatforms, defaultFrequency: defaultsFrequency });
  };

  const formatWhen = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      // Prefer Intl with timezone if available/valid
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: tz || 'UTC' }).format(d);
    } catch (e) {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return String(iso);
      }
    }
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
            <li className={activeTab === 'schedules' ? 'active' : ''} onClick={() => handleNav('schedules')}>Schedules</li>
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
              {safeSmartLink && (
                <div style={{marginTop: '.5rem'}}>
                  Smart Link: <a href={safeSmartLink} target="_blank" rel="noopener noreferrer">{safeSmartLink}</a>
                </div>
              )}
            </div>
            <div className="performance-summary">
              <div><strong>Views:</strong> {firstItem?.views ?? 0}</div>
              <div><strong>Clicks:</strong> {firstItem?.clicks ?? 0}</div>
              <div><strong>Conversions:</strong> {firstItem?.conversions ?? 0}</div>
            </div>
            <div className="profile-defaults" style={{marginTop:'1rem'}}>
              <h4>Profile Defaults</h4>
              <div style={{display:'grid', gap:'.5rem', maxWidth: 520}}>
                <label style={{color:'#9aa4b2'}}>Timezone
                  <input type="text" value={tz} onChange={(e)=>setTz(e.target.value)} style={{display:'block', width:'100%', marginTop:'.25rem', padding:'.4rem', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#eef2ff'}} />
                </label>
                <div style={{color:'#9aa4b2'}}>Default Platforms</div>
                <div className="platform-toggles">
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('tiktok')} onChange={() => toggleDefaultPlatform('tiktok')} /> TikTok</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('youtube')} onChange={() => toggleDefaultPlatform('youtube')} /> YouTube</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('instagram')} onChange={() => toggleDefaultPlatform('instagram')} /> Instagram</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('twitter')} onChange={() => toggleDefaultPlatform('twitter')} /> Twitter</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('facebook')} onChange={() => toggleDefaultPlatform('facebook')} /> Facebook</label>
                </div>
                <label style={{color:'#9aa4b2'}}>Default Frequency
                  <select value={defaultsFrequency} onChange={(e)=>setDefaultsFrequency(e.target.value)} style={{display:'block', width:'100%', marginTop:'.25rem', background:'rgba(255,255,255,0.05)', color:'#eef2ff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'.3rem .5rem'}}>
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                <div style={{display:'flex', gap:'.5rem'}}>
                  <button className="check-quality" onClick={handleSaveDefaults}>Save Defaults</button>
                </div>
              </div>
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
            <div style={{display: 'grid', gap: '.5rem', marginTop: '.5rem'}}>
              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{padding: '.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#eef2ff'}}
              />
              <textarea
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{padding: '.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#eef2ff'}}
              />
              <label style={{color:'#9aa4b2'}}>Type: 
                <select value={type} onChange={(e) => setType(e.target.value)} style={{marginLeft: '.5rem', background:'rgba(255,255,255,0.05)', color:'#eef2ff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'.3rem .5rem'}}>
                  <option value="video">Video</option>
                  <option value="image">Image</option>
                </select>
              </label>
            </div>
            <div className="platform-toggles">
              <label><input type="checkbox" checked={selectedPlatforms.includes('tiktok')} onChange={() => togglePlatform('tiktok')} /> TikTok</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('youtube')} onChange={() => togglePlatform('youtube')} /> YouTube</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('instagram')} onChange={() => togglePlatform('instagram')} /> Instagram</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('twitter')} onChange={() => togglePlatform('twitter')} /> Twitter</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('facebook')} onChange={() => togglePlatform('facebook')} /> Facebook</label>
            </div>
            <div style={{display:'grid', gap:'.5rem', marginTop:'.5rem'}}>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
                <label><input type="radio" name="schedmode" checked={scheduleMode==='auto'} onChange={()=>setScheduleMode('auto')} /> Auto-schedule</label>
                <label><input type="radio" name="schedmode" checked={scheduleMode==='manual'} onChange={()=>setScheduleMode('manual')} /> Manual</label>
              </div>
              {scheduleMode==='manual' ? (
                <div style={{display:'flex', gap:'.5rem', alignItems:'center'}}>
                  <input type="datetime-local" value={manualWhen} onChange={(e)=>setManualWhen(e.target.value)} style={{padding:'.4rem', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#eef2ff'}} />
                  <label style={{color:'#9aa4b2'}}>Frequency:
                    <select value={frequency} onChange={(e)=>setFrequency(e.target.value)} style={{marginLeft: '.5rem', background:'rgba(255,255,255,0.05)', color:'#eef2ff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'.3rem .5rem'}}>
                      <option value="once">Once</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                </div>
              ) : (
                <div style={{color:'#9aa4b2'}}>
                  Suggested next time: <span style={{color:'#eef2ff'}}>{new Date(suggestNextTime()).toLocaleString()}</span> · Frequency: {frequency}
                </div>
              )}
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

        {activeTab === 'schedules' && (
          <section className="schedules-panel">
            <h3>My Schedules</h3>
            {schedulesList.length === 0 ? (
              <div style={{ color: '#9aa4b2' }}>No schedules yet. Create one by uploading content and selecting platforms.</div>
            ) : (
              <div className="schedules-list" style={{ display: 'grid', gap: '.5rem' }}>
                {schedulesList.map((sch, i) => {
                  const titleText = typeof sch?.contentTitle === 'string' ? sch.contentTitle : (sch?.contentTitle ? JSON.stringify(sch.contentTitle) : 'Untitled');
                  const platform = sch?.platform || (Array.isArray(sch?.platforms) ? sch.platforms.join(', ') : '—');
                  const frequency = (sch?.frequency || sch?.scheduleType || 'once');
                  const when = formatWhen(sch?.startTime || sch?.startAt || sch?.when);
                  const isActive = sch?.isActive !== false; // default to true unless explicitly false
                  const statusText = isActive ? 'active' : 'paused';
                  return (
                    <div key={i} className="schedule-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr 0.8fr', gap: '.5rem', alignItems: 'center', padding: '.5rem', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <div title={titleText} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleText}</div>
                      <div style={{ color: '#cbd5e1' }}>{platform}</div>
                      <div style={{ color: '#cbd5e1', textTransform: 'capitalize' }}>{frequency}</div>
                      <div style={{ color: '#e2e8f0' }}>{when}</div>
                      <div>
                        <span className={`status status-${statusText}`}>{statusText}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
