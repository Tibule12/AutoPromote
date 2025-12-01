import React from 'react';
import { API_ENDPOINTS } from '../config';

const ConnectionsPanel = ({ platformSummary, discordStatus, spotifyStatus, redditStatus, youtubeStatus, twitterStatus, tiktokStatus, facebookStatus, linkedinStatus, snapchatStatus, telegramStatus, pinterestStatus,
  handleConnectSpotify, handleConnectDiscord, handleConnectReddit, handleConnectYouTube, handleConnectTwitter, handleConnectSnapchat, handleConnectLinkedin, handleConnectTelegram, handleConnectPinterest, handleConnectTikTok, handleConnectFacebook,
  handleDisconnectPlatform
}) => {

  const getPlatformLabel = (platform) => {
    const summary = platformSummary?.summary || {};
    switch(platform) {
      case 'twitter':
        return twitterStatus?.identity?.username || summary.twitter?.username || twitterStatus?.identity?.name || null;
      case 'tiktok':
        return tiktokStatus?.meta?.display_name || summary.tiktok?.display_name || null;
      case 'facebook':
        return facebookStatus?.meta?.pages?.[0]?.name || summary.facebook?.pages?.[0] || null;
      case 'youtube':
        return youtubeStatus?.channel?.snippet?.title || summary.youtube?.channelTitle || null;
      case 'spotify':
        return spotifyStatus?.meta?.display_name || summary.spotify?.display_name || null;
      case 'reddit':
        return redditStatus?.meta?.username || summary.reddit?.name || null;
      case 'discord':
        return discordStatus?.meta?.username || summary.discord?.username || null;
      case 'linkedin':
        return linkedinStatus?.meta?.organizations?.[0]?.name || summary.linkedin?.organizations?.[0] || null;
      case 'telegram':
        return telegramStatus?.meta?.chatId || summary.telegram?.chatId || null;
      case 'pinterest':
        return pinterestStatus?.meta?.boards?.[0]?.name || summary.pinterest?.boards || null;
      case 'snapchat':
        return snapchatStatus?.profile?.username || null;
      default:
        return null;
    }
  };
  return (
    <section className="connections-panel">
      <h3>Connections</h3>
      <div style={{ display: 'grid', gap: '.75rem' }}>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {twitterStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Twitter connected{getPlatformLabel('twitter') ? ` — ${getPlatformLabel('twitter')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectTwitter}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Twitter" className="check-quality" onClick={()=>handleDisconnectPlatform('twitter')}>Disconnect</button>}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectTwitter}>Connect Twitter</button>
              <span style={{color:'#9aa4b2'}}>Connect to post tweets and schedule posts.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {tiktokStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>TikTok connected{getPlatformLabel('tiktok') ? ` — ${getPlatformLabel('tiktok')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectTikTok}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect TikTok" className="check-quality" onClick={()=>handleDisconnectPlatform('tiktok')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>Instagram connected{getPlatformLabel('facebook') ? ` — ${getPlatformLabel('facebook')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectFacebook}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Facebook" className="check-quality" onClick={()=>handleDisconnectPlatform('facebook')}>Disconnect</button>}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectFacebook}>Connect Instagram</button>
              <span style={{color:'#9aa4b2'}}>Connect to manage Instagram via Facebook.</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {snapchatStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Snapchat connected{getPlatformLabel('snapchat') ? ` — ${getPlatformLabel('snapchat')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectSnapchat}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Snapchat" className="check-quality" onClick={()=>handleDisconnectPlatform('snapchat')}>Disconnect</button>}
            </>
          ) : (
            <>
              <button className="check-quality" onClick={handleConnectSnapchat}>Connect Snapchat</button>
              <span style={{color:'#9aa4b2'}}>Connect to post Snaps (if enabled).</span>
            </>
          )}
        </div>
        <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
          {facebookStatus?.connected ? (
            <>
              <span style={{color:'#cbd5e1'}}>Facebook connected{getPlatformLabel('facebook') ? ` — ${getPlatformLabel('facebook')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectFacebook}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Facebook" className="check-quality" onClick={()=>handleDisconnectPlatform('facebook')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>YouTube connected{getPlatformLabel('youtube') ? ` — ${getPlatformLabel('youtube')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectYouTube}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect YouTube" className="check-quality" onClick={()=>handleDisconnectPlatform('youtube')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>Spotify connected{getPlatformLabel('spotify') ? ` — ${getPlatformLabel('spotify')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectSpotify}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Spotify" className="check-quality" onClick={()=>handleDisconnectPlatform('spotify')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>Reddit connected{getPlatformLabel('reddit') ? ` — ${getPlatformLabel('reddit')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectReddit}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Reddit" className="check-quality" onClick={()=>handleDisconnectPlatform('reddit')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>Discord connected{getPlatformLabel('discord') ? ` — ${getPlatformLabel('discord')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectDiscord}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Discord" className="check-quality" onClick={()=>handleDisconnectPlatform('discord')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>LinkedIn connected{getPlatformLabel('linkedin') ? ` — ${getPlatformLabel('linkedin')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectLinkedin}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect LinkedIn" className="check-quality" onClick={()=>handleDisconnectPlatform('linkedin')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>Telegram connected{getPlatformLabel('telegram') ? ` — ${getPlatformLabel('telegram')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectTelegram}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Telegram" className="check-quality" onClick={()=>handleDisconnectPlatform('telegram')}>Disconnect</button>}
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
              <span style={{color:'#cbd5e1'}}>Pinterest connected{getPlatformLabel('pinterest') ? ` — ${getPlatformLabel('pinterest')}` : ''}</span>
              <button className="check-quality" onClick={handleConnectPinterest}>Reconnect</button>
              {handleDisconnectPlatform && <button aria-label="Disconnect Pinterest" className="check-quality" onClick={()=>handleDisconnectPlatform('pinterest')}>Disconnect</button>}
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
