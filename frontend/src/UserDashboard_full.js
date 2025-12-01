// Canonical consolidated user dashboard
import React, { useEffect, useMemo, useState, useRef } from 'react';
import './UserDashboard.css';
import ProfilePanel from './UserDashboardTabs/ProfilePanel';
import UploadPanel from './UserDashboardTabs/UploadPanel';
import SchedulesPanel from './UserDashboardTabs/SchedulesPanel';
import AnalyticsPanel from './UserDashboardTabs/AnalyticsPanel';
import RewardsPanel from './UserDashboardTabs/RewardsPanel';
import NotificationsPanel from './UserDashboardTabs/NotificationsPanel';
import EarningsPanel from './UserDashboardTabs/EarningsPanel';
import ConnectionsPanel from './UserDashboardTabs/ConnectionsPanel';
import { auth } from './firebaseClient';
import { API_ENDPOINTS, API_BASE_URL } from './config';

const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ''}/image.png`;

const UserDashboard = ({ user, content, stats, badges = [], notifications = [], userDefaults, onSaveDefaults, onLogout, onUpload, mySchedules = [], onSchedulesChanged }) => {
	const [activeTab, setActiveTab] = useState('profile');
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [earnings, setEarnings] = useState(null);
	const [notifs, setNotifs] = useState(Array.isArray(notifications) ? notifications : []);
	const [selectedFile, setSelectedFile] = useState(null);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [platformOptions, setPlatformOptions] = useState({});
	const [platformMetadata, setPlatformMetadata] = useState({});
	const [spotifySelectedTracks, setSpotifySelectedTracks] = useState([]);
	const [previewUrl, setPreviewUrl] = useState('');
	const [rotate, setRotate] = useState(0);
	const [flipH, setFlipH] = useState(false);
	const [flipV, setFlipV] = useState(false);
	const [template, setTemplate] = useState('none');
	const [trimStart, setTrimStart] = useState(0);
	const [trimEnd, setTrimEnd] = useState(0);
	const [duration, setDuration] = useState(0);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [type, setType] = useState('video');
	const [scheduleMode, setScheduleMode] = useState('auto');
	const [manualWhen, setManualWhen] = useState('');
	const [frequency, setFrequency] = useState('once');
	const [tz, setTz] = useState(userDefaults?.timezone || 'UTC');
	const [defaultsPlatforms, setDefaultsPlatforms] = useState(Array.isArray(userDefaults?.defaultPlatforms) ? userDefaults.defaultPlatforms : []);
	const [defaultsFrequency, setDefaultsFrequency] = useState(userDefaults?.defaultFrequency || 'once');
	const [scheduleContentMap, setScheduleContentMap] = useState({});
	const [discordStatus, setDiscordStatus] = useState({ connected: false, meta: null });
	const [linkedinStatus, setLinkedinStatus] = useState({ connected: false, meta: null });
	const [telegramStatus, setTelegramStatus] = useState({ connected: false, meta: null });
	const [pinterestStatus, setPinterestStatus] = useState({ connected: false, meta: null });
	const [redditStatus, setRedditStatus] = useState({ connected: false, meta: null });
	const [spotifyStatus, setSpotifyStatus] = useState({ connected: false, meta: null });
	const [youtubeStatus, setYouTubeStatus] = useState({ connected: false, channel: null });
	const [twitterStatus, setTwitterStatus] = useState({ connected: false, identity: null });
	const [snapchatStatus, setSnapchatStatus] = useState({ connected: false, profile: null });
	const [connectBanner, setConnectBanner] = useState(null);
	const [tiktokStatus, setTikTokStatus] = useState({ connected: false, meta: null });
	const [facebookStatus, setFacebookStatus] = useState({ connected: false, meta: null });
	const [payouts, setPayouts] = useState([]);
	const [progress, setProgress] = useState({ contentCount: 0, requiredForRevenue: 0, remaining: 0, revenueEligible: false });
	const [platformSummary, setPlatformSummary] = useState({ platforms: {} });
	const [pinterestCreateVisible, setPinterestCreateVisible] = useState(false);
	const [pinterestCreateName, setPinterestCreateName] = useState('');
	const [pinterestCreateDesc, setPinterestCreateDesc] = useState('');
	const selectedVideoRef = useRef(null);
	const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
	const schedulesList = useMemo(() => (Array.isArray(mySchedules) ? mySchedules : []), [mySchedules]);

		// Toggle dashboard-mode class on mount/unmount so global gradients don't show through dashboard pages
		useEffect(() => {
			document.documentElement?.classList?.add('dashboard-mode');
			document.body?.classList?.add('dashboard-mode');
			return () => {
				document.documentElement?.classList?.remove('dashboard-mode');
				document.body?.classList?.remove('dashboard-mode');
			};
		}, []);

	const handleNav = (tab) => { setActiveTab(tab); setSidebarOpen(false); };
	const triggerSchedulesRefresh = () => { onSchedulesChanged && onSchedulesChanged(); };

	const withAuth = async (cb) => {
		const currentUser = auth?.currentUser;
		if (!currentUser) { alert('Please sign in first'); return; }
		const token = await currentUser.getIdToken(true);
		return cb(token);
	};

	const doPause = async (id) => { await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_PAUSE(id), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); triggerSchedulesRefresh(); } catch (e) { console.warn(e); alert('Failed to pause schedule'); } }); };
	const doResume = async (id) => { await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_RESUME(id), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); triggerSchedulesRefresh(); } catch (e) { console.warn(e); alert('Failed to resume schedule'); } }); };
	const doReschedule = async (id, when) => { await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_RESCHEDULE(id), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ time: when }) }); triggerSchedulesRefresh(); } catch (e) { console.warn(e); alert('Failed to reschedule'); } }); };
	const doDelete = async (id) => { if (!window.confirm('Delete this schedule?')) return; await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_DELETE(id), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); triggerSchedulesRefresh(); } catch (e) { console.warn(e); alert('Failed to delete schedule'); } }); };

	const createSchedule = async ({ contentId, time, frequency, platforms = [], platformOptions = {} }) => {
		try {
			await withAuth(async token => {
				if (!contentId) throw new Error('Missing contentId');
				const res = await fetch(`${API_BASE_URL}/api/content/${contentId}/promotion-schedules`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ time, frequency, platforms, platformOptions }) });
				if (!res.ok) throw new Error('Failed to create schedule');
				triggerSchedulesRefresh();
			});
		} catch (e) {
			console.warn(e);
			alert('Failed to create schedule');
		}
	};

	// Platform status loaders
	const loadSpotifyStatus = async () => {
		try {
			const cur = auth.currentUser; if (!cur) return setSpotifyStatus({ connected: false });
			const token = await cur.getIdToken(true);
			const res = await fetch(API_ENDPOINTS.SPOTIFY_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
			if (!res.ok) return setSpotifyStatus({ connected: false });
			const j = await res.json(); setSpotifyStatus({ connected: !!j.connected, meta: j.meta || null });
			if (j.connected) {
				try {
					const md = await fetch(API_ENDPOINTS.SPOTIFY_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
					if (md.ok) { const mdj = await md.json(); setPlatformMetadata(prev => ({ ...(prev||{}), spotify: mdj.meta || {} })); }
				} catch (_) {}
			}
		} catch (_) { setSpotifyStatus({ connected: false }); }
	};

	const loadYouTubeStatus = async () => {
		try { const cur = auth.currentUser; if (!cur) return setYouTubeStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.YOUTUBE_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setYouTubeStatus({ connected: false }); const d = await res.json(); setYouTubeStatus({ connected: !!d.connected, channel: d.channel || null }); } catch (_) { setYouTubeStatus({ connected: false }); }
	};

	const loadFacebookStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setFacebookStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setFacebookStatus({ connected: false }); const d = await res.json(); setFacebookStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setFacebookStatus({ connected: false }); } };

	const loadTikTokStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setTikTokStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.TIKTOK_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setTikTokStatus({ connected: false }); const d = await res.json(); setTikTokStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setTikTokStatus({ connected: false }); } };

	const loadTwitterStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setTwitterStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.TWITTER_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setTwitterStatus({ connected: false }); const d = await res.json(); setTwitterStatus({ connected: !!d.connected, identity: d.identity || null }); } catch (_) { setTwitterStatus({ connected: false }); } };

	const loadRedditStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setRedditStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.REDDIT_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setRedditStatus({ connected: false }); const d = await res.json(); setRedditStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setRedditStatus({ connected: false }); } };
	const loadDiscordStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setDiscordStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.DISCORD_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setDiscordStatus({ connected: false }); const d = await res.json(); setDiscordStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setDiscordStatus({ connected: false }); } };

	const loadLinkedinStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setLinkedinStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.LINKEDIN_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setLinkedinStatus({ connected: false }); const d = await res.json(); setLinkedinStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setLinkedinStatus({ connected: false }); } };

	const loadTelegramStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setTelegramStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.TELEGRAM_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setTelegramStatus({ connected: false }); const d = await res.json(); setTelegramStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setTelegramStatus({ connected: false }); } };

	const loadPinterestStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setPinterestStatus({ connected: false, meta: null }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.PINTEREST_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setPinterestStatus({ connected: false, meta: null }); const d = await res.json(); setPinterestStatus({ connected: !!d.connected, meta: d.meta || null }); if (d.connected) { try { const md = await fetch(API_ENDPOINTS.PINTEREST_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (md.ok) { const mdj = await md.json(); setPlatformMetadata(prev => ({ ...(prev||{}), pinterest: mdj.meta || {} })); } } catch (_) {} } } catch (_) { setPinterestStatus({ connected: false, meta: null }); } };

	const loadSnapchatStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setSnapchatStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.SNAPCHAT_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setSnapchatStatus({ connected: false }); const d = await res.json(); setSnapchatStatus({ connected: !!d.connected, profile: d.profile || null }); } catch (_) { setSnapchatStatus({ connected: false }); } };

	useEffect(() => {
		// If we need to load platform statuses at mount, we can kick off a fetch here
		const loadInitial = async () => {
			try {
				const currentUser = auth.currentUser;
				if (!currentUser) return;
				// Platform summary + earnings are loaded here
				const token = await currentUser.getIdToken(true);
				const [earnRes, payRes, progRes, platRes] = await Promise.all([
					fetch(API_ENDPOINTS.EARNINGS_SUMMARY, { headers: { Authorization: `Bearer ${token}` }}),
					fetch(API_ENDPOINTS.EARNINGS_PAYOUTS, { headers: { Authorization: `Bearer ${token}` }}),
					fetch(API_ENDPOINTS.USER_PROGRESS, { headers: { Authorization: `Bearer ${token}` }}),
					fetch(API_ENDPOINTS.PLATFORM_STATUS, { headers: { Authorization: `Bearer ${token}` }})
				]);
				if (earnRes.ok) { const d = await earnRes.json(); setEarnings(d); }
				if (payRes.ok) { const d = await payRes.json(); setPayouts(d.payouts || []); }
				if (progRes.ok) { const d = await progRes.json(); setProgress(d); }
				if (platRes.ok) { const d = await platRes.json(); setPlatformSummary(d); }
			} catch (e) { /* ignore */ }
		};
			loadInitial();
			// Load platform statuses
			loadTikTokStatus();
			loadFacebookStatus();
			loadYouTubeStatus();
			loadTwitterStatus();
			loadSnapchatStatus();
			loadSpotifyStatus();
			loadRedditStatus();
			loadDiscordStatus();
			loadLinkedinStatus();
			loadTelegramStatus();
			loadPinterestStatus();
			// If coming back from OAuth, the URL may contain flags like ?tiktok=connected
		const loadEarnings = async () => {
			try { const currentUser = auth.currentUser; if (!currentUser) return; const token = await currentUser.getIdToken(true); const res = await fetch(API_ENDPOINTS.EARNINGS_SUMMARY, { headers: { Authorization: `Bearer ${token}` } }); if (res.ok) { const d = await res.json(); setEarnings(d); } } catch (e) { console.warn(e); }
		};
		if (activeTab === 'earnings') loadEarnings();
	}, [activeTab]);

	const setPlatformOption = (platform, key, value) => {
		setPlatformOptions(prev => ({ ...(prev||{}), [platform]: { ...((prev||{})[platform]||{}), [key]: value } }));
	};

	const togglePlatform = (name) => {
		setSelectedPlatforms((prev) => prev.includes(name) ? prev.filter((p)=>p!==name) : [...prev, name]);
	};

	// Small helper for default platform toggles
	const toggleDefaultPlatform = (name) => {
		setDefaultsPlatforms(prev => prev.includes(name) ? prev.filter((p)=>p!==name) : [...prev, name]);
	};

	const handleSaveDefaults = async () => {
		if (!onSaveDefaults) return;
		try {
			await onSaveDefaults({ timezone: tz, defaultPlatforms: defaultsPlatforms, defaultFrequency: defaultsFrequency });
			alert('Defaults saved');
		} catch (e) { alert('Failed to save defaults'); }
	};

	// Connect handlers; these call the generic openProviderAuth where appropriate
	const handleConnectTikTok = async () => openProviderAuth(API_ENDPOINTS.TIKTOK_AUTH_START);
	const handleConnectFacebook = async () => openProviderAuth(API_ENDPOINTS.FACEBOOK_AUTH_START);
	const handleConnectYouTube = async () => openProviderAuth(API_ENDPOINTS.YOUTUBE_AUTH_START);
	const handleConnectTwitter = async () => openProviderAuth(API_ENDPOINTS.TWITTER_AUTH_PREPARE || API_ENDPOINTS.TWITTER_AUTH_START);
	const handleConnectSnapchat = async () => openProviderAuth(API_ENDPOINTS.SNAPCHAT_AUTH_PREPARE || API_ENDPOINTS.SNAPCHAT_AUTH_START);
	const handleConnectSpotify = async () => openProviderAuth(API_ENDPOINTS.SPOTIFY_AUTH_START);
	const handleConnectReddit = async () => openProviderAuth(API_ENDPOINTS.REDDIT_AUTH_START);
	const handleConnectDiscord = async () => openProviderAuth(API_ENDPOINTS.DISCORD_AUTH_START);
	const handleConnectLinkedin = async () => openProviderAuth(API_ENDPOINTS.LINKEDIN_AUTH_START);
	const handleConnectTelegram = async () => openProviderAuth(API_ENDPOINTS.TELEGRAM_AUTH_START);
	const handleConnectPinterest = async () => openProviderAuth(API_ENDPOINTS.PINTEREST_AUTH_START);

	const markAllNotificationsRead = async () => { try { await withAuth(async (token) => { await fetch(API_ENDPOINTS.NOTIFICATIONS_MARK_READ, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); }); setNotifs([]); } catch (e) { console.warn(e); alert('Failed to mark notifications as read'); } };

	const claimPayout = async () => { try { await withAuth(async (token) => { const res = await fetch(API_ENDPOINTS.EARNINGS_PAYOUT_SELF, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); if (!res.ok) throw new Error('Payout failed'); alert('Payout requested'); }); } catch (e) { console.warn(e); alert('Payout request failed'); } };

	const openProviderAuth = async (endpointUrl) => { try { const currentUser = auth.currentUser; if (!currentUser) { alert('Please sign in first'); return; } const token = await currentUser.getIdToken(true); const res = await fetch(endpointUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }); const data = await res.json(); if (!res.ok || !data?.authUrl) throw new Error('Auth prepare failed'); const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''); if (isMobile) window.location.href = data.authUrl; else window.open(data.authUrl, '_blank'); } catch (e) { console.warn(e); alert(e.message || 'Failed to start auth'); } };

	return (
		<div className="dashboard-root">
			<header className="dashboard-topbar" aria-label="Top navigation">
				<button className="hamburger" aria-label={sidebarOpen ? 'Close menu' : 'Open menu'} aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(v => !v)}>
					<span />
					<span />
					<span />
				</button>
				<div className="topbar-title">Your Dashboard</div>
				<div className="topbar-user">{user?.name || 'Guest'}</div>
			</header>

			<aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Sidebar">
				<div className="profile-section">
					<img className="profile-avatar" src={user?.avatarUrl || DEFAULT_IMAGE} alt="Avatar" />
					<h2>{user?.name || 'User Name'}</h2>
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
						<li className={activeTab === 'earnings' ? 'active' : ''} onClick={() => handleNav('earnings')}>Earnings</li>
						<li className={activeTab === 'connections' ? 'active' : ''} onClick={() => handleNav('connections')}>Connections</li>
					</ul>
				</nav>
				<button className="logout-btn" onClick={onLogout}>Logout</button>
			</aside>

			<main className="dashboard-main">
				{activeTab === 'profile' && (
					<ProfilePanel user={user} stats={stats}
						tiktokStatus={tiktokStatus} facebookStatus={facebookStatus} youtubeStatus={youtubeStatus} twitterStatus={twitterStatus} snapchatStatus={snapchatStatus}
						spotifyStatus={spotifyStatus} redditStatus={redditStatus} discordStatus={discordStatus} linkedinStatus={linkedinStatus} telegramStatus={telegramStatus} pinterestStatus={pinterestStatus}
						tz={tz} defaultsPlatforms={defaultsPlatforms} defaultsFrequency={defaultsFrequency} toggleDefaultPlatform={toggleDefaultPlatform} setDefaultsFrequency={setDefaultsFrequency} setTz={setTz} handleSaveDefaults={handleSaveDefaults}
						handleConnectTikTok={handleConnectTikTok} handleConnectFacebook={handleConnectFacebook} handleConnectYouTube={handleConnectYouTube} handleConnectTwitter={handleConnectTwitter}
						handleConnectSnapchat={handleConnectSnapchat} handleConnectSpotify={handleConnectSpotify} handleConnectReddit={handleConnectReddit} handleConnectDiscord={handleConnectDiscord}
						handleConnectLinkedin={handleConnectLinkedin} handleConnectTelegram={handleConnectTelegram} handleConnectPinterest={handleConnectPinterest}
					/>
				)}

				{activeTab === 'upload' && (
					<UploadPanel
						onUpload={onUpload}
						contentList={contentList}
						platformMetadata={platformMetadata}
						platformOptions={platformOptions}
						setPlatformOption={setPlatformOption}
						selectedPlatforms={selectedPlatforms}
						setSelectedPlatforms={setSelectedPlatforms}
						spotifySelectedTracks={spotifySelectedTracks}
						setSpotifySelectedTracks={setSpotifySelectedTracks}
					/>
				)}

				{activeTab === 'schedules' && (
					<SchedulesPanel schedulesList={schedulesList} contentList={contentList} onCreate={createSchedule} onPause={doPause} onResume={doResume} onReschedule={doReschedule} onDelete={doDelete} />
				)}

				{activeTab === 'analytics' && (
					<AnalyticsPanel />
				)}

				{activeTab === 'rewards' && (
					<RewardsPanel badges={badges} />
				)}

				{activeTab === 'notifications' && (
					<NotificationsPanel notifs={notifs} onMarkAllRead={markAllNotificationsRead} />
				)}

				{activeTab === 'earnings' && (
					<EarningsPanel earnings={earnings} onClaim={claimPayout} />
				)}

				{activeTab === 'connections' && (
					<ConnectionsPanel platformSummary={platformSummary}
						discordStatus={discordStatus} spotifyStatus={spotifyStatus} redditStatus={redditStatus} youtubeStatus={youtubeStatus} twitterStatus={twitterStatus} tiktokStatus={tiktokStatus} facebookStatus={facebookStatus} linkedinStatus={linkedinStatus} snapchatStatus={snapchatStatus} telegramStatus={telegramStatus} pinterestStatus={pinterestStatus}
						handleConnectSpotify={handleConnectSpotify} handleConnectDiscord={handleConnectDiscord} handleConnectReddit={handleConnectReddit} handleConnectYouTube={handleConnectYouTube} handleConnectTwitter={handleConnectTwitter} handleConnectSnapchat={handleConnectSnapchat} handleConnectLinkedin={handleConnectLinkedin} handleConnectTelegram={handleConnectTelegram} handleConnectPinterest={handleConnectPinterest} handleConnectTikTok={handleConnectTikTok} handleConnectFacebook={handleConnectFacebook}
					/>
				)}
			</main>
		</div>
	);
};

export default UserDashboard;

