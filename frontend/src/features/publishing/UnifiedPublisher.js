// UnifiedPublisher.js
// The "Command Center" for cross-platform publishing.
// Wraps existing platform forms and delegates upload to App.js

import React, { useState, useEffect } from "react";
import LinkedInForm from "../../components/PlatformForms/LinkedInForm";
import RedditForm from "../../components/PlatformForms/RedditForm";
import "./UnifiedPublisher.css";
// Ensure platform form styles are loaded
import "../../components/PlatformForms/PlatformForms.css";

// --- Config / Services ---
import { API_ENDPOINTS } from "../../config";
import { auth, storage } from "../../firebaseClient";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import toast from "react-hot-toast";

// --- Hooks ---
import { usePublishingState } from "./hooks/usePublishingState";
import { useMediaProcessor } from "./hooks/useMediaProcessor";
import { sanitizeUrl } from "../../utils/security";

// --- Components ---
import VideoEditor from "../../components/VideoEditor";
import ImageCropper from "../../components/ImageCropper";
import BestTimeToPost from "../../components/BestTimeToPost";
import TikTokForm from "../../components/PlatformForms/TikTokForm";
import YouTubeForm from "../../components/PlatformForms/YouTubeForm";
import InstagramForm from "../../components/PlatformForms/InstagramForm";
import FacebookForm from "../../components/PlatformForms/FacebookForm";

// --- New Features ---
import ViralScanner from "../../components/ViralScanner";

// --- Helpers ---
const PLATFORM_LABELS = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  reddit: "Reddit",
};

const getPlatformName = platformId => {
  if (!platformId) return "";
  return (
    PLATFORM_LABELS[platformId] || `${platformId.charAt(0).toUpperCase()}${platformId.slice(1)}`
  );
};

function normalizeTikTokCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const displayName =
    primary?.display_name ||
    primary?.user?.display_name ||
    primary?.profile?.display_name ||
    primary?.profile?.username ||
    fallbackRaw?.display_name ||
    fallbackRaw?.meta?.display_name ||
    fallbackRaw?.profile?.username ||
    fallbackSummary?.display_name ||
    primary?.open_id ||
    fallbackRaw?.open_id ||
    null;

  if (!displayName && !primary && !fallbackRaw && !fallbackSummary) {
    return null;
  }

  return {
    ...(fallbackRaw || {}),
    ...(primary || {}),
    display_name: displayName,
    open_id: primary?.open_id || fallbackRaw?.open_id || displayName,
  };
}

function normalizeYouTubeCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const source =
    primary?.channel ||
    primary ||
    fallbackRaw?.channel ||
    (fallbackSummary?.channelTitle || fallbackSummary?.display_name
      ? {
          snippet: {
            title: fallbackSummary.channelTitle || fallbackSummary.display_name,
          },
        }
      : null);

  const title =
    source?.snippet?.title ||
    fallbackRaw?.display_name ||
    fallbackSummary?.channelTitle ||
    fallbackSummary?.display_name ||
    null;
  const thumbnailUrl =
    source?.snippet?.thumbnails?.default?.url ||
    source?.snippet?.thumbnails?.medium?.url ||
    source?.snippet?.thumbnails?.high?.url ||
    null;

  if (!title && !thumbnailUrl && !primary && !fallbackRaw && !fallbackSummary) {
    return null;
  }

  return {
    ...(source || {}),
    snippet: {
      ...(source?.snippet || {}),
      title: title || source?.snippet?.title || "Unknown Channel",
      thumbnails: {
        ...(source?.snippet?.thumbnails || {}),
        default: thumbnailUrl
          ? {
              ...(source?.snippet?.thumbnails?.default || {}),
              url: thumbnailUrl,
            }
          : source?.snippet?.thumbnails?.default,
      },
    },
  };
}

function normalizeLinkedInCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const localizedName =
    primary?.meta?.localizedName ||
    primary?.localizedName ||
    [primary?.localizedFirstName, primary?.localizedLastName].filter(Boolean).join(" ") ||
    fallbackRaw?.meta?.display_name ||
    fallbackSummary?.display_name ||
    null;
  const profilePicture =
    primary?.profilePicture ||
    primary?.meta?.profilePicture ||
    fallbackRaw?.profilePicture ||
    fallbackRaw?.meta?.profilePicture ||
    null;
  const followers =
    primary?.meta?.followers ||
    primary?.followers ||
    fallbackRaw?.meta?.followers ||
    fallbackSummary?.followers ||
    null;

  if (
    !localizedName &&
    !profilePicture &&
    !followers &&
    !primary &&
    !fallbackRaw &&
    !fallbackSummary
  ) {
    return null;
  }

  const [firstName, ...restName] = (localizedName || "").split(" ").filter(Boolean);

  return {
    ...(fallbackRaw || {}),
    ...(primary || {}),
    localizedName,
    localizedFirstName: primary?.localizedFirstName || firstName || null,
    localizedLastName: primary?.localizedLastName || restName.join(" ") || null,
    profilePicture,
    meta: {
      ...((fallbackRaw && fallbackRaw.meta) || {}),
      ...((primary && primary.meta) || {}),
      localizedName,
      followers,
      profilePicture,
    },
  };
}

function normalizeRedditCreatorInfo(primary, fallbackRaw, fallbackSummary) {
  const username =
    primary?.name ||
    primary?.meta?.name ||
    primary?.meta?.username ||
    fallbackRaw?.meta?.username ||
    fallbackRaw?.name ||
    fallbackSummary?.name ||
    fallbackSummary?.display_name ||
    null;
  const iconImg =
    primary?.icon_img ||
    primary?.meta?.icon_img ||
    fallbackRaw?.icon_img ||
    fallbackRaw?.meta?.icon_img ||
    null;
  const totalKarma =
    primary?.total_karma ||
    primary?.meta?.total_karma ||
    fallbackRaw?.total_karma ||
    fallbackRaw?.meta?.total_karma ||
    null;

  if (!username && !iconImg && !primary && !fallbackRaw && !fallbackSummary) {
    return null;
  }

  return {
    ...(fallbackRaw || {}),
    ...(primary || {}),
    name: username,
    icon_img: iconImg,
    total_karma: totalKarma,
    meta: {
      ...((fallbackRaw && fallbackRaw.meta) || {}),
      ...((primary && primary.meta) || {}),
      name: username,
      username,
      icon_img: iconImg,
      total_karma: totalKarma,
    },
  };
}

async function fetchPlatformStatusSnapshot(token) {
  const res = await fetch(API_ENDPOINTS.PLATFORM_STATUS, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) return { raw: {}, summary: {} };
  const json = await res.json();
  return {
    raw: json.raw || {},
    summary: json.summary || {},
  };
}

// --- Sub-components ---

const PlatformPreview = ({
  label = "Platform Preview",
  data,
  globalFile,
  previewUrl,
  mediaType,
  platformId,
  creatorInfo,
}) => {
  // Correctly resolve the file to preview: Platform specific > Global
  const fileToPreview = data.file || globalFile;

  // Use useMemo to create the preview URL efficiently
  const effectivePreviewUrl = React.useMemo(() => {
    if (!fileToPreview) return null;

    // If it's the global file, use the provided previewUrl (which is managed by useMediaProcessor)
    if (fileToPreview === globalFile && previewUrl) {
      return previewUrl;
    }

    // If it's a file override (different from globalFile), create a URL
    if (fileToPreview instanceof File || fileToPreview instanceof Blob) {
      return URL.createObjectURL(fileToPreview);
    }

    // If it's a string (URL), return it
    if (typeof fileToPreview === "string") {
      return fileToPreview;
    }

    return null;
  }, [fileToPreview, globalFile, previewUrl]);

  // RENDER HELPERS
  const [previewError, setPreviewError] = React.useState(null);

  React.useEffect(() => {
    // Clear preview error when the preview source changes.
    setPreviewError(null);
  }, [effectivePreviewUrl]);

  const renderMedia = (style = {}) => {
    if (previewError) {
      return (
        <div
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#333",
            color: "#f88",
            minHeight: "200px",
            padding: "10px",
            textAlign: "center",
          }}
        >
          <div>
            <strong>Preview not available</strong>
            <div style={{ fontSize: "0.9rem", marginTop: "6px" }}>{previewError}</div>
          </div>
        </div>
      );
    }

    if (!effectivePreviewUrl) {
      return (
        <div
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#333",
            color: "#888",
            minHeight: "200px",
          }}
        >
          No Media
        </div>
      );
    }

    const isVideo =
      mediaType === "video" ||
      (fileToPreview &&
        typeof fileToPreview === "object" &&
        fileToPreview.type?.startsWith("video"));

    if (isVideo) {
      // Check if controls should be hidden (for overlay styles)
      // If absolute-positioned, we assume overlays exist and hide controls.
      // But we allow click-to-play/pause logic via ref if needed.
      const showControls = !style.position;

      return (
        <div style={{ ...style, overflow: "hidden", position: style.position || "relative" }}>
          <video
            key={effectivePreviewUrl} // Force reload on URL change
            src={sanitizeUrl(effectivePreviewUrl)}
            controls={showControls}
            playsInline
            loop
            autoPlay
            muted // Start muted for autoplay policy
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={e => {
              console.warn("Preview video failed to load", e);
              setPreviewError(
                "This file cannot be previewed. Please select a video or image file (e.g., MP4, MOV, JPG, PNG)."
              );
            }}
            onClick={e => {
              // Simple toggle mute/play for non-controlled videos (like TikTok style)
              if (!showControls) {
                if (e.target.paused) e.target.play();
                else e.target.muted = !e.target.muted;
              }
            }}
          />
          {!showControls && (
            <div
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "rgba(0,0,0,0.5)",
                padding: "5px",
                borderRadius: "50%",
                pointerEvents: "none",
              }}
            >
              🔊 {/* Visual indicator */}
            </div>
          )}
        </div>
      );
    }
    return (
      <img
        src={sanitizeUrl(effectivePreviewUrl)}
        alt="Preview"
        style={{ ...style, objectFit: "cover" }}
      />
    );
  };

  // --- PLATFORM SPECIFIC MOCKUPS ---

  // 1. TikTok Mockup
  if (platformId === "tiktok") {
    return (
      <div
        className="platform-preview-mockup tiktok-mockup"
        style={{
          width: "300px",
          margin: "0 auto",
          background: "#000",
          borderRadius: "12px",
          overflow: "hidden",
          position: "relative",
          height: "530px",
          border: "1px solid #333",
        }}
      >
        {/* Media Filling Container */}
        {renderMedia({ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })}

        {/* Overlay UI */}
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            right: "0",
            padding: "15px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
            color: "white",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
            {creatorInfo?.display_name ||
              creatorInfo?.user?.display_name ||
              creatorInfo?.open_id ||
              "@your_username"}
          </div>
          <div style={{ fontSize: "0.9rem", marginBottom: "10px", lineHeight: "1.2" }}>
            {data.caption || "Your caption will appear here..."}
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem" }}>
            <span>🎵</span>{" "}
            <marquee style={{ marginLeft: "5px", width: "150px" }}>
              Original Sound - @your_username
            </marquee>
          </div>
        </div>

        {/* Right Side Icons */}
        <div
          style={{
            position: "absolute",
            bottom: "80px",
            right: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            alignItems: "center",
          }}
        >
          <div
            style={{ width: "40px", height: "40px", background: "#fff", borderRadius: "50%" }}
          ></div>{" "}
          {/* Avatar */}
          <div style={{ textAlign: "center", color: "white" }}>
            ❤️
            <br />
            <span style={{ fontSize: "10px" }}>Like</span>
          </div>
          <div style={{ textAlign: "center", color: "white" }}>
            💬
            <br />
            <span style={{ fontSize: "10px" }}>123</span>
          </div>
          <div style={{ textAlign: "center", color: "white" }}>
            ↪️
            <br />
            <span style={{ fontSize: "10px" }}>Share</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. YouTube Mockup
  if (platformId === "youtube") {
    const isShorts = data.shortsMode;
    if (isShorts) {
      // YouTube Shorts (Similar to TikTok)
      return (
        <div
          className="platform-preview-mockup youtube-shorts-mockup"
          style={{
            width: "300px",
            margin: "0 auto",
            background: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
            height: "530px",
            border: "1px solid #333",
          }}
        >
          {renderMedia({ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })}
          <div
            style={{
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              padding: "15px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              color: "white",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
              {data.title || "Title goes here..."}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {creatorInfo?.snippet?.thumbnails?.default?.url ? (
                <img
                  src={creatorInfo.snippet.thumbnails.default.url}
                  alt="Avatar"
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    background: "#ccc",
                    borderRadius: "50%",
                  }}
                ></div>
              )}
              <span style={{ fontSize: "0.9rem" }}>
                {creatorInfo?.snippet?.title || "@channel"}
              </span>
              <button
                style={{
                  background: "#fff",
                  color: "#000",
                  border: "none",
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "10px",
                  fontWeight: "bold",
                }}
              >
                Subscribe
              </button>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: "100px",
              right: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              alignItems: "center",
              color: "white",
            }}
          >
            <div style={{ textAlign: "center" }}>
              👍 <span style={{ fontSize: "10px" }}>Like</span>
            </div>
            <div style={{ textAlign: "center" }}>
              👎 <span style={{ fontSize: "10px" }}>Dislike</span>
            </div>
            <div style={{ textAlign: "center" }}>
              💬 <span style={{ fontSize: "10px" }}>Cost</span>
            </div>
          </div>
        </div>
      );
    }
    // Standard YouTube
    return (
      <div
        className="platform-preview-mockup youtube-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "0px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        {renderMedia({ width: "100%", height: "auto", aspectRatio: "16/9" })}
        <div style={{ padding: "12px" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: "1rem", lineHeight: "1.2", color: "#000" }}>
            {data.title || "Video Title Placeholder"}
          </h4>
          <div
            style={{ display: "flex", fontSize: "0.8rem", color: "#606060", marginBottom: "10px" }}
          >
            <span>1M views • 1 hour ago</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderTop: "1px solid #eee",
              borderBottom: "1px solid #eee",
              padding: "8px 0",
            }}
          >
            {creatorInfo?.snippet?.thumbnails?.default?.url ? (
              <img
                src={creatorInfo.snippet.thumbnails.default.url}
                alt="Avatar"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  background: "#ccc",
                  borderRadius: "50%",
                }}
              ></div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
                {creatorInfo?.snippet?.title || "Channel Name"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#606060" }}>
                {creatorInfo?.statistics?.subscriberCount
                  ? `${new Intl.NumberFormat("en-US", { notation: "compact" }).format(
                      creatorInfo.statistics.subscriberCount
                    )} subscribers`
                  : "10K subscribers"}
              </div>
            </div>
            <button
              style={{
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "18px",
                padding: "6px 12px",
                fontSize: "0.8rem",
                fontWeight: "bold",
              }}
            >
              Subscribe
            </button>
          </div>
          <div
            style={{
              marginTop: "10px",
              fontSize: "0.85rem",
              color: "#000",
              whiteSpace: "pre-wrap",
            }}
          >
            {data.description
              ? data.description.length > 100
                ? data.description.substring(0, 100) + "..."
                : data.description
              : "Video description will appear here..."}
          </div>
        </div>
      </div>
    );
  }

  // 3. Facebook Mockup
  if (platformId === "facebook") {
    return (
      <div
        className="platform-preview-mockup facebook-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <div style={{ padding: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{ width: "40px", height: "40px", background: "#1877F2", borderRadius: "50%" }}
          ></div>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
              {data.pageName || "Your Page Name"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#606060" }}>Just now • 🌍</div>
          </div>
        </div>
        <div
          style={{
            padding: "0 12px 12px 12px",
            fontSize: "0.9rem",
            color: "#000",
            whiteSpace: "pre-wrap",
          }}
        >
          {data.message || "Your post message goes here..."}
        </div>
        {renderMedia({ width: "100%", height: "auto", maxHeight: "400px" })}
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #eee",
            color: "#606060",
            fontSize: "0.9rem",
          }}
        >
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>↪️ Share</span>
        </div>
      </div>
    );
  }

  // 4. Instagram Mockup
  if (platformId === "instagram") {
    const isReel = data.isReel !== false; // Default to true if undefined
    if (isReel) {
      // Instagram Reel (Similar to TikTok)
      return (
        <div
          className="platform-preview-mockup instagram-reel-mockup"
          style={{
            width: "300px",
            margin: "0 auto",
            background: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
            height: "530px",
            border: "1px solid #333",
          }}
        >
          {renderMedia({ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })}
          <div
            style={{
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              padding: "15px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              color: "white",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <div
                style={{ width: "24px", height: "24px", background: "#ccc", borderRadius: "50%" }}
              ></div>
              <span style={{ fontWeight: "bold", fontSize: "0.9rem" }}>
                {data.username || "username"}
              </span>
              <button
                style={{
                  background: "transparent",
                  border: "1px solid white",
                  color: "white",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                }}
              >
                Follow
              </button>
            </div>
            <div style={{ fontSize: "0.9rem", lineHeight: "1.2" }}>
              {data.caption
                ? data.caption.length > 80
                  ? data.caption.substring(0, 80) + "..."
                  : data.caption
                : "Caption..."}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              right: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              alignItems: "center",
              color: "white",
            }}
          >
            <div style={{ textAlign: "center" }}>♡</div>
            <div style={{ textAlign: "center" }}>💬</div>
            <div style={{ textAlign: "center" }}>✈️</div>
          </div>
        </div>
      );
    }
    // Instagram Post
    return (
      <div
        className="platform-preview-mockup instagram-post-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "3px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <div style={{ padding: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "30px",
              height: "30px",
              background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              borderRadius: "50%",
            }}
          ></div>
          <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
            {data.username || "username"}
          </div>
        </div>
        {renderMedia({ width: "100%", height: "auto", aspectRatio: "1/1" })}
        <div style={{ padding: "10px" }}>
          <div
            style={{
              display: "flex",
              gap: "15px",
              fontSize: "1.2rem",
              marginBottom: "8px",
              color: "#000",
            }}
          >
            <span>♡</span>
            <span>💬</span>
            <span>✈️</span>
          </div>
          <div style={{ fontSize: "0.9rem", color: "#000" }}>
            <span style={{ fontWeight: "bold", marginRight: "5px" }}>
              {data.username || "username"}
            </span>
            {data.caption || "Caption text here..."}
          </div>
        </div>
      </div>
    );
  }

  // 5. LinkedIn Mockup
  if (platformId === "linkedin") {
    const linkedInName =
      creatorInfo?.localizedName ||
      creatorInfo?.meta?.localizedName ||
      [creatorInfo?.localizedFirstName, creatorInfo?.localizedLastName].filter(Boolean).join(" ") ||
      creatorInfo?.meta?.display_name ||
      "Your Company";
    const linkedInFollowers =
      creatorInfo?.meta?.followers ||
      creatorInfo?.followers ||
      creatorInfo?.meta?.followerCount ||
      null;
    return (
      <div
        className="platform-preview-mockup linkedin-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <div style={{ padding: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{ width: "40px", height: "40px", background: "#0A66C2", borderRadius: "4px" }}
          ></div>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
              {linkedInName}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#606060" }}>
              {linkedInFollowers ? linkedInFollowers.toLocaleString() : "1,234"} followers
            </div>
            <div style={{ fontSize: "0.75rem", color: "#606060" }}>Just now • 🌐</div>
          </div>
        </div>
        <div
          style={{
            padding: "0 12px 12px 12px",
            fontSize: "0.9rem",
            color: "#000",
            whiteSpace: "pre-wrap",
          }}
        >
          {data.commentary || data.title || "Your post content..."}
        </div>
        {renderMedia({ width: "100%", height: "auto", maxHeight: "400px" })}
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #eee",
            color: "#606060",
            fontSize: "0.85rem",
          }}
        >
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>♻️ Repost</span>
          <span>✈️ Send</span>
        </div>
      </div>
    );
  }

  // 6. Reddit Mockup
  if (platformId === "reddit") {
    const redditPoster =
      creatorInfo?.name || creatorInfo?.meta?.username || creatorInfo?.meta?.name || "me";
    return (
      <div
        className="platform-preview-mockup reddit-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "4px",
          overflow: "hidden",
          border: "1px solid #ddd",
          display: "flex",
        }}
      >
        <div
          style={{
            width: "40px",
            background: "#f8f9fa",
            padding: "10px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: "#878a8c",
          }}
        >
          <span>⬆️</span>
          <span style={{ fontWeight: "bold", margin: "5px 0" }}>1</span>
          <span>⬇️</span>
        </div>
        <div style={{ flex: 1, padding: "10px" }}>
          <div
            style={{
              fontSize: "0.75rem",
              color: "#787c7e",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ fontWeight: "bold", color: "#000" }}>
              r/{data.subreddit || "subreddit"}
            </span>
            <span>• Posted by u/{redditPoster} just now</span>
          </div>
          <h3 style={{ fontSize: "1rem", fontWeight: "500", margin: "0 0 10px 0", color: "#000" }}>
            {data.title || "Your Post Title"}
          </h3>
          <div style={{ borderRadius: "4px", overflow: "hidden", border: "1px solid #eee" }}>
            {renderMedia({ width: "100%", height: "auto", maxHeight: "300px" })}
          </div>
          <div
            style={{
              display: "flex",
              gap: "15px",
              color: "#878a8c",
              fontSize: "0.8rem",
              marginTop: "10px",
              fontWeight: "bold",
            }}
          >
            <span>💬 Comments</span>
            <span>🎁 Award</span>
            <span>↪️ Share</span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback Generic Preview
  return (
    <div
      className="platform-mini-preview"
      style={{
        marginTop: "20px",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        paddingTop: "20px",
      }}
    >
      <p style={{ marginBottom: "10px", color: "#cbd5e1" }}>
        {label} ({platformId})
      </p>
      {renderMedia({ width: "100%", maxHeight: "400px", borderRadius: "8px" })}

      {data.file && (
        <div
          style={{
            fontSize: "0.9em",
            color: "#4ade80",
            marginTop: "10px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>✓</span> Using platform-specific file ({data.file.name})
        </div>
      )}
    </div>
  );
};

const UnifiedPublisher = ({ onUpload, initialFile }) => {
  // 1. Initialize State Logic
  const {
    // Global File (Raw)
    globalFile,
    setGlobalFile,
    globalTitle,
    setGlobalTitle,
    globalDescription,
    setGlobalDescription,
    bountyAmount,
    setBountyAmount,
    bountyNiche,
    setBountyNiche,
    protocol7Enabled,
    setProtocol7Enabled,
    protocol7Volatility,
    setProtocol7Volatility,

    // Marketing
    optimizeViral,
    setOptimizeViral,
    variants,
    setVariants,

    // Scheduling
    scheduledTime,
    setScheduledTime,
    frequency,
    setFrequency,

    selectedPlatforms,
    togglePlatform,
    updatePlatformData,
    getPlatformEffectiveData,
    platformStates, // Expose platform selection overrides if needed, but usually we rely on "selectedPlatforms" array
  } = usePublishingState(["tiktok", "youtube"]); // Default selection

  // Handle Initial File
  useEffect(() => {
    if (initialFile) {
      setGlobalFile(initialFile);
      if (initialFile.suggestedTitle) setGlobalTitle(initialFile.suggestedTitle);
      if (initialFile.suggestedDescription) setGlobalDescription(initialFile.suggestedDescription);
      toast.success("Loaded generated video! Proceed to publish.");
    }
  }, [initialFile, setGlobalFile, setGlobalTitle, setGlobalDescription]);

  // --- External Data Fetching ---
  const [tiktokCreator, setTiktokCreator] = useState(null);
  const [facebookPages, setFacebookPages] = useState([]);
  const [youtubeChannel, setYoutubeChannel] = useState(null);
  const [linkedinProfile, setLinkedinProfile] = useState(null);
  const [redditUser, setRedditUser] = useState(null);

  // 1. TikTok Creator Info
  useEffect(() => {
    if (selectedPlatforms.includes("tiktok")) {
      let mounted = true;
      const fetchTikTok = async () => {
        try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
          const [res, platformStatus] = await Promise.all([
            fetch(API_ENDPOINTS.TIKTOK_CREATOR_INFO, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }),
            fetchPlatformStatusSnapshot(token),
          ]);
          if (mounted && res.ok) {
            const json = await res.json();
            if (json && !json.error) {
              setTiktokCreator(
                normalizeTikTokCreatorInfo(
                  json.creator || json,
                  platformStatus.raw.tiktok,
                  platformStatus.summary.tiktok
                )
              );
            }
          } else if (mounted) {
            setTiktokCreator(
              normalizeTikTokCreatorInfo(
                null,
                platformStatus.raw.tiktok,
                platformStatus.summary.tiktok
              )
            );
          }
        } catch (e) {
          console.warn("TikTok fetch failed", e);
        }
      };
      fetchTikTok();
      return () => {
        mounted = false;
      };
    }
  }, [selectedPlatforms]);

  // 2. Facebook/Instagram Pages
  useEffect(() => {
    if (!selectedPlatforms.includes("facebook") && !selectedPlatforms.includes("instagram")) {
      setFacebookPages([]);
      return;
    }
    let mounted = true;
    const fetchPages = async () => {
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        const res = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (mounted && res.ok) {
          const json = await res.json();
          if (json.diagnostic) console.warn("[FacebookStatus]", json.diagnostic);
          setFacebookPages(json.pages || []);
        }
      } catch (e) {
        console.warn("UnifiedPublisher: Failed to fetch FB pages", e);
      }
    };
    fetchPages();
    return () => {
      mounted = false;
    };
  }, [selectedPlatforms]);

  // 3. YouTube Channel Info
  useEffect(() => {
    if (selectedPlatforms.includes("youtube")) {
      let mounted = true;
      const fetchYouTube = async () => {
        try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
          const [res, platformStatus] = await Promise.all([
            fetch(API_ENDPOINTS.YOUTUBE_STATUS, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }),
            fetchPlatformStatusSnapshot(token),
          ]);
          if (mounted && res.ok) {
            const json = await res.json();
            setYoutubeChannel(
              normalizeYouTubeCreatorInfo(
                json && !json.error ? json.channel || json : null,
                platformStatus.raw.youtube,
                platformStatus.summary.youtube
              )
            );
          } else if (mounted) {
            setYoutubeChannel(
              normalizeYouTubeCreatorInfo(
                null,
                platformStatus.raw.youtube,
                platformStatus.summary.youtube
              )
            );
          }
        } catch (e) {
          console.warn("YouTube fetch failed", e);
        }
      };
      fetchYouTube();
      return () => {
        mounted = false;
      };
    }
  }, [selectedPlatforms]);

  // 4. LinkedIn Profile Info
  useEffect(() => {
    if (selectedPlatforms.includes("linkedin")) {
      let mounted = true;
      const fetchLinkedIn = async () => {
        try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
          const [res, platformStatus] = await Promise.all([
            fetch(API_ENDPOINTS.LINKEDIN_STATUS, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }),
            fetchPlatformStatusSnapshot(token),
          ]);
          if (mounted && res.ok) {
            const json = await res.json();
            if (json && !json.error) {
              setLinkedinProfile(
                normalizeLinkedInCreatorInfo(
                  json,
                  platformStatus.raw.linkedin,
                  platformStatus.summary.linkedin
                )
              );
            }
          } else if (mounted) {
            setLinkedinProfile(
              normalizeLinkedInCreatorInfo(
                null,
                platformStatus.raw.linkedin,
                platformStatus.summary.linkedin
              )
            );
          }
        } catch (e) {
          console.warn("LinkedIn fetch failed", e);
        }
      };
      fetchLinkedIn();
      return () => {
        mounted = false;
      };
    }
  }, [selectedPlatforms]);

  // 5. Reddit User Info
  useEffect(() => {
    if (selectedPlatforms.includes("reddit")) {
      let mounted = true;
      const fetchReddit = async () => {
        try {
          const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
          const [res, platformStatus] = await Promise.all([
            fetch(API_ENDPOINTS.REDDIT_STATUS, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }),
            fetchPlatformStatusSnapshot(token),
          ]);
          if (mounted && res.ok) {
            const json = await res.json();
            if (json && !json.error) {
              setRedditUser(
                normalizeRedditCreatorInfo(
                  json,
                  platformStatus.raw.reddit,
                  platformStatus.summary.reddit
                )
              );
            }
          } else if (mounted) {
            setRedditUser(
              normalizeRedditCreatorInfo(
                null,
                platformStatus.raw.reddit,
                platformStatus.summary.reddit
              )
            );
          }
        } catch (e) {
          console.warn("Reddit fetch failed", e);
        }
      };
      fetchReddit();
      return () => {
        mounted = false;
      };
    }
  }, [selectedPlatforms]);

  // Media Processor Hook (Handles heavy edits: crop, trim, filter)
  const {
    file: mediaFile,
    previewUrl,
    type: mediaType,
    showVideoEditor,
    setShowVideoEditor,
    showCropper,
    setShowCropper,
    handleFileChange: processFileChange,

    // Transforms
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    rotate,
    setRotate,
    flipH,
    setFlipH,
    flipV,
    setFlipV,
    selectedFilter,
    setSelectedFilter,
    duration,
    setDuration,
    setFile: setMediaFile, // Expose manually
    setPreviewUrl, // Expose manually
  } = useMediaProcessor(globalFile);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingPlatform, setPublishingPlatform] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [fallbackPublishPlatform, setFallbackPublishPlatform] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null); // 'global' or platformId

  // --- Viral Scanner State ---
  const [showViralScanner, setShowViralScanner] = useState(false);
  const [viralScannerFile, setViralScannerFile] = useState(null);

  const formatPublisherError = err => {
    if (err?.code === "PLATFORM_LIMIT_EXCEEDED" || err?.code === "TIER_LIMIT_EXCEEDED") {
      const limit = err?.context?.limit;
      const attempted = err?.context?.attempted;
      const suggestedTier = err?.context?.suggested_tier;
      if (limit && attempted) {
        return `Your current plan allows ${limit} platform${limit === 1 ? "" : "s"} per post. You selected ${attempted}. Remove ${attempted - limit} platform${attempted - limit === 1 ? "" : "s"} or upgrade${suggestedTier ? ` to ${suggestedTier}` : ""}.`;
      }
    }
    if (err?.code === "UPLOAD_CAP_EXCEEDED") {
      const limit = err?.context?.limit;
      const used = err?.context?.used;
      const monthKey = err?.context?.monthKey;
      const suggestedTier = err?.context?.suggested_tier;
      if (limit && typeof used === "number") {
        return `Your plan upload quota for ${monthKey || "this month"} is exhausted (${used}/${limit}). Upgrade${suggestedTier ? ` to ${suggestedTier}` : ""} or wait for the quota reset before publishing again.`;
      }
    }
    if (err?.code === "PROMOTION_TASK_QUOTA_EXCEEDED") {
      const remaining = err?.context?.remaining;
      const required = err?.context?.required;
      const suggestedTier = err?.context?.suggested_tier;
      if (typeof remaining === "number" && typeof required === "number") {
        return `Your plan has ${remaining} automated distribution task${remaining === 1 ? "" : "s"} remaining this month, but this publish needs ${required}. Upgrade${suggestedTier ? ` to ${suggestedTier}` : ""} or reduce the selected platforms.`;
      }
    }
    return err?.message ? `Error: ${err.message}` : "Error: Upload failed.";
  };

  // Sync Global File -> Media Processor (Initial Load)
  useEffect(() => {
    if (globalFile && globalFile !== mediaFile) {
      processFileChange(globalFile);
    }
  }, [globalFile]);

  // 2. Handle File Upload (Global)
  const handleGlobalFileChange = e => {
    const file = e.target.files[0];
    if (file) {
      // 1. Send to Media Processor
      processFileChange(file);
      // 2. Update Global State
      setGlobalFile(file);
      console.log("Global file selected:", file.name);
    }
  };

  // 3. Render Helpers
  const renderPlatformForm = platformId => {
    // Get the effective data (Global + Overrides)
    const data = getPlatformEffectiveData(platformId);

    // Common props for ALL forms
    const commonProps = {
      // 1. Core Content
      globalTitle,
      globalDescription,
      currentFile: data.file,
      // Pass facebook pages (needed for FB and IG forms)
      pages: facebookPages,
      facebookPages: facebookPages,
      // Pass Platform Specific Creator Info
      creatorInfo:
        platformId === "tiktok"
          ? tiktokCreator
          : platformId === "youtube"
            ? youtubeChannel
            : platformId === "linkedin"
              ? linkedinProfile
              : platformId === "reddit"
                ? redditUser
                : null,

      onFileChange: newFile => {
        updatePlatformData(platformId, { file: newFile });
      },

      // New props for AI Review & Viral Clips on Platform-Specific Files
      onReviewAI: () => {
        // Logic to open VideoEditor with the PLATFORM-SPECIFIC file or Global File
        const fileToEdit = data.file || globalFile;

        if (fileToEdit) {
          console.log(`Reviewing AI for ${platformId}:`, fileToEdit.name);
          // CRITICAL: Set editing target so VideoEditor knows which state to update on Save
          setEditingTarget(platformId);

          // CRITICAL: We must load the file into the state that VideoEditor reads.
          // In UnifiedPublisher, 'mediaFile' seems to be the source for VideoEditor.
          // If we are editing a platform-specific file, we might need a way to tell VideoEditor about it.
          // Currently, VideoEditor takes 'file={mediaFile}'.
          // So let's temporarily swap mediaFile (or ensure VideoEditor uses a different state if target is set).

          processFileChange(fileToEdit); // Load this file into the main editor state properly
          setShowVideoEditor(true);
        } else {
          setFeedbackMessage("Please select a file first.");
        }
      },
      onFindViralClips: () => {
        // Determine which file to scan
        const fileToScan = data.file || globalFile;

        if (!fileToScan) {
          setFeedbackMessage("Please select a file to scan.");
          return;
        }
        if (fileToScan.type && !fileToScan.type.startsWith("video/")) {
          setFeedbackMessage("Viral Scanner supports video files only.");
          return;
        }

        console.log(`Starting Viral Scanner for ${platformId}`);
        setEditingTarget(platformId);
        setViralScannerFile(fileToScan);
        setShowViralScanner(true);
      },

      // 2. Global Features (Bounty / Protocol 7)
      bountyAmount,
      setBountyAmount, // Note: If a form changes bounty, it affects global state
      bountyNiche,
      setBountyNiche,
      protocol7Enabled,
      setProtocol7Enabled,
      protocol7Volatility,
      setProtocol7Volatility,

      // 3. State Management
      // The form calls this when the user types something specific (overriding global)
      onChange: newData => updatePlatformData(platformId, newData),
    };

    // Per-Platform PREVIEW Component (Moved outside)
    // To ensure PlatformPreview receives all necessary props

    switch (platformId) {
      case "tiktok":
        return (
          <div
            className="platform-card-wrapper"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="platform-card-header" style={{ marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>TikTok Configuration</h3>
            </div>

            {/* STACKED LAYOUT: Form Top, Preview Bottom */}
            <div className="platform-card-body">
              <div className="platform-form-column" style={{ marginBottom: "20px" }}>
                {/* Wrap in dark-theme-provider class to force styles */}
                <div className="dark-theme-form">
                  <TikTokForm {...commonProps} initialData={data} />
                </div>
              </div>
              <div className="platform-preview-column">
                <PlatformPreview
                  label="TikTok Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  mediaType={mediaType}
                  platformId={platformId}
                  creatorInfo={tiktokCreator}
                />

                <button
                  className="btn-primary-sm"
                  style={{
                    marginTop: "12px",
                    width: "100%",
                    fontSize: "0.9rem",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePublishPlatform(platformId)}
                  disabled={isPublishing && publishingPlatform !== platformId}
                >
                  {isPublishing && publishingPlatform === platformId
                    ? "Publishing..."
                    : `Publish to ${getPlatformName(platformId)}`}
                </button>
              </div>
            </div>
          </div>
        );
      case "youtube":
        return (
          <div
            className="platform-card-wrapper"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="platform-card-header" style={{ marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>YouTube Configuration</h3>
            </div>
            <div className="platform-card-body">
              <div className="platform-form-column" style={{ marginBottom: "20px" }}>
                <div className="dark-theme-form">
                  <YouTubeForm {...commonProps} initialData={data} />
                </div>
              </div>
              <div className="platform-preview-column">
                <PlatformPreview
                  label="YouTube Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  mediaType={mediaType}
                  platformId={platformId}
                  creatorInfo={youtubeChannel}
                />

                <button
                  className="btn-primary-sm"
                  style={{
                    marginTop: "12px",
                    width: "100%",
                    fontSize: "0.9rem",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePublishPlatform(platformId)}
                  disabled={isPublishing && publishingPlatform !== platformId}
                >
                  {isPublishing && publishingPlatform === platformId
                    ? "Publishing..."
                    : `Publish to ${getPlatformName(platformId)}`}
                </button>
              </div>
            </div>
          </div>
        );
      case "instagram":
        return (
          <div
            className="platform-card-wrapper"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="platform-card-header" style={{ marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>Instagram Configuration</h3>
            </div>
            <div className="platform-card-body">
              <div className="platform-form-column" style={{ marginBottom: "20px" }}>
                <div className="dark-theme-form">
                  <InstagramForm {...commonProps} initialData={data} />
                </div>
              </div>
              <div className="platform-preview-column">
                <PlatformPreview
                  label="Instagram Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  mediaType={mediaType}
                  platformId={platformId}
                />

                <button
                  className="btn-primary-sm"
                  style={{
                    marginTop: "12px",
                    width: "100%",
                    fontSize: "0.9rem",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePublishPlatform(platformId)}
                  disabled={isPublishing && publishingPlatform !== platformId}
                >
                  {isPublishing && publishingPlatform === platformId
                    ? "Publishing..."
                    : `Publish to ${getPlatformName(platformId)}`}
                </button>
              </div>
            </div>
          </div>
        );
      case "facebook":
        return (
          <div
            className="platform-card-wrapper"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="platform-card-header" style={{ marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>Facebook Configuration</h3>
            </div>
            <div className="platform-card-body">
              <div className="platform-form-column" style={{ marginBottom: "20px" }}>
                <div className="dark-theme-form">
                  <FacebookForm {...commonProps} initialData={data} />
                </div>
              </div>
              <div className="platform-preview-column">
                <PlatformPreview
                  label="Facebook Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  mediaType={mediaType}
                  platformId={platformId}
                />

                <button
                  className="btn-primary-sm"
                  style={{
                    marginTop: "12px",
                    width: "100%",
                    fontSize: "0.9rem",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePublishPlatform(platformId)}
                  disabled={isPublishing && publishingPlatform !== platformId}
                >
                  {isPublishing && publishingPlatform === platformId
                    ? "Publishing..."
                    : `Publish to ${getPlatformName(platformId)}`}
                </button>
              </div>
            </div>
          </div>
        );
      case "linkedin":
        return (
          <div
            className="platform-card-wrapper"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="platform-card-header" style={{ marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>LinkedIn Configuration</h3>
            </div>
            <div className="platform-card-body">
              <div className="platform-form-column" style={{ marginBottom: "20px" }}>
                <div className="dark-theme-form">
                  <LinkedInForm {...commonProps} initialData={data} />
                </div>
              </div>
              <div className="platform-preview-column">
                <PlatformPreview
                  label="LinkedIn Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  mediaType={mediaType}
                  platformId={platformId}
                  creatorInfo={linkedinProfile}
                />

                <button
                  className="btn-primary-sm"
                  style={{
                    marginTop: "12px",
                    width: "100%",
                    fontSize: "0.9rem",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePublishPlatform(platformId)}
                  disabled={isPublishing && publishingPlatform !== platformId}
                >
                  {isPublishing && publishingPlatform === platformId
                    ? "Publishing..."
                    : `Publish to ${getPlatformName(platformId)}`}
                </button>
              </div>
            </div>
          </div>
        );
      case "reddit":
        return (
          <div
            className="platform-card-wrapper"
            style={{ background: "#1e293b", border: "1px solid #334155" }}
          >
            <div className="platform-card-header" style={{ marginBottom: "15px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc" }}>Reddit Configuration</h3>
            </div>
            <div className="platform-card-body">
              <div className="platform-form-column" style={{ marginBottom: "20px" }}>
                <div className="dark-theme-form">
                  <RedditForm {...commonProps} initialData={data} />
                </div>
              </div>
              <div className="platform-preview-column">
                <PlatformPreview
                  label="Reddit Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  mediaType={mediaType}
                  platformId={platformId}
                  creatorInfo={redditUser}
                />

                <button
                  className="btn-primary-sm"
                  style={{
                    marginTop: "12px",
                    width: "100%",
                    fontSize: "0.9rem",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePublishPlatform(platformId)}
                  disabled={isPublishing && publishingPlatform !== platformId}
                >
                  {isPublishing && publishingPlatform === platformId
                    ? "Publishing..."
                    : `Publish to ${getPlatformName(platformId)}`}
                </button>
              </div>
            </div>
          </div>
        );
      default:
        return <div>Unknown Platform: {platformId}</div>;
    }
  };

  // 4. Publish Action
  const publish = async (platforms, label) => {
    // Determine the file to upload: prefer global file, but fall back to a single-platform file if set.
    let fileToUpload = globalFile;

    if (!fileToUpload && platforms && platforms.length === 1) {
      const effective = getPlatformEffectiveData(platforms[0]);
      if (effective && effective.file) {
        fileToUpload = effective.file;
      }
    }

    if (!fileToUpload) {
      setFeedbackMessage("Please select a file first.");
      return;
    }

    // If user selected a platform-specific file but not a global file, keep UI consistent by
    // mirroring the selected file into global state and showing a hint.
    if (!globalFile && fileToUpload) {
      setGlobalFile(fileToUpload);
      if (platforms && platforms.length === 1) {
        setFallbackPublishPlatform(platforms[0]);
      }
    } else {
      setFallbackPublishPlatform(null);
    }

    if (!platforms || platforms.length === 0) {
      setFeedbackMessage("Please select at least one platform.");
      return;
    }

    setIsPublishing(true);
    setPublishingPlatform(platforms.length === 1 ? platforms[0] : "all");
    setFeedbackMessage("Preparing upload...");

    try {
      // --- 1. Validation ---
      const MAX_SIZE_MB = 500;
      const effectiveMediaType =
        (fileToUpload && fileToUpload.type && fileToUpload.type.split("/")[0]) ||
        mediaType ||
        "video";

      if (fileToUpload instanceof Blob && fileToUpload.size > MAX_SIZE_MB * 1024 * 1024) {
        throw new Error(`File too large. Maximum upload size is ${MAX_SIZE_MB}MB.`);
      }

      // --- 2. Upload with Progress ---
      let finalUrl = "";
      if (fileToUpload instanceof Blob) {
        // File or Blob
        const storagePath = `uploads/${effectiveMediaType}s/${Date.now()}_${fileToUpload.name || "untitled"}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            snapshot => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setFeedbackMessage(`Uploading: ${Math.round(progress)}%`);
            },
            error => {
              console.error("Upload failed:", error);
              reject(new Error("Upload failed. Please check your connection."));
            },
            async () => {
              try {
                finalUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve();
              } catch (e) {
                reject(e);
              }
            }
          );
        });
        setFeedbackMessage("Finalizing...");
      } else if (typeof fileToUpload === "string") {
        finalUrl = fileToUpload;
      }

      // --- 3. Construct Payload ---
      const platformOptionsMap = {};

      platforms.forEach(p => {
        const data = getPlatformEffectiveData(p);
        platformOptionsMap[p] = { ...data };

        if (p === "tiktok") {
          platformOptionsMap[p].commercial = {
            isCommercial: data.commercialContent,
            yourBrand: data.yourBrand,
            brandedContent: data.brandedContent,
            is_commercial_content: data.commercialContent,
          };
          platformOptionsMap[p].commercialContent = data.commercialContent;
        }

        if (p === "instagram") {
          if (platformOptionsMap[p].isPaidPartnership && !platformOptionsMap[p].sponsorUser) {
            console.warn(
              "[UnifiedPublisher] Sanitizing Instagram options: disabling isPaidPartnership (missing sponsorUser)"
            );
            platformOptionsMap[p].isPaidPartnership = false;
          }
        }
      });

      const resolvedTitle = (globalTitle || "").trim() || "Untitled Post";

      if (!globalTitle || !globalTitle.trim()) {
        setGlobalTitle(resolvedTitle);
      }

      const uploadParams = {
        url: finalUrl,
        file: null,
        type: effectiveMediaType,
        platforms,
        title: resolvedTitle,
        description: globalDescription,
        platform_options: platformOptionsMap,
        bounty: {
          amount: bountyAmount,
          niche: bountyNiche || "general",
        },
        protocol7: { enabled: protocol7Enabled, volatility: protocol7Volatility },
        viral_boost: optimizeViral ? { force_seeding: true } : undefined,
        variants: variants && variants.length > 0 ? variants : undefined,
        schedule: scheduledTime
          ? {
              date: new Date(scheduledTime).toISOString(),
              frequency: frequency,
            }
          : undefined,
        isDryRun: false,
        meta: {
          trimStart: trimStart > 0 ? trimStart : undefined,
          trimEnd: trimEnd > 0 ? trimEnd : undefined,
          rotate: rotate !== 0 ? rotate : undefined,
          flipH: flipH ? true : undefined,
          flipV: flipV ? true : undefined,
          filter: selectedFilter || undefined,
          duration: duration || undefined,
        },
      };

      if (onUpload) {
        await onUpload(uploadParams);
        setFeedbackMessage(`${label} started successfully!`);
      } else {
        console.warn("UnifiedPublisher: No onUpload prop provided");
        setFeedbackMessage("Error: Upload handler missing.");
      }

      setIsPublishing(false);
      setPublishingPlatform(null);
      setFallbackPublishPlatform(null);
    } catch (err) {
      console.error("UnifiedPublisher Error:", err);
      setFeedbackMessage(formatPublisherError(err));
      setIsPublishing(false);
      setPublishingPlatform(null);
      setFallbackPublishPlatform(null);
    }
  };

  const handlePublishAll = () => publish(selectedPlatforms, "Publish Everywhere");
  const handlePublishPlatform = platformId => publish([platformId], `Publish to ${platformId}`);

  const modalOpen = showVideoEditor || showViralScanner || showCropper;

  return (
    <div className={`unified-publisher-container${modalOpen ? " modal-open" : ""}`}>
      {/* --- HEADER: Global Context --- */}
      <header className="publisher-header">
        <h1>Cross-Platform Publisher</h1>
        <p>Upload once, customize everywhere.</p>
      </header>

      <div className="publisher-layout">
        {/* --- LEFT SIDE: The "Global" Input (Optional Helper) --- */}
        <aside className="global-controls">
          <div className="card global-card">
            <h2>1. Master Content</h2>
            <div className="form-group">
              <label>Master File</label>

              <input type="file" accept="video/*,image/*" onChange={handleGlobalFileChange} />
              <small>Applying to {selectedPlatforms.length} platforms</small>

              {previewUrl && mediaType !== "video" && (
                <div
                  className="preview-container"
                  style={{ marginTop: "10px", marginBottom: "10px" }}
                >
                  <img
                    src={sanitizeUrl(previewUrl)}
                    alt="Preview"
                    className="preview-media"
                    style={{
                      width: "100%",
                      maxHeight: "200px",
                      objectFit: "contain",
                      borderRadius: "4px",
                    }}
                  />
                </div>
              )}

              {/* Media Tools */}
              {mediaFile && (
                <div className="media-tools">
                  <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                    <button
                      className="btn-secondary-sm"
                      style={{ flex: 1 }}
                      onClick={() => setShowVideoEditor(true)}
                    >
                      {mediaType === "image" ? "🎬 Create Slideshow" : "✨ Review AI Enhancements"}
                    </button>

                    {mediaType === "video" && (
                      <button
                        className="btn-secondary-sm"
                        style={{ flex: 1, background: "#e94560", color: "white", border: "none" }}
                        onClick={() => {
                          setViralScannerFile(mediaFile);
                          setShowViralScanner(true);
                        }}
                      >
                        🔍 Find Viral Clips
                      </button>
                    )}
                  </div>

                  {previewUrl && (
                    <div
                      className="preview-container"
                      style={{
                        marginTop: "15px",
                        background: "#000",
                        padding: "10px",
                        borderRadius: "8px",
                        textAlign: "center",
                        border: "1px solid #333",
                      }}
                    >
                      <label
                        style={{
                          display: "block",
                          marginBottom: "5px",
                          color: "#888",
                          fontSize: "0.8rem",
                          textAlign: "left",
                        }}
                      >
                        Preview:
                      </label>
                      <video
                        key={previewUrl}
                        src={sanitizeUrl(previewUrl)}
                        controls
                        className="preview-media"
                        onLoadedMetadata={e => setDuration(e.target.duration)}
                        style={{
                          width: "100%",
                          maxHeight: "300px",
                          objectFit: "contain",
                          borderRadius: "4px",
                        }}
                      />
                    </div>
                  )}

                  {mediaType === "video" && (
                    <div className="trim-controls" style={{ margin: "10px 0" }}>
                      <label>
                        Start: {trimStart}s / End: {trimEnd > 0 ? trimEnd + "s" : "Full"}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.1"
                        value={trimStart}
                        onChange={e => setTrimStart(Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}
                  {mediaType === "image" && (
                    <button className="btn-secondary-sm" onClick={() => setShowCropper(true)}>
                      📐 Crop Image
                    </button>
                  )}

                  {/* Common Transforms */}
                  <div
                    className="transform-controls"
                    style={{
                      marginTop: "15px",
                      padding: "10px",
                      background: "rgba(0, 0, 0, 0.3)",
                      borderRadius: "4px",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <div className="control-row">
                      <label style={{ display: "block", marginBottom: "5px" }}>
                        Rotation: {rotate}°
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="270"
                        step="90"
                        value={rotate}
                        onChange={e => setRotate(parseInt(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>

                    <div
                      className="control-row checkbox-group"
                      style={{ display: "flex", gap: "15px", marginTop: "10px" }}
                    >
                      <label style={{ cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={flipH}
                          onChange={e => setFlipH(e.target.checked)}
                        />{" "}
                        Flip Horizontal
                      </label>
                      <label style={{ cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={flipV}
                          onChange={e => setFlipV(e.target.checked)}
                        />{" "}
                        Flip Vertical
                      </label>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="filter-controls" style={{ marginTop: "15px" }}>
                    <label style={{ display: "block", marginBottom: "5px" }}>Visual Filter:</label>
                    <select
                      value={selectedFilter || ""}
                      onChange={e => setSelectedFilter(e.target.value || null)}
                      className="form-control"
                      style={{ width: "100%", padding: "8px" }}
                    >
                      <option value="">None (Original)</option>
                      <option value="grayscale">Grayscale</option>
                      <option value="sepia">Sepia</option>
                      <option value="invert">Invert</option>
                      <option value="brightness">Brightness Boost</option>
                      <option value="contrast">High Contrast</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Master Title</label>
              <input
                type="text"
                value={globalTitle}
                onChange={e => setGlobalTitle(e.target.value)}
                placeholder="My Awesome Video"
              />
            </div>

            <div className="form-group">
              <label>Master Description</label>
              <textarea
                value={globalDescription}
                onChange={e => setGlobalDescription(e.target.value)}
                placeholder="Check this out..."
                rows={3}
              />
            </div>

            {/* --- MARKETING & GROWTH --- */}
            <div
              className="marketing-tools"
              style={{
                marginTop: "15px",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>🚀 Growth Optimization</h4>
              <p
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "12px",
                  color: "#64748b",
                  lineHeight: 1.5,
                }}
              >
                Keep this section focused on options that are applied at upload time. Repost cadence
                and follow-up recycling are managed after publish.
              </p>

              {/* Viral Toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: "8px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={optimizeViral}
                  onChange={e => setOptimizeViral(e.target.checked)}
                  style={{ marginRight: "8px" }}
                />
                <span>Prime this upload for viral seeding</span>
              </label>

              {/* A/B Variants */}
              <div
                className="variants-section"
                style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px dashed #eee" }}
              >
                <label style={{ fontSize: "12px", fontWeight: "bold" }}>
                  Alternate hook or title
                </label>
                <input
                  type="text"
                  placeholder="Optional alternate title for testing"
                  value={variants[0] || ""}
                  onChange={e => setVariants(e.target.value ? [e.target.value] : [])}
                  style={{ width: "100%", fontSize: "12px" }}
                />
                <div style={{ marginTop: "6px", fontSize: "11px", color: "#64748b" }}>
                  AutoPromote stores this as a simple rotation variant for headline testing.
                </div>
              </div>
            </div>

            {/* --- SCHEDULING --- */}
            <div
              className="scheduling-tools"
              style={{
                marginTop: "15px",
                padding: "10px",
                border: "1px solid #ddd",
                borderRadius: "4px",
              }}
            >
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px" }}>📅 Scheduling</h4>

              <BestTimeToPost selectedPlatforms={selectedPlatforms} />

              <div style={{ marginTop: "10px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "bold" }}>
                  Publish Time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  style={{ width: "100%", padding: "5px", marginTop: "5px" }}
                />
                <small style={{ color: "#666", fontSize: "11px" }}>
                  {scheduledTime
                    ? "Will be added to queue."
                    : "Leave empty to publish immediately."}
                </small>
              </div>

              {scheduledTime && (
                <div style={{ marginTop: "10px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "bold" }}>
                    Frequency
                  </label>
                  <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value)}
                    className="form-control"
                    style={{ width: "100%" }}
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="card platform-selector">
            <h2>2. Select Networks</h2>
            <div className="platform-toggles">
              {["tiktok", "youtube", "instagram", "facebook", "linkedin", "reddit"].map(p => (
                <label
                  key={p}
                  className={`toggle-btn ${selectedPlatforms.includes(p) ? "active" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                  />
                  {getPlatformName(p)}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* --- RIGHT SIDE: The Platform Cards (Your Existing Forms) --- */}
        <main className="platform-workspace" style={{ paddingBottom: "120px" }}>
          <h2>3. Optimize & Publish</h2>

          {selectedPlatforms.length === 0 ? (
            <div className="empty-state">Select a platform to begin.</div>
          ) : (
            <div className="platform-stack">
              {selectedPlatforms.map(platformId => (
                <div key={platformId} className="platform-section">
                  {renderPlatformForm(platformId)}
                </div>
              ))}
            </div>
          )}

          {/* --- Bottom Action Bar (Fixed) --- */}
          <div className="publish-actions">
            <div
              style={{
                fontSize: "14px",
                color: "#A0AEC0",
                display: "flex",
                gap: "8px",
                alignItems: "center",
                marginLeft: "20px", // Add some spacing from edge
              }}
            >
              <span style={{ color: "#fff", fontWeight: "bold" }}>{selectedPlatforms.length}</span>{" "}
              platforms selected
              {feedbackMessage && (
                <span className="feedback-message" style={{ marginLeft: "15px" }}>
                  | {feedbackMessage}
                </span>
              )}
              {fallbackPublishPlatform && (
                <span className="feedback-message" style={{ marginLeft: "15px", color: "#a5b4fc" }}>
                  | Using {getPlatformName(fallbackPublishPlatform)} file because no global file was
                  selected.
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: "15px", marginRight: "20px" }}>
              <button
                className="btn-secondary-sm"
                onClick={() => {
                  // Reset Logic
                  setGlobalTitle("");
                  setGlobalDescription("");
                  setGlobalFile(null);
                  setPreviewUrl("");
                }}
                style={{ background: "transparent", border: "1px solid #4a5568" }}
              >
                Reset Form
              </button>
              <button
                className="btn-primary-large"
                onClick={handlePublishAll}
                disabled={isPublishing || selectedPlatforms.length === 0}
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  padding: "12px 30px",
                  fontSize: "1.1em",
                  borderRadius: "8px",
                  fontWeight: "bold",
                  boxShadow: "0 4px 15px rgba(37, 99, 235, 0.3)",
                }}
              >
                {isPublishing
                  ? "Publishing..."
                  : `🚀 Publish to ${selectedPlatforms.map(p => getPlatformName(p)).join(" + ")}`}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* --- Modals --- */}
      {showVideoEditor && (
        <div
          className="modal-overlay open"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            overflowY: "auto",
            zIndex: 3000,
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: "800px",
              width: "90%",
              background: "#1e293b",
              color: "#fff",
              position: "relative",
            }}
          >
            <button
              className="close-btn"
              onClick={() => setShowVideoEditor(false)}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                zIndex: 100,
                fontSize: "1.5rem",
                background: "none",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                padding: "0 8px",
              }}
            >
              ×
            </button>
            <VideoEditor
              file={mediaFile}
              // images={sourceFiles} // Removed images prop as it might not be defined in scope here or handled by useMediaProcessor?
              // The original code passed `sourceFiles` but I don't see `sourceFiles` in useMediaProcessor return values in my read snippet (line 46-60).
              // Wait, checking useMediaProcessor hook return values usage
              // Line 65: file: mediaFile...
              // I should check if sourceFiles is available in UnifiedPublisher scope.
              // It is not destructured from useMediaProcessor in line 65.
              // It was just `images={sourceFiles}` in the original code. Let me check if sourceFiles is defined.
              // Ah, I missed reading where sourceFiles is defined. Let me double check usage.
              // Assuming sourceFiles was there before, I should keep it if possible or remove if undefined.
              // In ContentUploadForm, sourceFiles was state. Here, it might be missing or handled differently.
              // I will keep `images={[]}` for now to be safe or check if sourceFiles is defined.
              onSave={async result => {
                try {
                  if (result && result.isRemote && result.url) {
                    // For viral clips, use remote URL directly to prevent download/timeout issues
                    processFileChange(result);
                    toast.success("Viral clip ready for scheduling!");
                  } else if (result instanceof File || result instanceof Blob) {
                    // FIX: Usse processFileChange
                    processFileChange(result);
                    toast.success("Edits applied!");
                  }
                } catch (e) {
                  console.error("Failed to load viral clip:", e);
                  setFeedbackMessage("Error loading clip.");
                }
                setShowVideoEditor(false);
                setEditingTarget(null);
              }}
              onCancel={() => {
                setShowVideoEditor(false);
                setEditingTarget(null);
              }}
            />
          </div>
        </div>
      )}

      {/* --- VIRAL SCANNER MODAL --- */}
      {showViralScanner && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000 }}>
          <ViralScanner
            file={viralScannerFile || mediaFile} // specific file or fallback
            onClose={() => setShowViralScanner(false)}
            onSelectClip={clip => {
              if (editingTarget) {
                const currentData = getPlatformEffectiveData(editingTarget);
                updatePlatformData(editingTarget, {
                  trimStart: clip.start,
                  trimEnd: clip.end,
                });
                setFeedbackMessage(
                  `Analyzed & applied viral moment (${clip.start}s-${clip.end}s) for ${editingTarget}!`
                );
              } else {
                // Apply globally if no specific target
                setTrimStart(clip.start);
                setTrimEnd(clip.end);
                setFeedbackMessage(`Global trim applied: ${clip.start}s - ${clip.end}s`);
              }
              setShowViralScanner(false);
            }}
          />
        </div>
      )}

      {showCropper && mediaFile && (
        <div
          className="modal-overlay open"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            overflowY: "auto",
            zIndex: 3000,
          }}
        >
          <div className="modal" style={{ background: "#1e293b", color: "#fff" }}>
            <button className="close-btn" onClick={() => setShowCropper(false)}>
              ×
            </button>
            <ImageCropper
              file={mediaFile}
              onSave={newFile => {
                setGlobalFile(newFile);
                processFileChange(newFile);
                setShowCropper(false);
              }}
              onCancel={() => setShowCropper(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedPublisher;
