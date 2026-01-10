/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* eslint-env browser, es6 */
import React, { useState, useRef, useEffect } from "react";
import "./ContentUploadForm.css";
import { storage, auth } from "./firebaseClient";
import { API_ENDPOINTS } from "./config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import SpotifyTrackSearch from "./components/SpotifyTrackSearch";
import ImageCropper from "./components/ImageCropper";
import AudioWaveformTrimmer from "./components/AudioWaveformTrimmer";
import EmojiPicker from "./components/EmojiPicker";
import FilterEffects from "./components/FilterEffects";
import HashtagSuggestions from "./components/HashtagSuggestions";
import DraftManager from "./components/DraftManager";
import ProgressIndicator from "./components/ProgressIndicator";
import BestTimeToPost from "./components/BestTimeToPost";
import ExplainButton from "./components/ExplainButton";
import PreviewEditModal from "./components/PreviewEditModal";
import ConfirmPublishModal from "./components/ConfirmPublishModal";
import PlatformSettingsOverride from "./components/PlatformSettingsOverride";

// Default inline thumbnail (avoids external 404s when thumbnail is missing)
const DEFAULT_THUMBNAIL = (function () {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="16">Preview Thumbnail</text></svg>';
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
})();

// Security: Comprehensive sanitization to prevent XSS attacks
// Uses direct string replacement - no DOM manipulation
const sanitizeInput = input => {
  if (!input) return "";

  // Convert to string and escape all HTML special characters using direct replacement
  let escaped = String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");

  // Additional protection: block dangerous patterns
  escaped = escaped
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .replace(/vbscript:/gi, "")
    .replace(/file:/gi, "")
    .replace(/on\w+\s*=/gi, "");

  return escaped;
};

// Security: Sanitize CSS values to prevent CSS injection
// Only allows specific CSS filter functions with numeric values
const sanitizeCSS = css => {
  if (!css) return "";

  const str = String(css).trim();

  // Block any CSS that could be dangerous
  if (/url\s*\(/i.test(str) || /expression\s*\(/i.test(str) || /@import/i.test(str)) {
    return "";
  }

  // Whitelist: only allow safe CSS filter functions
  const allowedFunctions = [
    "blur",
    "brightness",
    "contrast",
    "grayscale",
    "hue-rotate",
    "invert",
    "opacity",
    "saturate",
    "sepia",
  ];

  // Split by spaces and validate each filter function
  const parts = str.split(/\s+/);
  const safeParts = [];

  for (const part of parts) {
    // Check if part matches: functionName(number + optional unit)
    // Use more restrictive regex that requires closing parenthesis
    const match = part.match(/^([a-z-]+)\(([\d.]+)(px|deg|%)?\)$/i);
    if (match && allowedFunctions.includes(match[1].toLowerCase())) {
      safeParts.push(part);
    }
  }

  return safeParts.join(" ");
};

// Security: Escape HTML to prevent XSS attacks
const escapeHtml = text => {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

function ContentUploadForm({
  onUpload,
  platformMetadata: extPlatformMetadata,
  platformOptions: extPlatformOptions,
  setPlatformOption: extSetPlatformOption,
  selectedPlatforms: extSelectedPlatforms,
  setSelectedPlatforms: extSetSelectedPlatforms,
  spotifySelectedTracks: extSpotifySelectedTracks,
  setSpotifySelectedTracks: extSetSpotifySelectedTracks,
  // When true, render only the platform cards (no global form elements)
  platformCardsOnly = false,
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("video");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [template, setTemplate] = useState("none");
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropMeta, setCropMeta] = useState(null);
  const [spotifyTracks, setSpotifyTracks] = useState(extSpotifySelectedTracks || []);
  const [overlayText, setOverlayText] = useState("");
  const [overlayPosition, setOverlayPosition] = useState("bottom");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTarget, setEmojiTarget] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [hashtags, setHashtags] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [textStyles, setTextStyles] = useState({
    fontSize: 16,
    color: "#ffffff",
    fontWeight: "bold",
    shadow: true,
  });

  // Platform Overrides State
  const [youtubeSettings, setYoutubeSettings] = useState({
    privacy: "public",
    typeOverride: "auto",
    tags: "",
  });
  const [instagramSettings, setInstagramSettings] = useState({ shareToFeed: true, location: "" });
  const [twitterSettings, setTwitterSettings] = useState({ threadMode: false });
  const [linkedinSettings, setLinkedinSettings] = useState({ postType: "post" });
  const [snapchatSettings, setSnapchatSettings] = useState({ placement: "spotlight" });
  const [redditSettings, setRedditSettings] = useState({ flair: "", nsfw: false });
  const [pinterestSettings, setPinterestSettings] = useState({ linkUrl: "" });
  const [discordSettings, setDiscordSettings] = useState({ notify: "none" });
  const [telegramSettings, setTelegramSettings] = useState({ silent: false });
  const [spotifySettings, setSpotifySettings] = useState({});

  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // TikTok-specific UX state (Direct Post compliance)
  const [tiktokCreatorInfo, setTiktokCreatorInfo] = useState(null);
  const [tiktokPrivacy, setTiktokPrivacy] = useState("");
  const [tiktokInteractions, setTiktokInteractions] = useState({
    comments: false,
    duet: false,
    stitch: false,
  });
  // Track which interactions should be disabled (based on creator_info)
  const [tiktokInteractionDisabled, setTiktokInteractionDisabled] = useState({
    comments: false,
    duet: false,
    stitch: false,
  });
  const [tiktokCommercial, setTiktokCommercial] = useState({
    isCommercial: false,
    yourBrand: false,
    brandedContent: false,
  });
  const [tiktokAIGenerated, setTiktokAIGenerated] = useState(false);
  const [tiktokConsentChecked, setTiktokConsentChecked] = useState(false);
  const [tiktokDisclosure, setTiktokDisclosure] = useState(false);
  const uploadLockRef = useRef(false);
  const [error, setError] = useState("");

  // Preview / Confirm modal state
  const [showPreviewEditModal, setShowPreviewEditModal] = useState(false);
  // Keep track of created object URLs (so we can revoke them on unmount)
  const objectUrlsRef = React.useRef(new Set());

  useEffect(() => {
    return () => {
      // Revoke any created object URLs when component unmounts
      try {
        objectUrlsRef.current.forEach(url => {
          try {
            URL.revokeObjectURL(url);
          } catch (_) {}
        });
      } catch (_) {}
    };
  }, []);
  const [previewToEdit, setPreviewToEdit] = useState(null);
  const [showConfirmPublishModal, setShowConfirmPublishModal] = useState(false);
  const [confirmTargetPlatform, setConfirmTargetPlatform] = useState(null);

  const [previews, setPreviews] = useState([]);
  const [qualityScore, setQualityScore] = useState(null);
  const [qualityFeedback, setQualityFeedback] = useState([]);
  const [enhancedSuggestions, setEnhancedSuggestions] = useState(null);
  const [privacyAutoSwitched, setPrivacyAutoSwitched] = useState(false);
  const [tiktokProcessingNotice, setTiktokProcessingNotice] = useState("");
  const [tiktokPollStatus, setTiktokPollStatus] = useState(null);
  const titleInputRef = useRef(null);
  const descInputRef = useRef(null);

  useEffect(() => {
    // Cleanup URL.createObjectURL to prevent mem leaks
    return () => {
      if (previewUrl) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (e) {}
      }
    };
  }, [previewUrl]);
  // If branded content is selected, prevent 'SELF_ONLY' privacy by auto-switching
  useEffect(() => {
    if (tiktokCommercial && tiktokCommercial.brandedContent) {
      if (tiktokPrivacy === "SELF_ONLY") {
        setTiktokPrivacy("EVERYONE");
        setPrivacyAutoSwitched(true);
        setTimeout(() => setPrivacyAutoSwitched(false), 8000);
      }
    }
  }, [tiktokCommercial && tiktokCommercial.brandedContent, tiktokPrivacy]);

  const getTikTokDeclaration = () => {
    const isCommercial = tiktokCommercial && tiktokCommercial.isCommercial;
    const branded = tiktokCommercial && tiktokCommercial.brandedContent;
    const yourBrand = tiktokCommercial && tiktokCommercial.yourBrand;
    if (!isCommercial) return "By posting, you agree to TikTok's Music Usage Confirmation.";
    // When any branded content flag is selected we must include Branded Content Policy
    if (branded && !yourBrand)
      return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
    if (yourBrand && !branded) return "By posting, you agree to TikTok's Music Usage Confirmation.";
    return "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.";
  };

  useEffect(() => {
    const handleKeyPress = e => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !isUploading) {
        e.preventDefault();
        handleSubmit(e);
      }
      // Ctrl/Cmd + P to preview
      if ((e.ctrlKey || e.metaKey) && e.key === "p" && !isPreviewing) {
        e.preventDefault();
        handlePreview(e);
      }
      // Ctrl/Cmd + S to save draft
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const draft = getCurrentDraft();
        if (draft.title) {
          const saved = JSON.parse(localStorage.getItem("contentDrafts") || "[]");
          const newDraft = { ...draft, id: Date.now(), savedAt: new Date().toISOString() };
          localStorage.setItem("contentDrafts", JSON.stringify([newDraft, ...saved].slice(0, 10)));
          alert("✅ Draft saved!");
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isUploading, isPreviewing, title, description]);

  // E2E helper: allow tests to auto-check TikTok consent when UI doesn't expose it
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.__E2E_TEST_TIKTOK_CONSENT) {
        setTiktokConsentChecked(true);
      }
    } catch (e) {}
  }, []);

  // Sync pinterest boards from parent-controlled metadata
  useEffect(() => {
    if (extPlatformMetadata && Array.isArray(extPlatformMetadata.pinterest?.boards)) {
      setPinterestBoards(extPlatformMetadata.pinterest.boards);
    } else {
      setPinterestBoards([]);
    }
  }, [extPlatformMetadata]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [spotifyPlaylistId, setSpotifyPlaylistId] = useState("");
  const [spotifyPlaylistName, setSpotifyPlaylistName] = useState("");
  // Sync spotify playlists from parent-controlled metadata
  useEffect(() => {
    if (extPlatformMetadata && Array.isArray(extPlatformMetadata.spotify?.playlists)) {
      setSpotifyPlaylists(extPlatformMetadata.spotify.playlists);
    } else {
      setSpotifyPlaylists([]);
    }
  }, [extPlatformMetadata]);
  // Content Quality Check handler
  const [pinterestBoard, setPinterestBoard] = useState(
    extPlatformOptions?.pinterest?.boardId || ""
  );
  const [pinterestNote, setPinterestNote] = useState(extPlatformOptions?.pinterest?.note || "");
  const [pinterestBoards, setPinterestBoards] = useState([]);
  const [youtubeVisibility, setYoutubeVisibility] = useState(
    extPlatformOptions?.youtube?.visibility || "public"
  );
  const [youtubeShorts, setYoutubeShorts] = useState(!!extPlatformOptions?.youtube?.shortsMode);
  const [selectedPlatforms, setSelectedPlatforms] = useState(extSelectedPlatforms || []);
  const selectedPlatformsVal = Array.isArray(extSelectedPlatforms)
    ? extSelectedPlatforms
    : selectedPlatforms;
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [focusedPlatform, setFocusedPlatform] = useState(null);
  const [perPlatformPreviews, setPerPlatformPreviews] = useState({});
  const [perPlatformQuality, setPerPlatformQuality] = useState({});
  const [perPlatformUploading, setPerPlatformUploading] = useState({});
  const [perPlatformUploadStatus, setPerPlatformUploadStatus] = useState({});
  const [perPlatformFile, setPerPlatformFile] = useState({});
  const [perPlatformTitle, setPerPlatformTitle] = useState({});
  const [perPlatformDescription, setPerPlatformDescription] = useState({});
  // Per-platform quick guidelines and details to help users adhere to platform UX constraints
  const platformGuidelines = {
    tiktok: {
      summary: "9:16 • max: dynamic • no watermarks",
      details: [
        "Preferred aspect ratio: 9:16 (vertical)",
        "Avoid watermarks or overlays; TikTok rejects watermarked content",
        "Enable only allowed interactions (comments/duet/stitch) if the creator allows",
        "Branded content cannot be private — choose public visibility",
        "Creators may have custom max duration; the UI will enforce it if provided",
      ],
    },
    youtube: {
      summary: "16:9 • long-form OK",
      details: [
        "Preferred aspect ratio: 16:9",
        "Titles and descriptions are public by default",
        "Longer durations are supported",
      ],
    },
    instagram: {
      summary: "4:5 or 1:1 • consider Reels 9:16",
      details: [
        "Use 4:5 or 1:1 for feed images",
        "Use Reels (9:16) for short vertical videos",
        "Add hashtags and a concise caption",
      ],
    },
    twitter: {
      summary: "Short text • images or videos",
      details: [
        "Tweets should be concise; recommended image aspect 16:9",
        "Video max duration depends on account",
      ],
    },
    linkedin: {
      summary: "Professional content • shorter",
      details: [
        "Keep content professional",
        "Native videos and image posts",
        "Use company ID for organization pages",
      ],
    },
    reddit: {
      summary: "Subreddit-specific rules",
      details: [
        "Check subreddit rules before posting",
        "Ensure media meets the subreddit community guidelines",
      ],
    },
    discord: {
      summary: "Channel posts",
      details: ["Set a channel ID to post", "Bots may be rate limited in some guilds"],
    },
    telegram: {
      summary: "Group/channel posts",
      details: ["Use a chat ID to post", "Media posts are supported via channel APIs"],
    },
    pinterest: {
      summary: "Pins • boards",
      details: ["Attach to a board and include a pin note", "Prefer tall images"],
    },
    spotify: {
      summary: "Audio tracks or playlists",
      details: ["Add tracks or a playlist to share audio content"],
    },
    snapchat: {
      summary: "Vertical short-form",
      details: ["Short vertical videos are ideal", "Check for platform-specific filters"],
    },
    facebook: {
      summary: "Wide reach • many formats",
      details: ["Supports many formats and longer clips", "Use descriptions and call-to-actions"],
    },
  };
  useEffect(() => {
    if (Array.isArray(extSelectedPlatforms)) {
      setSelectedPlatforms(extSelectedPlatforms || []);
      // If parent provides selected platforms, expand the first one inline for quick options
      if (extSelectedPlatforms && extSelectedPlatforms.length > 0) {
        setExpandedPlatform(extSelectedPlatforms[0]);
      }
    }
  }, [extSelectedPlatforms]);

  // Fetch TikTok creator info when TikTok is selected so the UI can enforce rules
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // Fetch creator info when TikTok panel is opened OR when TikTok is selected
      // (so the creator nickname can be shown in compact views without expanding)
      const tiktokSelected =
        Array.isArray(selectedPlatformsVal) && selectedPlatformsVal.includes("tiktok");
      if (!(expandedPlatform === "tiktok" || focusedPlatform === "tiktok" || tiktokSelected))
        return;
      try {
        const currentUser = auth && auth.currentUser;
        let headers = { Accept: "application/json" };
        if (currentUser) {
          const token = await currentUser.getIdToken(true);
          headers.Authorization = `Bearer ${token}`;
        }
        if (typeof fetch !== "function") {
          throw new Error("fetch_not_available");
        }
        const res = await fetch(API_ENDPOINTS.TIKTOK_CREATOR_INFO, { headers });
        if (!res.ok) {
          console.warn("TikTok creator_info fetch not ok", res.status);
          // If the server endpoint is unavailable, do NOT default privacy.
          // Leave privacy empty and surface a warning so the user must explicitly pick one.
          setTiktokPrivacy("");
          setError(
            "Warning: Could not retrieve TikTok creator info. Please select privacy and interaction settings manually."
          );
          return;
        }
        const json = await res.json();
        if (!mounted) return;
        if (json && json.creator) {
          setTiktokCreatorInfo(json.creator);
          // default privacy to empty so user must choose
          setTiktokPrivacy("");
          // Respect suggested interactions only for enabling/disabling; do NOT auto-check interactions.
          if (json.creator.interactions) {
            setTiktokInteractionDisabled({
              comments: json.creator.interactions.comments === false,
              duet: json.creator.interactions.duet === false,
              stitch: json.creator.interactions.stitch === false,
            });
            // Ensure disabled interactions are unchecked
            setTiktokInteractions(prev => ({
              comments: json.creator.interactions.comments === false ? false : prev.comments,
              duet: json.creator.interactions.duet === false ? false : prev.duet,
              stitch: json.creator.interactions.stitch === false ? false : prev.stitch,
            }));
          }
        }
      } catch (err) {
        console.warn("Failed to load TikTok creator_info", err);
        // Network or server error: do NOT default privacy to PUBLIC.
        // Require the user to explicitly choose privacy to comply with TikTok UX rules.
        setTiktokPrivacy("");
        setError(
          "Warning: Could not retrieve TikTok creator info. Please select privacy and interaction settings manually."
        );
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [selectedPlatformsVal, expandedPlatform, focusedPlatform]);
  // Provide a sensible fallback display name for TikTok creator UI when creator_info is not available
  const tiktokCreatorDisplayName = (() => {
    if (tiktokCreatorInfo)
      return tiktokCreatorInfo.display_name || tiktokCreatorInfo.open_id || null;
    try {
      const currentUser = auth && auth.currentUser;
      if (currentUser) return currentUser.displayName || currentUser.email || currentUser.uid;
    } catch (e) {}
    return null;
  })();
  const [discordChannelId, setDiscordChannelId] = useState(
    extPlatformOptions?.discord?.channelId || ""
  );
  const [telegramChatId, setTelegramChatId] = useState(extPlatformOptions?.telegram?.chatId || "");
  const [redditSubreddit, setRedditSubreddit] = useState(
    extPlatformOptions?.reddit?.subreddit || ""
  );
  const [linkedinCompanyId, setLinkedinCompanyId] = useState(
    extPlatformOptions?.linkedin?.companyId || ""
  );
  const [twitterMessage, setTwitterMessage] = useState(extPlatformOptions?.twitter?.message || "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(() => {
    if (!extPlatformOptions) return;
    setDiscordChannelId(extPlatformOptions?.discord?.channelId || "");
    setTelegramChatId(extPlatformOptions?.telegram?.chatId || "");
    setRedditSubreddit(extPlatformOptions?.reddit?.subreddit || "");
    setLinkedinCompanyId(extPlatformOptions?.linkedin?.companyId || "");
    setTwitterMessage(extPlatformOptions?.twitter?.message || "");
    setPinterestBoard(extPlatformOptions?.pinterest?.boardId || "");
    setPinterestNote(extPlatformOptions?.pinterest?.note || "");
    setSpotifyPlaylistId(extPlatformOptions?.spotify?.playlistId || "");
    setSpotifyPlaylistName(extPlatformOptions?.spotify?.name || "");
    // Initialize TikTok options from external props if provided (helps tests and parent-controlled forms)
    if (extPlatformOptions?.tiktok) {
      setTiktokPrivacy(extPlatformOptions.tiktok.privacy || "");
      setTiktokInteractions(
        extPlatformOptions.tiktok.interactions || { comments: false, duet: false, stitch: false }
      );
      if (extPlatformOptions.tiktok.commercial) {
        setTiktokCommercial({
          isCommercial: true,
          yourBrand: !!extPlatformOptions.tiktok.commercial.yourBrand,
          brandedContent: !!extPlatformOptions.tiktok.commercial.brandedContent,
        });
      }
      if (typeof extPlatformOptions.tiktok.disclosure !== "undefined") {
        setTiktokDisclosure(!!extPlatformOptions.tiktok.disclosure);
      }
      if (typeof extPlatformOptions.tiktok.consent !== "undefined") {
        setTiktokConsentChecked(!!extPlatformOptions.tiktok.consent);
      }
    }
  }, [extPlatformOptions]);
  const handleQualityCheck = async e => {
    e.preventDefault();
    setQualityScore(null);
    setQualityFeedback([]);
    setEnhancedSuggestions(null);
    setError("");
    try {
      const currentUser = auth && auth.currentUser;
      const headers = { "Content-Type": "application/json" };
      if (currentUser) {
        const token = await currentUser.getIdToken(true).catch(() => null);
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(API_ENDPOINTS.CONTENT_QUALITY_CHECK, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          description,
          type,
          url: file ? `preview://${file.name}` : "",
        }),
      });
      const text = await response.text();
      let result = null;
      try {
        result = text ? JSON.parse(text) : null;
      } catch (e) {
        throw new Error("Invalid JSON response from quality check");
      }
      if (response.ok && result) {
        setQualityScore(result.qualityScore || result.quality_score || null);
        setQualityFeedback(result.feedback || result.quality_feedback || []);
        if (result.enhanced && (result.qualityScore || result.quality_score) < 70) {
          setEnhancedSuggestions(result.enhanced);
        }
      } else {
        setError((result && result.error) || "Quality check failed.");
      }
    } catch (err) {
      setError(err.message || "Quality check failed.");
    }
  };
  // Preview handler
  const handlePreview = async e => {
    e.preventDefault();
    setError("");
    setIsPreviewing(true);
    setPreviews([]);
    // If a local file is selected, generate a local preview to show immediately
    if (file) {
      try {
        let url = null;
        try {
          url = URL.createObjectURL(file);
        } catch (e) {
          url = `preview://${file.name}`;
        }
        setPreviewUrl(url);
      } catch (err) {
        console.error("[Preview] failed to generate local preview URL", err);
      }
    }
    try {
      let url = "";
      if (file) {
        // Simulate upload to get preview URL (skip actual upload for preview)
        url = `preview://${file.name}`;
      }
      const contentData = {
        title,
        type,
        description,
        url,
        file: file ? { name: file.name } : undefined,
        idempotency_key: idempotencyKey || undefined,
        // backend expects `target_platforms`; include it and keep `platforms` for compatibility
        target_platforms: selectedPlatformsVal,
        platforms: selectedPlatformsVal,
        isDryRun: true,
        meta: {
          trimStart: type === "video" || type === "audio" ? trimStart : undefined,
          trimEnd: type === "video" || type === "audio" ? trimEnd : undefined,
          rotate: type === "image" ? rotate : undefined,
          flipH: type === "image" ? flipH : undefined,
          flipV: type === "image" ? flipV : undefined,
          duration: duration || undefined,
          crop: cropMeta || undefined,
          template: template !== "none" ? template : undefined,
        },
      };
      // Add overlay metadata if provided
      if (overlayText) {
        contentData.meta.overlay = { text: overlayText, position: overlayPosition };
      }
      // include platform options for preview (e.g., pinterest / spotify)
      // Include platform options for preview
      contentData.platform_options = {
        pinterest:
          pinterestBoard || pinterestNote
            ? { boardId: pinterestBoard || undefined, note: pinterestNote || undefined }
            : undefined,
        spotify:
          (spotifyTracks && spotifyTracks.length) || spotifyPlaylistId || spotifyPlaylistName
            ? {
                trackUris:
                  spotifyTracks && spotifyTracks.length ? spotifyTracks.map(t => t.uri) : undefined,
                playlistId: spotifyPlaylistId || undefined,
                name: spotifyPlaylistName || undefined,
              }
            : undefined,
      };
      if (selectedPlatformsVal.includes("discord"))
        contentData.platform_options.discord = { channelId: discordChannelId || undefined };
      if (selectedPlatformsVal.includes("telegram"))
        contentData.platform_options.telegram = { chatId: telegramChatId || undefined };
      if (selectedPlatformsVal.includes("reddit"))
        contentData.platform_options.reddit = { subreddit: redditSubreddit || undefined };
      if (selectedPlatformsVal.includes("linkedin"))
        contentData.platform_options.linkedin = { companyId: linkedinCompanyId || undefined };
      if (selectedPlatformsVal.includes("twitter"))
        contentData.platform_options.twitter = { message: twitterMessage || undefined };
      // Include TikTok options for previews so tests and clients see the consent/privacy metadata
      if (selectedPlatformsVal.includes("tiktok")) {
        contentData.platform_options = contentData.platform_options || {};
        contentData.platform_options.tiktok = {
          privacy: tiktokPrivacy || undefined,
          interactions: tiktokInteractions || undefined,
          commercial:
            tiktokCommercial && tiktokCommercial.isCommercial
              ? {
                  yourBrand: !!tiktokCommercial.yourBrand,
                  brandedContent: !!tiktokCommercial.brandedContent,
                }
              : undefined,
          disclosure: !!tiktokDisclosure,
          consent: !!tiktokConsentChecked,
        };
      }
      // Call backend preview (reuse onUpload with dry run)
      const result = await onUpload({ ...contentData, isDryRun: true });
      console.log("[E2E] handlePlatformPreview result", result);
      // Helper to convert possibly-structured fields into safe strings for rendering
      const safeText = v => {
        if (!v && v !== 0) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number") return String(v);
        if (Array.isArray(v)) return v.join(", ");
        if (typeof v === "object") {
          // Prefer common readable keys
          if (v.text) return String(v.text);
          if (v.title) return String(v.title);
          if (v.original) return String(v.original);
          if (v.improved) return JSON.stringify(v.improved);
          return JSON.stringify(v);
        }
        return String(v);
      };

      if (result && result.previews) {
        const sanitized = result.previews.map(p => {
          const thumb = p.thumbnail;
          let thumbnail = thumb;
          if (thumbnail && typeof thumbnail === "object") {
            thumbnail = thumbnail.url || thumbnail.original || thumbnail.thumbnail || "";
          }
          // Ensure strings for text fields so React doesn't try to render objects
          const title = safeText(p.title);
          const description = safeText(p.description);
          const caption = safeText(p.caption);
          const sound = safeText(p.sound);
          return { ...p, thumbnail, title, description, caption, sound };
        });
        setPreviews(sanitized);
      } else if (result && result.content_preview) {
        const p = result.content_preview;
        const thumb = p.thumbnail;
        let thumbnail = thumb;
        if (thumbnail && typeof thumbnail === "object") {
          thumbnail = thumbnail.url || thumbnail.original || thumbnail.thumbnail || "";
        }
        const title = safeText(p.title);
        const description = safeText(p.description);
        const caption = safeText(p.caption);
        const sound = safeText(p.sound);
        setPreviews([{ ...p, thumbnail, title, description, caption, sound }]);
      } else {
        setError("No preview data returned.");
      }
      // If TikTok selected, show processing notice if applicable
      if (selectedPlatformsVal.includes("tiktok")) {
        const publishMsg =
          result && (result.shareUrl || result.publish_id || result.videoId)
            ? `TikTok upload submitted. It may take a few minutes to process. ${result.shareUrl ? "View: " + result.shareUrl : ""}`
            : "TikTok upload submitted. It may take a few minutes to process.";
        setTiktokProcessingNotice(publishMsg);
      }
    } catch (err) {
      setError(err.message || "Failed to generate preview.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const buildContentDataForPlatform = (platform, isDryRun = true) => {
    const fileForPlatform = (perPlatformFile && perPlatformFile[platform]) || file;
    const finalTitle =
      (perPlatformTitle && perPlatformTitle[platform]) ||
      title ||
      (fileForPlatform ? fileForPlatform.name : "");
    const finalDescription =
      (perPlatformDescription && perPlatformDescription[platform]) || description || "";
    const contentData = {
      title: finalTitle,
      type,
      description: finalDescription,
      url: fileForPlatform ? `preview://${fileForPlatform.name}` : "",
      file: fileForPlatform ? { name: fileForPlatform.name } : undefined,
      idempotency_key: idempotencyKey || undefined,
      target_platforms:
        Array.isArray(selectedPlatformsVal) && selectedPlatformsVal.length
          ? selectedPlatformsVal
          : [platform],
      platforms:
        Array.isArray(selectedPlatformsVal) && selectedPlatformsVal.length
          ? selectedPlatformsVal
          : [platform],
      isDryRun: isDryRun,
      meta: {
        trimStart: type === "video" || type === "audio" ? trimStart : undefined,
        trimEnd: type === "video" || type === "audio" ? trimEnd : undefined,
        rotate: type === "image" ? rotate : undefined,
        flipH: type === "image" ? flipH : undefined,
        flipV: type === "image" ? flipV : undefined,
        duration: duration || undefined,
        crop: cropMeta || undefined,
        template: template !== "none" ? template : undefined,
      },
      platform_options: {},
    };
    // copy platform-specific options for all selected platforms (useful for multi-platform previews)
    const platformsToInclude =
      Array.isArray(selectedPlatformsVal) && selectedPlatformsVal.length
        ? selectedPlatformsVal
        : [platform];
    platformsToInclude.forEach(pl => {
      if (pl === "discord")
        contentData.platform_options.discord = { channelId: discordChannelId || undefined };
      if (pl === "telegram")
        contentData.platform_options.telegram = { chatId: telegramChatId || undefined };
      if (pl === "reddit")
        contentData.platform_options.reddit = { subreddit: redditSubreddit || undefined };
      if (pl === "linkedin")
        contentData.platform_options.linkedin = { companyId: linkedinCompanyId || undefined };
      if (pl === "twitter")
        contentData.platform_options.twitter = { message: twitterMessage || undefined };
      if (pl === "pinterest")
        contentData.platform_options.pinterest =
          pinterestBoard || pinterestNote
            ? { boardId: pinterestBoard || undefined, note: pinterestNote || undefined }
            : undefined;
      if (pl === "spotify")
        contentData.platform_options.spotify =
          (spotifyTracks && spotifyTracks.length) || spotifyPlaylistId || spotifyPlaylistName
            ? {
                trackUris:
                  spotifyTracks && spotifyTracks.length ? spotifyTracks.map(t => t.uri) : undefined,
                playlistId: spotifyPlaylistId || undefined,
                name: spotifyPlaylistName || undefined,
              }
            : undefined;
      if (pl === "tiktok")
        contentData.platform_options.tiktok = {
          privacy: tiktokPrivacy || undefined,
          interactions: tiktokInteractions || undefined,
          commercial:
            tiktokCommercial && tiktokCommercial.isCommercial
              ? {
                  yourBrand: !!tiktokCommercial.yourBrand,
                  brandedContent: !!tiktokCommercial.brandedContent,
                }
              : undefined,
          consent: !!tiktokConsentChecked,
        };
    });
    if (platform === "youtube")
      contentData.platform_options.youtube = {
        visibility: youtubeVisibility || undefined,
        shortsMode: !!youtubeShorts,
      };
    if (overlayText) contentData.meta.overlay = { text: overlayText, position: overlayPosition };
    return contentData;
  };

  const handlePerPlatformFileChange = (platform, fileObj) => {
    setPerPlatformFile(prev => ({ ...prev, [platform]: fileObj || null }));
    if (fileObj && !(perPlatformTitle && perPlatformTitle[platform])) {
      setPerPlatformTitle(prev => ({ ...prev, [platform]: fileObj.name }));
    }
  };

  const handlePlatformPreview = async platform => {
    setPerPlatformPreviews(prev => ({ ...prev, [platform]: null }));
    setError("");
    console.log("[E2E] handlePlatformPreview called for platform:", platform);
    const fileToUse = (perPlatformFile && perPlatformFile[platform]) || file;
    try {
      if (!fileToUse) throw new Error("Please select a file to preview.");
      const contentData = buildContentDataForPlatform(platform, true);
      console.log("[E2E] handlePlatformPreview contentData", contentData);
      const result = await onUpload({ ...contentData, isDryRun: true });
      const previews =
        result && (result.previews || (result.content_preview ? [result.content_preview] : []));

      // Helper to ensure preview text fields are safe strings
      const safeText = v => {
        if (!v && v !== 0) return "";
        if (typeof v === "string") return v;
        if (typeof v === "number") return String(v);
        if (Array.isArray(v)) return v.join(", ");
        if (typeof v === "object") {
          if (v.text) return String(v.text);
          if (v.title) return String(v.title);
          if (v.original) return String(v.original);
          if (v.improved) return JSON.stringify(v.improved);
          return JSON.stringify(v);
        }
        return String(v);
      };

      // If the backend didn't return previews (400/500 or dry-run not supported),
      // fall back to a local preview using the selected file's object URL so the
      // Preview button still shows something useful to the user.
      if (!previews || (Array.isArray(previews) && previews.length === 0)) {
        const fallback = [];
        // Prefer an explicit previewUrl (global), otherwise use the per-platform selected file
        let mediaUrl = previewUrl || null;
        let mediaType = null;
        if (!mediaUrl && fileToUse) {
          try {
            mediaUrl = URL.createObjectURL(fileToUse);
            // Track created object URLs to revoke on unmount
            objectUrlsRef.current.add(mediaUrl);
          } catch (e) {
            // In test environments URL.createObjectURL may be missing — fall back to preview:// scheme
            mediaUrl = `preview://${fileToUse.name}`;
          }
        }
        if (mediaUrl) {
          // Determine if it's a video
          if (
            (fileToUse && fileToUse.type && fileToUse.type.startsWith("video")) ||
            (typeof mediaUrl === "string" && mediaUrl.toLowerCase().endsWith(".mp4"))
          ) {
            mediaType = "video";
          } else {
            mediaType = "image";
          }
          fallback.push({
            platform,
            thumbnail: mediaUrl,
            mediaUrl,
            mediaType,
            title: safeText(
              (perPlatformTitle && perPlatformTitle[platform]) ||
                title ||
                (fileToUse && fileToUse.name) ||
                "Preview"
            ),
            description: safeText(
              (perPlatformDescription && perPlatformDescription[platform]) || description || ""
            ),
          });
        }
        setPerPlatformPreviews(prev => ({
          ...prev,
          [platform]: fallback.length ? fallback : null,
        }));
      } else {
        // sanitize per-platform previews before setting state
        const sanitized = previews.map(p => {
          const thumb = p.thumbnail;
          let thumbnail = thumb;
          if (thumbnail && typeof thumbnail === "object") {
            thumbnail = thumbnail.url || thumbnail.original || thumbnail.thumbnail || "";
          }
          // Determine a media URL and type (video vs image) for richer previews
          let mediaUrl = p.url || p.mediaUrl || thumbnail || "";

          // FALLBACK: if backend returned an empty mediaUrl, prefer the local preview URL
          // or create an object URL from the selected file so the preview shows the user's media
          if (!mediaUrl) {
            if (previewUrl) {
              mediaUrl = previewUrl;
            } else if (fileToUse) {
              try {
                mediaUrl = URL.createObjectURL(fileToUse);
                objectUrlsRef.current.add(mediaUrl);
              } catch (e) {
                mediaUrl = `preview://${fileToUse.name}`;
              }
            }
          }

          let mediaType = "image";
          if (
            p.type === "video" ||
            (mediaUrl && typeof mediaUrl === "string" && mediaUrl.toLowerCase().endsWith(".mp4")) ||
            (p.mime && typeof p.mime === "string" && p.mime.startsWith("video")) ||
            (p.file && p.file.name && /\.mp4$/i.test(p.file.name)) ||
            (fileToUse && fileToUse.type && fileToUse.type.startsWith("video"))
          ) {
            mediaType = "video";
          }
          return {
            ...p,
            thumbnail,
            mediaUrl,
            mediaType,
            title: safeText(p.title),
            description: safeText(p.description),
            caption: safeText(p.caption),
            sound: safeText(p.sound),
          };
        });
        setPerPlatformPreviews(prev => ({ ...prev, [platform]: sanitized }));
      }
    } catch (err) {
      // On error, show a local preview if available so the Preview action remains useful
      if (fileToUse) {
        let tmpThumb = previewUrl;
        if (!tmpThumb) {
          try {
            tmpThumb = URL.createObjectURL(fileToUse);
            objectUrlsRef.current.add(tmpThumb);
          } catch (e) {
            tmpThumb = `preview://${fileToUse.name}`;
          }
        }
        setPerPlatformPreviews(prev => ({
          ...prev,
          [platform]: [
            {
              platform,
              thumbnail: tmpThumb,
              mediaUrl: tmpThumb,
              mediaType:
                fileToUse && fileToUse.type && fileToUse.type.startsWith("video")
                  ? "video"
                  : "image",
              title:
                (perPlatformTitle && perPlatformTitle[platform]) ||
                title ||
                (fileToUse && fileToUse.name) ||
                "Preview",
              description:
                (perPlatformDescription && perPlatformDescription[platform]) || description || "",
            },
          ],
        }));
      } else if (previewUrl) {
        setPerPlatformPreviews(prev => ({
          ...prev,
          [platform]: [
            {
              platform,
              thumbnail: previewUrl,
              title: title || (file && file.name) || "Preview",
              description: description || "",
            },
          ],
        }));
      } else {
        setError(err.message || "Platform preview failed.");
      }
    }
  };

  const handlePlatformQualityCheck = async platform => {
    setPerPlatformQuality(prev => ({ ...prev, [platform]: { loading: true } }));
    setError("");
    try {
      const currentUser = auth && auth.currentUser;
      const headers = { "Content-Type": "application/json" };
      if (currentUser) {
        const token = await currentUser.getIdToken(true).catch(() => null);
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(API_ENDPOINTS.CONTENT_QUALITY_CHECK, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, description, type, platform }),
      });
      const text = await response.text();
      let result = null;
      try {
        result = text ? JSON.parse(text) : null;
      } catch (e) {
        setPerPlatformQuality(prev => ({
          ...prev,
          [platform]: { loading: false, error: "Invalid JSON response from quality check" },
        }));
        return;
      }
      if (response.ok && result) {
        setPerPlatformQuality(prev => ({ ...prev, [platform]: { loading: false, result } }));
      } else {
        setPerPlatformQuality(prev => ({
          ...prev,
          [platform]: { loading: false, error: result.error || "Quality check failed." },
        }));
      }
    } catch (err) {
      setPerPlatformQuality(prev => ({
        ...prev,
        [platform]: { loading: false, error: err.message || "Quality check failed." },
      }));
    }
  };

  const handlePlatformUpload = async platform => {
    if (perPlatformUploading[platform]) return;
    setPerPlatformUploading(prev => ({ ...prev, [platform]: true }));
    setPerPlatformUploadStatus(prev => ({ ...prev, [platform]: "Preparing upload..." }));
    setError("");
    try {
      const fileToUse = (perPlatformFile && perPlatformFile[platform]) || file;
      if (!fileToUse) throw new Error("Please select a file to upload.");
      // Platform-specific client-side checks (TikTok)
      if (platform === "tiktok") {
        if (!tiktokConsentChecked)
          throw new Error(
            "You must confirm the TikTok consent checkbox before publishing to TikTok."
          );
        if (!tiktokPrivacy) throw new Error("Please select a privacy option for TikTok posts.");
        if (tiktokCreatorInfo && tiktokCreatorInfo.can_post === false)
          throw new Error(
            "This TikTok account cannot be used to publish via third-party apps at this time."
          );
        if (overlayText && overlayText.trim().length > 0)
          throw new Error("TikTok uploads must not contain watermarks or overlay text.");
        const maxDur =
          tiktokCreatorInfo && tiktokCreatorInfo.max_video_post_duration_sec
            ? tiktokCreatorInfo.max_video_post_duration_sec
            : null;
        if (type === "video" && maxDur && duration > maxDur)
          throw new Error(
            `This creator account allows videos up to ${maxDur} seconds. Please trim your video before posting to TikTok.`
          );
        if (tiktokCommercial && tiktokCommercial.isCommercial) {
          if (!tiktokCommercial.yourBrand && !tiktokCommercial.brandedContent)
            throw new Error(
              "Please indicate if this content promotes yourself, a third party, or both."
            );
          if (tiktokCommercial.brandedContent && tiktokPrivacy === "SELF_ONLY")
            throw new Error("Branded content visibility cannot be set to private.");
        }
      }
      // Platform-specific required fields
      if (platform === "discord" && !discordChannelId)
        throw new Error("Discord Channel ID is required for Discord posts.");
      if (platform === "telegram" && !telegramChatId)
        throw new Error("Telegram Chat ID is required for Telegram posts.");
      if (platform === "reddit" && !redditSubreddit)
        throw new Error("Reddit subreddit is required for Reddit posts.");
      if (platform === "linkedin" && !linkedinCompanyId)
        throw new Error("LinkedIn company id is required for LinkedIn posts.");
      if (
        platform === "spotify" &&
        !(spotifyTracks && spotifyTracks.length) &&
        !spotifyPlaylistId &&
        !spotifyPlaylistName
      )
        throw new Error("Spotify tracks or playlist is required for Spotify sharing.");

      setPerPlatformUploadStatus(prev => ({ ...prev, [platform]: "Uploading to cloud..." }));
      // Upload file to storage (same as handleSubmit)
      let url = "";
      if (typeof window !== "undefined" && window.__E2E_BYPASS_UPLOADS) {
        // E2E bypass: don't call real Firebase Storage; use placeholder URL
        url = `https://example.com/e2e-${platform}.mp4`;
      } else {
        const filePath = `uploads/${type}s/${Date.now()}_${fileToUse.name}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, fileToUse);
        url = await getDownloadURL(storageRef);
      }

      const contentData = buildContentDataForPlatform(platform, false);
      contentData.url = url;

      setPerPlatformUploadStatus(prev => ({ ...prev, [platform]: "Publishing to platform..." }));
      const resp = await onUpload(contentData);
      console.log("[Upload] onUpload response:", resp);
      // If backend created a content record, try to poll for its processing status
      try {
        const maybeKey = idempotencyKey || (resp && (resp.idempotency_key || resp.id));
        if (maybeKey) {
          setTiktokPollStatus({ status: "pending", message: "Waiting for platform processing..." });
          pollMyContentForIdempotency(maybeKey, platform);
        }
      } catch (e) {
        console.warn("Polling setup failed", e);
      }
      setPerPlatformUploadStatus(prev => ({
        ...prev,
        [platform]: "✓ Upload submitted. It may take a few minutes to process.",
      }));
      // Clear per-platform inputs for this platform only
      setPerPlatformFile(prev => ({ ...prev, [platform]: null }));
      setPerPlatformTitle(prev => ({ ...prev, [platform]: "" }));
      setPerPlatformDescription(prev => ({ ...prev, [platform]: "" }));
    } catch (err) {
      setError(err.message || "Platform upload failed.");
      setPerPlatformUploadStatus(prev => ({
        ...prev,
        [platform]: err.message || "Upload failed.",
      }));
    } finally {
      setPerPlatformUploading(prev => ({ ...prev, [platform]: false }));
    }
  };

  // Open preview edit modal for a specific preview card
  const openPreviewEdit = p => {
    setPreviewToEdit(p);
    setShowPreviewEditModal(true);
  };

  const handleSavePreviewEdits = edited => {
    // Apply edits to the global form state so the final upload uses the edited values
    if (edited.title) setTitle(edited.title);
    if (edited.description) setDescription(edited.description);
    if (Array.isArray(edited.hashtags)) setHashtags(edited.hashtags);
    // Update any preview card that matches this thumbnail or platform so the preview reflects edits immediately
    setPreviews(prev =>
      prev.map(p => {
        const matches =
          (previewToEdit && previewToEdit.thumbnail && p.thumbnail === previewToEdit.thumbnail) ||
          p.platform === previewToEdit?.platform;
        if (matches)
          return {
            ...p,
            title: edited.title || p.title,
            description: edited.description || p.description,
            hashtags: edited.hashtags || p.hashtags,
          };
        return p;
      })
    );

    // Also update per-platform previews if the edited preview belongs to a platform
    setPerPlatformPreviews(prevPlatforms => {
      const out = { ...prevPlatforms };
      Object.keys(out).forEach(key => {
        if (!Array.isArray(out[key])) return;
        out[key] = out[key].map(p => {
          const matches =
            (previewToEdit && previewToEdit.thumbnail && p.thumbnail === previewToEdit.thumbnail) ||
            p.platform === previewToEdit?.platform;
          if (matches)
            return {
              ...p,
              title: edited.title || p.title,
              description: edited.description || p.description,
              hashtags: edited.hashtags || p.hashtags,
            };
          return p;
        });
      });
      return out;
    });
    setShowPreviewEditModal(false);
  };

  const submitFromConfirmed = () => {
    // Create a synthetic event that satisfies the production guard (isTrusted)
    const fakeEvent = { preventDefault: () => {}, nativeEvent: { isTrusted: true } };
    setShowConfirmPublishModal(false);
    // If a focused per-platform upload initiated the confirm modal, handle that specific platform upload
    if (confirmTargetPlatform) {
      const platform = confirmTargetPlatform;
      setConfirmTargetPlatform(null);
      // Trigger the per-platform upload flow
      handlePlatformUpload(platform);
      return;
    }
    // Otherwise, call the existing submit handler with a trusted-like event
    handleSubmit(fakeEvent);
  };

  // Poll /api/content/my-content for a record with the given idempotency key.
  // This helps surface post-processing state to the user (TikTok may take minutes).
  const pollMyContentForIdempotency = async (key, platform, attempts = 15, intervalMs = 4000) => {
    try {
      const currentUser = auth && auth.currentUser;
      let headers = { Accept: "application/json" };
      if (currentUser) {
        const token = await currentUser.getIdToken(true);
        headers.Authorization = `Bearer ${token}`;
      }
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(API_ENDPOINTS.MY_CONTENT, { headers });
          if (!res.ok) {
            console.warn("pollMyContentForIdempotency: my-content fetch not ok", res.status);
            await new Promise(r => setTimeout(r, intervalMs));
            continue;
          }
          const list = await res.json();
          if (Array.isArray(list) && list.length) {
            const found = list.find(
              c => c.idempotency_key === key || c.id === key || c.content_id === key
            );
            if (found) {
              const msg = found.published
                ? `Published on ${platform}. View: ${found.platform_post_url || found.share_url || "(open your profile)"}`
                : `Upload recorded. Processing on ${platform}. Refresh in a few minutes to see status.`;
              setTiktokPollStatus({
                status: found.published ? "published" : "processing",
                message: msg,
                record: found,
              });
              return found;
            }
          }
        } catch (err) {
          console.warn("pollMyContentForIdempotency error", err);
        }
        await new Promise(r => setTimeout(r, intervalMs));
      }
      setTiktokPollStatus({
        status: "timeout",
        message: "Processing is taking longer than expected. Check your TikTok profile later.",
      });
    } catch (err) {
      console.error("pollMyContentForIdempotency fatal", err);
      setTiktokPollStatus({ status: "error", message: "Unable to poll status." });
    }
  };

  const handleSubmit = async e => {
    // Protect against non-user-initiated/form auto-submits which may occur when fields change.
    // In production, require the event to be a trusted user action (e.nativeEvent.isTrusted === true).
    if (process.env.NODE_ENV === "production") {
      if (!e || !e.nativeEvent || !e.nativeEvent.isTrusted) {
        console.warn("[Upload] Ignoring non-user-initiated submit (production guard)");
        return;
      }
    }

    e.preventDefault();
    // Prevent duplicate submissions from multiple clicks / events
    if (uploadLockRef.current) {
      console.warn("[Upload] Duplicate submit prevented");
      return;
    }
    uploadLockRef.current = true;
    setError("");
    setIsUploading(true);
    setShowProgress(true);
    setUploadProgress(0);
    setUploadStatus("Preparing upload...");

    console.log(
      "[Upload] Starting upload process",
      "E2E_BYPASS_UPLOADS?",
      typeof window !== "undefined" ? window.__E2E_BYPASS_UPLOADS : "no-window"
    );
    try {
      console.log("[Upload] Content type:", type);
      if (!file) {
        console.error("[Upload] No file selected");
        throw new Error("Please select a file to upload.");
      }

      // TikTok-specific client-side checks (Direct Post compliance)
      if (selectedPlatformsVal.includes("tiktok")) {
        // Require explicit consent checkbox
        if (!tiktokConsentChecked) {
          throw new Error(
            "You must confirm the TikTok consent checkbox before publishing to TikTok."
          );
        }
        // Require privacy selection
        if (!tiktokPrivacy) {
          throw new Error("Please select a privacy option for TikTok posts.");
        }
        // Ensure creator account allows posting
        if (tiktokCreatorInfo && tiktokCreatorInfo.can_post === false) {
          throw new Error(
            "This TikTok account cannot be used to publish via third-party apps at this time. Connect a different account or try again later."
          );
        }
        // Prohibit overlays/watermarks for TikTok
        if (overlayText && overlayText.trim().length > 0) {
          throw new Error(
            "TikTok uploads must not contain watermarks or overlay text. Please remove overlay text before posting to TikTok."
          );
        }
        // Enforce max duration if creator info provided
        const maxDur =
          tiktokCreatorInfo && tiktokCreatorInfo.max_video_post_duration_sec
            ? tiktokCreatorInfo.max_video_post_duration_sec
            : null;
        if (type === "video" && maxDur && duration > maxDur) {
          throw new Error(
            `This creator account allows videos up to ${maxDur} seconds. Please trim your video before posting to TikTok.`
          );
        }
        // If commercial disclosure is required, ensure at least one selection is made
        if (tiktokCommercial && tiktokCommercial.isCommercial) {
          if (!tiktokCommercial.yourBrand && !tiktokCommercial.brandedContent) {
            throw new Error(
              "Please indicate if this content promotes yourself, a third party, or both."
            );
          }
          // Branded content cannot be private
          if (tiktokCommercial.brandedContent && tiktokPrivacy === "SELF_ONLY") {
            throw new Error(
              "Branded content visibility cannot be set to private. Please change visibility before posting."
            );
          }
        }
      }

      console.log("[Upload] File selected:", file);
      setUploadProgress(10);
      setUploadStatus("Uploading to cloud...");

      // Upload file to Firebase Storage
      let url = "";
      if (typeof window !== "undefined" && window.__E2E_BYPASS_UPLOADS) {
        url = `https://example.com/e2e-${type}.mp4`;
      } else {
        const filePath = `uploads/${type}s/${Date.now()}_${file.name}`;
        console.log("[Upload] Firebase Storage filePath:", filePath);
        const storageRef = ref(storage, filePath);
        console.log("[Upload] Storage ref created:", storageRef);
        try {
          setUploadProgress(30);
          const uploadResult = await uploadBytes(storageRef, file);
          console.log("[Upload] uploadBytes result:", uploadResult);
          setUploadProgress(60);
          setUploadStatus("Processing file...");
          url = await getDownloadURL(storageRef);
          setUploadProgress(80);
        } catch (uploadErr) {
          console.error("[Upload] Error uploading to Firebase Storage:", uploadErr);
          throw uploadErr;
        }
      }
      console.log("[Upload] File available at URL:", url);

      const finalTitle = title || file.name;
      // Basic platform-required validation
      const missing = [];
      if (selectedPlatformsVal.includes("discord") && !discordChannelId)
        missing.push("Discord Channel ID");
      if (selectedPlatformsVal.includes("telegram") && !telegramChatId)
        missing.push("Telegram Chat ID");
      if (selectedPlatformsVal.includes("reddit") && !redditSubreddit)
        missing.push("Reddit subreddit");
      if (selectedPlatformsVal.includes("linkedin") && !linkedinCompanyId)
        missing.push("LinkedIn company id");
      if (
        selectedPlatformsVal.includes("spotify") &&
        !(spotifyTracks && spotifyTracks.length) &&
        !spotifyPlaylistId &&
        !spotifyPlaylistName
      )
        missing.push("Spotify playlist or track");
      if (missing.length) throw new Error("Missing: " + missing.join(", "));

      const contentData = {
        title: finalTitle,
        type,
        description,
        url,
        idempotency_key: idempotencyKey || undefined,
        // include both keys so backend preview and upload handlers accept the platforms list
        target_platforms: selectedPlatformsVal,
        platforms: selectedPlatformsVal,
        template: template !== "none" ? template : undefined,
        meta: {
          trimStart: type === "video" || type === "audio" ? trimStart : undefined,
          trimEnd: type === "video" || type === "audio" ? trimEnd : undefined,
          rotate: type === "image" ? rotate : undefined,
          flipH: type === "image" ? flipH : undefined,
          flipV: type === "image" ? flipV : undefined,
          duration: duration || undefined,
          crop: cropMeta || undefined,
          template: template !== "none" ? template : undefined,
        },
        platform_options: {
          pinterest:
            pinterestBoard || pinterestNote
              ? { boardId: pinterestBoard || undefined, note: pinterestNote || undefined }
              : undefined,
          spotify:
            (spotifyTracks && spotifyTracks.length) || spotifyPlaylistId || spotifyPlaylistName
              ? {
                  trackUris:
                    spotifyTracks && spotifyTracks.length
                      ? spotifyTracks.map(t => t.uri)
                      : undefined,
                  playlistId: spotifyPlaylistId || undefined,
                  name: spotifyPlaylistName || undefined,
                }
              : undefined,
          discord: selectedPlatformsVal.includes("discord")
            ? { channelId: discordChannelId || undefined }
            : undefined,
          telegram: selectedPlatformsVal.includes("telegram")
            ? { chatId: telegramChatId || undefined }
            : undefined,
          reddit: selectedPlatformsVal.includes("reddit")
            ? { subreddit: redditSubreddit || undefined }
            : undefined,
          linkedin: selectedPlatformsVal.includes("linkedin")
            ? { companyId: linkedinCompanyId || undefined }
            : undefined,
          twitter: selectedPlatformsVal.includes("twitter")
            ? { message: twitterMessage || undefined }
            : undefined,
        },
      };
      // Add TikTok platform options if TikTok is selected
      if (selectedPlatformsVal.includes("tiktok")) {
        contentData.platform_options = contentData.platform_options || {};
        contentData.platform_options.tiktok = {
          privacy: tiktokPrivacy || undefined,
          interactions: tiktokInteractions || undefined,
          commercial:
            tiktokCommercial && tiktokCommercial.isCommercial
              ? {
                  yourBrand: !!tiktokCommercial.yourBrand,
                  brandedContent: !!tiktokCommercial.brandedContent,
                }
              : undefined,
          // Include explicit disclosure + consent flags so server-side can validate prior to publishing
          is_aigc: !!tiktokAIGenerated,
          disclosure: !!tiktokDisclosure,
          consent: !!tiktokConsentChecked,
        };
      }
      // Add YouTube platform options if YouTube is selected
      if (selectedPlatformsVal.includes("youtube")) {
        contentData.platform_options = contentData.platform_options || {};
        contentData.platform_options.youtube = {
          visibility: youtubeVisibility || undefined,
          shortsMode: !!youtubeShorts,
        };
      }
      // Add overlay metadata to submit payload
      if (overlayText) contentData.meta.overlay = { text: overlayText, position: overlayPosition };
      console.log("[Upload] Content data to send:", contentData);

      setUploadStatus("Publishing to platforms...");
      setUploadProgress(90);
      const resp = await onUpload(contentData);
      console.log("[Upload] onUpload response:", resp);
      console.log("[Upload] onUpload callback completed");

      setUploadProgress(100);
      if (selectedPlatformsVal.includes("tiktok")) {
        setUploadStatus(
          "✓ Upload complete! It may take a few minutes for posts to process and be visible on TikTok."
        );
      } else {
        setUploadStatus("✓ Upload complete!");
      }

      // Clear form on successful upload
      setTimeout(() => {
        setTitle("");
        setDescription("");
        setFile(null);
        setHashtags([]);
        setOverlayText("");
        setShowProgress(false);
        console.log("[Upload] Form cleared after successful upload");
      }, 1500);
    } catch (err) {
      console.error("[Upload] Upload error:", err);
      setError(err.message || "Failed to upload content. Please try again.");
      setShowProgress(false);
    } finally {
      uploadLockRef.current = false;
      setIsUploading(false);
      console.log("[Upload] Upload process finished");
    }
  };

  const handleEmojiSelect = emoji => {
    if (emojiTarget === "title") {
      setTitle(prev => prev + emoji);
    } else if (emojiTarget === "description") {
      setDescription(prev => prev + emoji);
    } else if (emojiTarget === "overlay") {
      setOverlayText(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  };

  const openEmojiPicker = target => {
    setEmojiTarget(target);
    setShowEmojiPicker(true);
  };

  const handleAddHashtag = tag => {
    if (!hashtags.includes(tag)) {
      setHashtags([...hashtags, tag]);
      setDescription(prev => prev + (prev ? " " : "") + "#" + tag);
    }
  };

  const removeHashtag = tag => {
    setHashtags(hashtags.filter(t => t !== tag));
    setDescription(prev => prev.replace(new RegExp("#" + tag + "\\s?", "g"), "").trim());
  };

  const handleLoadDraft = draft => {
    setTitle(draft.title || "");
    setDescription(draft.description || "");
    setType(draft.type || "video");
    setOverlayText(draft.overlayText || "");
    if (draft.hashtags) setHashtags(draft.hashtags);
    if (draft.selectedPlatforms) setSelectedPlatforms(draft.selectedPlatforms);
  };

  const getCurrentDraft = () => ({
    title,
    description,
    type,
    overlayText,
    hashtags,
    selectedPlatforms: selectedPlatformsVal,
  });

  // Prevent Enter from submitting the form implicitly. We want explicit button clicks
  // for Preview and Upload; allow Ctrl/Cmd+Enter to submit and Enter inside textareas.
  const handleFormKeyDown = e => {
    if (e.key === "Enter") {
      const targetTag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : "";
      // Allow Enter inside textarea; allow Ctrl/Cmd+Enter to trigger submission via keyboard shortcut handler
      if (targetTag !== "TEXTAREA" && !(e.ctrlKey || e.metaKey)) {
        e.preventDefault();
      }
    }
  };

  const handleFileChange = selected => {
    setFile(selected);
    setRotate(0);
    setFlipH(false);
    setFlipV(false);
    setTrimStart(0);
    setTrimEnd(0);
    setDuration(0);
    setSelectedFilter(null);
    if (selected) {
      // Generate a short idempotency key when a file is selected to help server-side dedup
      try {
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        setIdempotencyKey(key);
      } catch (err) {
        setIdempotencyKey(null);
      }
      try {
        const url = URL.createObjectURL(selected);
        setPreviewUrl(url);
      } catch (err) {
        console.error("[Preview] Error creating local preview:", err);
      }
    } else {
      setPreviewUrl("");
    }
  };

  const handleDrop = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]) {
      handleFileChange(ev.dataTransfer.files[0]);
    }
  };

  const handleDragOver = ev => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const [isDropActive, setIsDropActive] = useState(false);
  const handleDragEnter = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    setIsDropActive(true);
  };
  const handleDragLeave = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    setIsDropActive(false);
  };

  const applyTemplate = t => {
    if (!t || t === "none") return;
    // Lightweight template suggestions; these only change metadata
    const suggestions = {
      tiktok: {
        title: "New TikTok Clip",
        description: "Short entertaining content optimized for vertical feed #trending",
        hashtags: ["trending", "viral"],
      },
      "instagram-story": {
        title: "Story Post",
        description: "Share your moment - portrait format",
        hashtags: ["story", "moments"],
      },
      "facebook-feed": {
        title: "Facebook Post",
        description: "Great content for your feed",
        hashtags: ["social", "promotion"],
      },
      youtube: {
        title: "YouTube Video",
        description: "Full resolution horizontal video",
        hashtags: ["youtube", "video"],
      },
      thumbnail: {
        title: "Thumbnail",
        description: "Custom thumbnail for your link",
        hashtags: ["thumbnail"],
      },
    };
    const s = suggestions[t];
    if (s) {
      if (!title) setTitle(s.title);
      if (!description) setDescription(s.description);
    }
  };

  const togglePlatform = platform => {
    // If TikTok creator cannot post from third-party apps, prevent selecting TikTok tile
    if (platform === "tiktok" && tiktokCreatorInfo && tiktokCreatorInfo.can_post === false) {
      setError(
        "This TikTok account cannot post via third-party apps. Connect a different account or post manually."
      );
      return;
    }
    const cur = Array.isArray(extSelectedPlatforms) ? extSelectedPlatforms : selectedPlatforms;
    const updated = cur.includes(platform) ? cur.filter(p => p !== platform) : [...cur, platform];
    if (typeof extSetSelectedPlatforms === "function") {
      extSetSelectedPlatforms(updated);
    } else {
      setSelectedPlatforms(updated);
    }
  };

  // Return a lightweight icon (SVG) for a given platform name
  const getPlatformIcon = platform => {
    switch (platform) {
      case "youtube":
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="3" y="5" width="18" height="14" rx="4" fill="#FF0000" />
            <path d="M10 9l6 3-6 3V9z" fill="#fff" />
          </svg>
        );
      case "tiktok":
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 2v10.5C11.33 12.5 10.5 12 9.5 12 7 12 5 14 5 16.5S7 21 9.5 21 14 19 14 16.5V7h3V4h-5z"
              fill="#000"
            />
            <path d="M18 2v6h-2V3.9c0 .1-2 .1-2 0V4l-2-.5" fill="#25F4EE" />
          </svg>
        );
      case "instagram":
        return (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect x="3" y="3" width="18" height="18" rx="5" fill="#E1306C" />
            <circle cx="12" cy="12" r="4" fill="#fff" />
          </svg>
        );
      case "facebook":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="3" fill="#1877F2" />
            <path
              d="M14 7h-2c-.8 0-1 .4-1 1v2H14l-.5 2H11v6H9v-6H7v-2h2V8.5C9 6.6 10 5 12 5h2v2z"
              fill="#fff"
            />
          </svg>
        );
      case "twitter":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M23 3.5s-1 1.2-2 1.7c0 0-1.4-1-2 .4 0 0-.8 2 1 2.8 0 0-2.2-.2-3 1 0 0-1 1.8 1 3 0 0-3.4 0-4 1 0 0-1.2 2.4 2 3.2 0 0-4 .6-6-.5 0 0 .2 5 6.5 4.5 0 0 7 0 9-7 0 0 1.7-3.8-1.5-6.2z"
              fill="#1DA1F2"
            />
          </svg>
        );
      case "linkedin":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="#0A66C2" />
            <path
              d="M8 10H6v8h2v-8zM7 8a1 1 0 110-2 1 1 0 010 2zM18 16c0-3-2-3.5-2-3.5s0 1 0 3.5h2zM12 9H10v9h2v-4c0-1.6 2-1.7 2 0v4h2v-5c0-3-2-3.8-4-3.8z"
              fill="#fff"
            />
          </svg>
        );
      case "discord":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#495B8C"
              d="M19 2A2 2 0 0121 4v13a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h14z"
            />
          </svg>
        );
      case "reddit":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <circle cx="12" cy="11" r="8" fill="#FF4500" />
          </svg>
        );
      case "telegram":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M21 3L3 10l5 2 2 5 8-14z" fill="#37AEE2" />
          </svg>
        );
      case "pinterest":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#E60023"
              d="M12 2C6.5 2 2 6.5 2 12c0 3.8 2.4 7.1 5.9 8.4-.1-.7-.1-1.9 0-2.7.1-.6.6-3.8.6-3.8s-.2-.4-.2-1.1c0-1 .6-1.8 1.3-1.8.6 0 .9.4.9.9 0 .6-.4 1.5-.6 2.4-.2.7.4 1.3 1.1 1.3 1.3 0 2.5-1.3 3-2.1.8-1.2 1.2-2.7 1.2-4.1C17.1 5.3 14.1 3 10.4 3 7 3 4.2 5 4.2 8.1c0 1.6.7 2.7.7 2.7l-.2 1.1c0 .2-.2.6-.4.7C4 14 3.7 13.7 3.7 13.4 3.7 10 5 6.4 9.4 6.4c2.6 0 4.1 1.7 4.1 4 0 3.1-1.6 4.5-2.9 4.5-.9 0-1.4-.6-1 3.5 0 1.1-.1 1.9-.2 2.7 1.9.5 3.8-.2 4.8-1.9 1.5-2.5 1.8-6 1-8.4C18.6 6 17 3 13 3s-8 3-8 9c0 4.8 3.4 7.6 7 7.6 1.5 0 2.8-.1 4-.4.3-.8.5-1.8.5-2.9C17.9 15.1 16.6 14 16.6 14c-.8.9-1.8 1.4-2.9 1.4-1.6 0-2.6-1.4-2.6-3.2 0-1.5.9-2.4 1.9-2.4 1 0 1.8.7 1.8 1.7 0 1.1-.7 2.2-1.6 2.2-.4 0-.7-.2-.7-.6 0-.4.1-.9.3-1.2.3-.4 1.2-1.6 1.2-2.9 0-1.3-.9-2.6-3.1-2.6-3 0-5.1 3-5.1 6 0 1.5.3 2.6 1 3.5 1.1 1.5 3 1.2 3.8.6 1.4-1.1 2.2-4.3 2.2-6.6C18 6.8 15 4 12 4z"
            />
          </svg>
        );
      case "spotify":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="#1DB954" />
          </svg>
        );
      case "snapchat":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#FFFC00"
              d="M12 2s3.08.42 4 1.5C19 6.5 20 8 18 10s-6 4-6 4-3-1-6-4c-2-2 0-3.5 2-6.5C8.92 2.43 12 2 12 2z"
            />
          </svg>
        );
      default:
        return (
          <div
            style={{
              width: 20,
              height: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              background: "#eee",
            }}
          >
            {platform.charAt(0).toUpperCase()}
          </div>
        );
    }
  };

  // By default render a simplified view that only shows platform cards.
  // Clicking a card will set `focusedPlatform` and reveal the per-platform form.
  if (!focusedPlatform) {
    const platforms = [
      "youtube",
      "tiktok",
      "instagram",
      "facebook",
      "twitter",
      "linkedin",
      "reddit",
      "discord",
      "telegram",
      "pinterest",
      "spotify",
      "snapchat",
    ];

    return (
      <div className="content-upload-container">
        <div className="form-group">
          <label>🎯 Target Platforms</label>
          <div className="platform-grid">
            {platforms.map(p => {
              const disabled =
                p === "tiktok" && tiktokCreatorInfo && tiktokCreatorInfo.can_post === false;
              return (
                <div
                  key={p}
                  role="button"
                  tabIndex={0}
                  aria-label={p.charAt(0).toUpperCase() + p.slice(1)}
                  onClick={() => {
                    if (!disabled) {
                      setFocusedPlatform(p);
                      // If parent controls selected platforms (extSelectedPlatforms provided), do not override it.
                      if (typeof extSetSelectedPlatforms === "function")
                        extSetSelectedPlatforms([p]);
                      else if (!Array.isArray(extSelectedPlatforms)) setSelectedPlatforms([p]);
                    } else setError("This TikTok account cannot post via third-party apps.");
                  }}
                  onKeyDown={e => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      if (!disabled) {
                        setFocusedPlatform(p);
                        if (typeof extSetSelectedPlatforms === "function")
                          extSetSelectedPlatforms([p]);
                        else if (!Array.isArray(extSelectedPlatforms)) setSelectedPlatforms([p]);
                      } else setError("This TikTok account cannot post via third-party apps.");
                    }
                  }}
                  className={`platform-card ${disabled ? "disabled" : ""}`}
                >
                  <div className="platform-icon" aria-hidden="true">
                    {getPlatformIcon(p)}
                  </div>
                  <div className="platform-name">{p.charAt(0).toUpperCase() + p.slice(1)}</div>
                </div>
              );
            })}
          </div>
          {/* Inline expanded area for when parent provides a single selected platform */}
          {expandedPlatform && (
            <div style={{ marginTop: 12 }} className="expanded-platform-inline">
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {expandedPlatform.charAt(0).toUpperCase() + expandedPlatform.slice(1)} Options
              </div>
              {platformGuidelines[expandedPlatform] && (
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  {platformGuidelines[expandedPlatform].summary}
                </div>
              )}

              {/* Platform-specific small inputs for selected platforms (tests rely on these) */}
              {expandedPlatform === "discord" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    placeholder="Discord channel ID"
                    value={discordChannelId}
                    onChange={e => {
                      setDiscordChannelId(e.target.value);
                      if (typeof extSetPlatformOption === "function") {
                        extSetPlatformOption("discord", "channelId", e.target.value);
                      }
                    }}
                  />
                </div>
              )}

              {expandedPlatform === "tiktok" && (
                <div style={{ display: "grid", gap: 8 }} className="tiktok-expanded-inline">
                  <div style={{ fontSize: 12, color: "#666" }}>
                    Creator: {tiktokCreatorDisplayName || "Loading..."}
                  </div>
                  {type !== "video" && (
                    <div
                      role="status"
                      className="no-video-disclosure"
                      style={{ fontSize: 12, color: "#b66", marginBottom: 6 }}
                    >
                      This post doesn&apos;t contain a video. TikTok features like Duet and Stitch
                      require a video — upload one to enable them.
                    </div>
                  )}

                  {tiktokCreatorInfo && tiktokCreatorInfo.can_post === false && (
                    <div className="tiktok-disabled-banner" role="alert">
                      This TikTok account cannot publish via third-party apps right now. Please try
                      again later.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}{" "}
        </div>
      </div>
    );
  }

  // If a platform was focused, render only that platform's isolated form
  if (focusedPlatform) {
    const p = focusedPlatform;
    return (
      <div className="content-upload-container">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={() => setFocusedPlatform(null)}
            aria-label="Back to platforms"
          >
            ← Back
          </button>
          <h3 style={{ margin: 0 }}>Upload to {p.charAt(0).toUpperCase() + p.slice(1)}</h3>
        </div>
        {error && <div className="error-message">{error}</div>}

        <div className="form-group full-width">
          <label>{`Platform title ${p}`}</label>
          <div className="input-with-emoji">
            <input
              aria-label={`Platform title ${p}`}
              type="text"
              value={(perPlatformTitle && perPlatformTitle[p]) || ""}
              onChange={e =>
                setPerPlatformTitle(prev => ({ ...prev, [p]: sanitizeInput(e.target.value) }))
              }
              className="form-input"
              maxLength={100}
            />
            <button
              type="button"
              className="emoji-btn"
              onClick={() => openEmojiPicker(`platform-title-${p}`)}
            >
              😊
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>{`Platform file ${p}`}</label>
          <div
            className={`file-upload drop-zone ${isDropActive ? "dragging" : ""}`}
            data-testid="drop-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          >
            <input
              aria-label={`Platform file ${p}`}
              type="file"
              accept={type === "video" ? "video/*" : type === "audio" ? "audio/*" : "image/*"}
              onChange={e => handlePerPlatformFileChange(p, e.target.files[0])}
              className="form-file-input"
            />
            <div className="drop-help">Drop files here or click to browse</div>
            {perPlatformFile && perPlatformFile[p] && (
              <div className="file-info">
                Selected file: {perPlatformFile[p].name} (
                {(perPlatformFile[p].size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>
        </div>

        <div className="form-group">
          <label>🎨 Text Overlay (optional)</label>
          <div className="input-with-emoji">
            <input
              placeholder="Add overlay text..."
              value={overlayText}
              onChange={e => setOverlayText(e.target.value)}
              className="form-input"
            />
            <button
              className="emoji-btn"
              type="button"
              onClick={() => openEmojiPicker("overlay-text")}
            >
              😊
            </button>
          </div>
          <div className="overlay-controls">
            <select
              aria-label="Overlay position"
              className="form-select-small"
              value={overlayPosition}
              onChange={e => setOverlayPosition(e.target.value)}
            >
              <option value="top">⬆️ Top</option>
              <option value="center">⏺️ Center</option>
              <option value="bottom">⬇️ Bottom</option>
            </select>
            <input
              className="color-picker"
              title="Text color"
              type="color"
              value="#ffffff"
              readOnly
            />
            <select className="form-select-small" value={12} onChange={() => {}}>
              <option value="12">Small</option>
              <option value="16">Medium</option>
              <option value="24">Large</option>
              <option value="32">XL</option>
            </select>
          </div>
        </div>

        {/* Include TikTok-specific publish options in the focused per-platform view */}
        {p === "tiktok" && (
          <div
            className="form-group tiktok-options"
            style={{
              border: "1px solid #efeef0",
              padding: 12,
              borderRadius: 8,
              background: "#fbfbfc",
              marginTop: 12,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              TikTok Publish Options
            </label>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              Creator: {tiktokCreatorDisplayName || "Not available"}
              {tiktokCreatorInfo && typeof tiktokCreatorInfo.posting_remaining === "number" && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  Posting cap: {tiktokCreatorInfo.posting_cap_per_24h} per 24h • Remaining:{" "}
                  {tiktokCreatorInfo.posting_remaining}
                  {tiktokCreatorInfo.posting_remaining <= 0 && (
                    <div style={{ marginTop: 8, color: "#b91c1c", fontWeight: "bold" }}>
                      Posting cap reached — uploading to TikTok is currently disabled for this
                      account.
                    </div>
                  )}
                </div>
              )}
              {/* Show a clear disclosure when the selected content is not a video */}
              {type !== "video" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color: "#92400e",
                    background: "#fff7ed",
                    padding: "8px",
                    borderRadius: 6,
                    border: "1px solid #fed7aa",
                  }}
                  role="status"
                >
                  Video content is not present. TikTok-specific features (Duet / Stitch and other
                  video-only options) require a video to be selected.
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div>
                <label>Privacy (required)</label>
                <select
                  value={tiktokPrivacy}
                  onChange={e => setTiktokPrivacy(e.target.value)}
                  className="form-select"
                >
                  <option value="">Select privacy</option>
                  {(tiktokCreatorInfo && Array.isArray(tiktokCreatorInfo.privacy_level_options)
                    ? tiktokCreatorInfo.privacy_level_options
                    : ["EVERYONE", "FRIENDS", "SELF_ONLY"]
                  ).map(pv => (
                    <option
                      key={pv}
                      value={pv}
                      disabled={
                        tiktokCommercial && tiktokCommercial.brandedContent && pv === "SELF_ONLY"
                      }
                      title={
                        tiktokCommercial && tiktokCommercial.brandedContent && pv === "SELF_ONLY"
                          ? "Branded content visibility cannot be set to private."
                          : undefined
                      }
                    >
                      {pv}
                    </option>
                  ))}
                </select>
                {privacyAutoSwitched && (
                  <div style={{ fontSize: 12, color: "#b66", marginTop: 6 }}>
                    Branded content cannot be private — visibility has been changed to “EVERYONE”.
                  </div>
                )}
              </div>

              <div>
                <label>Interactions</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label
                    title={
                      tiktokInteractionDisabled.comments
                        ? "Comments disabled by creator"
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={!!tiktokInteractions.comments}
                      onChange={e =>
                        setTiktokInteractions(prev => ({ ...prev, comments: e.target.checked }))
                      }
                      disabled={tiktokInteractionDisabled.comments}
                      title={
                        tiktokInteractionDisabled.comments
                          ? "Comments disabled by creator"
                          : undefined
                      }
                    />{" "}
                    Comments
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!tiktokInteractions.duet}
                      onChange={e =>
                        setTiktokInteractions(prev => ({ ...prev, duet: e.target.checked }))
                      }
                      disabled={tiktokInteractionDisabled.duet}
                    />{" "}
                    Duet
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!tiktokInteractions.stitch}
                      onChange={e =>
                        setTiktokInteractions(prev => ({ ...prev, stitch: e.target.checked }))
                      }
                      disabled={tiktokInteractionDisabled.stitch}
                      title={
                        tiktokInteractionDisabled.stitch ? "Stitch disabled by creator" : undefined
                      }
                      aria-disabled={tiktokInteractionDisabled.stitch}
                    />{" "}
                    Stitch
                  </label>
                </div>
              </div>

              <div>
                <label>Commercial / Branded Content</label>
                <div
                  style={{ display: "flex", gap: 8, alignItems: "center", flexDirection: "column" }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!tiktokCommercial.isCommercial}
                      onChange={e =>
                        setTiktokCommercial(prev => ({ ...prev, isCommercial: e.target.checked }))
                      }
                    />{" "}
                    This content is commercial or promotional
                  </label>
                  {tiktokCommercial.isCommercial && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={!!tiktokCommercial.yourBrand}
                          onChange={e =>
                            setTiktokCommercial(prev => ({ ...prev, yourBrand: e.target.checked }))
                          }
                        />{" "}
                        Your Brand
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={!!tiktokCommercial.brandedContent}
                          onChange={e =>
                            setTiktokCommercial(prev => ({
                              ...prev,
                              brandedContent: e.target.checked,
                            }))
                          }
                        />{" "}
                        Branded Content
                      </label>
                    </div>
                  )}
                  {tiktokCommercial.isCommercial &&
                    !tiktokCommercial.yourBrand &&
                    !tiktokCommercial.brandedContent && (
                      <div
                        style={{ fontSize: 12, color: "#b66", marginTop: 6 }}
                        title="You need to indicate if your content promotes yourself, a third party, or both."
                      >
                        You need to indicate if your content promotes yourself, a third party, or
                        both.
                      </div>
                    )}
                </div>
              </div>

              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={tiktokAIGenerated}
                    onChange={e => setTiktokAIGenerated(e.target.checked)}
                  />{" "}
                  This content is AI-generated
                </label>
                <div
                  style={{
                    fontSize: 11,
                    color: "#666",
                    marginTop: 4,
                    paddingLeft: 24,
                    paddingBottom: 8,
                  }}
                >
                  Required by TikTok for AI-created or modified content.
                </div>
              </div>

              <div style={{ fontSize: 13 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={tiktokConsentChecked}
                    onChange={e => setTiktokConsentChecked(e.target.checked)}
                  />{" "}
                  {getTikTokDeclaration()}
                </label>
              </div>

              {tiktokCreatorInfo && tiktokCreatorInfo.max_video_post_duration_sec && (
                <div style={{ fontSize: 12, color: "#666" }}>
                  Max allowed video duration for this creator:{" "}
                  {tiktokCreatorInfo.max_video_post_duration_sec} seconds
                </div>
              )}
            </div>
          </div>
        )}

        {p === "spotify" && (
          <div className="form-group spotify-search-container" style={{ marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#1DB954" }}>
              Search Spotify Tracks & Podcasts
            </label>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Use this tool to find tracks or podcasts to add to your playlists or reference.
              Uploading original content is not supported here.
            </div>

            <SpotifyTrackSearch
              selectedTracks={
                Array.isArray(extSpotifySelectedTracks) ? extSpotifySelectedTracks : spotifyTracks
              }
              onChangeTracks={list => {
                if (typeof extSetSpotifySelectedTracks === "function")
                  extSetSpotifySelectedTracks(list);
                else setSpotifyTracks(list);
              }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: ".5rem", marginTop: ".5rem", flexWrap: "wrap" }}>
          <button
            aria-label="Preview Content"
            className="preview-button"
            type="button"
            disabled={
              isPreviewing ||
              (p === "tiktok" && tiktokCreatorInfo && tiktokCreatorInfo.can_post === false)
            }
            onClick={() => handlePlatformPreview(p)}
          >
            ⚡ Preview
          </button>
          <button
            aria-label="Upload Content"
            className="submit-button"
            type="button"
            disabled={
              isUploading ||
              (p === "tiktok" && !tiktokConsentChecked) ||
              (p === "tiktok" &&
                tiktokCommercial &&
                tiktokCommercial.isCommercial &&
                !tiktokCommercial.yourBrand &&
                !tiktokCommercial.brandedContent) ||
              (p === "tiktok" && tiktokCreatorInfo && tiktokCreatorInfo.can_post === false) ||
              (p === "tiktok" &&
                tiktokCreatorInfo &&
                typeof tiktokCreatorInfo.posting_remaining === "number" &&
                tiktokCreatorInfo.posting_remaining <= 0)
            }
            onClick={() => {
              if (p === "tiktok" && !tiktokConsentChecked) {
                setConfirmTargetPlatform(p);
                setShowConfirmPublishModal(true);
              } else {
                // If consent already given (or not a TikTok upload), proceed immediately
                handlePlatformUpload(p);
              }
            }}
          >
            🚀 Upload
          </button>
        </div>

        {perPlatformPreviews[p] && (
          <div style={{ marginTop: 12 }} className="preview-cards">
            {perPlatformPreviews[p].map((pv, idx) => (
              <div key={idx} className="preview-card">
                <h5>
                  {pv.platform
                    ? pv.platform.charAt(0).toUpperCase() + pv.platform.slice(1)
                    : "Preview"}
                </h5>
                <div
                  className={`platform-preview ${pv.platform ? `platform-${pv.platform}` : ""}`}
                  style={{ width: 200 }}
                >
                  {pv.mediaType === "video" ? (
                    <video
                      aria-label="Preview media"
                      src={pv.mediaUrl || pv.thumbnail}
                      controls
                      style={{ width: "100%", height: 320, objectFit: "cover" }}
                    />
                  ) : (
                    <img
                      aria-label="Preview media"
                      src={pv.thumbnail || DEFAULT_THUMBNAIL}
                      alt="Preview Thumbnail"
                      style={{ width: "100%", height: 320, objectFit: "cover" }}
                    />
                  )}
                </div>
                <div>
                  <strong>Title:</strong> {pv.title}
                </div>
                <div>
                  <strong>Description:</strong> {pv.description}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="edit-platform-btn"
                    onClick={() => openPreviewEdit(pv)}
                    aria-label={`Edit preview ${pv.platform || ""}`}
                  >
                    Edit Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Focused view preview edit modal */}
        <PreviewEditModal
          open={showPreviewEditModal}
          preview={previewToEdit}
          onClose={() => setShowPreviewEditModal(false)}
          onSave={handleSavePreviewEdits}
        />
      </div>
    );
  }

  // Continue with full form when not in simplified mode
  return (
    <div className="content-upload-container">
      <form
        onSubmit={handleSubmit}
        onKeyDown={handleFormKeyDown}
        className="content-upload-form"
        data-testid="content-upload-form"
      >
        <DraftManager onLoadDraft={handleLoadDraft} currentDraft={getCurrentDraft()} />

        {/* Show which creator/account will be used for platform uploads (e.g., TikTok nickname) */}
        {(() => {
          const currentUser = auth && auth.currentUser;
          const creatorName =
            tiktokCreatorInfo && (tiktokCreatorInfo.display_name || tiktokCreatorInfo.open_id)
              ? tiktokCreatorInfo.display_name || tiktokCreatorInfo.open_id
              : currentUser
                ? currentUser.displayName || currentUser.email || currentUser.uid
                : null;
          return (
            creatorName && (
              <div className="creator-badge" data-testid="creator-badge">
                <span style={{ opacity: 0.9 }}>👤 Posting as</span>
                <strong style={{ marginLeft: 8 }}>{escapeHtml(creatorName)}</strong>
              </div>
            )
          );
        })()}

        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label>Content Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className="form-select">
            <option value="video">Video</option>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
          </select>
        </div>
        <div className={`content-upload-grid ${file ? "has-file" : ""}`}>
          <div className="left-column">
            <div className="form-group">
              <label htmlFor="content-file-input">File</label>
              <div
                data-testid="drop-zone"
                className={`file-upload drop-zone ${isDropActive ? "dragging" : ""}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
              >
                <input
                  type="file"
                  id="content-file-input"
                  accept={type === "video" ? "video/*" : type === "audio" ? "audio/*" : "image/*"}
                  onChange={e => handleFileChange(e.target.files[0])}
                  required
                  className="form-file-input"
                />
                <div className="drop-help">Drop files here or click to browse</div>
                {file && (
                  <div className="file-info">
                    Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
              </div>
            </div>
          </div>
          {file && (
            <div className="form-group preview-area">
              <label>Live Preview</label>
              <div className="preview-wrapper">
                {type === "video" ? (
                  <video
                    ref={videoRef}
                    src={previewUrl}
                    controls
                    className="preview-video"
                    style={{ filter: selectedFilter?.css ? sanitizeCSS(selectedFilter.css) : "" }}
                    onLoadedMetadata={ev => {
                      const dur = ev.target.duration || 0;
                      setDuration(dur);
                      setTrimEnd(dur);
                    }}
                  />
                ) : type === "audio" ? (
                  <audio
                    src={previewUrl}
                    controls
                    style={{
                      width: "100%",
                      filter: selectedFilter?.css ? sanitizeCSS(selectedFilter.css) : "",
                    }}
                    onLoadedMetadata={ev => {
                      const dur = ev.target.duration || 0;
                      setDuration(dur);
                      setTrimEnd(dur);
                    }}
                  />
                ) : (
                  <img className="preview-image" src={previewUrl} alt="Content preview" />
                )}
              </div>
              {overlayText && (
                <div className={`preview-overlay ${overlayPosition}`}>
                  <div className="overlay-text">{overlayText}</div>
                </div>
              )}
              <div className="preview-controls">
                {type === "video" ? (
                  <div className="video-controls">
                    <div className="trim-row">
                      <label>
                        Trim Start:{" "}
                        <input
                          type="number"
                          min={0}
                          max={duration}
                          step="0.1"
                          value={trimStart}
                          onChange={e => setTrimStart(parseFloat(e.target.value) || 0)}
                        />{" "}
                        secs
                      </label>
                      <label>
                        Trim End:{" "}
                        <input
                          type="number"
                          min={0}
                          max={duration}
                          step="0.1"
                          value={trimEnd}
                          onChange={e => setTrimEnd(parseFloat(e.target.value) || duration)}
                        />{" "}
                        secs
                      </label>
                    </div>
                    <div className="range-row">
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.05"
                        value={trimStart}
                        onChange={e => setTrimStart(parseFloat(e.target.value))}
                      />
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.05"
                        value={trimEnd}
                        onChange={e => setTrimEnd(parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <div className="right-column">
            <div className="form-group">
              <label>Templates</label>
              <select
                value={template}
                onChange={e => setTemplate(e.target.value)}
                className="form-select"
              >
                <option value="none">No Template</option>
                <option value="tiktok">TikTok (9:16)</option>
                <option value="instagram-story">Instagram Story (9:16)</option>
                <option value="facebook-feed">Facebook Feed (4:5)</option>
                <option value="youtube">YouTube (16:9)</option>
                <option value="thumbnail">Platform Thumbnail</option>
              </select>
              {template !== "none" && (
                <div className="template-hint">
                  Template <strong>{template}</strong> will prefill recommended aspect ratio and
                  tags
                </div>
              )}
              {template !== "none" && (
                <button
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="apply-template-btn"
                >
                  Apply Template
                </button>
              )}
            </div>
            <BestTimeToPost selectedPlatforms={selectedPlatformsVal} />

            <div className="form-group">
              <label>🎯 Target Platforms</label>
              <div className="platform-grid">
                {[
                  "youtube",
                  "tiktok",
                  "instagram",
                  "facebook",
                  "twitter",
                  "linkedin",
                  "reddit",
                  "discord",
                  "telegram",
                  "pinterest",
                  "spotify",
                  "snapchat",
                ].map(p => {
                  const disabled =
                    p === "tiktok" && tiktokCreatorInfo && tiktokCreatorInfo.can_post === false;
                  return (
                    <div
                      key={p}
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandedPlatform === p}
                      aria-label={p.charAt(0).toUpperCase() + p.slice(1)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (!disabled) {
                            const nextExpand = expandedPlatform === p ? null : p;
                            setExpandedPlatform(nextExpand);
                            if (typeof extSetSelectedPlatforms === "function") {
                              const current = Array.isArray(extSelectedPlatforms)
                                ? extSelectedPlatforms
                                : [];
                              const isSel = current.includes(p);
                              extSetSelectedPlatforms(
                                isSel ? current.filter(x => x !== p) : [...current, p]
                              );
                            } else {
                              setSelectedPlatforms(prev => {
                                const curr = Array.isArray(prev) ? prev : [];
                                const isSel = curr.includes(p);
                                return isSel ? curr.filter(x => x !== p) : [...curr, p];
                              });
                            }
                          }
                        }
                      }}
                      className={`platform-card ${expandedPlatform === p ? "expanded" : ""} ${disabled ? "disabled" : ""}`}
                      onClick={() => {
                        if (!disabled) {
                          const nextExpand = expandedPlatform === p ? null : p;
                          setExpandedPlatform(nextExpand);
                          if (typeof extSetSelectedPlatforms === "function") {
                            const current = Array.isArray(extSelectedPlatforms)
                              ? extSelectedPlatforms
                              : [];
                            const isSel = current.includes(p);
                            extSetSelectedPlatforms(
                              isSel ? current.filter(x => x !== p) : [...current, p]
                            );
                          } else {
                            setSelectedPlatforms(prev => {
                              const curr = Array.isArray(prev) ? prev : [];
                              const isSel = curr.includes(p);
                              return isSel ? curr.filter(x => x !== p) : [...curr, p];
                            });
                          }
                        } else setError("This TikTok account cannot post via third-party apps.");
                      }}
                    >
                      <div className="platform-icon" aria-hidden="true">
                        {getPlatformIcon(p)}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                        }}
                      >
                        <div>
                          <div className="platform-name">
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </div>
                          {disabled ? (
                            <div
                              className="platform-guideline"
                              style={{ fontSize: 11, color: "#b66" }}
                            >
                              Cannot post via third-party apps
                            </div>
                          ) : (
                            platformGuidelines[p] && (
                              <div
                                className="platform-guideline"
                                style={{ fontSize: 11, color: "#6b7280" }}
                              >
                                {platformGuidelines[p].summary.replace(
                                  "dynamic",
                                  p === "tiktok" &&
                                    tiktokCreatorInfo &&
                                    tiktokCreatorInfo.max_video_post_duration_sec
                                    ? `${tiktokCreatorInfo.max_video_post_duration_sec}s`
                                    : ""
                                )}
                              </div>
                            )
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div
                            className="open-platform-indicator"
                            style={{ fontSize: 12, color: "#374151" }}
                          >
                            {expandedPlatform === p ? "Close" : "Open"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* Inline expanded area below grid to show per-platform options for the expandedPlatform */}
                {expandedPlatform && (
                  <div
                    className="platform-expanded"
                    style={{
                      marginTop: 12,
                      padding: 12,
                      border: "1px solid #eee",
                      borderRadius: 8,
                      background: "#fff",
                    }}
                  >
                    <h4 style={{ margin: "0 0 8px 0" }}>
                      {expandedPlatform.charAt(0).toUpperCase() + expandedPlatform.slice(1)} Options
                    </h4>
                    {platformGuidelines[expandedPlatform] && (
                      <div style={{ marginBottom: 8, fontSize: 13, color: "#374151" }}>
                        <strong>Quick Guidelines:</strong>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                          {platformGuidelines[expandedPlatform].summary.replace(
                            "dynamic",
                            expandedPlatform === "tiktok" &&
                              tiktokCreatorInfo &&
                              tiktokCreatorInfo.max_video_post_duration_sec
                              ? `${tiktokCreatorInfo.max_video_post_duration_sec}s`
                              : ""
                          )}
                        </div>
                        <ul style={{ marginTop: 8 }}>
                          {platformGuidelines[expandedPlatform].details.map((d, idx) => (
                            <li key={idx} style={{ fontSize: 13, color: "#374151" }}>
                              {d.replace(
                                "max duration",
                                expandedPlatform === "tiktok" &&
                                  tiktokCreatorInfo &&
                                  tiktokCreatorInfo.max_video_post_duration_sec
                                  ? `max: ${tiktokCreatorInfo.max_video_post_duration_sec}s`
                                  : d
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {/* Per-platform inputs: file, title, description (defaults to global if empty) */}
                    <div
                      className="per-platform-form"
                      style={{ marginTop: 8, display: "grid", gap: 8 }}
                    >
                      <label style={{ fontWeight: 700 }}>
                        Upload for{" "}
                        {expandedPlatform.charAt(0).toUpperCase() + expandedPlatform.slice(1)}
                      </label>
                      <input
                        aria-label={`Platform file ${expandedPlatform}`}
                        type="file"
                        onChange={e =>
                          handlePerPlatformFileChange(
                            expandedPlatform,
                            e.target.files && e.target.files[0]
                          )
                        }
                      />
                      <input
                        aria-label={`Platform title ${expandedPlatform}`}
                        placeholder="Title"
                        className="form-input"
                        value={perPlatformTitle[expandedPlatform] || title}
                        onChange={e =>
                          setPerPlatformTitle(prev => ({
                            ...prev,
                            [expandedPlatform]: e.target.value,
                          }))
                        }
                      />
                      <textarea
                        aria-label={`Platform description ${expandedPlatform}`}
                        placeholder="Description"
                        className="form-input"
                        value={perPlatformDescription[expandedPlatform] || description}
                        onChange={e =>
                          setPerPlatformDescription(prev => ({
                            ...prev,
                            [expandedPlatform]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    {expandedPlatform === "discord" && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            backgroundColor: "rgba(88, 101, 242, 0.1)",
                            padding: "8px",
                            borderRadius: "4px",
                            marginBottom: "8px",
                            fontSize: "12px",
                            color: "#5865F2",
                            border: "1px solid rgba(88, 101, 242, 0.2)",
                          }}
                        >
                          <strong>Link & Embed Mode:</strong> Shares content as a rich embed via
                          Webhook. Attachments are not uploaded directly to Discord.
                        </div>
                        <input
                          placeholder="Discord channel ID"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          }}
                          value={discordChannelId}
                          onChange={e => {
                            setDiscordChannelId(e.target.value);
                            if (typeof extSetPlatformOption === "function")
                              extSetPlatformOption("discord", "channelId", e.target.value);
                          }}
                        />
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <button
                        type="button"
                        className="preview-button"
                        onClick={() => handlePlatformPreview(expandedPlatform)}
                        disabled={
                          !((perPlatformFile && perPlatformFile[expandedPlatform]) || file) ||
                          perPlatformUploading[expandedPlatform]
                        }
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="quality-check-button"
                        onClick={() => handlePlatformQualityCheck(expandedPlatform)}
                        disabled={
                          perPlatformQuality[expandedPlatform] &&
                          perPlatformQuality[expandedPlatform].loading
                        }
                      >
                        Quality Check
                      </button>
                      <button
                        type="button"
                        className="submit-button"
                        onClick={() => handlePlatformUpload(expandedPlatform)}
                        disabled={
                          !((perPlatformFile && perPlatformFile[expandedPlatform]) || file) ||
                          perPlatformUploading[expandedPlatform] ||
                          (expandedPlatform === "tiktok" &&
                            tiktokCommercial &&
                            tiktokCommercial.isCommercial &&
                            !tiktokCommercial.yourBrand &&
                            !tiktokCommercial.brandedContent) ||
                          (expandedPlatform === "tiktok" && tiktokConsentChecked === false)
                        }
                      >
                        Upload to{" "}
                        {expandedPlatform.charAt(0).toUpperCase() + expandedPlatform.slice(1)}
                      </button>
                    </div>
                    {perPlatformPreviews[expandedPlatform] && (
                      <div style={{ marginTop: 8 }} className="preview-cards">
                        {perPlatformPreviews[expandedPlatform].map((p, idx) => (
                          <div
                            key={idx}
                            className="preview-card"
                            style={{
                              border: "1px solid #ccc",
                              borderRadius: 8,
                              padding: "1rem",
                              minWidth: 220,
                              maxWidth: 320,
                              background: "#f9fafb",
                            }}
                          >
                            <h5>
                              {p.platform
                                ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1)
                                : "Preview"}
                            </h5>
                            {p.mediaType === "video" ? (
                              <video
                                aria-label="Preview media"
                                src={p.mediaUrl || p.thumbnail}
                                controls
                                style={{
                                  width: "100%",
                                  height: 120,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                }}
                              />
                            ) : (
                              <img
                                aria-label="Preview media"
                                src={p.thumbnail || DEFAULT_THUMBNAIL}
                                alt="Preview Thumbnail"
                                style={{
                                  width: "100%",
                                  height: 120,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                }}
                              />
                            )}
                            <div>
                              <strong>Title:</strong> {p.title}
                            </div>
                            <div>
                              <strong>Description:</strong> {p.description}
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                className="edit-platform-btn"
                                onClick={() => openPreviewEdit(p)}
                                aria-label={`Edit preview ${p.platform || ""}`}
                              >
                                Edit Preview
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {perPlatformQuality[expandedPlatform] &&
                      perPlatformQuality[expandedPlatform].result && (
                        <div style={{ marginTop: 8 }} className="quality-check-mini">
                          Score: {perPlatformQuality[expandedPlatform].result.quality_score}/100
                        </div>
                      )}
                    {perPlatformUploadStatus[expandedPlatform] && (
                      <div
                        style={{ marginTop: 8, fontSize: 13, color: "#374151" }}
                        className="platform-upload-status"
                      >
                        {perPlatformUploadStatus[expandedPlatform]}
                      </div>
                    )}
                    {expandedPlatform === "telegram" && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            backgroundColor: "rgba(0, 136, 204, 0.1)",
                            padding: "8px",
                            borderRadius: "4px",
                            marginBottom: "8px",
                            fontSize: "12px",
                            color: "#0088cc",
                            border: "1px solid rgba(0, 136, 204, 0.2)",
                          }}
                        >
                          <strong>Native Host:</strong> Supports direct Video, Photo, and Text
                          messages to your chat/channel.
                        </div>
                        <input
                          placeholder="Telegram chat ID"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          }}
                          value={telegramChatId}
                          onChange={e => {
                            setTelegramChatId(e.target.value);
                            if (typeof extSetPlatformOption === "function")
                              extSetPlatformOption("telegram", "chatId", e.target.value);
                          }}
                        />
                      </div>
                    )}
                    {expandedPlatform === "reddit" && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            backgroundColor: "rgba(255, 69, 0, 0.1)",
                            padding: "8px",
                            borderRadius: "4px",
                            marginBottom: "8px",
                            fontSize: "12px",
                            color: "#FF4500",
                            border: "1px solid rgba(255, 69, 0, 0.2)",
                          }}
                        >
                          <strong>Link & Text Mode:</strong> Shares content as a URL link or
                          self-text post. Direct video hosting not supported.
                        </div>
                        <input
                          placeholder="Reddit subreddit"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          }}
                          value={redditSubreddit}
                          onChange={e => {
                            setRedditSubreddit(e.target.value);
                            if (typeof extSetPlatformOption === "function")
                              extSetPlatformOption("reddit", "subreddit", e.target.value);
                          }}
                        />
                      </div>
                    )}
                    {expandedPlatform === "linkedin" && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            backgroundColor: "rgba(0, 119, 181, 0.1)",
                            padding: "8px",
                            borderRadius: "4px",
                            marginBottom: "8px",
                            fontSize: "12px",
                            color: "#0077b5",
                            border: "1px solid rgba(0, 119, 181, 0.2)",
                          }}
                        >
                          <strong>Native Host:</strong> Supports direct Video and Image uploads.
                        </div>
                        <input
                          placeholder="LinkedIn Organization ID (optional)"
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                          }}
                          value={linkedinCompanyId}
                          onChange={e => {
                            setLinkedinCompanyId(e.target.value);
                            if (typeof extSetPlatformOption === "function")
                              extSetPlatformOption("linkedin", "companyId", e.target.value);
                          }}
                        />
                      </div>
                    )}
                    {expandedPlatform === "twitter" && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            backgroundColor: "rgba(29, 161, 242, 0.1)",
                            padding: "8px",
                            borderRadius: "4px",
                            marginBottom: "8px",
                            fontSize: "12px",
                            color: "#1DA1F2",
                            border: "1px solid rgba(29, 161, 242, 0.2)",
                          }}
                        >
                          <strong>Native Host:</strong> Supports direct Video and Image uploads.
                        </div>
                        <textarea
                          placeholder="Tweet text..."
                          style={{
                            width: "100%",
                            padding: "8px",
                            borderRadius: "4px",
                            border: "1px solid #ccc",
                            minHeight: "60px",
                            fontFamily: "inherit",
                          }}
                          value={twitterMessage}
                          onChange={e => {
                            setTwitterMessage(e.target.value);
                            if (typeof extSetPlatformOption === "function")
                              extSetPlatformOption("twitter", "message", e.target.value);
                          }}
                        />
                        <div
                          style={{
                            fontSize: 10,
                            textAlign: "right",
                            marginTop: 2,
                            color: twitterMessage.length > 280 ? "red" : "#666",
                          }}
                        >
                          {twitterMessage.length}/280
                        </div>
                      </div>
                    )}
                    {expandedPlatform === "tiktok" && (
                      <div
                        className="form-group tiktok-options"
                        style={{ display: "grid", gap: 8 }}
                      >
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Creator: {tiktokCreatorDisplayName || "Loading..."}
                        </div>
                        {type !== "video" && (
                          <div
                            role="status"
                            className="no-video-disclosure"
                            style={{ fontSize: 12, color: "#b66" }}
                          >
                            This post doesn&apos;t contain a video. TikTok features like Duet and
                            Stitch require a video — upload one to enable them.
                          </div>
                        )}
                        {tiktokCreatorInfo && tiktokCreatorInfo.can_post === false && (
                          <div className="tiktok-disabled-banner" role="alert">
                            This TikTok account cannot publish via third-party apps right now.
                            Please try again later.
                          </div>
                        )}
                        <div>
                          <label style={{ fontWeight: 700, color: "#000" }}>
                            Privacy (required)
                          </label>
                          <select
                            value={tiktokPrivacy}
                            onChange={e => setTiktokPrivacy(e.target.value)}
                            className="form-select privacy-select"
                            aria-label="TikTok privacy selection"
                          >
                            <option value="">Select privacy</option>
                            {(tiktokCreatorInfo &&
                            Array.isArray(tiktokCreatorInfo.privacy_level_options)
                              ? tiktokCreatorInfo.privacy_level_options
                              : ["EVERYONE", "FRIENDS", "SELF_ONLY"]
                            ).map(p => (
                              <option
                                key={p}
                                value={p}
                                disabled={
                                  tiktokCommercial &&
                                  tiktokCommercial.brandedContent &&
                                  p === "SELF_ONLY"
                                }
                                title={
                                  tiktokCommercial &&
                                  tiktokCommercial.brandedContent &&
                                  p === "SELF_ONLY"
                                    ? "Branded content visibility cannot be set to private."
                                    : undefined
                                }
                              >
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label>Interactions</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <label>
                              <input
                                type="checkbox"
                                checked={!!tiktokInteractions.comments}
                                onChange={e =>
                                  setTiktokInteractions(prev => ({
                                    ...prev,
                                    comments: e.target.checked,
                                  }))
                                }
                                disabled={tiktokInteractionDisabled.comments}
                                title={
                                  tiktokInteractionDisabled.comments
                                    ? "Comments disabled by creator"
                                    : undefined
                                }
                                aria-disabled={tiktokInteractionDisabled.comments}
                              />{" "}
                              Comments
                            </label>
                            {type === "video" && (
                              <>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={!!tiktokInteractions.duet}
                                    onChange={e =>
                                      setTiktokInteractions(prev => ({
                                        ...prev,
                                        duet: e.target.checked,
                                      }))
                                    }
                                    disabled={tiktokInteractionDisabled.duet}
                                    title={
                                      tiktokInteractionDisabled.duet
                                        ? "Duet disabled by creator"
                                        : undefined
                                    }
                                    aria-disabled={tiktokInteractionDisabled.duet}
                                  />{" "}
                                  Duet
                                </label>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={!!tiktokInteractions.stitch}
                                    onChange={e =>
                                      setTiktokInteractions(prev => ({
                                        ...prev,
                                        stitch: e.target.checked,
                                      }))
                                    }
                                    disabled={tiktokInteractionDisabled.stitch}
                                    title={
                                      tiktokInteractionDisabled.stitch
                                        ? "Stitch disabled by creator"
                                        : undefined
                                    }
                                    aria-disabled={tiktokInteractionDisabled.stitch}
                                  />{" "}
                                  Stitch
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                        {perPlatformPreviews["tiktok"] && (
                          <div style={{ marginTop: 8 }} className="preview-cards">
                            {perPlatformPreviews["tiktok"].map((p, idx) => (
                              <div
                                key={idx}
                                className="preview-card"
                                style={{
                                  border: "1px solid #ccc",
                                  borderRadius: 8,
                                  padding: "1rem",
                                  minWidth: 220,
                                  maxWidth: 320,
                                  background: "#f9fafb",
                                }}
                              >
                                <h5>
                                  {p.platform
                                    ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1)
                                    : "Preview"}
                                </h5>
                                {p.mediaType === "video" ? (
                                  <video
                                    aria-label="Preview media"
                                    src={p.mediaUrl || p.thumbnail}
                                    controls
                                    style={{
                                      width: "100%",
                                      height: 120,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                    }}
                                  />
                                ) : (
                                  <img
                                    aria-label="Preview media"
                                    src={p.thumbnail ? p.thumbnail : DEFAULT_THUMBNAIL}
                                    onError={e => {
                                      e.target.onerror = null;
                                      e.target.src = DEFAULT_THUMBNAIL;
                                    }}
                                    alt="Preview Thumbnail"
                                    style={{
                                      width: "100%",
                                      height: 120,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                    }}
                                  />
                                )}
                                <div>
                                  <strong>Title:</strong> {p.title}
                                </div>
                                <div>
                                  <strong>Description:</strong> {p.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {perPlatformQuality["tiktok"] && perPlatformQuality["tiktok"].result && (
                          <div style={{ marginTop: 8 }} className="quality-check-mini">
                            Score: {perPlatformQuality["tiktok"].result.quality_score}/100
                          </div>
                        )}
                      </div>
                    )}
                    {expandedPlatform === "spotify" && (
                      <div className="spotify-search-inline">
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 4,
                            color: "#1DB954",
                          }}
                        >
                          Search Spotify Catalog
                        </label>
                        <SpotifyTrackSearch
                          selectedTracks={
                            Array.isArray(extSpotifySelectedTracks)
                              ? extSpotifySelectedTracks
                              : spotifyTracks
                          }
                          onChangeTracks={list => {
                            if (typeof extSetSpotifySelectedTracks === "function")
                              extSetSpotifySelectedTracks(list);
                            else setSpotifyTracks(list);
                          }}
                        />
                      </div>
                    )}
                    {expandedPlatform === "snapchat" && (
                      <div className="snapchat-feature-inline">
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 700,
                            marginBottom: 4,
                            color: "#aa9900", // Darker yellow for readability
                          }}
                        >
                          Snapchat Promotions
                        </label>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#666",
                            background: "#fff",
                            padding: 8,
                            borderRadius: 6,
                            border: "1px solid #e5e5e5",
                          }}
                        >
                          Server-side publishing creates <strong>Ads</strong> (Dark Posts/Spotlight)
                          via Marketing API. To post standard user Stories, use the mobile app.
                        </div>
                      </div>
                    )}
                    {expandedPlatform === "youtube" && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <label>YouTube Visibility</label>
                        <select
                          id="youtube-visibility"
                          value={youtubeVisibility}
                          onChange={e => {
                            setYoutubeVisibility(e.target.value);
                            if (typeof extSetPlatformOption === "function")
                              extSetPlatformOption("youtube", "visibility", e.target.value);
                          }}
                          className="form-select"
                        >
                          <option value="public">Public</option>
                          <option value="unlisted">Unlisted</option>
                          <option value="private">Private</option>
                        </select>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            id="youtube-shorts"
                            type="checkbox"
                            checked={youtubeShorts}
                            onChange={e => {
                              setYoutubeShorts(e.target.checked);
                              if (typeof extSetPlatformOption === "function")
                                extSetPlatformOption("youtube", "shortsMode", e.target.checked);
                            }}
                          />{" "}
                          Shorts (short-form)
                        </label>
                        {perPlatformPreviews["youtube"] && (
                          <div style={{ marginTop: 8 }} className="preview-cards">
                            {perPlatformPreviews["youtube"].map((p, idx) => (
                              <div
                                key={idx}
                                className="preview-card"
                                style={{
                                  border: "1px solid #ccc",
                                  borderRadius: 8,
                                  padding: "1rem",
                                  minWidth: 220,
                                  maxWidth: 320,
                                  background: "#f9fafb",
                                }}
                              >
                                <h5>
                                  {p.platform
                                    ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1)
                                    : "Preview"}
                                </h5>
                                {p.mediaType === "video" ? (
                                  <video
                                    aria-label="Preview media"
                                    src={p.mediaUrl || p.thumbnail}
                                    controls
                                    style={{
                                      width: "100%",
                                      height: 120,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                    }}
                                  />
                                ) : (
                                  <img
                                    aria-label="Preview media"
                                    src={p.thumbnail ? p.thumbnail : DEFAULT_THUMBNAIL}
                                    onError={e => {
                                      e.target.onerror = null;
                                      e.target.src = DEFAULT_THUMBNAIL;
                                    }}
                                    alt="Preview Thumbnail"
                                    style={{
                                      width: "100%",
                                      height: 120,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                    }}
                                  />
                                )}
                                <div>
                                  <strong>Title:</strong> {p.title}
                                </div>
                                <div>
                                  <strong>Description:</strong> {p.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {perPlatformQuality["youtube"] && perPlatformQuality["youtube"].result && (
                          <div style={{ marginTop: 8 }} className="quality-check-mini">
                            Score: {perPlatformQuality["youtube"].result.quality_score}/100
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Per-platform options are also available here when a platform is selected */}
            {selectedPlatformsVal.includes("discord") && (
              <div className="form-group">
                <label>Discord Channel ID</label>
                <input
                  placeholder="Discord channel ID"
                  value={discordChannelId}
                  onChange={e => {
                    setDiscordChannelId(e.target.value);
                    if (typeof extSetPlatformOption === "function")
                      extSetPlatformOption("discord", "channelId", e.target.value);
                  }}
                  className="form-input"
                />
              </div>
            )}
            {selectedPlatformsVal.includes("telegram") && (
              <div className="form-group">
                <label>Telegram Chat ID</label>
                <input
                  placeholder="Telegram chat ID"
                  value={telegramChatId}
                  onChange={e => {
                    setTelegramChatId(e.target.value);
                    if (typeof extSetPlatformOption === "function")
                      extSetPlatformOption("telegram", "chatId", e.target.value);
                  }}
                  className="form-input"
                />
              </div>
            )}
            {selectedPlatformsVal.includes("reddit") && (
              <div className="form-group">
                <label>Reddit Subreddit</label>
                <input
                  placeholder="Reddit subreddit"
                  value={redditSubreddit}
                  onChange={e => {
                    setRedditSubreddit(e.target.value);
                    if (typeof extSetPlatformOption === "function")
                      extSetPlatformOption("reddit", "subreddit", e.target.value);
                  }}
                  className="form-input"
                />
              </div>
            )}
            {selectedPlatformsVal.includes("linkedin") && (
              <div className="form-group">
                <label>LinkedIn Organization ID</label>
                <input
                  placeholder="LinkedIn organization/company ID"
                  value={linkedinCompanyId}
                  onChange={e => {
                    setLinkedinCompanyId(e.target.value);
                    if (typeof extSetPlatformOption === "function")
                      extSetPlatformOption("linkedin", "companyId", e.target.value);
                  }}
                  className="form-input"
                />
              </div>
            )}
            {selectedPlatformsVal.includes("twitter") && (
              <div className="form-group">
                <label>Twitter Message (optional)</label>
                <input
                  placeholder="Twitter message (optional)"
                  value={twitterMessage}
                  onChange={e => {
                    setTwitterMessage(e.target.value);
                    if (typeof extSetPlatformOption === "function")
                      extSetPlatformOption("twitter", "message", e.target.value);
                  }}
                  className="form-input"
                />
              </div>
            )}
            {/* TikTok-specific publish options required for Direct Post API compliance */}
            {selectedPlatformsVal.includes("tiktok") && (
              <div
                className="form-group tiktok-options"
                style={{
                  border: "1px solid #efeef0",
                  padding: 12,
                  borderRadius: 8,
                  background: "#fbfbfc",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  TikTok Publish Options
                </label>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                  Creator: {tiktokCreatorDisplayName || "Loading..."}
                </div>
                {type !== "video" && (
                  <div
                    role="status"
                    className="no-video-disclosure"
                    style={{ fontSize: 12, color: "#b66", marginBottom: 8 }}
                  >
                    This post doesn&apos;t contain a video. TikTok features like Duet and Stitch
                    require a video — upload one to enable them.
                  </div>
                )}
                <div style={{ display: "grid", gap: 8 }}>
                  <div>
                    <label>Privacy (required)</label>
                    <select
                      value={tiktokPrivacy}
                      onChange={e => setTiktokPrivacy(e.target.value)}
                      className="form-select"
                    >
                      <option value="">Select privacy</option>
                      {(tiktokCreatorInfo && Array.isArray(tiktokCreatorInfo.privacy_level_options)
                        ? tiktokCreatorInfo.privacy_level_options
                        : ["EVERYONE", "FRIENDS", "SELF_ONLY"]
                      ).map(p => (
                        <option
                          key={p}
                          value={p}
                          disabled={
                            tiktokCommercial && tiktokCommercial.brandedContent && p === "SELF_ONLY"
                          }
                          title={
                            tiktokCommercial && tiktokCommercial.brandedContent && p === "SELF_ONLY"
                              ? "Branded content visibility cannot be set to private."
                              : undefined
                          }
                        >
                          {p}
                        </option>
                      ))}
                    </select>
                    {privacyAutoSwitched && (
                      <div style={{ fontSize: 12, color: "#b66", marginTop: 6 }}>
                        Branded content cannot be private — visibility has been changed to
                        &apos;EVERYONE&apos;.
                      </div>
                    )}
                  </div>
                  <div>
                    <label>Interactions</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <label>
                        <input
                          type="checkbox"
                          checked={!!tiktokInteractions.comments}
                          onChange={e =>
                            setTiktokInteractions(prev => ({ ...prev, comments: e.target.checked }))
                          }
                          disabled={tiktokInteractionDisabled.comments}
                        />{" "}
                        Comments
                      </label>
                      {type === "video" && (
                        <>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!tiktokInteractions.duet}
                              onChange={e =>
                                setTiktokInteractions(prev => ({ ...prev, duet: e.target.checked }))
                              }
                              disabled={tiktokInteractionDisabled.duet}
                            />{" "}
                            Duet
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!tiktokInteractions.stitch}
                              onChange={e =>
                                setTiktokInteractions(prev => ({
                                  ...prev,
                                  stitch: e.target.checked,
                                }))
                              }
                              disabled={tiktokInteractionDisabled.stitch}
                              title={
                                tiktokInteractionDisabled.stitch
                                  ? "Stitch disabled by creator"
                                  : undefined
                              }
                              aria-disabled={tiktokInteractionDisabled.stitch}
                            />{" "}
                            Stitch
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <label>Commercial / Branded Content</label>
                    <div style={{ fontSize: 13, fontStyle: "italic", color: "#666" }}>
                      Moved to Platform Settings below description.
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={tiktokAIGenerated}
                        onChange={e => setTiktokAIGenerated(e.target.checked)}
                      />{" "}
                      This content is AI-generated
                    </label>
                  </div>
                  {tiktokCreatorInfo && tiktokCreatorInfo.max_video_post_duration_sec && (
                    <div style={{ fontSize: 12, color: "#666" }}>
                      Max allowed video duration for this creator:{" "}
                      {tiktokCreatorInfo.max_video_post_duration_sec} seconds
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="form-group full-width">
          <label htmlFor="content-title">Title</label>
          <div className="input-with-emoji">
            <input
              id="content-title"
              ref={titleInputRef}
              type="text"
              placeholder="✨ Enter catchy title..."
              value={title}
              required
              onChange={e => {
                // Security: Use centralized sanitization function
                setTitle(sanitizeInput(e.target.value));
              }}
              className="form-input"
              maxLength={100}
            />
            <button type="button" className="emoji-btn" onClick={() => openEmojiPicker("title")}>
              😊
            </button>
          </div>
          <div className="char-count">{title.length}/100</div>
        </div>

        <div className="form-group full-width">
          <label htmlFor="content-description">Description</label>
          <div className="input-with-emoji">
            <textarea
              id="content-description"
              ref={descInputRef}
              placeholder="📝 Describe your content..."
              value={description}
              required
              onChange={e => {
                // Security: Use centralized sanitization function
                setDescription(sanitizeInput(e.target.value));
              }}
              className="form-textarea"
              rows={4}
              maxLength={500}
            />
            <button
              type="button"
              className="emoji-btn"
              onClick={() => openEmojiPicker("description")}
            >
              😊
            </button>
          </div>
          <div className="char-count">{description.length}/500</div>
        </div>

        {hashtags.length > 0 && (
          <div className="selected-hashtags">
            {hashtags.map((tag, idx) => (
              <span key={idx} className="hashtag-badge">
                #{tag}
                <button type="button" onClick={() => removeHashtag(tag)} className="remove-hashtag">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <HashtagSuggestions
          contentType={type}
          title={title}
          description={description}
          onAddHashtag={handleAddHashtag}
        />

        {/* Platform Specific Overrides */}
        <PlatformSettingsOverride
          selectedPlatforms={selectedPlatformsVal}
          // TikTok
          tiktokCommercial={tiktokCommercial}
          setTiktokCommercial={setTiktokCommercial}
          tiktokDisclosure={tiktokDisclosure}
          setTiktokDisclosure={setTiktokDisclosure}
          tiktokConsentChecked={tiktokConsentChecked}
          setTiktokConsentChecked={setTiktokConsentChecked}
          tiktokCreatorInfo={tiktokCreatorInfo}
          getTikTokDeclaration={getTikTokDeclaration}
          // YouTube
          youtubeSettings={youtubeSettings}
          setYoutubeSettings={setYoutubeSettings}
          // Instagram
          instagramSettings={instagramSettings}
          setInstagramSettings={setInstagramSettings}
          // Twitter
          twitterSettings={twitterSettings}
          setTwitterSettings={setTwitterSettings}
          // LinkedIn
          linkedinSettings={linkedinSettings}
          setLinkedinSettings={setLinkedinSettings}
          // New Platforms
          snapchatSettings={snapchatSettings}
          setSnapchatSettings={setSnapchatSettings}
          redditSettings={redditSettings}
          setRedditSettings={setRedditSettings}
          pinterestSettings={pinterestSettings}
          setPinterestSettings={setPinterestSettings}
          discordSettings={discordSettings}
          setDiscordSettings={setDiscordSettings}
          telegramSettings={telegramSettings}
          setTelegramSettings={setTelegramSettings}
          spotifySettings={spotifySettings}
          setSpotifySettings={setSpotifySettings}
        />

        <div className="form-group">
          <label>🎨 Text Overlay (optional)</label>
          <div className="input-with-emoji">
            <input
              placeholder="Add overlay text..."
              value={overlayText}
              onChange={e => {
                // Security: Use centralized sanitization function
                setOverlayText(sanitizeInput(e.target.value));
              }}
              className="form-input"
            />
            <button type="button" className="emoji-btn" onClick={() => openEmojiPicker("overlay")}>
              😊
            </button>
          </div>
          <div className="overlay-controls">
            <select
              aria-label="Overlay position"
              value={overlayPosition}
              onChange={e => setOverlayPosition(e.target.value)}
              className="form-select-small"
            >
              <option value="top">⬆️ Top</option>
              <option value="center">⏺️ Center</option>
              <option value="bottom">⬇️ Bottom</option>
            </select>
            <input
              type="color"
              value={textStyles.color}
              onChange={e => setTextStyles({ ...textStyles, color: e.target.value })}
              className="color-picker"
              title="Text color"
            />
            <select
              value={textStyles.fontSize}
              onChange={e => setTextStyles({ ...textStyles, fontSize: parseInt(e.target.value) })}
              className="form-select-small"
            >
              <option value={12}>Small</option>
              <option value={16}>Medium</option>
              <option value={24}>Large</option>
              <option value={32}>XL</option>
            </select>
          </div>
        </div>

        {file && type === "image" && previewUrl && (
          <FilterEffects
            imageUrl={previewUrl}
            onApplyFilter={filter => setSelectedFilter(filter)}
          />
        )}

        {/* Pinterest options (board selection + note) */}
        <div className="form-group">
          <label>Pinterest Options (optional)</label>
          <div style={{ display: "grid", gap: ".5rem" }}>
            {pinterestBoards && pinterestBoards.length > 0 ? (
              <select
                value={pinterestBoard}
                onChange={e => {
                  setPinterestBoard(e.target.value);
                  if (typeof extSetPlatformOption === "function")
                    extSetPlatformOption("pinterest", "boardId", e.target.value);
                }}
                style={{ padding: ".5rem", borderRadius: 8 }}
              >
                <option value="">Select a board</option>
                {pinterestBoards.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Pinterest board id (or leave blank)"
                value={pinterestBoard}
                onChange={e => {
                  setPinterestBoard(e.target.value);
                  if (typeof extSetPlatformOption === "function")
                    extSetPlatformOption("pinterest", "boardId", e.target.value);
                }}
                style={{ padding: ".5rem", borderRadius: 8 }}
              />
            )}
            <input
              placeholder="Pin note (optional)"
              value={pinterestNote}
              onChange={e => {
                setPinterestNote(e.target.value);
                if (typeof extSetPlatformOption === "function")
                  extSetPlatformOption("pinterest", "note", e.target.value);
              }}
              style={{ padding: ".5rem", borderRadius: 8 }}
            />
          </div>
        </div>
        {/* Spotify track selection - removed from main flow to avoid duplication with card. */}
        {/* <div className="form-group">
          <label>Spotify Tracks to Add (optional)</label>
          <SpotifyTrackSearch
            selectedTracks={
              Array.isArray(extSpotifySelectedTracks) ? extSpotifySelectedTracks : spotifyTracks
            }
            onChangeTracks={list => {
              if (typeof extSetSpotifySelectedTracks === "function")
                extSetSpotifySelectedTracks(list);
              else setSpotifyTracks(list);
            }}
          />
        </div> */}
        <div className="form-group">
          <label>Spotify Playlist (optional)</label>
          <div style={{ display: "grid", gap: 8 }}>
            {spotifyPlaylists && spotifyPlaylists.length > 0 ? (
              <select
                value={spotifyPlaylistId}
                onChange={e => {
                  setSpotifyPlaylistId(e.target.value);
                  if (typeof extSetPlatformOption === "function")
                    extSetPlatformOption("spotify", "playlistId", e.target.value);
                }}
                style={{ padding: ".5rem", borderRadius: 8 }}
              >
                <option value="">Select existing playlist</option>
                {spotifyPlaylists.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                placeholder="Existing playlist id (optional)"
                value={spotifyPlaylistId}
                onChange={e => {
                  setSpotifyPlaylistId(e.target.value);
                  if (typeof extSetPlatformOption === "function")
                    extSetPlatformOption("spotify", "playlistId", e.target.value);
                }}
                style={{ padding: ".5rem", borderRadius: 8 }}
              />
            )}
            <input
              placeholder="Or create new playlist name (optional)"
              value={spotifyPlaylistName}
              onChange={e => {
                setSpotifyPlaylistName(e.target.value);
                if (typeof extSetPlatformOption === "function")
                  extSetPlatformOption("spotify", "name", e.target.value);
              }}
              style={{ padding: ".5rem", borderRadius: 8 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: ".5rem", marginTop: ".5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={
              isUploading ||
              isPreviewing ||
              (selectedPlatformsVal.includes("tiktok") &&
                tiktokCreatorInfo &&
                tiktokCreatorInfo.can_post === false)
            }
            className="preview-button"
            onClick={handlePreview}
            title={
              selectedPlatformsVal.includes("tiktok") &&
              tiktokCreatorInfo &&
              tiktokCreatorInfo.can_post === false
                ? "Preview disabled: creator account cannot publish right now"
                : "Preview (Ctrl+P)"
            }
            aria-label="Preview Content"
          >
            {isPreviewing ? (
              <>
                <span className="loading-spinner"></span> Generating Preview...
              </>
            ) : (
              <>⚡ Preview</>
            )}
          </button>
          <button
            type="button"
            disabled={isUploading}
            className="quality-check-button"
            onClick={handleQualityCheck}
            title="Check content quality"
          >
            ✨ Quality Check
          </button>
          <button
            type="button"
            disabled={
              isUploading ||
              (selectedPlatformsVal.includes("tiktok") && !tiktokConsentChecked) ||
              (selectedPlatformsVal.includes("tiktok") &&
                tiktokCommercial &&
                tiktokCommercial.isCommercial &&
                !tiktokCommercial.yourBrand &&
                !tiktokCommercial.brandedContent) ||
              (selectedPlatformsVal.includes("tiktok") &&
                tiktokCreatorInfo &&
                tiktokCreatorInfo.can_post === false)
            }
            className="submit-button"
            title={
              selectedPlatformsVal.includes("tiktok") &&
              tiktokCreatorInfo &&
              tiktokCreatorInfo.can_post === false
                ? "Upload disabled: creator account cannot publish right now"
                : "Upload (Ctrl+Enter)"
            }
            aria-label="Upload Content"
            onClick={e => {
              e.preventDefault();
              setShowConfirmPublishModal(true);
            }}
          >
            {isUploading ? (
              <>
                <span className="loading-spinner"></span>
                Uploading...
              </>
            ) : (
              <>🚀 Upload</>
            )}
          </button>
        </div>

        <div className="keyboard-shortcuts">
          <span>⌨️ Shortcuts:</span>
          <span className="shortcut-item">Ctrl+Enter = Upload</span>
          <span className="shortcut-item">Ctrl+P = Preview</span>
          <span className="shortcut-item">Ctrl+S = Save Draft</span>
        </div>
        {showCropper && previewUrl && (
          <ImageCropper
            imageUrl={previewUrl}
            onChangeCrop={rect => {
              setCropMeta(rect);
              setShowCropper(false);
            }}
            onClose={() => setShowCropper(false)}
          />
        )}

        {showEmojiPicker && (
          <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
        )}

        {showProgress && (
          <ProgressIndicator
            progress={uploadProgress}
            status={uploadStatus}
            fileName={file?.name}
          />
        )}
        {/* Render quality check results */}
        {qualityScore !== null && (
          <div
            className="quality-check-results"
            style={{
              marginTop: "1rem",
              padding: "1rem",
              border: "1px solid #e0e0e0",
              borderRadius: 8,
              background: "#f8f8fa",
            }}
          >
            <strong>Quality Score:</strong> {qualityScore} / 100
            <br />
            {qualityFeedback.length > 0 && (
              <div style={{ marginTop: "0.5rem" }}>
                <strong>Feedback:</strong>
                <ul>
                  {qualityFeedback.map((fb, idx) => (
                    <li key={idx}>{fb}</li>
                  ))}
                </ul>
              </div>
            )}
            {/* Show enhancement suggestions if available and score is low */}
            {enhancedSuggestions && (
              <div
                style={{
                  marginTop: "1rem",
                  background: "#fffbe6",
                  padding: "1rem",
                  borderRadius: 6,
                  border: "1px solid #ffe58f",
                }}
              >
                <strong>Suggested Improvements:</strong>
                {/* Support multiple enhanced shapes: prefer title/description but fall back to structured suggestions */}
                {enhancedSuggestions.title || enhancedSuggestions.description ? (
                  <>
                    <div>
                      <b>Title:</b> {enhancedSuggestions.title}
                    </div>
                    <div>
                      <b>Description:</b> {enhancedSuggestions.description}
                    </div>
                    <button
                      type="button"
                      style={{ marginTop: "0.5rem" }}
                      className="apply-enhancements-btn"
                      onClick={() => {
                        if (enhancedSuggestions.title) setTitle(enhancedSuggestions.title);
                        if (enhancedSuggestions.description)
                          setDescription(enhancedSuggestions.description);
                        setEnhancedSuggestions(null);
                      }}
                    >
                      Apply Suggestions
                    </button>
                  </>
                ) : enhancedSuggestions.original ? (
                  <div>
                    <div>
                      <b>Original:</b>
                      <pre style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(enhancedSuggestions.original, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <b>Suggestions:</b>
                      <pre style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(enhancedSuggestions.suggestions, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <b>Improvements:</b>
                      <pre style={{ whiteSpace: "pre-wrap" }}>
                        {JSON.stringify(enhancedSuggestions.improvements, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div>Suggested improvements available.</div>
                )}
              </div>
            )}
          </div>
        )}
      </form>
      {/* Render previews if available */}
      {previews && previews.length > 0 && (
        <div className="content-preview-section">
          <h4>Platform Previews</h4>
          <div className="preview-cards" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {previews.map((p, idx) => (
              <div
                key={idx}
                className="preview-card"
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: "1rem",
                  minWidth: 220,
                  maxWidth: 320,
                  background: "#f9fafb",
                }}
              >
                <h5>
                  {p.platform
                    ? p.platform.charAt(0).toUpperCase() + p.platform.slice(1)
                    : "Preview"}
                </h5>
                <img
                  src={p.thumbnail ? p.thumbnail : DEFAULT_THUMBNAIL}
                  onError={e => {
                    e.target.onerror = null;
                    e.target.src = DEFAULT_THUMBNAIL;
                  }}
                  alt="Preview Thumbnail"
                  style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }}
                />
                <div>
                  <strong>Title:</strong>{" "}
                  {(() => {
                    const t = p.title;
                    if (t === null || typeof t === "undefined") return "";
                    if (typeof t === "string") return t;
                    if (typeof t === "number") return String(t);
                    if (Array.isArray(t)) return t.join(" ");
                    if (typeof t === "object")
                      return t.original || t.text || t.title || JSON.stringify(t);
                    return String(t);
                  })()}
                </div>
                <div>
                  <strong>Description:</strong>{" "}
                  {(() => {
                    const d = p.description;
                    if (d === null || typeof d === "undefined") return "";
                    if (typeof d === "string") return d;
                    if (typeof d === "number") return String(d);
                    if (Array.isArray(d)) return d.join(" ");
                    if (typeof d === "object") return d.text || d.description || JSON.stringify(d);
                    return String(d);
                  })()}
                </div>
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="edit-platform-btn"
                    onClick={() => openPreviewEdit(p)}
                    aria-label={`Edit preview ${p.platform || ""}`}
                  >
                    Edit Preview
                  </button>
                </div>
                {p.caption && (
                  <div>
                    <strong>Caption:</strong> {p.caption}
                  </div>
                )}
                {Array.isArray(p.hashtags) && p.hashtags.length > 0 && (
                  <div>
                    <strong>Hashtags:</strong> {p.hashtags.map(h => `#${h}`).join(" ")}
                  </div>
                )}
                {p.sound && (
                  <div>
                    <strong>Sound:</strong> {p.sound}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global modal components */}
      <PreviewEditModal
        open={showPreviewEditModal}
        preview={previewToEdit}
        onClose={() => setShowPreviewEditModal(false)}
        onSave={handleSavePreviewEdits}
      />

      <ConfirmPublishModal
        open={showConfirmPublishModal}
        platforms={selectedPlatformsVal}
        title={title}
        description={description}
        hashtags={hashtags}
        tiktokConsentChecked={tiktokConsentChecked}
        setTiktokConsentChecked={setTiktokConsentChecked}
        onClose={() => setShowConfirmPublishModal(false)}
        onConfirm={submitFromConfirmed}
      />
    </div>
  );
}

export default ContentUploadForm;
