import React, { useEffect, useMemo, useState } from 'react';
import './UserDashboard.css';
import { auth } from './firebaseClient';
import { API_ENDPOINTS } from './config';

// Use PUBLIC_URL so assets resolve correctly on GitHub Pages and Render
const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ''}/image.png`;

const UserDashboard = ({ user, content, stats, badges, notifications, userDefaults, onSaveDefaults, onLogout, onUpload, mySchedules, onSchedulesChanged }) => {
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
  const [tiktokStatus, setTikTokStatus] = useState({ connected: false });
  const [facebookStatus, setFacebookStatus] = useState({ connected: false });
  const [youtubeStatus, setYouTubeStatus] = useState({ connected: false });
  const [twitterStatus, setTwitterStatus] = useState({ connected: false });
  const [snapchatStatus, setSnapchatStatus] = useState({ connected: false });
  const [spotifyStatus, setSpotifyStatus] = useState({ connected: false });
  const [redditStatus, setRedditStatus] = useState({ connected: false });
  const [discordStatus, setDiscordStatus] = useState({ connected: false });
  const [linkedinStatus, setLinkedinStatus] = useState({ connected: false });
  const [telegramStatus, setTelegramStatus] = useState({ connected: false });
  const [pinterestStatus, setPinterestStatus] = useState({ connected: false });
  const [earnings, setEarnings] = useState({ pendingEarnings: 0, totalEarnings: 0, payoutEligible: false, minPayoutAmount: 0 });
  const [payouts, setPayouts] = useState([]);
  const [progress, setProgress] = useState({ contentCount: 0, requiredForRevenue: 0, remaining: 0, revenueEligible: false });
  const [platformSummary, setPlatformSummary] = useState({ platforms: {} });
  // Snap connect banner state from URL
  const [connectBanner, setConnectBanner] = useState(null); // { type: 'success'|'error', message: string }

  // Ensure content is an array to simplify rendering
  const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
  const schedulesList = useMemo(() => (Array.isArray(mySchedules) ? mySchedules : []), [mySchedules]);
  const firstItem = contentList[0] || {};
  const safeFirstThumb = firstItem?.thumbnailUrl || DEFAULT_IMAGE;
  const safeLandingUrl = typeof firstItem?.landingPageUrl === 'string' ? firstItem.landingPageUrl : undefined;
  const safeSmartLink = typeof firstItem?.smartLink === 'string' ? firstItem.smartLink : undefined;

  // Allowlist for safe OAuth redirect targets. This protects against open
  // redirects by ensuring client-side navigation only follows known provider
  // hostnames or same-origin redirects. If an allowed hostname appears in
  // the future, add it here.
  const isAllowedAuthUrl = (url) => {
    try {
      if (!url || typeof url !== 'string') return false;
      if (url.startsWith('tg:') || url.startsWith('tg://')) return true;
      const u = new URL(url);
      const allowed = new Set([
        'sandbox.tiktok.com', 'www.tiktok.com', 'open.tiktokapis.com',
        'accounts.google.com', 'oauth2.googleapis.com',
        'www.facebook.com', 'connect.facebook.net', 'api.twitter.com',
        'www.youtube.com', 'accounts.youtube.com',
        't.me', 'web.telegram.org', 'discord.com', 'www.linkedin.com',
        'www.pinterest.com', 'accounts.spotify.com', 'www.reddit.com'
      ]);
      if (allowed.has(u.hostname)) return true;
      if (u.origin === window.location.origin) return true;
    } catch (_) {}
    return false;
  };

  const handleNav = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  // Load TikTok connection status
  const loadTikTokStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setTikTokStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.TIKTOK_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setTikTokStatus({ connected: false });
      const data = await res.json();
      setTikTokStatus({ connected: !!data.connected, display_name: data.display_name, avatar_url: data.avatar_url, open_id: data.open_id });
    } catch (_) {
      setTikTokStatus({ connected: false });
    }
  };

  // Load Facebook connection status
  const loadFacebookStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setFacebookStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setFacebookStatus({ connected: false });
      const data = await res.json();
      setFacebookStatus({ connected: !!data.connected, pages: data.pages || [], ig_business_account_id: data.ig_business_account_id || null });
    } catch (_) {
      setFacebookStatus({ connected: false });
    }
  };

  // Load YouTube connection status
  const loadYouTubeStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setYouTubeStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.YOUTUBE_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setYouTubeStatus({ connected: false });
      const data = await res.json();
      setYouTubeStatus({ connected: !!data.connected, channel: data.channel || null });
    } catch (_) {
      setYouTubeStatus({ connected: false });
    }
  };

  // Load Twitter connection status
  const loadTwitterStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setTwitterStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.TWITTER_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setTwitterStatus({ connected: false });
      const data = await res.json();
      setTwitterStatus({ connected: !!data.connected, identity: data.identity || null });
    } catch (_) {
      setTwitterStatus({ connected: false });
    }
  };

  // Load Snapchat connection status
  const loadSnapchatStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setSnapchatStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.SNAPCHAT_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setSnapchatStatus({ connected: false });
      const data = await res.json();
      setSnapchatStatus({ connected: !!data.connected, profile: data.profile || null });
    } catch (_) {
      setSnapchatStatus({ connected: false });
    }
  };

  // Load Spotify connection status
  const loadSpotifyStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setSpotifyStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.SPOTIFY_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setSpotifyStatus({ connected: false });
      const data = await res.json();
      setSpotifyStatus({ connected: !!data.connected, meta: data.meta || null });
    } catch (_) {
      setSpotifyStatus({ connected: false });
    }
  };

  // Load Reddit connection status
  const loadRedditStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setRedditStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.REDDIT_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setRedditStatus({ connected: false });
      const data = await res.json();
      setRedditStatus({ connected: !!data.connected, meta: data.meta || null });
    } catch (_) {
      setRedditStatus({ connected: false });
    }
  };

  // Load Discord connection status
  const loadDiscordStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setDiscordStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.DISCORD_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setDiscordStatus({ connected: false });
      const data = await res.json();
      setDiscordStatus({ connected: !!data.connected, meta: data.meta || null });
    } catch (_) {
      setDiscordStatus({ connected: false });
    }
  };

  // Load LinkedIn connection status
  const loadLinkedinStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setLinkedinStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.LINKEDIN_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setLinkedinStatus({ connected: false });
      const data = await res.json();
      setLinkedinStatus({ connected: !!data.connected, meta: data.meta || null });
    } catch (_) {
      setLinkedinStatus({ connected: false });
    }
  };

  // Load Telegram connection status
  const loadTelegramStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setTelegramStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.TELEGRAM_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setTelegramStatus({ connected: false });
      const data = await res.json();
      setTelegramStatus({ connected: !!data.connected, meta: data.meta || null });
    } catch (_) {
      setTelegramStatus({ connected: false });
    }
  };

  // Load Pinterest connection status
  const loadPinterestStatus = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return setPinterestStatus({ connected: false });
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.PINTEREST_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!res.ok) return setPinterestStatus({ connected: false });
      const data = await res.json();
      setPinterestStatus({ connected: !!data.connected, meta: data.meta || null });
    } catch (_) {
      setPinterestStatus({ connected: false });
    }
  };

  // Short-lived in-memory cache + inflight guard for Telegram status checks.
  // This prevents duplicate simultaneous fetches from popup + main page
  // (which was causing many slow requests and occasional 429s).
  const telegramStatusCacheRef = { current: { ts: 0, data: null } };
  let telegramStatusInflightRef = false;
  const fetchTelegramStatusCached = async () => {
    const now = Date.now();
    const cache = telegramStatusCacheRef.current;
    if (cache.ts && (now - cache.ts) < 1000 && cache.data) return cache.data;
    if (telegramStatusInflightRef) return cache.data || { connected: false };
    telegramStatusInflightRef = true;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        telegramStatusCacheRef.current = { ts: Date.now(), data: { connected: false } };
        return telegramStatusCacheRef.current.data;
      }
      const token = await currentUser.getIdToken(true);
      const st = await fetch(API_ENDPOINTS.TELEGRAM_STATUS, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (!st.ok) {
        telegramStatusCacheRef.current = { ts: Date.now(), data: { connected: false } };
        return telegramStatusCacheRef.current.data;
      }
      const sd = await st.json();
      telegramStatusCacheRef.current = { ts: Date.now(), data: sd };
      return sd;
    } catch (e) {
      return telegramStatusCacheRef.current.data || { connected: false };
    } finally {
      telegramStatusInflightRef = false;
    }
  };

  useEffect(() => {
    try {
      const qp = new URLSearchParams(window.location.search);
      const sc = qp.get('snapchat');
      if (sc === 'connected') setConnectBanner({ type: 'success', message: 'Snapchat connected successfully.' });
      else if (sc === 'error') setConnectBanner({ type: 'error', message: qp.get('message') ? decodeURIComponent(qp.get('message')) : 'Snapchat connection failed.' });
    } catch (_) {}
    loadTikTokStatus();
    loadFacebookStatus();
    loadYouTubeStatus();
    loadTwitterStatus();
  loadSnapchatStatus();
  // New platforms
  loadSpotifyStatus();
  loadRedditStatus();
  loadDiscordStatus();
  loadLinkedinStatus();
  loadTelegramStatus();
  loadPinterestStatus();
    // Earnings & progress & platform summary
    (async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        const token = await currentUser.getIdToken(true);
        const [earnRes, payRes, progRes, platRes] = await Promise.all([
          fetch(API_ENDPOINTS.EARNINGS_SUMMARY, { headers: { Authorization: `Bearer ${token}` }}),
          fetch(API_ENDPOINTS.EARNINGS_PAYOUTS, { headers: { Authorization: `Bearer ${token}` }}),
          fetch(API_ENDPOINTS.USER_PROGRESS, { headers: { Authorization: `Bearer ${token}` }}),
          fetch(API_ENDPOINTS.PLATFORM_STATUS, { headers: { Authorization: `Bearer ${token}` }}),
        ]);
        if (earnRes.ok) { const d = await earnRes.json(); if (d.ok) setEarnings(d); }
        if (payRes.ok) { const d = await payRes.json(); if (d.ok) setPayouts(d.payouts || []); }
        if (progRes.ok) { const d = await progRes.json(); if (d.ok) setProgress(d); }
        if (platRes.ok) { const d = await platRes.json(); if (d.ok) setPlatformSummary(d); }
      } catch(_){}
    })();
    // If coming back from OAuth, the URL may contain ?tiktok=connected
    const params = new URLSearchParams(window.location.search);
    if (params.get('tiktok')) {
      // Refresh status then clean the query to avoid confusion
      loadTikTokStatus();
      params.delete('tiktok');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('facebook')) {
      loadFacebookStatus();
      params.delete('facebook');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('youtube')) {
      loadYouTubeStatus();
      params.delete('youtube');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('twitter')) {
      loadTwitterStatus();
      params.delete('twitter');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('snapchat')) {
      loadSnapchatStatus();
      params.delete('snapchat');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('spotify')) {
      loadSpotifyStatus();
      params.delete('spotify');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('reddit')) {
      loadRedditStatus();
      params.delete('reddit');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('discord')) {
      loadDiscordStatus();
      params.delete('discord');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    // New generic oauth redirect pattern: ?oauth=discord&status=success
    if (params.get('oauth') === 'discord') {
      const status = params.get('status');
      if (status === 'success') {
        setConnectBanner({ type: 'success', message: 'Discord connected successfully.' });
        loadDiscordStatus();
      } else {
        setConnectBanner({ type: 'error', message: 'Discord connection failed.' });
      }
      params.delete('oauth');
      params.delete('status');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('linkedin')) {
      loadLinkedinStatus();
      params.delete('linkedin');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('telegram')) {
      loadTelegramStatus();
      params.delete('telegram');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
    if (params.get('pinterest')) {
      loadPinterestStatus();
      params.delete('pinterest');
      const url = `${window.location.pathname}?${params.toString()}`.replace(/\?$/, '');
      window.history.replaceState({}, '', url);
    }
  }, [user?.uid]);

  // Listen for postMessage requests from popup interstitials asking the
  // parent to check Telegram status. This allows the popup (same-origin)
  // to ask the opener to perform the authenticated status check and
  // reply with the result so the popup can close itself.
  useEffect(() => {
    // Use the shared cached fetch (defined above) to avoid duplicating
    // cache/inflight logic here. This keeps a single source of truth and
    // prevents multiple slightly-different implementations from diverging.
    const origin = window.location.origin;
    const listener = (ev) => {
      try {
        if (ev.origin !== origin) return; // only accept same-origin
        const data = ev.data || {};
        if (data && data.type === 'telegram:status:check') {
          (async () => {
            try {
              // Delegate to shared cached fetch which handles auth, caching
              // and inflight guarding.
              const sd = await fetchTelegramStatusCached();
              const connected = !!sd.connected;
              try { ev.source.postMessage({ type: 'telegram:status:response', connected }, ev.origin); } catch (_) {}
              if (connected) {
                // Refresh main UI status
                loadTelegramStatus();
              }
            } catch (e) {
              try { ev.source.postMessage({ type: 'telegram:status:response', connected: false }, ev.origin); } catch (_) {}
            }
          })();
        }
      } catch (_) {}
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [user?.uid]);

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
      snapchat: [[20, 0], [22, 0]], // evening/night time for Snapchat
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

  // TikTok connect flow via backend start endpoint
  const handleConnectTikTok = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prep = await fetch(API_ENDPOINTS.TIKTOK_AUTH_START, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare TikTok OAuth');
      // Only navigate to allowlisted OAuth providers to avoid open redirects
      if (isAllowedAuthUrl(data.authUrl)) {
        window.location.href = data.authUrl;
      } else {
        // Fallback: open in new tab if not technically allowed by default
        window.open(data.authUrl, '_blank');
      }
    } catch (e) {
      alert(e.message || 'Unable to start TikTok connect');
    }
  };

  const handleConnectFacebook = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prep = await fetch(`${API_ENDPOINTS.FACEBOOK_AUTH_START.replace('/auth/start','/auth/prepare')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Facebook OAuth');
      if (isAllowedAuthUrl(data.authUrl)) {
        window.location.href = data.authUrl;
      } else {
        window.open(data.authUrl, '_blank');
      }
    } catch (e) {
      alert(e.message || 'Unable to start Facebook connect');
    }
  };

  const handleConnectYouTube = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prep = await fetch(`${API_ENDPOINTS.YOUTUBE_AUTH_START.replace('/auth/start','/auth/prepare')}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare YouTube OAuth');
      if (isAllowedAuthUrl(data.authUrl)) {
        window.location.href = data.authUrl;
      } else {
        window.open(data.authUrl, '_blank');
      }
    } catch (e) {
      alert(e.message || 'Unable to start YouTube connect');
    }
  };

  const handleConnectTwitter = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prep = await fetch(API_ENDPOINTS.TWITTER_AUTH_PREPARE, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Twitter OAuth');
      if (isAllowedAuthUrl(data.authUrl)) {
        window.location.href = data.authUrl;
      } else {
        window.open(data.authUrl, '_blank');
      }
    } catch (e) {
      alert(e.message || 'Unable to start Twitter connect');
    }
  };

  const handleConnectSnapchat = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prep = await fetch(API_ENDPOINTS.SNAPCHAT_AUTH_PREPARE, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` }
      });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Snapchat OAuth');
      if (isAllowedAuthUrl(data.authUrl)) {
        window.location.href = data.authUrl;
      } else {
        window.open(data.authUrl, '_blank');
      }
    } catch (e) {
      alert(e.message || 'Unable to start Snapchat connect');
    }
  };

  // Generic connect handlers for newly added platforms
  const handleConnectSpotify = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prepUrl = API_ENDPOINTS.SPOTIFY_AUTH_START.replace('/auth/start', '/auth/prepare');
      const prep = await fetch(prepUrl, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' } });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Spotify OAuth');
      // open popup and poll status
      const popup = window.open(data.authUrl, 'spotify_connect', 'width=900,height=700');
      const poll = async () => {
        for (let i = 0; i < 80; i++) {
          await new Promise(r => setTimeout(r, 1500));
          if (popup && popup.closed) break;
          try {
            const s = await currentUser.getIdToken(true);
            const st = await fetch(API_ENDPOINTS.SPOTIFY_STATUS, { headers: { Authorization: `Bearer ${s}`, Accept: 'application/json' } });
            if (st.ok) {
              const sd = await st.json();
              if (sd.connected) {
                if (popup && !popup.closed) popup.close();
                loadSpotifyStatus();
                return;
              }
            }
          } catch (_) {}
        }
        if (popup && !popup.closed) popup.close();
        alert('Connection timed out or was closed. If you connected, try refreshing.');
      };
      poll();
    } catch (e) {
      alert(e.message || 'Unable to start Spotify connect');
    }
  };

  const handleConnectReddit = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prepUrl = API_ENDPOINTS.REDDIT_AUTH_START.replace('/auth/start', '/auth/prepare');
      const prep = await fetch(prepUrl, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' } });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Reddit OAuth');
      const popup = window.open(data.authUrl, 'reddit_connect', 'width=900,height=700');
      const poll = async () => {
        for (let i = 0; i < 80; i++) {
          await new Promise(r => setTimeout(r, 1500));
          if (popup && popup.closed) break;
          try {
            const s = await currentUser.getIdToken(true);
            const st = await fetch(API_ENDPOINTS.REDDIT_STATUS, { headers: { Authorization: `Bearer ${s}`, Accept: 'application/json' } });
            if (st.ok) {
              const sd = await st.json();
              if (sd.connected) {
                if (popup && !popup.closed) popup.close();
                loadRedditStatus();
                return;
              }
            }
          } catch (_) {}
        }
        if (popup && !popup.closed) popup.close();
        alert('Connection timed out or was closed. If you connected, try refreshing.');
      };
      poll();
    } catch (e) {
      alert(e.message || 'Unable to start Reddit connect');
    }
  };

  const handleConnectDiscord = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prepUrl = API_ENDPOINTS.DISCORD_AUTH_START.replace('/auth/start', '/auth/prepare');
      // Try to open a popup; if popup is allowed we'll request a popup-tailored state from the server.
      const tryPopup = (() => {
        try {
          const w = window.open('', 'discord_connect_test');
          if (!w || w.closed || typeof w.closed === 'undefined') return false;
          w.close();
          return true;
        } catch (_) { return false; }
      })();

      const prep = await fetch(prepUrl, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ popup: tryPopup }) });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Discord OAuth');
      // If the server prepared the authUrl for popup flows, open a popup and wait for postMessage.
      const authUrl = data.authUrl;
      const popup = tryPopup ? window.open(authUrl, 'discord_connect', 'width=900,height=700') : null;

      if (popup) {
        // Listen for message from popup
        const origin = new URL(window.location.href).origin;
        let handled = false;
        const listener = (ev) => {
          try {
            // Accept messages where the payload explicitly signals platform: 'discord'.
            // For robustness allow any origin but ensure event.source matches the popup we opened.
            if (!ev.data || ev.data.platform !== 'discord') return;
            if (ev.source !== popup) return;
            handled = true;
            window.removeEventListener('message', listener);
            try { if (popup && !popup.closed) popup.close(); } catch (_) {}
            // Refresh status
            loadDiscordStatus();
          } catch (_) {}
        };
        window.addEventListener('message', listener);

        // Timeout: if no message within 2 minutes, close popup and show alert
        setTimeout(() => {
          if (!handled) {
            try { if (popup && !popup.closed) popup.close(); } catch (_) {}
            window.removeEventListener('message', listener);
            alert('Connection timed out or was closed. If you connected, try refreshing.');
          }
        }, 120000);
      } else {
        // Popup blocked or not available: navigate current tab to authUrl and rely on redirect back to frontend
        if (isAllowedAuthUrl(authUrl)) {
          window.location.href = authUrl;
        } else {
          window.open(authUrl, '_blank');
        }
      }
    } catch (e) {
      alert(e.message || 'Unable to start Discord connect');
    }
  };

  const handleConnectLinkedin = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prepUrl = API_ENDPOINTS.LINKEDIN_AUTH_START.replace('/auth/start', '/auth/prepare');
      const prep = await fetch(prepUrl, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' } });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare LinkedIn OAuth');
      const popup = window.open(data.authUrl, 'linkedin_connect', 'width=900,height=700');
      const poll = async () => {
        for (let i = 0; i < 80; i++) {
          await new Promise(r => setTimeout(r, 1500));
          if (popup && popup.closed) break;
          try {
            const s = await currentUser.getIdToken(true);
            const st = await fetch(API_ENDPOINTS.LINKEDIN_STATUS, { headers: { Authorization: `Bearer ${s}`, Accept: 'application/json' } });
            if (st.ok) {
              const sd = await st.json();
              if (sd.connected) {
                if (popup && !popup.closed) popup.close();
                loadLinkedinStatus();
                return;
              }
            }
          } catch (_) {}
        }
        if (popup && !popup.closed) popup.close();
        alert('Connection timed out or was closed. If you connected, try refreshing.');
      };
      poll();
    } catch (e) {
      alert(e.message || 'Unable to start LinkedIn connect');
    }
  };

  const handleConnectTelegram = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prepUrl = API_ENDPOINTS.TELEGRAM_AUTH_START.replace('/auth/start', '/auth/prepare');
      // Open a blank popup immediately on user click to preserve the user
      // gesture (browsers only allow popups when initiated during a click).
      // We'll navigate this popup after the prepare call returns. If the
      // popup was blocked, fall back to same-tab navigation.
      let popup = null;
      try {
        popup = window.open('', 'telegram_connect', 'width=900,height=700');
        if (popup) {
          try {
            // Show minimal feedback while we prepare the URL
            popup.document.title = 'Connecting to Telegram';
            popup.document.body.innerHTML = '<p style="font-family:sans-serif;margin:24px">Opening Telegram... If nothing happens, please return to the app.</p>';
          } catch (_) { /* ignore cross-origin after navigation */ }
        }
      } catch (_) { popup = null; }

      const prep = await fetch(prepUrl, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ popup: !!popup }) });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Telegram connect');
      // If we have a popup window, navigate it to the deep link (appUrl) or
      // web t.me link. If popup was blocked, fall back to navigating the
      // current tab (try native scheme first, then web fallback).
      if (popup) {
        // Navigate the popup to a local interstitial page that provides
        // explicit 'Open in app' / 'Open in browser' buttons and instructions.
          try {
            // Build an absolute URL to the interstitial reliably.
            // Use the origin and an absolute pathname so we don't accidentally
            // pick up a malformed PUBLIC_URL or other build-time value that
            // could turn into a path segment (which was causing URLs like
            // `/tg%3A%2F%2F...` to be requested and return Not Found).
            const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
            const baseUrl = new URL('/telegram-interstitial.html', origin).toString();
            const params = new URLSearchParams();
            // Let URLSearchParams handle encoding for us (don't double-encode)
            if (data.appUrl) params.set('appUrl', data.appUrl);
            if (data.authUrl) params.set('authUrl', data.authUrl);
            if (data.state) params.set('state', data.state);
            if (data.bot) params.set('bot', data.bot);
            const interstitial = `${baseUrl}?${params.toString()}`;
          // Debug: log prepare response so we can inspect in browser devtools
          try { console.debug('Telegram prepare response', data, 'interstitial', interstitial); } catch (_) {}
          // Use window.open with the same window name to navigate the popup reliably
          try {
            window.open(interstitial, 'telegram_connect');
          } catch (e) {
            // If that fails, fallback to setting location on the popup
            try { popup.location.href = interstitial; } catch (_) {
              const target = data.appUrl || data.authUrl;
              try { window.open(target, '_blank'); } catch (_) { /* ignore */ }
            }
          }
        } catch (e) {
          // If navigation fails, open the target directly as a last resort
          const target = data.appUrl || data.authUrl;
          try { window.open(target, '_blank'); } catch (_) { /* ignore */ }
        }

        // Start polling for connection status while popup is open
        const poll = async () => {
          for (let i = 0; i < 80; i++) {
            await new Promise(r => setTimeout(r, 1500));
            if (popup && popup.closed) break;
            try {
              const s = await currentUser.getIdToken(true);
              const st = await fetch(API_ENDPOINTS.TELEGRAM_STATUS, { headers: { Authorization: `Bearer ${s}`, Accept: 'application/json' } });
              if (st.ok) {
                const sd = await st.json();
                if (sd.connected) {
                  try { if (popup && !popup.closed) popup.close(); } catch (_) {}
                  loadTelegramStatus();
                  return;
                }
              }
            } catch (_) {}
          }
          try { if (popup && !popup.closed) popup.close(); } catch (_) {}
          alert('Connection timed out or was closed. If you connected, try refreshing.');
        };
        poll();
      } else {
        // Popup blocked -> try native app deep link first, then fallback to web t.me
        const appUrl = data.appUrl || data.authUrl;
        try {
          // Attempt to open native app in current tab (only if allowed)
            if (isAllowedAuthUrl(appUrl)) {
              window.location.href = appUrl;
            } else {
              window.open(appUrl, '_blank');
            }
            setTimeout(() => {
              if ((data.appUrl && data.appUrl.startsWith('tg://')) || !data.appUrl) {
                if (isAllowedAuthUrl(data.authUrl)) window.location.href = data.authUrl;
                else window.open(data.authUrl, '_blank');
              }
            }, 1500);
        } catch (_) {
          if (isAllowedAuthUrl(data.authUrl)) window.location.href = data.authUrl;
          else window.open(data.authUrl, '_blank');
        }
      }
    } catch (e) {
      alert(e.message || 'Unable to start Telegram connect');
    }
  };

  const handleConnectPinterest = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Please sign in first');
      const idToken = await currentUser.getIdToken(true);
      const prepUrl = API_ENDPOINTS.PINTEREST_AUTH_START.replace('/auth/start', '/auth/prepare');
      const prep = await fetch(prepUrl, { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' } });
      const data = await prep.json();
      if (!prep.ok || !data.authUrl) throw new Error(data.error || 'Failed to prepare Pinterest OAuth');
      const popup = window.open(data.authUrl, 'pinterest_connect', 'width=900,height=700');
      const poll = async () => {
        for (let i = 0; i < 80; i++) {
          await new Promise(r => setTimeout(r, 1500));
          if (popup && popup.closed) break;
          try {
            const s = await currentUser.getIdToken(true);
            const st = await fetch(API_ENDPOINTS.PINTEREST_STATUS, { headers: { Authorization: `Bearer ${s}`, Accept: 'application/json' } });
            if (st.ok) {
              const sd = await st.json();
              if (sd.connected) {
                if (popup && !popup.closed) popup.close();
                loadPinterestStatus();
                return;
              }
            }
          } catch (_) {}
        }
        if (popup && !popup.closed) popup.close();
        alert('Connection timed out or was closed. If you connected, try refreshing.');
      };
      poll();
    } catch (e) {
      alert(e.message || 'Unable to start Pinterest connect');
    }
  };

  // Schedule action helpers
  const withAuth = async (fn) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Not authenticated');
    const token = await currentUser.getIdToken(true);
    return fn(token);
  };

  const doPause = async (scheduleId) => withAuth(async (token) => {
    const res = await fetch(API_ENDPOINTS.SCHEDULE_PAUSE(scheduleId), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to pause');
    onSchedulesChanged && onSchedulesChanged();
  });

  const doResume = async (scheduleId) => withAuth(async (token) => {
    const res = await fetch(API_ENDPOINTS.SCHEDULE_RESUME(scheduleId), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to resume');
    onSchedulesChanged && onSchedulesChanged();
  });

  const doReschedule = async (scheduleId) => {
    const when = prompt('New start time (YYYY-MM-DDTHH:mm, local time):');
    if (!when) return;
    const iso = new Date(when).toISOString();
    await withAuth(async (token) => {
      const res = await fetch(API_ENDPOINTS.SCHEDULE_RESCHEDULE(scheduleId), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ startTime: iso })
      });
      if (!res.ok) throw new Error('Failed to reschedule');
    });
    onSchedulesChanged && onSchedulesChanged();
  };

  const doDelete = async (scheduleId) => withAuth(async (token) => {
    if (!window.confirm('Delete this schedule?')) return;
    const res = await fetch(API_ENDPOINTS.SCHEDULE_DELETE(scheduleId), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Failed to delete');
    onSchedulesChanged && onSchedulesChanged();
  });

  return (
    <div className="dashboard-root">
      {/* OAuth connect banner */}
      {connectBanner && (
        <div className={`connect-banner ${connectBanner.type === 'success' ? 'connect-success' : 'connect-error'}`} role="status">
          <div className="connect-message">{connectBanner.message}</div>
          <button className="connect-close" onClick={() => setConnectBanner(null)} aria-label="Dismiss">×</button>
        </div>
      )}
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
            <li className={activeTab === 'earnings' ? 'active' : ''} onClick={() => handleNav('earnings')}>Earnings</li>
            <li className={activeTab === 'connections' ? 'active' : ''} onClick={() => handleNav('connections')}>Connections</li>
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
            <div className="platform-connections" style={{marginTop:'1rem'}}>
              <h4>Platform Connections</h4>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center'}}>
                {tiktokStatus.connected ? (
                  <>
                    {tiktokStatus.avatar_url && (
                      <img src={tiktokStatus.avatar_url} alt="TikTok avatar" style={{width:28, height:28, borderRadius:'50%'}} />
                    )}
                    <span style={{color:'#cbd5e1'}}>Connected as <strong>{tiktokStatus.display_name || tiktokStatus.open_id || 'TikTok User'}</strong></span>
                    <button className="check-quality" onClick={handleConnectTikTok}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectTikTok}>Connect TikTok</button>
                    <span style={{color:'#9aa4b2'}}>Connect to link your TikTok account for future posting and analytics.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {facebookStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Facebook connected</span>
                    {facebookStatus.pages?.length > 0 && (
                      <span style={{color:'#9aa4b2'}}>Pages: {facebookStatus.pages.slice(0,2).map(p => p.name).join(', ')}{facebookStatus.pages.length>2?'…':''}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectFacebook}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectFacebook}>Connect Facebook</button>
                    <span style={{color:'#9aa4b2'}}>Connect to manage Pages and Instagram.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {youtubeStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>YouTube connected</span>
                    {youtubeStatus.channel?.snippet?.title && (
                      <span style={{color:'#9aa4b2'}}>Channel: {youtubeStatus.channel.snippet.title}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectYouTube}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectYouTube}>Connect YouTube</button>
                    <span style={{color:'#9aa4b2'}}>Connect to upload videos directly.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {twitterStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Twitter connected</span>
                    {twitterStatus.identity?.username && (
                      <span style={{color:'#9aa4b2'}}>@{twitterStatus.identity.username}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectTwitter}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectTwitter}>Connect Twitter</button>
                    <span style={{color:'#9aa4b2'}}>Connect to enable tweeting & analytics.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {snapchatStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Snapchat connected</span>
                    {snapchatStatus.profile?.display_name && (
                      <span style={{color:'#9aa4b2'}}>{snapchatStatus.profile.display_name}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectSnapchat}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectSnapchat}>Connect Snapchat</button>
                    <span style={{color:'#9aa4b2'}}>Connect to enable Snap posting & analytics.</span>
                  </>
                )}
              </div>
              {/* New platform connections */}
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {spotifyStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Spotify connected</span>
                    {spotifyStatus.meta?.display_name && (
                      <span style={{color:'#9aa4b2'}}>{spotifyStatus.meta.display_name}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectSpotify}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectSpotify}>Connect Spotify</button>
                    <span style={{color:'#9aa4b2'}}>Connect to enable playlist sharing and analytics.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {redditStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Reddit connected</span>
                    {redditStatus.meta?.username && (
                      <span style={{color:'#9aa4b2'}}>u/{redditStatus.meta.username}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectReddit}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectReddit}>Connect Reddit</button>
                    <span style={{color:'#9aa4b2'}}>Connect to cross-post to your subreddit or profile.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {discordStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Discord connected</span>
                    {discordStatus.meta?.guilds && (
                      <span style={{color:'#9aa4b2'}}>Servers: {discordStatus.meta.guilds.length}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectDiscord}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectDiscord}>Connect Discord</button>
                    <span style={{color:'#9aa4b2'}}>Connect to post to channels or get analytics.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {linkedinStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>LinkedIn connected</span>
                    {linkedinStatus.meta?.profile && (
                      <span style={{color:'#9aa4b2'}}>{linkedinStatus.meta.profile.localizedFirstName || ''} {linkedinStatus.meta.profile.localizedLastName || ''}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectLinkedin}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectLinkedin}>Connect LinkedIn</button>
                    <span style={{color:'#9aa4b2'}}>Connect to share posts and company pages.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {telegramStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Telegram connected</span>
                    {telegramStatus.meta?.chat && (
                      <span style={{color:'#9aa4b2'}}>{telegramStatus.meta.chat.title || 'Chat'}</span>
                    )}
                    <button className="check-quality" onClick={handleConnectTelegram}>Reconnect</button>
                  </>
                ) : (
                  <>
                    <button className="check-quality" onClick={handleConnectTelegram}>Connect Telegram</button>
                    <span style={{color:'#9aa4b2'}}>Connect to post to channels or groups.</span>
                  </>
                )}
              </div>
              <div style={{display:'flex', gap:'.75rem', alignItems:'center', marginTop: '.5rem'}}>
                {pinterestStatus.connected ? (
                  <>
                    <span style={{color:'#cbd5e1'}}>Pinterest connected</span>
                    {pinterestStatus.meta?.boards && (
                      <span style={{color:'#9aa4b2'}}>Boards: {pinterestStatus.meta.boards.length}</span>
                    )}
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
            <div className="profile-defaults" style={{marginTop:'1rem'}}>
              <h4>Profile Defaults</h4>
              <div style={{display:'grid', gap:'.5rem', maxWidth: 520}}>
                <label style={{color:'#9aa4b2'}}>Timezone
                  <input type="text" value={tz} onChange={(e)=>setTz(e.target.value)} style={{display:'block', width:'100%', marginTop:'.25rem', padding:'.4rem', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'#eef2ff'}} />
                </label>
                <div style={{color:'#9aa4b2'}}>Default Platforms</div>
                <div className="platform-toggles">
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('youtube')} onChange={() => toggleDefaultPlatform('youtube')} /> YouTube ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('twitter')} onChange={() => toggleDefaultPlatform('twitter')} /> Twitter ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('linkedin')} onChange={() => toggleDefaultPlatform('linkedin')} /> LinkedIn ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('discord')} onChange={() => toggleDefaultPlatform('discord')} /> Discord ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('reddit')} onChange={() => toggleDefaultPlatform('reddit')} /> Reddit ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('spotify')} onChange={() => toggleDefaultPlatform('spotify')} /> Spotify ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('telegram')} onChange={() => toggleDefaultPlatform('telegram')} /> Telegram ✅</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('tiktok')} onChange={() => toggleDefaultPlatform('tiktok')} /> TikTok ⏳</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('facebook')} onChange={() => toggleDefaultPlatform('facebook')} /> Facebook ⏳</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('instagram')} onChange={() => toggleDefaultPlatform('instagram')} /> Instagram ⏳</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('snapchat')} onChange={() => toggleDefaultPlatform('snapchat')} /> Snapchat ⏳</label>
                  <label><input type="checkbox" checked={defaultsPlatforms.includes('pinterest')} onChange={() => toggleDefaultPlatform('pinterest')} /> Pinterest ⏳</label>
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
              <h4 style={{marginBottom: '.5rem', color: '#cbd5e1'}}>Ready Platforms (Post Now)</h4>
              <label><input type="checkbox" checked={selectedPlatforms.includes('youtube')} onChange={() => togglePlatform('youtube')} /> YouTube ✅</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('twitter')} onChange={() => togglePlatform('twitter')} /> Twitter ✅</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('linkedin')} onChange={() => togglePlatform('linkedin')} /> LinkedIn ✅</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('discord')} onChange={() => togglePlatform('discord')} /> Discord ✅</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('reddit')} onChange={() => togglePlatform('reddit')} /> Reddit ✅</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('spotify')} onChange={() => togglePlatform('spotify')} /> Spotify ✅</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('telegram')} onChange={() => togglePlatform('telegram')} /> Telegram ✅</label>
              <h4 style={{marginTop: '1rem', marginBottom: '.5rem', color: '#9aa4b2'}}>Pending Review (Coming Soon)</h4>
              <label><input type="checkbox" checked={selectedPlatforms.includes('tiktok')} onChange={() => togglePlatform('tiktok')} disabled /> TikTok ⏳</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('facebook')} onChange={() => togglePlatform('facebook')} disabled /> Facebook ⏳</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('instagram')} onChange={() => togglePlatform('instagram')} disabled /> Instagram ⏳</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('snapchat')} onChange={() => togglePlatform('snapchat')} disabled /> Snapchat ⏳</label>
              <label><input type="checkbox" checked={selectedPlatforms.includes('pinterest')} onChange={() => togglePlatform('pinterest')} disabled /> Pinterest ⏳</label>
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
                  const scheduleId = sch?.id || sch?.scheduleId || sch?.uid || sch?.docId;
                  return (
                    <div key={i} className="schedule-row" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr 0.8fr 1.6fr', gap: '.5rem', alignItems: 'center', padding: '.5rem', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      <div title={titleText} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleText}</div>
                      <div style={{ color: '#cbd5e1' }}>{platform}</div>
                      <div style={{ color: '#cbd5e1', textTransform: 'capitalize' }}>{frequency}</div>
                      <div style={{ color: '#e2e8f0' }}>{when}</div>
                      <div>
                        <span className={`status status-${statusText}`}>{statusText}</span>
                      </div>
                      <div style={{display:'flex', gap:'.35rem', justifyContent:'flex-end'}}>
                        {isActive ? (
                          <button className="logout-btn" onClick={() => scheduleId && doPause(scheduleId)}>Pause</button>
                        ) : (
                          <button className="check-quality" onClick={() => scheduleId && doResume(scheduleId)}>Resume</button>
                        )}
                        <button className="check-quality" onClick={() => scheduleId && doReschedule(scheduleId)}>Reschedule</button>
                        <button className="logout-btn" onClick={() => scheduleId && doDelete(scheduleId)}>Delete</button>
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

        {activeTab === 'earnings' && (
          <section className="earnings-panel">
            <h3>Earnings</h3>
            <div style={{display:'grid', gap:'.5rem', maxWidth:480}}>
              <div><strong>Pending:</strong> ${earnings.pendingEarnings?.toFixed ? earnings.pendingEarnings.toFixed(2) : earnings.pendingEarnings}</div>
              <div><strong>Total:</strong> ${earnings.totalEarnings?.toFixed ? earnings.totalEarnings.toFixed(2) : earnings.totalEarnings}</div>
              <div><strong>Min Payout:</strong> ${earnings.minPayoutAmount}</div>
              <div><strong>Revenue Eligible:</strong> {earnings.revenueEligible ? 'Yes' : 'No'} (Progress: {progress.contentCount}/{progress.requiredForRevenue} · Remaining: {progress.remaining})</div>
              <div><strong>Payout Eligible:</strong> {earnings.payoutEligible ? 'Yes' : 'No'}</div>
              <button className="check-quality" disabled={!earnings.payoutEligible} onClick={async ()=>{
                try {
                  const currentUser = auth.currentUser; if (!currentUser) return;
                  const token = await currentUser.getIdToken(true);
                  const res = await fetch(API_ENDPOINTS.EARNINGS_PAYOUT_SELF, { method:'POST', headers:{ Authorization:`Bearer ${token}` }});
                  if(res.ok){
                    const d = await res.json();
                    alert('Payout processed: $'+d.amount);
                  }
                } catch(e){ alert(e.message||'Payout failed'); }
              }}>Request Payout</button>
            </div>
            <h4 style={{marginTop:'1rem'}}>Recent Payouts</h4>
            {payouts.length===0? <div style={{color:'#9aa4b2'}}>No payouts yet.</div> : (
              <table style={{width:'100%', fontSize:'.85rem'}}>
                <thead><tr><th style={{textAlign:'left'}}>Date</th><th style={{textAlign:'right'}}>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {payouts.map(p=> (
                    <tr key={p.id}><td>{new Date(p.createdAt).toLocaleString()}</td><td style={{textAlign:'right'}}>${p.amount}</td><td>{p.status}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {activeTab === 'connections' && (
          <section className="connections-panel">
            <h3>Aggregated Platform Connections</h3>
            <pre style={{background:'rgba(255,255,255,0.05)', padding:'.75rem', borderRadius:8, maxHeight:300, overflow:'auto'}}>{JSON.stringify(platformSummary, null, 2)}</pre>
          </section>
        )}
      </main>
    </div>
  );
};

export default UserDashboard;
