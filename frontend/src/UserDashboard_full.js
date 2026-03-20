// Canonical consolidated user dashboard
/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import "./UserDashboard.css";
import ProfilePanel from "./UserDashboardTabs/ProfilePanel";
import UploadPanel from "./UserDashboardTabs/UploadPanel";
import SchedulesPanel from "./UserDashboardTabs/SchedulesPanel";
import AnalyticsPanel from "./UserDashboardTabs/AnalyticsPanel";
import RewardsPanel from "./UserDashboardTabs/RewardsPanel";
import NotificationsPanel from "./UserDashboardTabs/NotificationsPanel";

import ConnectionsPanel from "./UserDashboardTabs/ConnectionsPanel";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";
import AdminAuditViewer from "./AdminAuditViewer";
import SecurityPanel from "./UserDashboardTabs/SecurityPanel";
// CommunityPanel and CommunityFeed removed
import WolfHuntDashboard from "./EngagementMarketplace";
import ClipStudioPanel from "./UserDashboardTabs/ClipStudioPanel";
import IdeaVideoPanel from "./UserDashboardTabs/IdeaVideoPanel";
import MissionControlPanel from "./UserDashboardTabs/MissionControlPanel";
// LiveWatch import removed
// LiveHub import removed
import FloatingActions from "./components/FloatingActions";
import TopNav from "./components/TopNav";
import BottomNav from "./components/BottomNav";
import VoiceOverGuide from "./components/VoiceOverGuide";
import AdminKyc from "./AdminKyc";
import UsageLimitBanner from "./components/UsageLimitBanner";
import { auth } from "./firebaseClient";
import { sendEmailVerification } from "firebase/auth";
import { API_ENDPOINTS, API_BASE_URL, ENABLE_WOLF_HUNT } from "./config";
import toast, { Toaster } from "react-hot-toast";
import { cachedFetch, batchWithDelay, clearCache } from "./utils/requestCache";
import { isSafeRedirectUrl } from "./utils/security";
import usePlatformStatus from "./hooks/usePlatformStatus";

const DEFAULT_IMAGE = `${process.env.PUBLIC_URL || ""}/image.png`;
const CLIP_STUDIO_LOCKED = true;

const UserDashboard = ({
  user,
  content,
  stats,
  badges = [],
  notifications = [],
  userDefaults,
  onSaveDefaults,
  onLogout,
  onUpload,
  mySchedules = [],
  onSchedulesChanged,
}) => {
  const [activeTab, setActiveTab] = useState("profile");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // If Wolf Hunt is disabled, prevent accidentally staying on that tab
  useEffect(() => {
    if (!ENABLE_WOLF_HUNT && activeTab === "wolf_hunt") {
      setActiveTab("profile");
    }
  }, [activeTab]);

  useEffect(() => {
    if (CLIP_STUDIO_LOCKED && activeTab === "clips") {
      setActiveTab("profile");
    }
  }, [activeTab]);

  const [notifs, setNotifs] = useState(
    Array.isArray(notifications) ? notifications.filter(notification => !notification?.read) : []
  );
  const notifiedNotificationIdsRef = useRef(
    new Set(
      (Array.isArray(notifications) ? notifications : [])
        .map(notification => notification?.id)
        .filter(Boolean)
    )
  );
  const notificationSessionStartedAtRef = useRef(Date.now());
  const didHydrateNotificationPollRef = useRef(false);
  const [uploadLaunchTab, setUploadLaunchTab] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [platformOptions, setPlatformOptions] = useState({});
  const [spotifySelectedTracks, setSpotifySelectedTracks] = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [template, setTemplate] = useState("none");
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("video");
  const [scheduleMode, setScheduleMode] = useState("auto");
  const [manualWhen, setManualWhen] = useState("");
  const [frequency, setFrequency] = useState("once");
  const [tz, setTz] = useState(userDefaults?.timezone || "UTC");
  const [defaultsPlatforms, setDefaultsPlatforms] = useState(
    Array.isArray(userDefaults?.defaultPlatforms) ? userDefaults.defaultPlatforms : []
  );
  const [defaultsFrequency, setDefaultsFrequency] = useState(
    userDefaults?.defaultFrequency || "once"
  );
  const [paypalEmail, setPaypalEmail] = useState(
    userDefaults?.paypalEmail || user?.paypalEmail || ""
  );
  const [autoRepostEnabled, setAutoRepostEnabled] = useState(
    typeof userDefaults?.autoRepostEnabled === "boolean" ? userDefaults.autoRepostEnabled : true
  );

  const [scheduleContentMap, setScheduleContentMap] = useState({});

  // Platform statuses managed by the usePlatformStatus hook
  const {
    statuses: platformStatuses,
    platformMetadata,
    platformSummary,
    setStatus: setPlatformStatusByName,
    loadAllUnified: loadAllPlatformStatusesUnified,
  } = usePlatformStatus();

  // Aliases so existing prop names and JSX references stay unchanged
  const discordStatus = platformStatuses.discord;
  const linkedinStatus = platformStatuses.linkedin;
  const telegramStatus = platformStatuses.telegram;
  const pinterestStatus = platformStatuses.pinterest;
  const redditStatus = platformStatuses.reddit;
  const spotifyStatus = platformStatuses.spotify;
  const youtubeStatus = platformStatuses.youtube;
  const twitterStatus = platformStatuses.twitter;
  const snapchatStatus = platformStatuses.snapchat;
  const tiktokStatus = platformStatuses.tiktok;
  const facebookStatus = platformStatuses.facebook;

  const [connectBanner, setConnectBanner] = useState(null);
  const [systemHealth, setSystemHealth] = useState({ ok: true, status: "unknown", message: null });

  const [afterdarkRefreshKey, setAfterdarkRefreshKey] = useState(0);
  const [pinterestCreateVisible, setPinterestCreateVisible] = useState(false);
  const [pinterestCreateName, setPinterestCreateName] = useState("");
  const [pinterestCreateDesc, setPinterestCreateDesc] = useState("");
  const hasLoadedPlatformStatus = useRef(false);
  const selectedVideoRef = useRef(null);
  const hasAutoRoutedPrimaryTab = useRef(false);
  const contentList = useMemo(() => (Array.isArray(content) ? content : []), [content]);
  const schedulesList = useMemo(
    () => (Array.isArray(mySchedules) ? mySchedules : []),
    [mySchedules]
  );
  const hasAfterDarkAccess = !!(
    user &&
    (user.isAdmin ||
      user.role === "admin" ||
      user.kycVerified ||
      (user.flags && user.flags.afterDarkAccess))
  );
  const isAdminUser = !!(user && (user.isAdmin || user.role === "admin"));
  const needsKyc = !!(user && !user.kycVerified);
  const connectedPlatformCount = useMemo(() => {
    const rawPlatforms =
      platformSummary && platformSummary.raw ? Object.values(platformSummary.raw) : [];
    return rawPlatforms.filter(platform => platform && platform.connected).length;
  }, [platformSummary]);
  const hasConnectedPlatforms = connectedPlatformCount > 0;

  const [emailVerified, setEmailVerified] = useState(true);
  useEffect(() => {
    setTz(userDefaults?.timezone || "UTC");
    setDefaultsPlatforms(
      Array.isArray(userDefaults?.defaultPlatforms) ? userDefaults.defaultPlatforms : []
    );
    setDefaultsFrequency(userDefaults?.defaultFrequency || "once");
    setPaypalEmail(userDefaults?.paypalEmail || user?.paypalEmail || "");
    setAutoRepostEnabled(
      typeof userDefaults?.autoRepostEnabled === "boolean" ? userDefaults.autoRepostEnabled : true
    );
  }, [userDefaults, user?.paypalEmail]);

  useEffect(() => {
    const unreadNotifications = Array.isArray(notifications)
      ? notifications.filter(notification => !notification?.read)
      : [];
    unreadNotifications.forEach(notification => {
      if (notification?.id) notifiedNotificationIdsRef.current.add(notification.id);
    });

    setNotifs(prevNotifs => {
      const previous = Array.isArray(prevNotifs) ? prevNotifs : [];
      if (previous.length !== unreadNotifications.length) {
        return unreadNotifications;
      }

      const hasChanged = previous.some((notification, index) => {
        const nextNotification = unreadNotifications[index];
        return (
          notification?.id !== nextNotification?.id ||
          notification?.read !== nextNotification?.read ||
          notification?.message !== nextNotification?.message ||
          notification?.title !== nextNotification?.title ||
          notification?.created_at !== nextNotification?.created_at
        );
      });

      return hasChanged ? unreadNotifications : previous;
    });
  }, [notifications]);

  useEffect(() => {
    // NEW: Check for "Wolf Hunt" onboarding criteria
    // Triggers if user has >= 2 content items AND hasn't seen the welcome yet
    if (!ENABLE_WOLF_HUNT) return; // Do not show recruitment notice when Wolf Hunt is locked

    if (contentList && contentList.length >= 2) {
      const hasSeen = localStorage.getItem("wolfHuntWelcomeSeen");

      if (!hasSeen) {
        // Trigger the special notification logic
        // Mark as seen so it doesn't fire again immediately on refresh
        localStorage.setItem("wolfHuntWelcomeSeen", "true");

        // 1. Add to Notifications Panel
        const welcomeMsg = {
          id: "wolf-hunt-welcome-" + Date.now(),
          title: "🐺 WOLF HUNT INVITATION",
          message:
            "Soldier! You have proven your worth by publishing content. The Wolf Hunt awaits. Go to the Wolf Hunt tab and click the Speaker icon for your mission briefing.",
          type: "wolf_hunt_invite",
          read: false,
          created_at: new Date().toISOString(),
        };

        setNotifs(prev => [welcomeMsg, ...(prev || [])]);

        // 2. Show Persistent "Call to Action" Toast
        toast(
          t => (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "250px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "20px" }}>🐺</span>
                <b>RECRUITMENT NOTICE</b>
              </div>
              <span>You've published content. Now it's time to hunt.</span>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  handleNav("wolf_hunt"); // Navigate to Wolf Hunt tab
                }}
                style={{
                  background: "#00ff88",
                  color: "#000",
                  border: "none",
                  padding: "8px 12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginTop: "8px",
                  borderRadius: "4px",
                  textTransform: "uppercase",
                }}
              >
                REPORT FOR DUTY →
              </button>
              <small style={{ color: "#aaa", fontSize: "11px", marginTop: "4px" }}>
                ℹ️ Click the Speaker icon on the Hunt page for full briefing.
              </small>
            </div>
          ),
          {
            duration: 15000,
            position: "top-center",
            style: {
              background: "#111",
              border: "1px solid #00ff88",
              color: "#fff",
              boxShadow: "0 0 20px rgba(0,255,136,0.2)",
            },
          }
        );
      }
    }
  }, [contentList]); // Depend on contentList

  // Toggle dashboard-mode class on mount/unmount so global gradients don't show through dashboard pages
  useEffect(() => {
    // Fetch system health on dashboard load and log to console if any service degraded
    (async function checkSystemHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`);
        const json = await res.json();
        if (!res.ok || (json && json.status && json.status !== "OK")) {
          setSystemHealth({
            ok: false,
            status: (json && json.status) || "degraded",
            message: json && json.message,
          });
          console.error("[SystemHealth] Dashboard detected degraded system:", json);
        } else {
          setSystemHealth({ ok: true, status: "OK", message: null });
        }
      } catch (e) {
        setSystemHealth({ ok: false, status: "error", message: e.message });
        console.error("[SystemHealth] Dashboard detected error checking health:", e && e.message);
      }
    })();

    document.documentElement?.classList?.add("dashboard-mode");
    document.body?.classList?.add("dashboard-mode");

    // Poll notifications periodically so users see admin feedback promptly (mobile friendly)
    // Reduce noise: Poll every 60s instead of 10s
    let pollTimer = null;
    const pollNotifications = async () => {
      try {
        const currentUser = auth?.currentUser;
        if (!currentUser) return;
        // Do NOT force refresh token (pass false), use cached token to prevent rate limiting
        const token = await currentUser.getIdToken(false);
        const res = await fetch(`${API_ENDPOINTS.NOTIFICATIONS_LIST}?limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.notifications) return;
        const incoming = Array.isArray(json.notifications) ? json.notifications : [];
        const incomingUnread = incoming.filter(notification => !notification?.read);
        const unseenRecentUnread = incomingUnread.filter(notification => {
          if (!notification?.id || notifiedNotificationIdsRef.current.has(notification.id)) {
            return false;
          }
          const createdAt = Date.parse(notification.created_at || notification.timestamp || "");
          return Number.isFinite(createdAt) && createdAt >= notificationSessionStartedAtRef.current;
        });

        incomingUnread.forEach(notification => {
          if (notification?.id) notifiedNotificationIdsRef.current.add(notification.id);
        });

        setNotifs(prevNotifs => {
          const currentList = Array.isArray(prevNotifs) ? prevNotifs : [];
          const syntheticNotifications = currentList.filter(notification =>
            String(notification?.id || "").startsWith("wolf-hunt-welcome-")
          );
          const merged = [...incomingUnread, ...syntheticNotifications].reduce(
            (acc, notification) => {
              const key =
                notification?.id ||
                `${notification?.title || "notification"}-${notification?.created_at || ""}`;
              if (
                !acc.some(
                  item =>
                    (item?.id || `${item?.title || "notification"}-${item?.created_at || ""}`) ===
                    key
                )
              ) {
                acc.push(notification);
              }
              return acc;
            },
            []
          );

          if (didHydrateNotificationPollRef.current && unseenRecentUnread.length > 0) {
            setTimeout(() => {
              unseenRecentUnread.forEach(notification => {
                try {
                  toast(
                    notification.message || notification.title || "You have a new notification"
                  );
                } catch (_) {}
              });
            }, 0);
          }

          didHydrateNotificationPollRef.current = true;
          return merged.slice(0, 200);
        });
      } catch (e) {
        // ignore polling errors
      }
    };
    // Start a timer and also poll on visibility change to catch when mobile resumes
    pollTimer = setInterval(pollNotifications, 60000); // 60s interval
    const handleVisibility = () => {
      if (!document.hidden) {
        // Debounce visibility poll to avoid double-firing
        if (!pollTimer) pollNotifications();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // initial poll
    pollNotifications();

    return () => {
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.documentElement?.classList?.remove("dashboard-mode");
      document.body?.classList?.remove("dashboard-mode");
    };
  }, []); // Empty dependency array to run only once on mount

  const handleNav = useCallback(
    (tab, options = {}) => {
      if (tab === "wolf_hunt" && !ENABLE_WOLF_HUNT) {
        toast("🐺 Wolf Hunt is currently locked. Come back later!", { icon: "🔒" });
        return;
      }
      if (tab === "clips" && CLIP_STUDIO_LOCKED) {
        toast("Clip Studio is currently locked.", { icon: "🔒" });
        return;
      }
      setUploadLaunchTab(tab === "upload" ? options?.uploadTab || null : null);
      setActiveTab(tab);
      setSidebarOpen(false);
    },
    [ENABLE_WOLF_HUNT]
  );
  const triggerSchedulesRefresh = useCallback(() => {
    onSchedulesChanged && onSchedulesChanged();
  }, [onSchedulesChanged]);

  const withAuth = useCallback(async cb => {
    const currentUser = auth?.currentUser;
    if (!currentUser) {
      toast.error("Please sign in first");
      return;
    }
    try {
      const token = await currentUser.getIdToken(true);
      return cb(token);
    } catch (error) {
      // Silently handle token refresh errors
      console.warn("Token refresh failed:", error.message);
      return null;
    }
  }, []);

  const doPause = useCallback(
    async id => {
      await withAuth(async token => {
        try {
          await fetch(API_ENDPOINTS.SCHEDULE_PAUSE(id), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          triggerSchedulesRefresh();
          toast.success("Schedule paused");
        } catch (e) {
          console.warn(e);
          toast.error("Failed to pause schedule");
        }
      });
    },
    [withAuth, triggerSchedulesRefresh]
  );
  const doResume = useCallback(
    async id => {
      await withAuth(async token => {
        try {
          await fetch(API_ENDPOINTS.SCHEDULE_RESUME(id), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          triggerSchedulesRefresh();
          toast.success("Schedule resumed");
        } catch (e) {
          console.warn(e);
          toast.error("Failed to resume schedule");
        }
      });
    },
    [withAuth, triggerSchedulesRefresh]
  );
  const doReschedule = useCallback(
    async (id, when) => {
      await withAuth(async token => {
        try {
          await fetch(API_ENDPOINTS.SCHEDULE_RESCHEDULE(id), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ time: when }),
          });
          triggerSchedulesRefresh();
          toast.success("Schedule updated");
        } catch (e) {
          console.warn(e);
          toast.error("Failed to reschedule");
        }
      });
    },
    [withAuth, triggerSchedulesRefresh]
  );
  const doDelete = useCallback(
    async id => {
      if (!window.confirm("Delete this schedule?")) return;
      await withAuth(async token => {
        try {
          await fetch(API_ENDPOINTS.SCHEDULE_DELETE(id), {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          triggerSchedulesRefresh();
          toast.success("Schedule deleted");
        } catch (e) {
          console.warn(e);
          toast.error("Failed to delete schedule");
        }
      });
    },
    [withAuth, triggerSchedulesRefresh]
  );

  const createSchedule = useCallback(
    async ({ contentId, time, frequency, platforms = [], platformOptions = {} }) => {
      const toastId = toast.loading("Creating schedule...");
      try {
        await withAuth(async token => {
          if (!contentId) throw new Error("Missing contentId");
          const res = await fetch(`${API_BASE_URL}/api/content/${contentId}/promotion-schedules`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ time, frequency, platforms, platformOptions }),
          });
          if (!res.ok) throw new Error("Failed to create schedule");
          triggerSchedulesRefresh();
          toast.success("Schedule created successfully!", { id: toastId });
        });
      } catch (e) {
        console.warn(e);
        toast.error("Failed to create schedule", { id: toastId });
      }
    },
    [withAuth, triggerSchedulesRefresh]
  );

  const refreshAllStatus = loadAllPlatformStatusesUnified;

  useEffect(() => {
    // Check URL params for OAuth callback success/error
    const params = new URLSearchParams(window.location.search);
    const oauthPlatform =
      params.get("oauth") ||
      params.get("youtube") ||
      params.get("tiktok") ||
      params.get("facebook") ||
      params.get("twitter") ||
      params.get("spotify") ||
      params.get("discord") ||
      params.get("reddit") ||
      params.get("linkedin") ||
      params.get("pinterest") ||
      params.get("telegram") ||
      params.get("snapchat");
    const oauthStatus = params.get("status");

    if (oauthPlatform) {
      // Clear URL params without reload
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", cleanUrl);

      // Clear ALL platform status caches to force fresh data
      clearCache();

      // Show toast notification
      if (oauthStatus === "success" || params.get(oauthPlatform) === "connected") {
        setConnectBanner({
          type: "success",
          message: `${oauthPlatform.charAt(0).toUpperCase() + oauthPlatform.slice(1)} connected successfully!`,
        });
        toast.success(
          `${oauthPlatform.charAt(0).toUpperCase() + oauthPlatform.slice(1)} connected successfully!`
        );
        // Auto-dismiss after 5 seconds
        setTimeout(() => setConnectBanner(null), 5000);
      } else if (oauthStatus === "error" || params.get(oauthPlatform) === "error") {
        setConnectBanner({
          type: "error",
          message: `Failed to connect ${oauthPlatform}. Please try again.`,
        });
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
        // Use cached token unless expired to improve reliability
        const token = await currentUser.getIdToken();

        // Load critical data first (with caching)
        await cachedFetch(
          "initial-data",
          async () => {
            return true;
          },
          60000
        ); // 60s cache

        // Load all platform statuses from the unified endpoint
        await loadAllPlatformStatusesUnified();
      } catch (e) {
        /* ignore */
      }
    };
    // If user is already present, run initial load. Otherwise wait for auth state.
    const currentUser = auth.currentUser;
    if (currentUser) {
      loadInitial();
    } else {
      // Wait for auth state to initialize then run loadInitial once
      const unsubscribe = auth.onAuthStateChanged(u => {
        if (u) {
          // run initial load once
          loadInitial().catch(() => {});
          unsubscribe();
        }
      });
    }
  }, []);

  useEffect(() => {
    const rawPlatforms =
      platformSummary && platformSummary.raw ? Object.values(platformSummary.raw) : [];
    if (hasAutoRoutedPrimaryTab.current || rawPlatforms.length === 0) return;
    if (activeTab !== "profile") {
      hasAutoRoutedPrimaryTab.current = true;
      return;
    }

    setActiveTab(
      rawPlatforms.some(platform => platform && platform.connected) ? "upload" : "connections"
    );
    hasAutoRoutedPrimaryTab.current = true;
  }, [platformSummary, activeTab]);

  const setPlatformOption = useCallback((platform, key, value) => {
    setPlatformOptions(prev => ({
      ...(prev || {}),
      [platform]: { ...((prev || {})[platform] || {}), [key]: value },
    }));
  }, []);

  const togglePlatform = useCallback(name => {
    setSelectedPlatforms(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  }, []);

  // Small helper for default platform toggles
  const toggleDefaultPlatform = useCallback(name => {
    setDefaultsPlatforms(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    );
  }, []);

  const handleSaveDefaults = async () => {
    if (!onSaveDefaults) return;
    try {
      const saved = await onSaveDefaults({
        timezone: tz,
        defaultPlatforms: defaultsPlatforms,
        defaultFrequency: defaultsFrequency,
        autoRepostEnabled,
        paypalEmail,
      });
      if (!saved) throw new Error("save_failed");
      toast.success("Defaults saved successfully!");
    } catch (e) {
      toast.error("Failed to save defaults");
    }
  };

  // Connect handlers; these call the generic openProviderAuth where appropriate
  const handleConnectTikTok = async () => openProviderAuth(API_ENDPOINTS.TIKTOK_AUTH_START);
  const handleConnectFacebook = async () => openProviderAuth(API_ENDPOINTS.FACEBOOK_AUTH_START);
  const handleConnectYouTube = async () => openProviderAuth(API_ENDPOINTS.YOUTUBE_AUTH_START);
  const handleConnectTwitter = async () => {
    // Prompt the user to choose OAuth1 (recommended for native video uploads) or OAuth2 PKCE.
    const useOauth1 = window.confirm(
      "Connect with Twitter: click OK to use OAuth1 (recommended for video uploads), or Cancel to use standard OAuth2 PKCE."
    );
    const endpoint = useOauth1
      ? API_ENDPOINTS.TWITTER_AUTH_PREPARE_OAUTH1 ||
        API_ENDPOINTS.TWITTER_AUTH_PREPARE ||
        API_ENDPOINTS.TWITTER_AUTH_START
      : API_ENDPOINTS.TWITTER_AUTH_PREPARE || API_ENDPOINTS.TWITTER_AUTH_START;
    if (useOauth1) toast("Opening OAuth1 authentication (recommended for video uploads)");
    else toast("Opening standard Twitter authentication");
    await openProviderAuth(endpoint);
  };
  const handleConnectSnapchat = async () =>
    openProviderAuth(API_ENDPOINTS.SNAPCHAT_AUTH_PREPARE || API_ENDPOINTS.SNAPCHAT_AUTH_START);
  const handleConnectSpotify = async () => openProviderAuth(API_ENDPOINTS.SPOTIFY_AUTH_START);
  const handleConnectReddit = async () => openProviderAuth(API_ENDPOINTS.REDDIT_AUTH_START);
  const handleConnectDiscord = async () => openProviderAuth(API_ENDPOINTS.DISCORD_AUTH_START);
  const handleConnectLinkedin = async () => openProviderAuth(API_ENDPOINTS.LINKEDIN_AUTH_START);
  const handleConnectTelegram = async () =>
    openProviderAuth(API_ENDPOINTS.TELEGRAM_AUTH_PREPARE || API_ENDPOINTS.TELEGRAM_AUTH_START);
  const handleConnectPinterest = async () => openProviderAuth(API_ENDPOINTS.PINTEREST_AUTH_START);

  const handleDisconnectPlatform = async platform => {
    if (!window.confirm(`Disconnect ${platform}?`)) return;
    await withAuth(async token => {
      try {
        const res = await fetch(API_ENDPOINTS.PLATFORM_DISCONNECT(platform), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Failed to disconnect");
        }

        // Show success banner
        setConnectBanner({
          type: "success",
          message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} disconnected successfully`,
        });
        setTimeout(() => setConnectBanner(null), 4000);

        // Immediately update local state, then refresh from server
        setPlatformStatusByName(platform, { connected: false, meta: null });
        await refreshAllStatus();
      } catch (e) {
        console.warn(e);
        setConnectBanner({ type: "error", message: e.message || "Failed to disconnect" });
        setTimeout(() => setConnectBanner(null), 4000);
        toast.error(e.message || "Failed to disconnect");
      }
    });
  };

  const markAllNotificationsRead = async () => {
    try {
      await withAuth(async token => {
        await fetch(API_ENDPOINTS.NOTIFICATIONS_MARK_READ, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      });
      setNotifs([]);
      toast.success("All notifications marked as read");
    } catch (e) {
      console.warn(e);
      toast.error("Failed to mark notifications as read");
    }
  };

  const openProviderAuth = async endpointUrl => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        toast.error("Please sign in first");
        return;
      }
      const token = await currentUser.getIdToken(true);
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

      // If the endpoint is a "prepare" endpoint, POST to it to retrieve the authUrl
      const isPrepareEndpoint =
        String(endpointUrl).includes("/prepare") || String(endpointUrl).endsWith("/oauth/prepare");
      if (isPrepareEndpoint) {
        try {
          const prepareRes = await fetch(endpointUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ popup: true }),
          });
          const prepareData = await prepareRes.json().catch(() => null);
          if (!prepareRes.ok) {
            const msg =
              prepareData && (prepareData.error || prepareData.details || prepareData.message)
                ? prepareData.error || prepareData.details || prepareData.message
                : "Auth prepare failed";
            console.warn(
              "Prepare endpoint POST returned error",
              prepareRes.status,
              msg,
              prepareData
            );
            toast.error(msg);
            return;
          }
          if (!prepareData?.authUrl) {
            toast.error("Auth prepare failed: no authUrl returned");
            return;
          }
          // If provider probe returned 5xx or probe error, surface helpful error and do not open provider page
          const probeStatus = prepareData.probeStatus;
          if (
            probeStatus === "probe_error" ||
            (typeof probeStatus === "number" && probeStatus >= 500)
          ) {
            console.warn(
              "Provider probe indicates an error, aborting open. probeStatus=",
              probeStatus,
              prepareData
            );
            toast.error(
              "Provider temporarily unavailable. Please try again later or contact support."
            );
            return;
          }
          toast.success("Opening authentication window...");
          if (isMobile && prepareData.appUrl) {
            if (!isSafeRedirectUrl(prepareData.appUrl)) {
              toast.error("Untrusted redirect URL blocked.");
              return;
            }
            window.location.href = prepareData.appUrl;
          } else if (isMobile) {
            if (!isSafeRedirectUrl(prepareData.authUrl)) {
              toast.error("Untrusted redirect URL blocked.");
              return;
            }
            window.location.href = prepareData.authUrl;
          } else {
            if (!isSafeRedirectUrl(prepareData.authUrl)) {
              toast.error("Untrusted redirect URL blocked.");
              return;
            }
            window.open(prepareData.authUrl, "_blank");
          }
          return;
        } catch (err) {
          console.warn("Prepare endpoint POST failed:", err.message);
          toast.error("Failed to start authentication. Please try again.");
          return; // don't try to GET a prepare endpoint
        }
      }

      // First, check if this is a two-step flow (returns JSON with prepareUrl) or direct redirect
      // Only attempt the `fetch` probe when the endpoint is same-origin to avoid CORS issues
      try {
        const sameOrigin = (() => {
          try {
            const u = new URL(endpointUrl, window.location.href);
            return u.origin === window.location.origin;
          } catch (e) {
            return false;
          }
        })();

        if (sameOrigin) {
          // Try GET first to see if the provider uses a two-step flow (returns JSON)
          const checkRes = await fetch(endpointUrl, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
          });
          const contentType = checkRes.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            // Two-step flow: GET returns JSON with prepareUrl, then POST to prepare
            const data = await checkRes.json();
            if (data.prepareUrl) {
              // POST to prepare endpoint to get the actual auth URL
              const prepareRes = await fetch(data.prepareUrl, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              });
              const prepareData = await prepareRes.json();
              if (!prepareRes.ok) {
                const msg =
                  prepareData && (prepareData.error || prepareData.details || prepareData.message)
                    ? prepareData.error || prepareData.details || prepareData.message
                    : "Auth prepare failed";
                toast.error(msg);
                return;
              }
              if (!prepareData?.authUrl) {
                toast.error("Auth prepare failed: no authUrl returned");
                return;
              }
              toast.success("Opening authentication window...");
              if (isMobile) {
                if (!isSafeRedirectUrl(prepareData.authUrl)) {
                  toast.error("Untrusted redirect URL blocked.");
                  return;
                }
                window.location.href = prepareData.authUrl;
              } else {
                if (!isSafeRedirectUrl(prepareData.authUrl)) {
                  toast.error("Untrusted redirect URL blocked.");
                  return;
                }
                window.open(prepareData.authUrl, "_blank");
              }
              return;
            }
          }
        } else {
          // Skip probing cross-origin auth endpoints to avoid CORS redirect errors.
          console.debug("Skipping cross-origin auth probe for", endpointUrl);
        }
      } catch (jsonErr) {
        // Not JSON or fetch failed; fall through to direct redirect approach
        console.warn("Two-step auth not available, using direct redirect", jsonErr.message);
      }

      // Direct redirect flow: append token as query param and open
      const separator = endpointUrl.includes("?") ? "&" : "?";
      const authUrl = `${endpointUrl}${separator}id_token=${encodeURIComponent(token)}`;
      toast.success("Opening authentication window...");
      if (isMobile) {
        if (!isSafeRedirectUrl(authUrl)) {
          toast.error("Untrusted redirect URL blocked.");
          return;
        }
        window.location.href = authUrl;
      } else {
        if (!isSafeRedirectUrl(authUrl)) {
          toast.error("Untrusted redirect URL blocked.");
          return;
        }
        window.open(authUrl, "_blank");
      }
    } catch (e) {
      console.warn(e);
      toast.error(e.message || "Failed to start auth");
    }
  };

  return (
    <div className={`dashboard-root ${activeTab === "live" ? "live-mode" : ""}`}>
      <Toaster
        position="top-right"
        toastOptions={{ duration: 4000, style: { background: "#1a1a2e", color: "#fff" } }}
      />
      {/* TopNav removed for live tab as requested */}
      {activeTab !== "live" && (
        <header className="dashboard-topbar" aria-label="Top navigation">
          <button
            className="hamburger"
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(v => !v)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-title">Your Dashboard</div>
          <div className="topbar-user">{user?.name || "Guest"}</div>
          <VoiceOverGuide activeTab={activeTab} />
          <button
            className="topbar-icon-btn"
            aria-label="Notifications"
            onClick={() => handleNav("notifications")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text)",
              marginLeft: "0.5rem",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {notifs.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  background: "#ef4444",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: "bold",
                  minWidth: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 2px",
                }}
              >
                {notifs.length > 9 ? "9+" : notifs.length}
              </span>
            )}
          </button>
        </header>
      )}

      {activeTab !== "live" && (
        <aside className={`dashboard-sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Sidebar">
          <div className="profile-section">
            <img className="profile-avatar" src={user?.avatarUrl || DEFAULT_IMAGE} alt="Avatar" />
            <h2>{user?.name || "User Name"}</h2>

            <div className="profile-stats">
              <div>
                <strong>Views:</strong> {stats?.views ?? 0}
              </div>
              <div>
                <strong>Clicks:</strong> {stats?.clicks ?? 0}
              </div>
              <div>
                <strong>CTR:</strong> {stats?.ctr ?? 0}%
              </div>
              <div>
                <strong>Revenue:</strong> ${stats?.revenue ?? "0.00"}
              </div>
            </div>
          </div>
          <nav className="dashboard-navbar-vertical" role="navigation">
            <ul>
              <li
                className={activeTab === "profile" ? "active" : ""}
                onClick={() => handleNav("profile")}
              >
                Overview
              </li>
              <li
                className={activeTab === "connections" ? "active" : ""}
                onClick={() => handleNav("connections")}
              >
                Connections
              </li>
              <li
                className={activeTab === "upload" ? "active" : ""}
                onClick={() => handleNav("upload")}
              >
                Publish
              </li>
              <li
                className={activeTab === "schedules" ? "active" : ""}
                onClick={() => handleNav("schedules")}
              >
                Queue
              </li>
              <li
                className={activeTab === "analytics" ? "active" : ""}
                onClick={() => handleNav("analytics")}
              >
                Analytics
              </li>
              <li
                className={activeTab === "billing" ? "active" : ""}
                onClick={() => handleNav("billing")}
              >
                Billing
              </li>
              {/* Notifications moved to top bar */}
              {isAdminUser && (
                <li
                  className={activeTab === "admin-audit" ? "active" : ""}
                  onClick={() => handleNav("admin-audit")}
                >
                  Admin Audit
                </li>
              )}
              {isAdminUser && (
                <li
                  className={activeTab === "admin-kyc" ? "active" : ""}
                  onClick={() => handleNav("admin-kyc")}
                >
                  Admin KYC
                </li>
              )}
              {/* KYC uploads disabled for live-only AfterDark by design */}
              <li
                className={activeTab === "security" ? "active" : ""}
                onClick={() => handleNav("security")}
              >
                Security
              </li>
              {ENABLE_WOLF_HUNT ? (
                <li
                  className={activeTab === "wolf_hunt" ? "active" : ""}
                  onClick={() => handleNav("wolf_hunt")}
                >
                  Mission Board
                </li>
              ) : (
                <li
                  className="locked-feature"
                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                  onClick={e => {
                    e.stopPropagation();
                    toast("Mission Board is currently locked.", { icon: "🔒" });
                  }}
                >
                  Mission Board 🔒
                </li>
              )}
              {CLIP_STUDIO_LOCKED ? (
                <li
                  className="locked-feature"
                  style={{ opacity: 0.6, cursor: "not-allowed" }}
                  onClick={e => {
                    e.stopPropagation();
                    toast("Clip Studio is currently locked.", { icon: "🔒" });
                  }}
                >
                  Clip Studio 🔒
                </li>
              ) : (
                <li
                  className={activeTab === "clips" ? "active" : ""}
                  onClick={() => handleNav("clips")}
                >
                  Clip Studio
                </li>
              )}
              <li
                className={activeTab === "idea_video" ? "active" : ""}
                onClick={() => handleNav("idea_video")}
              >
                Creative Tools
              </li>
              <li
                className="locked-feature"
                style={{ opacity: 0.6, cursor: "not-allowed" }}
                onClick={e => {
                  e.stopPropagation();
                  toast("Promotion controls are coming soon.", { icon: "🔒" });
                }}
              >
                Promotion Controls 🔒
              </li>
            </ul>
          </nav>
          <button className="logout-btn" onClick={onLogout}>
            Logout
          </button>
        </aside>
      )}

      <main className="dashboard-main">
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 20px 0 0" }}>
          <VoiceOverGuide activeTab={activeTab} />
        </div>
        <UsageLimitBanner />
        {!emailVerified && (
          <div
            className="verification-banner"
            style={{
              background: "#fff3cd",
              color: "#856404",
              padding: "12px",
              marginBottom: "16px",
              borderRadius: "8px",
              border: "1px solid #ffeeba",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.95rem",
            }}
          >
            <span>
              {!hasConnectedPlatforms && (
                <div
                  style={{
                    marginBottom: "1rem",
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    color: "#1e3a8a",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>Start here:</strong> connect at least one platform before your first
                    publish workflow.
                  </div>
                  <button className="check-quality" onClick={() => handleNav("connections")}>
                    Connect Platforms
                  </button>
                </div>
              )}
              {hasConnectedPlatforms && contentList.length === 0 && (
                <div
                  style={{
                    marginBottom: "1rem",
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "#ecfeff",
                    border: "1px solid #a5f3fc",
                    color: "#155e75",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>Workspace ready:</strong> upload once, choose destinations, and inspect
                    status from one queue.
                  </div>
                  <button className="check-quality" onClick={() => handleNav("upload")}>
                    Publish Your First Asset
                  </button>
                </div>
              )}
              <strong>Verify your email:</strong> Please check your inbox for a verification link.
              Verify to access security features.
            </span>
            <button
              onClick={async () => {
                if (auth.currentUser) {
                  try {
                    await sendEmailVerification(auth.currentUser);
                    toast.success("Verification email sent!");
                  } catch (e) {
                    toast.error("Error sending email: " + e.message);
                  }
                }
              }}
              style={{
                background: "transparent",
                border: "1px solid #856404",
                color: "#856404",
                padding: "4px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
                marginLeft: "12px",
              }}
            >
              Resend Email
            </button>
          </div>
        )}
        {systemHealth && !systemHealth.ok && (
          <div
            style={{
              padding: "8px 12px",
              background: "#ffebee",
              color: "#b71c1c",
              borderRadius: 6,
              marginBottom: 12,
            }}
          >
            ⚠️ System status degraded: {systemHealth.status}{" "}
            {systemHealth.message ? ` - ${systemHealth.message}` : ""}
          </div>
        )}
        {connectBanner && (
          <div
            className={`connect-banner ${connectBanner.type}`}
            style={{
              padding: "1rem",
              marginBottom: "1rem",
              borderRadius: "8px",
              background: connectBanner.type === "success" ? "#10b981" : "#ef4444",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{connectBanner.message}</span>
            <button
              onClick={() => setConnectBanner(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: "1.2rem",
                padding: "0 0.5rem",
              }}
            >
              ×
            </button>
          </div>
        )}
        {activeTab === "profile" && (
          <ProfilePanel
            user={user}
            stats={stats}
            tiktokStatus={tiktokStatus}
            facebookStatus={facebookStatus}
            youtubeStatus={youtubeStatus}
            twitterStatus={twitterStatus}
            snapchatStatus={snapchatStatus}
            spotifyStatus={spotifyStatus}
            redditStatus={redditStatus}
            discordStatus={discordStatus}
            linkedinStatus={linkedinStatus}
            telegramStatus={telegramStatus}
            pinterestStatus={pinterestStatus}
            tz={tz}
            defaultsPlatforms={defaultsPlatforms}
            defaultsFrequency={defaultsFrequency}
            paypalEmail={paypalEmail}
            setPaypalEmail={setPaypalEmail}
            toggleDefaultPlatform={toggleDefaultPlatform}
            setDefaultsFrequency={setDefaultsFrequency}
            setTz={setTz}
            autoRepostEnabled={autoRepostEnabled}
            setAutoRepostEnabled={setAutoRepostEnabled}
            handleSaveDefaults={handleSaveDefaults}
            handleConnectTikTok={handleConnectTikTok}
            handleConnectFacebook={handleConnectFacebook}
            handleConnectYouTube={handleConnectYouTube}
            handleConnectTwitter={handleConnectTwitter}
            handleConnectSnapchat={handleConnectSnapchat}
            handleConnectSpotify={handleConnectSpotify}
            handleConnectReddit={handleConnectReddit}
            handleConnectDiscord={handleConnectDiscord}
            handleConnectLinkedin={handleConnectLinkedin}
            handleConnectTelegram={handleConnectTelegram}
            handleConnectPinterest={handleConnectPinterest}
            onNavigate={handleNav}
          />
        )}

        {activeTab === "upload" && (
          <UploadPanel
            onUpload={onUpload}
            initialFile={selectedFile}
            onClearInitialFile={() => setSelectedFile(null)}
            initialTabOverride={uploadLaunchTab}
            onInitialTabHandled={() => setUploadLaunchTab(null)}
            contentList={contentList}
            platformMetadata={platformMetadata}
            platformOptions={platformOptions}
            setPlatformOption={setPlatformOption}
            selectedPlatforms={selectedPlatforms}
            setSelectedPlatforms={setSelectedPlatforms}
            spotifySelectedTracks={spotifySelectedTracks}
            setSpotifySelectedTracks={setSpotifySelectedTracks}
            onNavigate={handleNav}
          />
        )}

        {activeTab === "schedules" && (
          <SchedulesPanel
            schedulesList={schedulesList}
            contentList={contentList}
            onCreate={createSchedule}
            onPause={doPause}
            onResume={doResume}
            onReschedule={doReschedule}
            onDelete={doDelete}
          />
        )}

        {activeTab === "analytics" && <AnalyticsPanel />}

        {activeTab === "rewards" && <RewardsPanel badges={badges} />}

        {activeTab === "notifications" && (
          <NotificationsPanel
            notifs={notifs}
            onMarkAllRead={markAllNotificationsRead}
            onNavigate={handleNav}
          />
        )}

        {activeTab === "ads" && <MissionControlPanel />}

        {activeTab === "billing" && <PayPalSubscriptionPanel />}

        {activeTab === "connections" && (
          <ConnectionsPanel
            platformSummary={platformSummary}
            discordStatus={discordStatus}
            spotifyStatus={spotifyStatus}
            redditStatus={redditStatus}
            youtubeStatus={youtubeStatus}
            twitterStatus={twitterStatus}
            tiktokStatus={tiktokStatus}
            facebookStatus={facebookStatus}
            linkedinStatus={linkedinStatus}
            snapchatStatus={snapchatStatus}
            telegramStatus={telegramStatus}
            pinterestStatus={pinterestStatus}
            handleConnectSpotify={handleConnectSpotify}
            handleConnectDiscord={handleConnectDiscord}
            handleConnectReddit={handleConnectReddit}
            handleConnectYouTube={handleConnectYouTube}
            handleConnectTwitter={handleConnectTwitter}
            handleConnectSnapchat={handleConnectSnapchat}
            handleConnectLinkedin={handleConnectLinkedin}
            handleConnectTelegram={handleConnectTelegram}
            handleConnectPinterest={handleConnectPinterest}
            handleConnectTikTok={handleConnectTikTok}
            handleConnectFacebook={handleConnectFacebook}
            handleDisconnectPlatform={handleDisconnectPlatform}
          />
        )}

        {activeTab === "admin-audit" && isAdminUser && <AdminAuditViewer />}

        {activeTab === "admin-kyc" && isAdminUser && <AdminKyc />}

        {/* KYC upload flow removed for live-only AfterDark */}

        {activeTab === "security" && <SecurityPanel user={user} />}

        {activeTab === "wolf_hunt" && <WolfHuntDashboard />}

        {activeTab === "clips" && !CLIP_STUDIO_LOCKED && (
          <ClipStudioPanel content={contentList} onRefresh={onUpload} />
        )}
        {activeTab === "idea_video" && (
          <IdeaVideoPanel
            onPublish={videoFile => {
              setSelectedFile(videoFile);
              setActiveTab("upload");
              window.scrollTo({ top: 0, behavior: "smooth" });
              toast.success("Proceeding to Upload Form...");
            }}
          />
        )}
      </main>
      <BottomNav activeTab={activeTab} onNav={handleNav} onLogout={onLogout} />
    </div>
  );
};

export default UserDashboard;
