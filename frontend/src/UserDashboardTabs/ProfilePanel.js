import React from 'react';

const ProfilePanel = ({
  user,
  stats,
  // connection status objects
  tiktokStatus, facebookStatus, youtubeStatus, twitterStatus, snapchatStatus,
  spotifyStatus, redditStatus, discordStatus, linkedinStatus, telegramStatus, pinterestStatus,
  // defaults and handlers
  tz, defaultsPlatforms, defaultsFrequency, toggleDefaultPlatform, setDefaultsFrequency, setTz, handleSaveDefaults,
  // connect handlers
  handleConnectTikTok, handleConnectFacebook, handleConnectYouTube, handleConnectTwitter,
  handleConnectSnapchat, handleConnectSpotify, handleConnectReddit, handleConnectDiscord,
  handleConnectLinkedin, handleConnectTelegram, handleConnectPinterest
}) => {
  const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ''}/image.png`;
  return (
    <section className="profile-details">
      <h3>Landing Page Preview</h3>
      <div className="landing-preview">
        <img className="landing-thumbnail" src={user?.thumbnailUrl || DEFAULT_IMAGE} alt="Landing Thumbnail" />
        <div style={{ color: '#9aa4b2', marginTop: '.5rem' }}>Welcome back, {user?.name || 'User'}.</div>
      </div>
      <div className="performance-summary">
        <div><strong>Views:</strong> {stats?.views ?? 0}</div>
        <div><strong>Clicks:</strong> {stats?.clicks ?? 0}</div>
        <div><strong>CTR:</strong> {stats?.ctr ?? 0}%</div>
      </div>

      <div className="platform-connections" style={{marginTop:'1rem'}}>
        <h4>Platform Connections</h4>
        {/* We'll render a subset of connection controls here; the full connections panel shows more details */}
        <div style={{display:'grid', gap:'.5rem'}}>
          <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
            {tiktokStatus?.connected ? (
              <>
                <span style={{color:'#cbd5e1'}}>TikTok connected</span>
                <button className="check-quality" onClick={handleConnectTikTok}>Reconnect</button>
              </>
            ) : (
              <>
                <button className="check-quality" onClick={handleConnectTikTok}>Connect TikTok</button>
                <span style={{color:'#9aa4b2'}}>Connect to link your TikTok account for future posting and analytics.</span>
              </>
            )}
          </div>
          <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
            {facebookStatus?.connected ? (
              <>
                <span style={{color:'#cbd5e1'}}>Facebook connected</span>
                <button className="check-quality" onClick={handleConnectFacebook}>Reconnect</button>
              </>
            ) : (
              <>
                <button className="check-quality" onClick={handleConnectFacebook}>Connect Facebook</button>
                <span style={{color:'#9aa4b2'}}>Connect to manage Pages and Instagram.</span>
              </>
            )}
          </div>
          <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
            {youtubeStatus?.connected ? (
              <>
                <span style={{color:'#cbd5e1'}}>YouTube connected</span>
                <button className="check-quality" onClick={handleConnectYouTube}>Reconnect</button>
              </>
            ) : (
              <>
                <button className="check-quality" onClick={handleConnectYouTube}>Connect YouTube</button>
                <span style={{color:'#9aa4b2'}}>Connect to upload videos directly.</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="profile-defaults" style={{marginTop:'1rem'}}>
        <h4>Profile Defaults</h4>
        <div style={{display:'grid', gap:'.5rem', maxWidth: 520}}>
          <label style={{color:'#9aa4b2'}}>Timezone
            <input type="text" value={tz} onChange={(e)=>setTz && setTz(e.target.value)} style={{display:'block', width:'100%', marginTop:'.25rem', padding:'.4rem', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#eef2ff'}} />
          </label>
          <div style={{color:'#9aa4b2'}}>Default Platforms</div>
          <div className="platform-toggles">
            {['youtube','twitter','linkedin','discord','reddit','spotify','telegram','tiktok','facebook','instagram','snapchat','pinterest'].map((p)=> (
              <label key={p}><input type="checkbox" checked={Array.isArray(defaultsPlatforms) ? defaultsPlatforms.includes(p) : false} onChange={()=>toggleDefaultPlatform && toggleDefaultPlatform(p)} /> {p.charAt(0).toUpperCase()+p.slice(1)}{(p==='tiktok' || p==='facebook' || p==='instagram' || p==='snapchat' || p==='pinterest') ? ' ⏳' : ' ✅'}</label>
            ))}
          </div>
          <label style={{color:'#9aa4b2'}}>Default Frequency
            <select value={defaultsFrequency} onChange={(e)=>setDefaultsFrequency && setDefaultsFrequency(e.target.value)} style={{display:'block', width:'100%', marginTop:'.25rem', background:'rgba(255,255,255,0.05)', color:'#eef2ff', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'8px', padding:'.3rem .5rem'}}>
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
  );
};

export default ProfilePanel;
