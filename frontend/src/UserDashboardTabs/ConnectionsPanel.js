import React from 'react';
import { API_ENDPOINTS } from '../config';

const ConnectionsPanel = ({ platformSummary, discordStatus, spotifyStatus, redditStatus, youtubeStatus, twitterStatus, tiktokStatus, facebookStatus, linkedinStatus, snapchatStatus, telegramStatus, pinterestStatus,
  handleConnectSpotify, handleConnectDiscord, handleConnectReddit, handleConnectYouTube, handleConnectTwitter, handleConnectSnapchat, handleConnectLinkedin, handleConnectTelegram, handleConnectPinterest, handleConnectTikTok, handleConnectFacebook
}) => {
  return (
    <section className="connections-panel">
      <h3>Connections</h3>
      <div style={{ display: 'grid', gap: '.75rem' }}>
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
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {spotifyStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Spotify connected</span>
              <button className="check-quality" onClick={handleConnectSpotify}>Reconnect</button>
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectSpotify}>Connect Spotify</button>
              <span style={{color:'#9aa4b2'}}>Connect to enable playlist sharing and analytics.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {redditStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Reddit connected</span>
              <button className="check-quality" onClick={handleConnectReddit}>Reconnect</button>
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectReddit}>Connect Reddit</button>
              <span style={{color:'#9aa4b2'}}>Connect to cross-post to your subreddit or profile.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {discordStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Discord connected</span>
              <button className="check-quality" onClick={handleConnectDiscord}>Reconnect</button>
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectDiscord}>Connect Discord</button>
              <span style={{color:'#9aa4b2'}}>Connect to post to channels or get analytics.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {linkedinStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>LinkedIn connected</span>
              <button className="check-quality" onClick={handleConnectLinkedin}>Reconnect</button>
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectLinkedin}>Connect LinkedIn</button>
              <span style={{color:'#9aa4b2'}}>Connect to share posts and company pages.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {telegramStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Telegram connected</span>
              <button className="check-quality" onClick={handleConnectTelegram}>Reconnect</button>
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectTelegram}>Connect Telegram</button>
              <span style={{color:'#9aa4b2'}}>Connect to post to channels or groups.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {pinterestStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Pinterest connected</span>
              <button className="check-quality" onClick={handleConnectPinterest}>Reconnect</button>
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectPinterest}>Connect Pinterest</button>
              <span style={{color:'#9aa4b2'}}>Connect to pin content and manage boards.</span>
            </>
          )}
        </div>
      </div>
      <div style={{marginTop:'.75rem'}}>
        <h4>Aggregated Platform Summary</h4>
        <pre style={{background:'rgba(255,255,255,0.05)', padding:'.75rem', borderRadius:8, maxHeight:300, overflow:'auto'}}>{JSON.stringify(platformSummary, null, 2)}</pre>
      </div>
    </section>
  );
};

export default ConnectionsPanel;
