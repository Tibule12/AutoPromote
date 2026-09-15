// UnifiedPublisher.js
// The "Command Center" for cross-platform publishing.
// Wraps existing platform forms and delegates upload to App.js

import React, { useState, useEffect } from "react";
import "./UnifiedPublisher.css";
// Ensure platform form styles are loaded
import "../../components/PlatformForms/PlatformForms.css";

// --- Config / Services ---
import { API_ENDPOINTS } from "../../config";
import { auth } from "../../firebaseClient";
import toast from "react-hot-toast";

// --- Hooks ---
import { usePublishingState } from "./hooks/usePublishingState";
import { useMediaProcessor } from "./hooks/useMediaProcessor";
import { sanitizeUrl } from "../../utils/security";
import { withWorkspaceHeaders } from "../../utils/workspace";
import {
  STORAGE_UPLOAD_LIMIT_MB,
  uploadSourceFileViaBackend,
} from "../../utils/sourceUpload";

// --- Components ---
import TikTokForm from "../../components/PlatformForms/TikTokForm";
import YouTubeForm from "../../components/PlatformForms/YouTubeForm";
import InstagramForm from "../../components/PlatformForms/InstagramForm";
import FacebookForm from "../../components/PlatformForms/FacebookForm";
import LinkedInForm from "../../components/PlatformForms/LinkedInForm";
import RedditForm from "../../components/PlatformForms/RedditForm";
import BestTimeToPost from "../../components/BestTimeToPost";
import VideoEditor from "../../components/VideoEditor";
import ImageCropper from "../../components/ImageCropper";
import PayPalSubscriptionPanel from "../../components/PayPalSubscriptionPanel";
import { SafeImage, SafeVideo } from "../../components/SafeMedia";

// --- New Features ---

// --- Helpers ---
import { PlatformPreview } from "./components/PlatformPreview";
import {
  getPlatformName,
  DEFAULT_SELECTED_PLATFORMS,
  buildMediaMeta,
  hasMeaningfulMediaMeta,
  getBrowserPreviewFailureMessage,
  normalizeEditedAsset,
  buildStructuredUploadError,
  EXPECTED_PUBLISH_BLOCK_CODES,
  formatMonthLabel,
  buildClientUploadError,
  buildTikTokCaption,
  DateTimeSplitControl,
  buildPlatformScheduleTimes,
  normalizeTikTokCreatorInfo,
  normalizeYouTubeCreatorInfo,
  normalizeLinkedInCreatorInfo,
  normalizeRedditCreatorInfo,
  normalizeUpgradePlanId,
  fetchPlatformStatusSnapshot,
} from "./utils/publishingUtils";

const UnifiedPublisher = ({ onUpload, initialFile, embedded = false }) => {
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
    customPlatformSchedule,
    setCustomPlatformSchedule,
    platformScheduleTimes,
    updatePlatformScheduleTime,

    selectedPlatforms,
    togglePlatform,
    updatePlatformData,
    getPlatformEffectiveData,
    platformData,
    resetPublishingState,
  } = usePublishingState(DEFAULT_SELECTED_PLATFORMS); // Default selection
  const [focusedPlatform, setFocusedPlatform] = useState(DEFAULT_SELECTED_PLATFORMS[0] || "tiktok");
  const [workflowStep, setWorkflowStep] = useState(initialFile ? 2 : 0);
  const [publishTiming, setPublishTiming] = useState(scheduledTime ? "schedule" : "now");

  useEffect(() => {
    if (!selectedPlatforms.length) return;
    if (!selectedPlatforms.includes(focusedPlatform)) {
      setFocusedPlatform(selectedPlatforms[0]);
    }
  }, [focusedPlatform, selectedPlatforms]);

  // Handle Initial File
  useEffect(() => {
    if (initialFile) {
      setGlobalFile(initialFile);
      if (initialFile.suggestedTitle) setGlobalTitle(initialFile.suggestedTitle);
      if (initialFile.suggestedDescription) setGlobalDescription(initialFile.suggestedDescription);
      setWorkflowStep(2);
      toast.success(
        initialFile.workflowAction === "find-viral-clips"
          ? "Loaded the selected viral clip. Proceed to publish."
          : "Loaded generated video! Proceed to publish."
      );
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
              headers: withWorkspaceHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
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
          headers: withWorkspaceHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
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
              headers: withWorkspaceHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
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
              headers: withWorkspaceHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
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
              headers: withWorkspaceHeaders(token ? { Authorization: `Bearer ${token}` } : {}),
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
    thumbnailUrl,
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
    resetMediaState,
  } = useMediaProcessor(globalFile);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishingPlatform, setPublishingPlatform] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [fallbackPublishPlatform, setFallbackPublishPlatform] = useState(null);
  const [editingTarget, setEditingTarget] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradePlanId, setUpgradePlanId] = useState(null);
  const [upgradePromptMessage, setUpgradePromptMessage] = useState("");
  const [pendingPublishRequest, setPendingPublishRequest] = useState(null);

  const effectiveThumbnailUrl = thumbnailUrl || "";
  const safeThumbUrl = effectiveThumbnailUrl ? sanitizeUrl(effectiveThumbnailUrl) : "";

  const restoreMasterPreview = () => {
    if (globalFile) {
      processFileChange(globalFile);
      return;
    }
    resetMediaState();
  };

  const getEffectiveMediaMetaForPlatform = platformId => {
    const platformOverrides = (platformData && platformData[platformId]) || {};
    return buildMediaMeta({
      trimStart:
        platformOverrides.trimStart !== undefined ? platformOverrides.trimStart : trimStart,
      trimEnd: platformOverrides.trimEnd !== undefined ? platformOverrides.trimEnd : trimEnd,
      rotate: platformOverrides.rotate !== undefined ? platformOverrides.rotate : rotate,
      flipH: platformOverrides.flipH !== undefined ? platformOverrides.flipH : flipH,
      flipV: platformOverrides.flipV !== undefined ? platformOverrides.flipV : flipV,
      filter:
        platformOverrides.selectedFilter !== undefined
          ? platformOverrides.selectedFilter
          : selectedFilter,
      duration,
    });
  };

  const resetPublisherForm = () => {
    resetPublishingState();
    resetMediaState();
    setFeedbackMessage("");
    setFallbackPublishPlatform(null);
    setEditingTarget(null);
    setShowVideoEditor(false);
    setShowCropper(false);
    setIsPublishing(false);
    setPublishingPlatform(null);
    setWorkflowStep(0);
    setPublishTiming("now");
  };

  const formatPublisherError = err => {
    if (err?.code === "PLATFORM_LIMIT_EXCEEDED" || err?.code === "TIER_LIMIT_EXCEEDED") {
      const limit = err?.context?.limit;
      const attempted = err?.context?.attempted;
      const suggestedTier = err?.context?.suggested_tier;
      if (limit && attempted) {
        return `That post is a little bigger than your current plan allows. You can publish to ${limit} platform${limit === 1 ? "" : "s"} at a time, and this one has ${attempted}. Remove ${attempted - limit} platform${attempted - limit === 1 ? "" : "s"} or upgrade${suggestedTier ? ` to ${suggestedTier}` : ""}.`;
      }
    }
    if (err?.code === "UPLOAD_CAP_EXCEEDED") {
      const limit = err?.context?.limit;
      const used = err?.context?.used;
      const monthKey = err?.context?.monthKey;
      const suggestedTier = err?.context?.suggested_tier;
      if (limit && typeof used === "number") {
        return `You have reached your upload limit for ${formatMonthLabel(monthKey)} (${used}/${limit}). Your file stayed safely on this device and was not uploaded. Upgrade${suggestedTier ? ` to ${suggestedTier}` : ""} or wait for your quota to reset.`;
      }
    }
    if (err?.code === "PROMOTION_TASK_QUOTA_EXCEEDED") {
      const remaining = err?.context?.remaining;
      const required = err?.context?.required;
      const suggestedTier = err?.context?.suggested_tier;
      if (typeof remaining === "number" && typeof required === "number") {
        return `You only have ${remaining} auto-publish slot${remaining === 1 ? "" : "s"} left this month, and this publish needs ${required}. Trim a few platforms or upgrade${suggestedTier ? ` to ${suggestedTier}` : ""}.`;
      }
    }
    return err?.message || "Upload failed. Please try again.";
  };

  const getUploadAuthToken = async () => {
    let token = null;
    try {
      const current = auth && auth.currentUser;
      if (current) token = await current.getIdToken(true);
    } catch (_) {
      token = null;
    }

    if (
      !token &&
      typeof window !== "undefined" &&
      window.__E2E_BYPASS === true &&
      window.__E2E_TEST_TOKEN
    ) {
      token = window.__E2E_TEST_TOKEN;
    }

    return token;
  };

  const closeUpgradeModal = () => {
    setShowUpgradeModal(false);
    setUpgradePlanId(null);
    setUpgradePromptMessage("");
    setPendingPublishRequest(null);
  };

  const openUpgradeModal = (err, platforms, label) => {
    setUpgradePlanId(normalizeUpgradePlanId(err?.context?.suggested_tier));
    setUpgradePromptMessage(formatPublisherError(err));
    setPendingPublishRequest({ platforms, label });
    setShowUpgradeModal(true);
  };

  const preflightUploadReadiness = async ({
    token,
    platforms,
    scheduledTime,
    platformScheduleTimes: readinessPlatformScheduleTimes,
  }) => {
    const controller = new AbortController();
    const timeoutMs = 12000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let readinessResponse;
    try {
      readinessResponse = await fetch(API_ENDPOINTS.CONTENT_UPLOAD_READINESS, {
        method: "POST",
        headers: withWorkspaceHeaders({
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        body: JSON.stringify({
          target_platforms: platforms,
          scheduled_promotion_time: scheduledTime || null,
          platform_schedule_times: readinessPlatformScheduleTimes || undefined,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("Plan check timed out. Please retry in a moment.");
        timeoutError.code = "READINESS_TIMEOUT";
        timeoutError.httpStatus = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }

    let readinessResult = null;
    const contentType = readinessResponse.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        readinessResult = await readinessResponse.json();
      } else {
        const textBody = await readinessResponse.text();
        readinessResult = textBody ? { text: textBody } : null;
      }
    } catch (_) {
      readinessResult = null;
    }

    if (!readinessResponse.ok) {
      throw buildStructuredUploadError(
        readinessResult,
        `Plan check failed (HTTP ${readinessResponse.status})`,
        readinessResponse.status
      );
    }

    if (readinessResult?.readiness?.allowed === false) {
      throw buildStructuredUploadError(
        {
          error: readinessResult.readiness.message,
          code: readinessResult.readiness.code,
          context: readinessResult.readiness.context,
          upgrade_required: readinessResult.readiness.context?.upgrade_required === true,
        },
        readinessResult.readiness.message,
        403
      );
    }

    return readinessResult?.readiness || null;
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
      setWorkflowStep(1);
      console.log("Global file selected:", file.name);
      const extension = String(file.name || "")
        .split(".")
        .pop()
        ?.toLowerCase();
      if (extension === "mov" || file.type === "video/quicktime") {
        setFeedbackMessage(
          "MOV selected. If the preview stays black or fails, the browser may not support this MOV codec. H.264 MP4 is safest for local preview."
        );
      }
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

      onReviewAI: () => {
        const fileToEdit = data.file || globalFile;
        if (!fileToEdit) {
          setFeedbackMessage("Please select a file first.");
          return;
        }

        setEditingTarget(platformId);
        processFileChange(fileToEdit);
        setShowVideoEditor(true);
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
                <div className="publisher-preview-title">TikTok preview</div>
                <PlatformPreview
                  label="TikTok Preview"
                  data={data}
                  globalFile={globalFile}
                  previewUrl={previewUrl}
                  thumbnailUrl={effectiveThumbnailUrl}
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
                <div className="publisher-preview-title">YouTube preview</div>
                <PlatformPreview
                  thumbnailUrl={effectiveThumbnailUrl}
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
                  thumbnailUrl={effectiveThumbnailUrl}
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
                  thumbnailUrl={effectiveThumbnailUrl}
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
                  thumbnailUrl={effectiveThumbnailUrl}
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
                  thumbnailUrl={effectiveThumbnailUrl}
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
  const publish = async (platforms, label, options = {}) => {
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

    const platformScheduleTimesForPayload = buildPlatformScheduleTimes({
      platforms,
      scheduledTime,
      customPlatformSchedule,
      platformScheduleTimes,
    });

    if (scheduledTime) {
      const scheduledAtMs = Date.parse(scheduledTime);
      if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
        setFeedbackMessage("Choose a queue time that has not already passed.");
        toast.error("Choose a queue time that has not already passed.");
        return;
      }

      if (customPlatformSchedule) {
        for (const platform of platforms) {
          const rawValue = platformScheduleTimes[platform] || scheduledTime;
          const platformTimeMs = Date.parse(rawValue);
          if (!Number.isFinite(platformTimeMs) || platformTimeMs <= Date.now()) {
            const platformName = getPlatformName(platform);
            setFeedbackMessage(`${platformName} needs a future queue time.`);
            toast.error(`${platformName} needs a future queue time.`);
            return;
          }
        }
      }
    }

    setIsPublishing(true);
    setPublishingPlatform(platforms.length === 1 ? platforms[0] : "all");
    setFeedbackMessage("Preparing upload...");

    try {
      // --- 1. Validation ---
      const effectiveMediaType =
        (fileToUpload && fileToUpload.type && fileToUpload.type.split("/")[0]) ||
        mediaType ||
        "video";

      const token = await getUploadAuthToken();
      if (!token) {
        throw new Error("Please sign in again before publishing.");
      }

      setFeedbackMessage("Checking plan limits...");
      await preflightUploadReadiness({
        token,
        platforms,
        scheduledTime: scheduledTime ? new Date(scheduledTime).toISOString() : null,
        platformScheduleTimes: Object.keys(platformScheduleTimesForPayload).length
          ? platformScheduleTimesForPayload
          : undefined,
      });

      if (
        fileToUpload instanceof Blob &&
        fileToUpload.size > STORAGE_UPLOAD_LIMIT_MB * 1024 * 1024
      ) {
        throw new Error(`File too large. Maximum upload size is ${STORAGE_UPLOAD_LIMIT_MB}MB.`);
      }

      // --- 2. Upload with Progress ---
      let finalUrl = "";
      if (fileToUpload instanceof Blob) {
        try {
          const uploadResult = await uploadSourceFileViaBackend({
            file: fileToUpload,
            token,
            mediaType: effectiveMediaType,
            onProgress: (sent, total) => {
              const safeTotal = total || fileToUpload.size || 0;
              if (!safeTotal) {
                setFeedbackMessage("Uploading...");
                return;
              }
              const progress = (sent / safeTotal) * 100;
              setFeedbackMessage(`Uploading: ${Math.round(progress)}%`);
            },
          });
          finalUrl = uploadResult.url;
        } catch (error) {
          console.error("Upload failed:", error);
          throw error?.httpStatus || error?.code ? error : buildClientUploadError(error);
        }

        setFeedbackMessage("Finalizing...");
      } else if (typeof fileToUpload === "string") {
        finalUrl = fileToUpload;
      }

      // --- 3. Construct Payload ---
      const platformOptionsMap = {};
      const platformFiles = {};

      platforms.forEach(p => {
        const data = getPlatformEffectiveData(p);
        platformOptionsMap[p] = { ...data };

        const platformTitle = String(data.title || "").trim();
        const platformDescription = String(data.description || "").trim();
        if (platformTitle) {
          platformOptionsMap[p].title = platformTitle;
        }
        if (platformDescription) {
          platformOptionsMap[p].description = platformDescription;
        }

        const platformSpecificFile = data.file;
        if (
          platformSpecificFile &&
          platformSpecificFile !== globalFile &&
          (platformSpecificFile instanceof File || platformSpecificFile instanceof Blob)
        ) {
          platformFiles[p] = platformSpecificFile;
        } else if (
          platformSpecificFile &&
          typeof platformSpecificFile === "object" &&
          platformSpecificFile.url
        ) {
          platformOptionsMap[p].media_url = platformSpecificFile.url;
        }

        const platformMeta = getEffectiveMediaMetaForPlatform(p);
        if (hasMeaningfulMediaMeta(platformMeta)) {
          platformOptionsMap[p].meta = platformMeta;
        }

        if (p === "tiktok") {
          const tiktokCaption = buildTikTokCaption({
            title: platformTitle || globalTitle,
            description: platformDescription || globalDescription,
            caption: data.caption,
          });
          if (tiktokCaption) {
            platformOptionsMap[p].caption = tiktokCaption;
          }
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

      const uploadMeta =
        platforms.length === 1
          ? getEffectiveMediaMetaForPlatform(platforms[0])
          : buildMediaMeta({
              trimStart,
              trimEnd,
              rotate,
              flipH,
              flipV,
              filter: selectedFilter,
              duration,
            });

      const primaryPlatformData =
        platforms.length === 1 ? getPlatformEffectiveData(platforms[0]) : null;
      const firstPlatformWithTitle = platforms
        .map(platform => getPlatformEffectiveData(platform))
        .find(data => String(data?.title || "").trim());
      const firstPlatformWithDescription = platforms
        .map(platform => getPlatformEffectiveData(platform))
        .find(data =>
          String(
            data?.description || data?.caption || data?.message || data?.commentary || ""
          ).trim()
        );
      const resolvedTitle =
        String(
          primaryPlatformData?.title || globalTitle || firstPlatformWithTitle?.title || ""
        ).trim() || "Untitled Post";
      const resolvedDescription = String(
        primaryPlatformData?.description ||
          globalDescription ||
          firstPlatformWithDescription?.description ||
          firstPlatformWithDescription?.caption ||
          firstPlatformWithDescription?.message ||
          firstPlatformWithDescription?.commentary ||
          ""
      ).trim();

      if (!globalTitle || !globalTitle.trim()) {
        setGlobalTitle(resolvedTitle);
      }

      const uploadParams = {
        url: finalUrl,
        file: null,
        type: effectiveMediaType,
        platforms,
        title: resolvedTitle,
        description: resolvedDescription,
        platform_options: platformOptionsMap,
        platform_files: Object.keys(platformFiles).length > 0 ? platformFiles : undefined,
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
              platformScheduleTimes: Object.keys(platformScheduleTimesForPayload).length
                ? platformScheduleTimesForPayload
                : undefined,
            }
          : undefined,
        isDryRun: false,
        meta: {
          ...(uploadMeta || {}),
          ...(fileToUpload?.clipLearning || mediaFile?.clipLearning
            ? {
                clipLearning: fileToUpload?.clipLearning || mediaFile?.clipLearning,
              }
            : {}),
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
      const friendlyMessage = formatPublisherError(err);
      if (EXPECTED_PUBLISH_BLOCK_CODES.has(err?.code)) {
        console.info("[UnifiedPublisher] publish blocked", {
          code: err?.code,
          context: err?.context || null,
        });
      } else {
        console.error("UnifiedPublisher Error:", err);
      }
      setFeedbackMessage(friendlyMessage);

      if (err?.upgradeRequired && !options.skipUpgradePrompt) {
        toast(friendlyMessage, { icon: "💡", duration: 6000 });
        openUpgradeModal(err, platforms, label);
      } else if (EXPECTED_PUBLISH_BLOCK_CODES.has(err?.code)) {
        toast(friendlyMessage, { icon: "⚠️", duration: 5000 });
      } else {
        toast.error(friendlyMessage, { duration: 5000 });
      }

      setIsPublishing(false);
      setPublishingPlatform(null);
      setFallbackPublishPlatform(null);
    }
  };

  const handlePublishAll = () => publish(selectedPlatforms, "Publish Everywhere");
  const handlePublishPlatform = platformId => publish([platformId], `Publish to ${platformId}`);

  const handleUpgradeSuccess = async () => {
    const pending = pendingPublishRequest;
    setShowUpgradeModal(false);
    setUpgradePlanId(null);
    setUpgradePromptMessage("");
    setPendingPublishRequest(null);

    if (!pending) return;

    toast.success("Plan updated. Retrying your publish now...");
    await publish(pending.platforms, pending.label, { skipUpgradePrompt: true });
  };

  const modalOpen = showVideoEditor || showCropper || showUpgradeModal;
  const isQueuedPublish = publishTiming === "schedule" && Boolean(scheduledTime);
  const selectedMediaName =
    (globalFile && typeof globalFile === "object" && globalFile.name) ||
    (typeof globalFile === "string" ? "Selected media URL" : "No media selected yet");
  const queueActionLabel = publishTiming === "schedule" ? "Schedule post" : "Publish now";
  const queuePlatformCount = selectedPlatforms.length;
  const isTikTokPostingCapped =
    selectedPlatforms.includes("tiktok") &&
    typeof tiktokCreator?.posting_remaining === "number" &&
    tiktokCreator.posting_remaining <= 0;
  const selectedMediaSize =
    globalFile && typeof globalFile === "object" && Number(globalFile.size)
      ? `${Math.max(1, Math.round(globalFile.size / 1024 / 1024))} MB`
      : "";
  const workflowSteps = ["Media", "Platforms", "Customize", "Review"];
  const workflowStepHelp = [
    "Choose the source",
    "Select destinations",
    "Perfect each post",
    "Publish or schedule",
  ];
  const moveToWorkflowStep = nextStep => {
    if (nextStep > 0 && !globalFile) {
      setFeedbackMessage("Choose a media file before selecting platforms.");
      return;
    }
    if (nextStep > 1 && selectedPlatforms.length === 0) {
      setFeedbackMessage("Select at least one publishing platform before customizing.");
      return;
    }
    setFeedbackMessage("");
    setWorkflowStep(Math.max(0, Math.min(3, nextStep)));
  };

  return (
    <div
      className={`unified-publisher-container publisher-redesign${embedded ? " is-embedded" : ""}${modalOpen ? " modal-open" : ""}`}
    >
      {/* --- HEADER: Global Context --- */}
      {!embedded && (
        <header className="publisher-header">
          <h1>Publisher</h1>
          <p>Upload once, tailor the details, and publish everywhere.</p>
        </header>
      )}

      <ol className="publisher-stepper" aria-label="Publishing workflow">
        {workflowSteps.map((step, index) => (
          <li
            key={step}
            className={index === workflowStep ? "active" : index < workflowStep ? "complete" : ""}
          >
            <button type="button" onClick={() => moveToWorkflowStep(index)}>
              <span>{index < workflowStep ? "✓" : index + 1}</span>
              <div>
                <strong>{step}</strong>
                <small>{workflowStepHelp[index]}</small>
              </div>
            </button>
          </li>
        ))}
      </ol>

      <section className="publisher-current-asset" aria-label="Current publishing asset">
        <span className={`publisher-asset-icon ${previewUrl ? "has-preview" : ""}`}>
          {previewUrl ? (
            mediaType === "image" ? (
              <SafeImage src={sanitizeUrl(previewUrl)} alt="" />
            ) : (
              <SafeVideo src={sanitizeUrl(previewUrl)} muted preload="metadata" />
            )
          ) : mediaType === "image" ? (
            "▧"
          ) : (
            "▶"
          )}
        </span>
        <div>
          <small>Current media</small>
          <strong>{selectedMediaName}</strong>
          <span>
            {selectedMediaSize || "Choose a master file to begin"}
            {duration > 0 ? ` · ${Math.round(duration)} seconds` : ""}
          </span>
        </div>
        <div className="publisher-destination-pills">
          {selectedPlatforms.length ? (
            selectedPlatforms.map(platform => (
              <span key={platform}>{getPlatformName(platform)}</span>
            ))
          ) : (
            <em>No platforms selected</em>
          )}
        </div>
        <span className="publisher-asset-status">
          {globalFile ? "Media ready" : "Waiting for media"}
        </span>
      </section>

      <div className={`publisher-layout publisher-step-${workflowStep}`}>
        {/* --- LEFT SIDE: The "Global" Input (Optional Helper) --- */}
        <aside className="global-controls">
          <div className="card global-card">
            <h2>1. Master Content</h2>
            <div className="form-group">
              <label>Master File</label>

              <label className="publisher-upload-dropzone">
                <input type="file" accept="video/*,image/*" onChange={handleGlobalFileChange} />
                <span className="publisher-upload-icon" aria-hidden="true">
                  ↑
                </span>
                <strong>{globalFile ? "Replace media" : "Choose a video or image"}</strong>
                <small>Drag and drop or browse your device · MP4, MOV, JPG, PNG</small>
              </label>

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
                      type="button"
                      className="btn-secondary-sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setEditingTarget("global");
                        setShowVideoEditor(true);
                      }}
                    >
                      {mediaType === "image" ? "🎬 Create Slideshow" : "✨ Review AI Enhancements"}
                    </button>
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
                      {effectiveThumbnailUrl && (
                        <div
                          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}
                        >
                          <SafeImage
                            src={safeThumbUrl}
                            alt="Thumbnail"
                            style={{
                              width: 120,
                              height: 68,
                              objectFit: "contain",
                              borderRadius: 6,
                              border: "2px solid #a78bfa",
                              background: "#020617",
                              padding: 4,
                            }}
                          />
                          <span style={{ color: "#a78bfa", fontSize: 11 }}>
                            {"Your cover frame"}
                          </span>
                        </div>
                      )}
                      <SafeVideo
                        key={previewUrl}
                        src={sanitizeUrl(previewUrl)}
                        controls
                        className="preview-media"
                        preload="metadata"
                        onLoadedMetadata={e => setDuration(e.target.duration)}
                        onError={e => {
                          const message = getBrowserPreviewFailureMessage(
                            globalFile,
                            e.currentTarget
                          );
                          console.warn("Master preview video failed to load", {
                            fileName: globalFile?.name,
                            fileType: globalFile?.type,
                            fileSize: globalFile?.size,
                            mediaErrorCode: e.currentTarget?.error?.code,
                          });
                          setFeedbackMessage(message);
                        }}
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
                      <label style={{ display: "block", marginBottom: "6px" }}>
                        Start: {trimStart}s / End: {trimEnd > 0 ? trimEnd + "s" : "Full"}
                      </label>
                      <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "6px" }}>
                        Trim the master clip window before it flows into the platform-specific
                        forms.
                      </div>
                      <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "4px" }}>
                        Start time
                      </label>
                      <input
                        type="range"
                        min="0"
                        max={duration}
                        step="0.1"
                        value={trimStart}
                        onChange={e => {
                          const nextStart = Number(e.target.value);
                          setTrimStart(nextStart);
                          if (trimEnd > 0 && trimEnd < nextStart) {
                            setTrimEnd(nextStart);
                          }
                        }}
                        style={{ width: "100%" }}
                      />
                      <label
                        style={{
                          display: "block",
                          fontSize: "0.8rem",
                          marginTop: "8px",
                          marginBottom: "4px",
                        }}
                      >
                        End time
                      </label>
                      <input
                        type="range"
                        min={trimStart}
                        max={duration}
                        step="0.1"
                        value={trimEnd > 0 ? trimEnd : duration}
                        onChange={e => {
                          const nextEnd = Number(e.target.value);
                          if (duration > 0 && Math.abs(nextEnd - duration) < 0.11) {
                            setTrimEnd(0);
                            return;
                          }
                          setTrimEnd(Math.max(nextEnd, trimStart));
                        }}
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

            {/* --- PUBLISH QUEUE --- */}
            <div className="scheduling-tools">
              <div className="schedule-header">
                <div>
                  <h4>Publish Queue</h4>
                  <p>
                    Queue the new media selected here for the platforms you choose. This does not
                    re-queue old uploads from your library.
                  </p>
                </div>
                <span className={`queue-mode-pill ${isQueuedPublish ? "queued" : "ready"}`}>
                  {queueActionLabel}
                </span>
              </div>

              <BestTimeToPost selectedPlatforms={selectedPlatforms} />

              <div className="queue-summary-grid">
                <div className="queue-summary-card">
                  <span>New Media</span>
                  <strong>{selectedMediaName}</strong>
                </div>
                <div className="queue-summary-card">
                  <span>Platforms</span>
                  <strong>{queuePlatformCount} selected</strong>
                </div>
              </div>

              <div className="schedule-field">
                <label>Publish Time</label>
                <DateTimeSplitControl
                  value={scheduledTime}
                  onChange={value => {
                    setScheduledTime(value);
                    setPublishTiming(value ? "schedule" : "now");
                  }}
                />
                <small>
                  {scheduledTime
                    ? "This new upload will be queued for the selected platforms. Plan limits are checked before anything is uploaded."
                    : "Leave empty to publish immediately after upload."}
                </small>
              </div>

              {scheduledTime && (
                <div className="platform-schedule-block">
                  <label className="platform-schedule-toggle">
                    <input
                      type="checkbox"
                      checked={customPlatformSchedule}
                      onChange={e => setCustomPlatformSchedule(e.target.checked)}
                    />
                    Customize time per platform
                  </label>
                  {customPlatformSchedule && (
                    <div className="platform-schedule-grid">
                      {selectedPlatforms.map(platform => (
                        <label key={platform} className="platform-schedule-row">
                          <span>{getPlatformName(platform)}</span>
                          <DateTimeSplitControl
                            value={platformScheduleTimes[platform] || scheduledTime}
                            onChange={value => updatePlatformScheduleTime(platform, value)}
                            compact
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {scheduledTime && (
                <div className="schedule-field">
                  <label>Frequency</label>
                  <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value)}
                    className="form-control"
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <small>
                    Each platform in the queue uses one automated distribution task from the current
                    plan allowance.
                  </small>
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
          <div className="publisher-platform-heading">
            <div>
              <small>Customize by platform</small>
              <h2>Perfect each destination</h2>
            </div>
            <div className="publisher-platform-tabs" role="tablist" aria-label="Selected platforms">
              {selectedPlatforms.map(platformId => (
                <button
                  key={platformId}
                  type="button"
                  role="tab"
                  aria-selected={focusedPlatform === platformId}
                  className={focusedPlatform === platformId ? "active" : ""}
                  onClick={() => setFocusedPlatform(platformId)}
                >
                  {getPlatformName(platformId)}
                </button>
              ))}
            </div>
          </div>

          {selectedPlatforms.length === 0 ? (
            <div className="empty-state">Select a platform to begin.</div>
          ) : (
            <div className="platform-stack">
              {selectedPlatforms
                .filter(platformId => platformId === focusedPlatform)
                .map(platformId => (
                  <div key={platformId} className="platform-section">
                    {renderPlatformForm(platformId)}
                  </div>
                ))}
            </div>
          )}

          {workflowStep === 2 ? (
            <section className="publisher-customize-schedule" aria-label="Publish timing">
              <div className="publisher-customize-schedule-heading">
                <div>
                  <small>Publish timing</small>
                  <strong>Choose when this post goes live</strong>
                </div>
                <div className="publisher-timing-options">
                  <label>
                    <input
                      type="radio"
                      name="publisher-timing"
                      checked={publishTiming === "now"}
                      onChange={() => {
                        setPublishTiming("now");
                        setScheduledTime("");
                      }}
                    />
                    Publish now
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="publisher-timing"
                      checked={publishTiming === "schedule"}
                      onChange={() => setPublishTiming("schedule")}
                    />
                    Schedule
                  </label>
                </div>
              </div>

              {publishTiming === "schedule" ? (
                <div className="publisher-schedule-controls">
                  <div className="schedule-field">
                    <label>Default publish time</label>
                    <DateTimeSplitControl value={scheduledTime} onChange={setScheduledTime} />
                  </div>
                  <label className="platform-schedule-toggle">
                    <input
                      type="checkbox"
                      checked={customPlatformSchedule}
                      onChange={event => setCustomPlatformSchedule(event.target.checked)}
                    />
                    Use a different time for each platform
                  </label>
                  {customPlatformSchedule ? (
                    <div className="platform-schedule-grid">
                      {selectedPlatforms.map(platform => (
                        <label key={platform} className="platform-schedule-row">
                          <span>{getPlatformName(platform)}</span>
                          <DateTimeSplitControl
                            value={platformScheduleTimes[platform] || scheduledTime}
                            onChange={value => updatePlatformScheduleTime(platform, value)}
                            compact
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {workflowStep === 3 ? (
            <section className="publisher-review-panel" aria-label="Review publishing details">
              <div className="publisher-review-heading">
                <div>
                  <small>Final review</small>
                  <h2>Ready to publish</h2>
                </div>
                <span>{isQueuedPublish ? "Scheduled" : "Publish now"}</span>
              </div>
              <div className="publisher-review-grid">
                <article>
                  <span>Media</span>
                  <strong>{selectedMediaName}</strong>
                  <small>{selectedMediaSize || "Ready"}</small>
                </article>
                <article>
                  <span>Destinations</span>
                  <strong>{selectedPlatforms.map(getPlatformName).join(", ")}</strong>
                  <small>{selectedPlatforms.length} platform(s)</small>
                </article>
                <article>
                  <span>Delivery</span>
                  <strong>{scheduledTime ? "Scheduled" : "Immediately"}</strong>
                  <small>{scheduledTime || "As soon as processing finishes"}</small>
                </article>
              </div>
              <div className="publisher-review-schedule">
                <label>Publish timing</label>
                <DateTimeSplitControl
                  value={scheduledTime}
                  onChange={value => {
                    setScheduledTime(value);
                    setPublishTiming(value ? "schedule" : "now");
                  }}
                />
                <small>Leave the date empty to publish immediately.</small>
              </div>
            </section>
          ) : null}
        </main>
      </div>

      <div className="publisher-wizard-actions">
        <div>
          {workflowStep > 0 ? (
            <button
              type="button"
              className="btn-secondary-sm"
              onClick={() => moveToWorkflowStep(workflowStep - 1)}
            >
              ← Back
            </button>
          ) : (
            <button type="button" className="btn-secondary-sm" onClick={resetPublisherForm}>
              Reset
            </button>
          )}
          {feedbackMessage ? <span className="feedback-message">{feedbackMessage}</span> : null}
          {fallbackPublishPlatform ? (
            <span className="feedback-message">
              Using {getPlatformName(fallbackPublishPlatform)} media.
            </span>
          ) : null}
        </div>
        {workflowStep < 3 ? (
          <button
            type="button"
            className="btn-primary-large"
            onClick={() => moveToWorkflowStep(workflowStep + 1)}
            disabled={
              (workflowStep === 0 && !globalFile) ||
              (workflowStep === 1 && !selectedPlatforms.length)
            }
          >
            {workflowStep === 0
              ? "Choose platforms →"
              : workflowStep === 1
                ? "Customize posts →"
                : "Review publishing →"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary-large"
            onClick={handlePublishAll}
            disabled={
              isPublishing ||
              selectedPlatforms.length === 0 ||
              !globalFile ||
              isTikTokPostingCapped ||
              (publishTiming === "schedule" && !scheduledTime)
            }
          >
            {isPublishing
              ? "Publishing..."
              : isQueuedPublish
                ? "Queue publishing →"
                : "Publish now →"}
          </button>
        )}
      </div>

      {/* --- Modals --- */}
      {showVideoEditor && mediaFile && (
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
              type="button"
              className="close-btn"
              onClick={() => {
                setShowVideoEditor(false);
                if (editingTarget && editingTarget !== "global") restoreMasterPreview();
                setEditingTarget(null);
              }}
            >
              ×
            </button>
            <VideoEditor
              file={mediaFile}
              hideCreationWorkflows
              onSave={result => {
                const target = editingTarget || "global";
                const fallbackName =
                  target === "global" ? "master-content" : `${target}-content-edit`;
                const normalizedResult = normalizeEditedAsset(result, fallbackName);

                if (target !== "global") {
                  if (normalizedResult?.url) {
                    updatePlatformData(target, {
                      file: normalizedResult,
                      media_url: normalizedResult.url,
                    });
                  } else if (normalizedResult instanceof File || normalizedResult instanceof Blob) {
                    updatePlatformData(target, { file: normalizedResult });
                  }
                  restoreMasterPreview();
                  toast.success(`${getPlatformName(target)} edits saved.`);
                } else if (normalizedResult) {
                  processFileChange(normalizedResult);
                  setGlobalFile(normalizedResult);
                  toast.success("Edits applied.");
                }

                setShowVideoEditor(false);
                setEditingTarget(null);
              }}
              onCancel={() => {
                setShowVideoEditor(false);
                if (editingTarget && editingTarget !== "global") restoreMasterPreview();
                setEditingTarget(null);
              }}
            />
          </div>
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

      {showUpgradeModal && (
        <div
          className="modal-overlay open"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            overflowY: "auto",
            zIndex: 3200,
          }}
          onClick={closeUpgradeModal}
        >
          <div
            className="modal upgrade-modal"
            style={{
              maxWidth: "1100px",
              width: "min(1100px, 94vw)",
              background: "#f8fafc",
              color: "#0f172a",
              position: "relative",
            }}
            onClick={event => event.stopPropagation()}
          >
            <div className="upgrade-modal-shell">
              <div className="upgrade-modal-copy">
                <span className="upgrade-modal-kicker">Upgrade and continue</span>
                <h2>That publish is ready. Your current plan is the only blocker.</h2>
                <p>{upgradePromptMessage}</p>
                <p>
                  Complete the subscription here and the same publish will retry automatically with
                  your new entitlement.
                </p>
              </div>

              <PayPalSubscriptionPanel
                compact
                highlightPlanId={upgradePlanId}
                onUpgradeSuccess={handleUpgradeSuccess}
                onClose={closeUpgradeModal}
                title="Choose a plan and stay in the flow"
                subtitle="PayPal checkout runs inside this modal when available. If not, the fallback link is still here."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedPublisher;
