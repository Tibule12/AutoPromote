import { useState, useCallback } from "react";
import { auth } from "../firebaseClient";
import { API_ENDPOINTS } from "../config";
import { cachedFetch } from "../utils/requestCache";

const DEFAULT_STATUS = { connected: false, meta: null };

/**
 * Configuration for each platform's status loading.
 * - endpoint: API endpoint for individual status check
 * - metadataEndpoint: (optional) separate endpoint for metadata
 * - cacheKey: key used for cachedFetch
 * - cacheTtl: (optional) cache duration in ms
 * - mapResponse: transform server response to local state shape
 */
const PLATFORM_CONFIG = {
  spotify: {
    endpoint: API_ENDPOINTS.SPOTIFY_STATUS,
    metadataEndpoint: API_ENDPOINTS.SPOTIFY_METADATA,
    cacheKey: "spotify-status",
    cacheTtl: 30000,
    mapResponse: d => ({ connected: !!d.connected, meta: d.meta || null }),
  },
  youtube: {
    endpoint: API_ENDPOINTS.YOUTUBE_STATUS,
    metadataEndpoint: API_ENDPOINTS.YOUTUBE_METADATA,
    cacheKey: "youtube-status",
    cacheTtl: 30000,
    mapResponse: d => ({ connected: !!d.connected, channel: d.channel || null }),
  },
  facebook: {
    endpoint: API_ENDPOINTS.FACEBOOK_STATUS,
    mapResponse: d => ({
      connected: !!d.connected,
      meta: d.meta || null,
      pages: d.pages || [],
      profile: d.profile || null,
      ig_business_account_id: d.ig_business_account_id || null,
    }),
  },
  tiktok: {
    endpoint: API_ENDPOINTS.TIKTOK_STATUS,
    mapResponse: d => ({ connected: !!d.connected, meta: d.meta || null }),
  },
  twitter: {
    endpoint: API_ENDPOINTS.TWITTER_STATUS,
    mapResponse: d => ({ connected: !!d.connected, identity: d.identity || null }),
  },
  reddit: {
    endpoint: API_ENDPOINTS.REDDIT_STATUS,
    mapResponse: d => ({ connected: !!d.connected, meta: d.meta || null }),
  },
  discord: {
    endpoint: API_ENDPOINTS.DISCORD_STATUS,
    metadataEndpoint: API_ENDPOINTS.DISCORD_METADATA,
    cacheKey: "discord-status",
    cacheTtl: 30000,
    mapResponse: d => ({ connected: !!d.connected, meta: d.meta || null }),
  },
  linkedin: {
    endpoint: API_ENDPOINTS.LINKEDIN_STATUS,
    mapResponse: d => ({ connected: !!d.connected, meta: d.meta || null }),
  },
  telegram: {
    endpoint: API_ENDPOINTS.TELEGRAM_STATUS,
    mapResponse: d => ({
      connected: !!d.connected,
      meta: d.meta || null,
      userId: d.userId || null,
      username: d.username || null,
    }),
  },
  pinterest: {
    endpoint: API_ENDPOINTS.PINTEREST_STATUS,
    metadataEndpoint: API_ENDPOINTS.PINTEREST_METADATA,
    mapResponse: d => ({ connected: !!d.connected, meta: d.meta || null }),
  },
  snapchat: {
    endpoint: API_ENDPOINTS.SNAPCHAT_STATUS,
    metadataEndpoint: API_ENDPOINTS.SNAPCHAT_METADATA,
    mapResponse: d => ({ connected: !!d.connected, profile: d.profile || null }),
  },
};

const PLATFORM_NAMES = Object.keys(PLATFORM_CONFIG);

/**
 * Custom hook that manages connection status for all social platforms.
 * Replaces 11 individual loader functions with a single factory-driven approach.
 */
export default function usePlatformStatus() {
  const [statuses, setStatuses] = useState(() => {
    const initial = {};
    PLATFORM_NAMES.forEach(name => {
      initial[name] = { ...DEFAULT_STATUS };
    });
    return initial;
  });
  const [platformMetadata, setPlatformMetadata] = useState({});
  const [platformSummary, setPlatformSummary] = useState({ platforms: {} });

  const setStatus = useCallback((platform, data) => {
    setStatuses(prev => ({ ...prev, [platform]: data }));
  }, []);

  /**
   * Load status for a single platform using its config.
   */
  const loadPlatformStatus = useCallback(
    async platformName => {
      const config = PLATFORM_CONFIG[platformName];
      if (!config) return;

      try {
        const cur = auth.currentUser;
        if (!cur) {
          setStatus(platformName, { ...DEFAULT_STATUS });
          return;
        }
        const token = await cur.getIdToken(true);
        const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

        const fetchStatus = async () => {
          const res = await fetch(config.endpoint, { headers });
          if (!res.ok) return { connected: false };
          const d = await res.json();
          // Try to load metadata if connected and endpoint exists
          if (d.connected && config.metadataEndpoint) {
            try {
              const md = await fetch(config.metadataEndpoint, { headers });
              if (md.ok) {
                const mdj = await md.json();
                return { ...d, metadata: mdj.meta || {} };
              }
            } catch {
              // metadata is optional
            }
          }
          return d;
        };

        let data;
        if (config.cacheKey) {
          data = await cachedFetch(config.cacheKey, fetchStatus, config.cacheTtl || 30000);
        } else {
          data = await fetchStatus();
        }

        setStatus(platformName, config.mapResponse(data));
        if (data.metadata) {
          setPlatformMetadata(prev => ({ ...prev, [platformName]: data.metadata }));
        }
      } catch {
        setStatus(platformName, { ...DEFAULT_STATUS });
      }
    },
    [setStatus]
  );

  /**
   * Load all platform statuses from the unified endpoint (preferred).
   * Falls back gracefully if the endpoint is unavailable.
   */
  const loadAllUnified = useCallback(async () => {
    try {
      const cur = auth.currentUser;
      if (!cur) return;
      const data = await cachedFetch(
        "platform-status-unified",
        async () => {
          let token;
          try {
            token = await cur.getIdToken();
          } catch {
            token = await cur.getIdToken(true);
          }

          const res = await fetch(API_ENDPOINTS.PLATFORM_STATUS, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          });
          if (!res.ok) throw new Error(`platform_status_${res.status}`);
          return res.json();
        },
        15000
      );

      const platforms = data.raw || {};

      const newStatuses = {};
      PLATFORM_NAMES.forEach(name => {
        if (platforms[name]) {
          const config = PLATFORM_CONFIG[name];
          newStatuses[name] = config.mapResponse(platforms[name]);
        }
      });
      setStatuses(prev => ({ ...prev, ...newStatuses }));
      setPlatformSummary(data);
    } catch (err) {
      console.error("Error loading unified platform statuses:", err);
    }
  }, []);

  /**
   * Disconnect a platform and update local state immediately.
   */
  const disconnectPlatform = useCallback(
    async platform => {
      const cur = auth.currentUser;
      if (!cur) return;
      const token = await cur.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.PLATFORM_DISCONNECT(platform), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to disconnect");
      }
      setStatus(platform, { ...DEFAULT_STATUS });
      // Refresh from server to confirm
      await loadAllUnified();
    },
    [setStatus, loadAllUnified]
  );

  return {
    statuses,
    platformMetadata,
    platformSummary,
    setStatus,
    loadPlatformStatus,
    loadAllUnified,
    disconnectPlatform,
    PLATFORM_NAMES,
  };
}
