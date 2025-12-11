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
import AdminAuditViewer from './AdminAuditViewer';
import SecurityPanel from './UserDashboardTabs/SecurityPanel';
import CommunityPanel from './UserDashboardTabs/CommunityPanel';
import CommunityFeed from './CommunityFeed';
import ClipStudioPanel from './UserDashboardTabs/ClipStudioPanel';
import AdsPanel from './UserDashboardTabs/AdsPanel';
import UsageLimitBanner from './components/UsageLimitBanner';
import { auth } from './firebaseClient';
import { API_ENDPOINTS, API_BASE_URL } from './config';
import toast, { Toaster } from 'react-hot-toast';
import { cachedFetch, batchWithDelay, clearCache } from './utils/requestCache';

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
	const [systemHealth, setSystemHealth] = useState({ ok: true, status: 'unknown', message: null });
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
				// Fetch system health on dashboard load and log to console if any service degraded
				(async function checkSystemHealth(){
					try {
						const res = await fetch(`${API_BASE_URL}/api/health`);
						const json = await res.json();
						if (!res.ok || (json && json.status && json.status !== 'OK')) {
							setSystemHealth({ ok: false, status: json && json.status || 'degraded', message: json && json.message });
							console.error('[SystemHealth] Dashboard detected degraded system:', json);
						} else {
							setSystemHealth({ ok: true, status: 'OK', message: null });
						}
					} catch (e) {
						setSystemHealth({ ok: false, status: 'error', message: e.message });
						console.error('[SystemHealth] Dashboard detected error checking health:', e && e.message);
					}
				})();

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
		if (!currentUser) { toast.error('Please sign in first'); return; }
		try {
			const token = await currentUser.getIdToken(true);
			return cb(token);
		} catch (error) {
			// Silently handle token refresh errors
			console.warn('Token refresh failed:', error.message);
			return null;
		}
	};

	const doPause = async (id) => { await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_PAUSE(id), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); triggerSchedulesRefresh(); toast.success('Schedule paused'); } catch (e) { console.warn(e); toast.error('Failed to pause schedule'); } }); };
	const doResume = async (id) => { await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_RESUME(id), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); triggerSchedulesRefresh(); toast.success('Schedule resumed'); } catch (e) { console.warn(e); toast.error('Failed to resume schedule'); } }); };
	const doReschedule = async (id, when) => { await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_RESCHEDULE(id), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ time: when }) }); triggerSchedulesRefresh(); toast.success('Schedule updated'); } catch (e) { console.warn(e); toast.error('Failed to reschedule'); } }); };
	const doDelete = async (id) => { if (!window.confirm('Delete this schedule?')) return; await withAuth(async (token) => { try { await fetch(API_ENDPOINTS.SCHEDULE_DELETE(id), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); triggerSchedulesRefresh(); toast.success('Schedule deleted'); } catch (e) { console.warn(e); toast.error('Failed to delete schedule'); } }); };

	const createSchedule = async ({ contentId, time, frequency, platforms = [], platformOptions = {} }) => {
		const toastId = toast.loading('Creating schedule...');
		try {
			await withAuth(async token => {
				if (!contentId) throw new Error('Missing contentId');
				const res = await fetch(`${API_BASE_URL}/api/content/${contentId}/promotion-schedules`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ time, frequency, platforms, platformOptions }) });
				if (!res.ok) throw new Error('Failed to create schedule');
				triggerSchedulesRefresh();
				toast.success('Schedule created successfully!', { id: toastId });
			});
		} catch (e) {
			console.warn(e);
			toast.error('Failed to create schedule', { id: toastId });
		}
	};

	// Platform status loaders (with caching)
	const loadSpotifyStatus = async () => {
		try {
			const cur = auth.currentUser; if (!cur) return setSpotifyStatus({ connected: false });
			const token = await cur.getIdToken(true);
			const data = await cachedFetch('spotify-status', async () => {
				const res = await fetch(API_ENDPOINTS.SPOTIFY_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
				if (!res.ok) return { connected: false };
				const j = await res.json();
				if (j.connected) {
					try {
						const md = await fetch(API_ENDPOINTS.SPOTIFY_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
						if (md.ok) { const mdj = await md.json(); return { ...j, metadata: mdj.meta || {} }; }
					} catch (_) {}
				}
				return j;
			}, 30000);
			setSpotifyStatus({ connected: !!data.connected, meta: data.meta || null });
			if (data.metadata) setPlatformMetadata(prev => ({ ...(prev||{}), spotify: data.metadata }));
		} catch (_) { setSpotifyStatus({ connected: false }); }
	};

	const loadYouTubeStatus = async () => {
		try {
			const cur = auth.currentUser; if (!cur) return setYouTubeStatus({ connected: false });
			const token = await cur.getIdToken(true);
			const data = await cachedFetch('youtube-status', async () => {
				const res = await fetch(API_ENDPOINTS.YOUTUBE_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
				if (!res.ok) return { connected: false };
				const d = await res.json();
				if (d.connected) {
					try {
						const md = await fetch(API_ENDPOINTS.YOUTUBE_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
						if (md.ok) { const mdj = await md.json(); return { ...d, metadata: mdj.meta || {} }; }
					} catch (_) {}
				}
				return d;
			}, 30000);
			setYouTubeStatus({ connected: !!data.connected, channel: data.channel || null });
			if (data.metadata) setPlatformMetadata(prev => ({ ...(prev||{}), youtube: data.metadata }));
		} catch (_) { setYouTubeStatus({ connected: false }); }
	};

	const loadFacebookStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setFacebookStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setFacebookStatus({ connected: false }); const d = await res.json(); setFacebookStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setFacebookStatus({ connected: false }); } };

	const loadTikTokStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setTikTokStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.TIKTOK_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setTikTokStatus({ connected: false }); const d = await res.json(); setTikTokStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setTikTokStatus({ connected: false }); } };

	const loadTwitterStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setTwitterStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.TWITTER_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setTwitterStatus({ connected: false }); const d = await res.json(); setTwitterStatus({ connected: !!d.connected, identity: d.identity || null }); } catch (_) { setTwitterStatus({ connected: false }); } };

	const loadRedditStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setRedditStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.REDDIT_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setRedditStatus({ connected: false }); const d = await res.json(); setRedditStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setRedditStatus({ connected: false }); } };
	const loadDiscordStatus = async () => {
		try {
			const cur = auth.currentUser; if (!cur) return setDiscordStatus({ connected: false });
			const token = await cur.getIdToken(true);
			const data = await cachedFetch('discord-status', async () => {
				const res = await fetch(API_ENDPOINTS.DISCORD_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
				if (!res.ok) return { connected: false };
				const d = await res.json();
				if (d.connected) {
					try {
						const md = await fetch(API_ENDPOINTS.DISCORD_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
						if (md.ok) { const mdj = await md.json(); return { ...d, metadata: mdj.meta || {} }; }
					} catch (_) {}
				}
				return d;
			}, 30000);
			setDiscordStatus({ connected: !!data.connected, meta: data.meta || null });
			if (data.metadata) setPlatformMetadata(prev => ({ ...(prev||{}), discord: data.metadata }));
		} catch (_) { setDiscordStatus({ connected: false }); }
	};

	const loadLinkedinStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setLinkedinStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.LINKEDIN_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setLinkedinStatus({ connected: false }); const d = await res.json(); setLinkedinStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setLinkedinStatus({ connected: false }); } };

	const loadTelegramStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setTelegramStatus({ connected: false }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.TELEGRAM_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setTelegramStatus({ connected: false }); const d = await res.json(); setTelegramStatus({ connected: !!d.connected, meta: d.meta || null }); } catch (_) { setTelegramStatus({ connected: false }); } };

	const loadPinterestStatus = async () => { try { const cur = auth.currentUser; if (!cur) return setPinterestStatus({ connected: false, meta: null }); const token = await cur.getIdToken(true); const res = await fetch(API_ENDPOINTS.PINTEREST_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (!res.ok) return setPinterestStatus({ connected: false, meta: null }); const d = await res.json(); setPinterestStatus({ connected: !!d.connected, meta: d.meta || null }); if (d.connected) { try { const md = await fetch(API_ENDPOINTS.PINTEREST_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }); if (md.ok) { const mdj = await md.json(); setPlatformMetadata(prev => ({ ...(prev||{}), pinterest: mdj.meta || {} })); } } catch (_) {} } } catch (_) { setPinterestStatus({ connected: false, meta: null }); } };

	const loadSnapchatStatus = async () => {
		try {
			const cur = auth.currentUser; if (!cur) return setSnapchatStatus({ connected: false });
			const token = await cur.getIdToken(true);
			const res = await fetch(API_ENDPOINTS.SNAPCHAT_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
			if (!res.ok) return setSnapchatStatus({ connected: false });
			const d = await res.json();
			setSnapchatStatus({ connected: !!d.connected, profile: d.profile || null });
			if (d.connected) {
				try {
					const md = await fetch(API_ENDPOINTS.SNAPCHAT_METADATA, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
					if (md.ok) { const mdj = await md.json(); setPlatformMetadata(prev => ({ ...(prev||{}), snapchat: mdj.meta || {} })); }
				} catch (_) {}
			}
		} catch (_) { setSnapchatStatus({ connected: false }); }
	};

	// Load all platform statuses from the unified endpoint
	const loadAllPlatformStatusesUnified = async () => {
		try {
			const cur = auth.currentUser;
			if (!cur) return;
			const token = await cur.getIdToken(true);
			
			const res = await fetch(API_ENDPOINTS.PLATFORM_STATUS, { 
				headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } 
			});
			
			if (!res.ok) {
				console.error('Failed to load unified platform status');
				return;
			}
			
		const data = await res.json();
		// Use 'raw' which contains the full connection data from Firestore
		const platforms = data.raw || {};
		
		// Update all individual status states from the unified response
		if (platforms.youtube) {
			setYouTubeStatus({ connected: !!platforms.youtube.connected, channel: platforms.youtube.channel || null });
		}
		if (platforms.twitter) {
			setTwitterStatus({ connected: !!platforms.twitter.connected, identity: platforms.twitter.identity || null });
		}
		if (platforms.tiktok) {
			setTikTokStatus({ connected: !!platforms.tiktok.connected, meta: platforms.tiktok.meta || null, profile: platforms.tiktok.profile || null, display_name: platforms.tiktok.display_name || null });
		}
		if (platforms.facebook) {
			setFacebookStatus({ connected: !!platforms.facebook.connected, meta: platforms.facebook.meta || null, pages: platforms.facebook.pages || null, profile: platforms.facebook.profile || null });
		}
		if (platforms.spotify) {
			setSpotifyStatus({ connected: !!platforms.spotify.connected, meta: platforms.spotify.meta || null });
		}
		if (platforms.reddit) {
			setRedditStatus({ connected: !!platforms.reddit.connected, meta: platforms.reddit.meta || null, profile: platforms.reddit.profile || null });
		}
		if (platforms.discord) {
			setDiscordStatus({ connected: !!platforms.discord.connected, meta: platforms.discord.meta || null, profile: platforms.discord.profile || null });
		}
		if (platforms.linkedin) {
			setLinkedinStatus({ connected: !!platforms.linkedin.connected, meta: platforms.linkedin.meta || null, profile: platforms.linkedin.profile || null });
		}
		if (platforms.telegram) {
			setTelegramStatus({ connected: !!platforms.telegram.connected, meta: platforms.telegram.meta || null, profile: platforms.telegram.profile || null, userId: platforms.telegram.userId || null, username: platforms.telegram.username || null });
		}
		if (platforms.pinterest) {
			setPinterestStatus({ connected: !!platforms.pinterest.connected, meta: platforms.pinterest.meta || null, profile: platforms.pinterest.profile || null });
		}
		if (platforms.snapchat) {
			setSnapchatStatus({ connected: !!platforms.snapchat.connected, profile: platforms.snapchat.profile || null });
		}			// Also update the platformSummary state
			setPlatformSummary(data);
		} catch (err) {
			console.error('Error loading unified platform statuses:', err);
		}
	};

	useEffect(() => {
		// Check URL params for OAuth callback success/error
		const params = new URLSearchParams(window.location.search);
		const oauthPlatform = params.get('oauth') || params.get('youtube') || params.get('tiktok') || params.get('facebook') || params.get('twitter') || params.get('spotify') || params.get('discord') || params.get('reddit') || params.get('linkedin') || params.get('pinterest') || params.get('telegram') || params.get('snapchat');
		const oauthStatus = params.get('status');
		
		if (oauthPlatform) {
			// Clear URL params without reload
			const cleanUrl = window.location.pathname + window.location.hash;
			window.history.replaceState({}, '', cleanUrl);
			
			// Clear ALL platform status caches to force fresh data
			clearCache();
			
			// Show toast notification
			if (oauthStatus === 'success' || params.get(oauthPlatform) === 'connected') {
				setConnectBanner({ type: 'success', message: `${oauthPlatform.charAt(0).toUpperCase() + oauthPlatform.slice(1)} connected successfully!` });
				toast.success(`${oauthPlatform.charAt(0).toUpperCase() + oauthPlatform.slice(1)} connected successfully!`);
				// Auto-dismiss after 5 seconds
				setTimeout(() => setConnectBanner(null), 5000);
			} else if (oauthStatus === 'error' || params.get(oauthPlatform) === 'error') {
				setConnectBanner({ type: 'error', message: `Failed to connect ${oauthPlatform}. Please try again.` });
				toast.error(`Failed to connect ${oauthPlatform}. Please try again.`);
				setTimeout(() => setConnectBanner(null), 5000);
			}
			
			// Trigger refresh of all platform statuses with cleared cache
			setTimeout(() => refreshAllStatus(), 500);
		}

		// Load initial data with caching and rate limit protection
		const loadInitial = async () => {
			try {
				const currentUser = auth.currentUser;
				if (!currentUser) return;
				const token = await currentUser.getIdToken(true);
				
				// Load critical data first (with caching)
				await cachedFetch('initial-data', async () => {
					const [earnRes, payRes, progRes] = await Promise.all([
						fetch(API_ENDPOINTS.EARNINGS_SUMMARY, { headers: { Authorization: `Bearer ${token}` }}).catch(() => null),
						fetch(API_ENDPOINTS.EARNINGS_PAYOUTS, { headers: { Authorization: `Bearer ${token}` }}).catch(() => null),
						fetch(API_ENDPOINTS.USER_PROGRESS, { headers: { Authorization: `Bearer ${token}` }}).catch(() => null)
					]);
					if (earnRes?.ok) { const d = await earnRes.json(); setEarnings(d); }
					if (payRes?.ok) { const d = await payRes.json(); setPayouts(d.payouts || []); }
					if (progRes?.ok) { const d = await progRes.json(); setProgress(d); }
					return true;
				}, 60000); // 60s cache
				
				// Load all platform statuses from the unified endpoint
				await loadAllPlatformStatusesUnified();
			} catch (e) { /* ignore */ }
		};
			// If user is already present, run initial load. Otherwise wait for auth state.
			const currentUser = auth.currentUser;
			if (currentUser) {
				loadInitial();
			} else {
				// Wait for auth state to initialize then run loadInitial once
				const unsubscribe = auth.onAuthStateChanged((u) => {
					if (u) {
						// run initial load once
						loadInitial().catch(() => {});
						unsubscribe();
					}
				});
			}
		const loadEarnings = async () => {
			try { const currentUser = auth.currentUser; if (!currentUser) return; const token = await currentUser.getIdToken(true); const res = await fetch(API_ENDPOINTS.EARNINGS_SUMMARY, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ ok: false })); if (res.ok) { const d = await res.json().catch(() => null); if (d) setEarnings(d); } } catch (e) { /* silently ignore */ }
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
			toast.success('Defaults saved successfully!');
		} catch (e) { toast.error('Failed to save defaults'); }
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
	const handleConnectTelegram = async () => openProviderAuth(API_ENDPOINTS.TELEGRAM_AUTH_PREPARE || API_ENDPOINTS.TELEGRAM_AUTH_START);
	const handleConnectPinterest = async () => openProviderAuth(API_ENDPOINTS.PINTEREST_AUTH_START);

	const refreshAllStatus = async () => {
		// Use the unified loader instead of calling individual endpoints
		await loadAllPlatformStatusesUnified();
	};

	const handleDisconnectPlatform = async (platform) => {
		if (!window.confirm(`Disconnect ${platform}?`)) return;
		await withAuth(async (token) => {
			try {
				const res = await fetch(API_ENDPOINTS.PLATFORM_DISCONNECT(platform), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
				if (!res.ok) { const j = await res.json().catch(()=>({})); throw new Error(j.error || 'Failed to disconnect'); }
				
				// Show success banner
				setConnectBanner({ type: 'success', message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected successfully` });
				setTimeout(() => setConnectBanner(null), 4000);
				
				// Immediately update local state to reflect disconnection
				switch(platform) {
					case 'tiktok': setTikTokStatus({ connected: false, meta: null }); break;
					case 'facebook': setFacebookStatus({ connected: false, meta: null }); break;
					case 'youtube': setYouTubeStatus({ connected: false, channel: null }); break;
					case 'twitter': setTwitterStatus({ connected: false, identity: null }); break;
					case 'snapchat': setSnapchatStatus({ connected: false, profile: null }); break;
					case 'spotify': setSpotifyStatus({ connected: false, meta: null }); break;
					case 'reddit': setRedditStatus({ connected: false, meta: null }); break;
					case 'discord': setDiscordStatus({ connected: false, meta: null }); break;
					case 'linkedin': setLinkedinStatus({ connected: false, meta: null }); break;
					case 'telegram': setTelegramStatus({ connected: false, meta: null }); break;
					case 'pinterest': setPinterestStatus({ connected: false, meta: null }); break;
				}
				
				// Refresh statuses from server to confirm
				await refreshAllStatus();
			} catch (e) {
				console.warn(e);
				setConnectBanner({ type: 'error', message: e.message || 'Failed to disconnect' });
				setTimeout(() => setConnectBanner(null), 4000);
				toast.error(e.message || 'Failed to disconnect');
			}
		});
	};

	const markAllNotificationsRead = async () => { try { await withAuth(async (token) => { await fetch(API_ENDPOINTS.NOTIFICATIONS_MARK_READ, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) }); }); setNotifs([]); toast.success('All notifications marked as read'); } catch (e) { console.warn(e); toast.error('Failed to mark notifications as read'); } };

	const claimPayout = async () => { const toastId = toast.loading('Requesting payout...'); try { await withAuth(async (token) => { const res = await fetch(API_ENDPOINTS.EARNINGS_PAYOUT_SELF, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); if (!res.ok) throw new Error('Payout failed'); toast.success('Payout requested successfully!', { id: toastId }); }); } catch (e) { console.warn(e); toast.error('Payout request failed', { id: toastId }); } };

	const openProviderAuth = async (endpointUrl) => {
		try {
			const currentUser = auth.currentUser;
			if (!currentUser) { toast.error('Please sign in first'); return; }
			const token = await currentUser.getIdToken(true);
			const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

			// If the endpoint is a "prepare" endpoint, POST to it to retrieve the authUrl
			const isPrepareEndpoint = String(endpointUrl).includes('/prepare') || String(endpointUrl).endsWith('/oauth/prepare');
			if (isPrepareEndpoint) {
				try {
					const prepareRes = await fetch(endpointUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ popup: true }) });
						const prepareData = await prepareRes.json().catch(()=>null);
						if (!prepareRes.ok) {
							const msg = (prepareData && (prepareData.error || prepareData.details || prepareData.message)) ? (prepareData.error || prepareData.details || prepareData.message) : 'Auth prepare failed';
							console.warn('Prepare endpoint POST returned error', prepareRes.status, msg, prepareData);
							toast.error(msg);
							return;
						}
						if (!prepareData?.authUrl) {
							toast.error('Auth prepare failed: no authUrl returned');
							return;
						}
						// If provider probe returned 5xx or probe error, surface helpful error and do not open provider page
						const probeStatus = prepareData.probeStatus;
						if (probeStatus === 'probe_error' || (typeof probeStatus === 'number' && probeStatus >= 500)) {
							console.warn('Provider probe indicates an error, aborting open. probeStatus=', probeStatus, prepareData);
							toast.error('Provider temporarily unavailable. Please try again later or contact support.');
							return;
						}
						toast.success('Opening authentication window...');
						if (isMobile && prepareData.appUrl) window.location.href = prepareData.appUrl;
						else if (isMobile) window.location.href = prepareData.authUrl;
						else window.open(prepareData.authUrl, '_blank');
					return;
				} catch (err) {
					console.warn('Prepare endpoint POST failed:', err.message);
					toast.error('Failed to start authentication. Please try again.');
					return; // don't try to GET a prepare endpoint
				}
			}

			// First, check if this is a two-step flow (returns JSON with prepareUrl) or direct redirect
			// Try GET first to see what we get
			try {
				const checkRes = await fetch(endpointUrl, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
				const contentType = checkRes.headers.get('content-type');
				if (contentType?.includes('application/json')) {
					// Two-step flow: GET returns JSON with prepareUrl, then POST to prepare
					const data = await checkRes.json();
					if (data.prepareUrl) {
						// POST to prepare endpoint to get the actual auth URL
						const prepareRes = await fetch(data.prepareUrl, {
							method: 'POST',
							headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
						});
						const prepareData = await prepareRes.json();
						if (!prepareRes.ok) {
							const msg = prepareData && (prepareData.error || prepareData.details || prepareData.message) ? (prepareData.error || prepareData.details || prepareData.message) : 'Auth prepare failed';
							toast.error(msg);
							return;
						}
						if (!prepareData?.authUrl) {
							toast.error('Auth prepare failed: no authUrl returned');
							return;
						}
						toast.success('Opening authentication window...');
						if (isMobile) window.location.href = prepareData.authUrl;
						else window.open(prepareData.authUrl, '_blank');
						return;
					}
				}
			} catch (jsonErr) {
				// Not JSON or fetch failed, fall through to direct redirect approach
				console.log('Two-step auth not available, using direct redirect', jsonErr.message);
			}

			// Direct redirect flow: append token as query param and open
			const separator = endpointUrl.includes('?') ? '&' : '?';
			const authUrl = `${endpointUrl}${separator}id_token=${encodeURIComponent(token)}`;
			toast.success('Opening authentication window...');
			if (isMobile) window.location.href = authUrl;
			else window.open(authUrl, '_blank');
		} catch (e) { console.warn(e); toast.error(e.message || 'Failed to start auth'); }
	};

	return (
		<div className="dashboard-root">
			<Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: '#1a1a2e', color: '#fff' } }} />
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
					<li className={activeTab === 'ads' ? 'active' : ''} onClick={() => handleNav('ads')}>📢 Ads</li>
					<li className={activeTab === 'connections' ? 'active' : ''} onClick={() => handleNav('connections')}>Connections</li>
					<li className={activeTab === 'admin-audit' ? 'active' : ''} onClick={() => handleNav('admin-audit')}>Admin Audit</li>
					<li className={activeTab === 'security' ? 'active' : ''} onClick={() => handleNav('security')}>Security</li>
					<li className={activeTab === 'feed' ? 'active' : ''} onClick={() => handleNav('feed')}>🎥 Feed</li>
					<li className={activeTab === 'community' ? 'active' : ''} onClick={() => handleNav('community')}>💬 Forum</li>
					<li className={activeTab === 'clips' ? 'active' : ''} onClick={() => handleNav('clips')}>AI Clips</li>
				</ul>
				</nav>
				<button className="logout-btn" onClick={onLogout}>Logout</button>
			</aside>

			<main className="dashboard-main">
				<UsageLimitBanner />
				{systemHealth && !systemHealth.ok && (
					<div style={{ padding: '8px 12px', background: '#ffebee', color: '#b71c1c', borderRadius: 6, marginBottom: 12 }}>
						⚠️ System status degraded: {systemHealth.status} {systemHealth.message ? ` - ${systemHealth.message}` : ''}
					</div>
				)}
				{connectBanner && (
					<div className={`connect-banner ${connectBanner.type}`} style={{
						padding: '1rem',
						marginBottom: '1rem',
						borderRadius: '8px',
						background: connectBanner.type === 'success' ? '#10b981' : '#ef4444',
						color: '#fff',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between'
					}}>
						<span>{connectBanner.message}</span>
						<button onClick={() => setConnectBanner(null)} style={{
							background: 'transparent',
							border: 'none',
							color: '#fff',
							cursor: 'pointer',
							fontSize: '1.2rem',
							padding: '0 0.5rem'
						}}>×</button>
					</div>
				)}
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

				{activeTab === 'ads' && (
					<AdsPanel />
				)}

				{activeTab === 'connections' && (
					<ConnectionsPanel platformSummary={platformSummary}
						discordStatus={discordStatus} spotifyStatus={spotifyStatus} redditStatus={redditStatus} youtubeStatus={youtubeStatus} twitterStatus={twitterStatus} tiktokStatus={tiktokStatus} facebookStatus={facebookStatus} linkedinStatus={linkedinStatus} snapchatStatus={snapchatStatus} telegramStatus={telegramStatus} pinterestStatus={pinterestStatus}
						handleConnectSpotify={handleConnectSpotify} handleConnectDiscord={handleConnectDiscord} handleConnectReddit={handleConnectReddit} handleConnectYouTube={handleConnectYouTube} handleConnectTwitter={handleConnectTwitter} handleConnectSnapchat={handleConnectSnapchat} handleConnectLinkedin={handleConnectLinkedin} handleConnectTelegram={handleConnectTelegram} handleConnectPinterest={handleConnectPinterest} handleConnectTikTok={handleConnectTikTok} handleConnectFacebook={handleConnectFacebook}
						handleDisconnectPlatform={handleDisconnectPlatform}
					/>
				)}

				{activeTab === 'admin-audit' && (
					<AdminAuditViewer />
				)}

				{activeTab === 'security' && (
					<SecurityPanel user={user} />
				)}

				{activeTab === 'feed' && (
					<CommunityFeed />
				)}

				{activeTab === 'community' && (
					<CommunityPanel />
				)}

				{activeTab === 'clips' && (
					<ClipStudioPanel content={contentList} />
				)}
			</main>
		</div>
	);
};

export default UserDashboard;

