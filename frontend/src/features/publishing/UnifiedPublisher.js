// UnifiedPublisher.js
// The "Command Center" for cross-platform publishing.
// Wraps existing platform forms and delegates upload to App.js

import React, { useState, useEffect, useMemo } from "react";
import "./UnifiedPublisher.css";
import "./PublisherRelease.css";
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

// --- New Features ---

// --- Helpers ---
import PublisherReleaseWorkspace from "./components/PublisherReleaseWorkspace";
import { assetFromContent, connectionState, masterCopyFor, mediaUrl, platformIssues,
  preparePlatformOptions, resolveDelivery } from "./utils/publisherWorkflow";
import { browserTimezone, isValidTimezone } from "../../UserDashboardTabs/scheduleReleaseModel";
import {
  getPlatformName,
  DEFAULT_SELECTED_PLATFORMS,
  buildMediaMeta,
  hasMeaningfulMediaMeta,
  normalizeEditedAsset,
  buildStructuredUploadError,
  EXPECTED_PUBLISH_BLOCK_CODES,
  formatMonthLabel,
  buildClientUploadError,
  normalizeTikTokCreatorInfo,
  normalizeYouTubeCreatorInfo,
  normalizeLinkedInCreatorInfo,
  normalizeRedditCreatorInfo,
  normalizeUpgradePlanId,
  fetchPlatformStatusSnapshot,
} from "./utils/publishingUtils";

const UnifiedPublisher = ({ onUpload, initialFile, contentList = [], defaultTimezone, onNavigate, embedded = false }) => {
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
    frequency,
    setFrequency,
    customPlatformSchedule,
    setCustomPlatformSchedule,

    selectedPlatforms,
    togglePlatform,
    updatePlatformData,
    getPlatformEffectiveData,
    platformData,
    resetPublishingState,
  } = usePublishingState(DEFAULT_SELECTED_PLATFORMS); // Default selection
  const [focusedPlatform, setFocusedPlatform] = useState(DEFAULT_SELECTED_PLATFORMS[0] || "tiktok");
  const [workflowStep, setWorkflowStep] = useState(initialFile ? 2 : 0);
  const [publishTiming, setPublishTiming] = useState("now");
  const [visitedPlatforms, setVisitedPlatforms] = useState({});
  const [formVersions, setFormVersions] = useState({});
  const [assetTab, setAssetTab] = useState(initialFile ? "studio" : "assets");
  const [sourceAsset, setSourceAsset] = useState(null);
  const [dimensions, setDimensions] = useState({});
  const [connectionSnapshot, setConnectionSnapshot] = useState({ raw: {}, summary: {} });
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [deliveryTimezone, setDeliveryTimezone] = useState(isValidTimezone(defaultTimezone) ? defaultTimezone : browserTimezone());
  const [deliveryFields, setDeliveryFields] = useState({ date: "", time: "09:00" });
  const [customFields, setCustomFields] = useState({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const token = await getUploadAuthToken();
        const snapshot = await fetchPlatformStatusSnapshot(token);
        if (active) setConnectionSnapshot(snapshot);
      } catch (_) {
        if (active) setConnectionSnapshot({ raw: {}, summary: {} });
      } finally {
        if (active) setConnectionsLoaded(true);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const activatePlatform = platform => {
    setFocusedPlatform(platform);
    setVisitedPlatforms(current => ({ ...current, [platform]: true }));
  };

  useEffect(() => {
    if (!selectedPlatforms.length) return;
    if (!selectedPlatforms.includes(focusedPlatform)) {
      setFocusedPlatform(selectedPlatforms[0]);
    }
  }, [focusedPlatform, selectedPlatforms]);

  // Handle Initial File
  useEffect(() => {
    if (initialFile) {
      const asset = typeof initialFile === "string" ? { url: initialFile, type: /\.(png|jpe?g|webp)(?:[?#]|$)/i.test(initialFile) ? "image/jpeg" : "video/mp4", name: "Selected media" } : initialFile;
      setGlobalFile(asset);
      setSourceAsset(asset);
      setVisitedPlatforms(current => ({ ...current, [DEFAULT_SELECTED_PLATFORMS[0]]: true }));
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
  const [, setPublishingPlatform] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [, setFallbackPublishPlatform] = useState(null);
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
    setVisitedPlatforms({});
    setSourceAsset(null);
    setDeliveryFields({ date: "", time: "09:00" });
    setCustomFields({});
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
        return `You only have ${remaining} publishing slot${remaining === 1 ? "" : "s"} left this month, and this publish needs ${required}. Trim a few platforms or upgrade${suggestedTier ? ` to ${suggestedTier}` : ""}.`;
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
      setSourceAsset(null);
      setDimensions({});
      setDuration(0);
      setWorkflowStep(0);
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

  const availableAssets = useMemo(() => contentList.map(assetFromContent).filter(Boolean), [contentList]);
  const visibleAssets = availableAssets.filter(asset => assetTab === "assets" ||
    (assetTab === "studio" && ["studio", "viral_clip_studio", "viral-clip-studio"].includes(asset.source)) ||
    (assetTab === "generated" && ["generated", "idea_video", "smart_promo"].includes(asset.source)));
  const selectOwnedAsset = asset => {
    setSourceAsset(asset);
    setGlobalFile(asset);
    processFileChange(asset);
    setDuration(Number(asset.duration) || 0);
    setDimensions({ width: asset.width, height: asset.height });
    if (asset.suggestedTitle) setGlobalTitle(asset.suggestedTitle);
    if (asset.suggestedDescription) setGlobalDescription(asset.suggestedDescription);
  };
  const connections = Object.fromEntries(["facebook", "instagram", "linkedin", "reddit", "tiktok", "youtube"].map(platform => [platform, connectionState(connectionSnapshot, platform, connectionsLoaded)]));
  const destinationIssues = Object.fromEntries(selectedPlatforms.map(platform => [platform, platformIssues(platform, getPlatformEffectiveData(platform), {
    connection: connections[platform], visited: visitedPlatforms[platform],
    creator: platform === "tiktok" ? tiktokCreator : null,
    publishReady: platform === "tiktok" ? connectionSnapshot.summary?.tiktok?.publishReady : undefined,
    instagramAccountId: connectionSnapshot.raw?.instagram?.ig_business_account_id || connectionSnapshot.raw?.instagram?.metadata?.instagram_business_account_id,
  })]));
  let delivery = null;
  let deliveryError = "";
  try {
    delivery = resolveDelivery({ mode: publishTiming, ...deliveryFields, timezone: deliveryTimezone,
      customTimes: customPlatformSchedule ? customFields : {}, platforms: selectedPlatforms });
  } catch (error) { deliveryError = error.message; }
  const scheduledTime = delivery?.scheduledTime || "";
  const platformScheduleTimes = delivery?.platformTimes || {};
  const reviewOptions = Object.fromEntries(selectedPlatforms.map(platform => [platform,
    preparePlatformOptions(platform, getPlatformEffectiveData(platform), globalTitle, globalDescription)]));
  const nextReason = nextStep => {
    if (nextStep > 0 && !globalFile) return "Choose media before selecting destinations.";
    if (nextStep > 1 && !selectedPlatforms.length) return "Select at least one destination.";
    if (nextStep > 2) {
      const incomplete = selectedPlatforms.find(platform => destinationIssues[platform]?.length);
      if (incomplete) return `${getPlatformName(incomplete)}: ${destinationIssues[incomplete][0]}`;
    }
    if (nextStep > 3 && deliveryError) return deliveryError;
    return "";
  };
  const moveToWorkflowStep = nextStep => {
    const reason = nextReason(nextStep);
    if (reason) { setFeedbackMessage(reason); return; }
    if (nextStep === 2 && selectedPlatforms.length) activatePlatform(selectedPlatforms.includes(focusedPlatform) ? focusedPlatform : selectedPlatforms[0]);
    setFeedbackMessage("");
    setWorkflowStep(Math.max(0, Math.min(4, nextStep)));
  };
  const copyMaster = platform => {
    updatePlatformData(platform, masterCopyFor(platform, globalTitle, globalDescription));
    setFormVersions(current => ({ ...current, [platform]: (current[platform] || 0) + 1 }));
  };
  const renderPlatformForm = platformId => {
    const data = getPlatformEffectiveData(platformId);
    const Form = { facebook: FacebookForm, instagram: InstagramForm, linkedin: LinkedInForm,
      reddit: RedditForm, tiktok: TikTokForm, youtube: YouTubeForm }[platformId];
    if (!Form) return null;
    return <div className="dark-theme-form"><Form key={`${platformId}:${formVersions[platformId] || 0}`}
      globalTitle={globalTitle} globalDescription={globalDescription} currentFile={data.file}
      pages={facebookPages} facebookPages={facebookPages}
      creatorInfo={{ tiktok: tiktokCreator, youtube: youtubeChannel, linkedin: linkedinProfile, reddit: redditUser }[platformId]}
      onFileChange={newFile => updatePlatformData(platformId, { file: newFile || globalFile })}
      onReviewAI={() => { setEditingTarget(platformId); processFileChange(data.file || globalFile); setShowVideoEditor(true); }}
      bountyAmount={bountyAmount} setBountyAmount={setBountyAmount} bountyNiche={bountyNiche} setBountyNiche={setBountyNiche}
      protocol7Enabled={protocol7Enabled} setProtocol7Enabled={setProtocol7Enabled}
      protocol7Volatility={protocol7Volatility} setProtocol7Volatility={setProtocol7Volatility}
      onChange={newData => updatePlatformData(platformId, newData)} initialData={data} />
    </div>;
  };

  // 4. Publish Action
  const publish = async (platforms, label, options = {}) => {
    if (isPublishing) return;
    const blockReason = nextReason(4);
    if (workflowStep !== 4 || blockReason) {
      setFeedbackMessage(blockReason || "Review the release before submitting.");
      return;
    }
    // Recheck the selected instants at submission, not just when the UI last rendered.
    try {
      resolveDelivery({ mode: publishTiming, ...deliveryFields, timezone: deliveryTimezone,
        customTimes: customPlatformSchedule ? customFields : {}, platforms });
    } catch (error) { setFeedbackMessage(error.message); return; }
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

    const platformScheduleTimesForPayload = platformScheduleTimes;

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
      } else if (/^https?:\/\//i.test(mediaUrl(fileToUpload))) {
        finalUrl = mediaUrl(fileToUpload);
      }
      if (!finalUrl) throw new Error("This media has no usable publishing URL.");

      // --- 3. Construct Payload ---
      const platformOptionsMap = {};
      const platformFiles = {};

      platforms.forEach(p => {
        const data = getPlatformEffectiveData(p);
        platformOptionsMap[p] = preparePlatformOptions(p, data, globalTitle, globalDescription);

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
              timezone: deliveryTimezone,
              platformScheduleTimes: Object.keys(platformScheduleTimesForPayload).length
                ? platformScheduleTimesForPayload
                : undefined,
            }
          : undefined,
        isDryRun: false,
        meta: {
          ...(uploadMeta || {}),
          ...(sourceAsset?.sourceContentId ? { sourceContentId: sourceAsset.sourceContentId } : {}),
          ...(sourceAsset?.source ? { source: sourceAsset.source } : {}),
          ...(sourceAsset?.templateName ? { template: { name: sourceAsset.templateName } } : {}),
          ...(fileToUpload?.clipLearning || mediaFile?.clipLearning
            ? {
                clipLearning: fileToUpload?.clipLearning || mediaFile?.clipLearning,
              }
            : {}),
        },
      };

      if (onUpload) {
        const result = await onUpload(uploadParams);
        if (result?.ok === false) throw new Error(result.error || "Submission failed.");
        setFeedbackMessage(`${label} submitted. Check Schedule for delivery status.`);
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

  const timezones = Array.from(new Set([deliveryTimezone, defaultTimezone, browserTimezone(), "Africa/Johannesburg", "UTC",
    ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [])].filter(isValidTimezone)));

  return (
    <>
      <PublisherReleaseWorkspace embedded={embedded} step={workflowStep} moveToStep={moveToWorkflowStep}
        title={globalTitle} description={globalDescription} onTitle={setGlobalTitle} onDescription={setGlobalDescription}
        file={globalFile} preview={previewUrl} poster={safeThumbUrl} duration={duration} dimensions={dimensions}
        onMetadata={video => { setDuration(video.duration); setDimensions({ width: video.videoWidth, height: video.videoHeight }); }}
        onUploadFile={handleGlobalFileChange} assetTab={assetTab} onAssetTab={setAssetTab} assets={visibleAssets}
        onSelectAsset={selectOwnedAsset} sourceAsset={sourceAsset} selected={selectedPlatforms} togglePlatform={togglePlatform}
        focus={focusedPlatform} activatePlatform={activatePlatform} connections={connections} issues={destinationIssues}
        visited={visitedPlatforms} forms={renderPlatformForm} copyMaster={copyMaster} mode={publishTiming} setMode={setPublishTiming}
        deliveryFields={deliveryFields} setDeliveryFields={setDeliveryFields} timezone={deliveryTimezone} setTimezone={setDeliveryTimezone}
        timezones={timezones} delivery={delivery} deliveryError={deliveryError} frequency={frequency} setFrequency={setFrequency}
        customSchedule={customPlatformSchedule} setCustomSchedule={setCustomPlatformSchedule} customFields={customFields}
        setCustomFields={(platform, fields) => setCustomFields(current => ({ ...current, [platform]: fields }))}
        reviewOptions={reviewOptions} getData={getPlatformEffectiveData} nextReason={nextReason}
        submit={handlePublishAll} submitting={isPublishing} feedback={feedbackMessage} onNavigate={onNavigate}
        bestTime={<details className="release-advanced"><summary>Best time insights</summary><BestTimeToPost selectedPlatforms={selectedPlatforms} /></details>}
        advanced={<details className="release-advanced"><summary>Media and optional settings</summary>
          <button type="button" onClick={resetPublisherForm}>Reset this preparation</button>
          <button type="button" onClick={() => { setEditingTarget("global"); setShowVideoEditor(true); }} disabled={!globalFile}>Open media editor</button>
          {mediaType === "image" && <button type="button" disabled={!globalFile} onClick={() => setShowCropper(true)}>Crop image</button>}
          {mediaType === "video" && <div className="release-date-time"><label>Trim start (seconds)<input type="number" min="0" max={duration || undefined} step="0.1" value={trimStart} onChange={event => setTrimStart(Number(event.target.value))} /></label><label>Trim end (0 = full)<input type="number" min={trimStart} max={duration || undefined} step="0.1" value={trimEnd} onChange={event => setTrimEnd(Number(event.target.value))} /></label></div>}
          <label>Rotation<select value={rotate} onChange={event => setRotate(Number(event.target.value))}>{[0, 90, 180, 270].map(value => <option key={value} value={value}>{value}°</option>)}</select></label>
          <label className="release-check"><input type="checkbox" checked={flipH} onChange={event => setFlipH(event.target.checked)} />Flip horizontally</label>
          <label className="release-check"><input type="checkbox" checked={flipV} onChange={event => setFlipV(event.target.checked)} />Flip vertically</label>
          <label>Visual filter<select value={selectedFilter || ""} onChange={event => setSelectedFilter(event.target.value || null)}>{[["", "None"], ["grayscale", "Grayscale"], ["sepia", "Sepia"], ["invert", "Invert"], ["brightness", "Brightness Boost"], ["contrast", "High Contrast"]].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Alternate hook or title<input value={variants[0] || ""} onChange={event => setVariants(event.target.value ? [event.target.value] : [])} /></label>
          <label className="release-check"><input type="checkbox" checked={optimizeViral} onChange={event => setOptimizeViral(event.target.checked)} />Request existing viral optimization</label>
          <label className="release-check"><input type="checkbox" checked={protocol7Enabled} onChange={event => setProtocol7Enabled(event.target.checked)} />Protocol 7</label>
          <label>Bounty amount<input type="number" min="0" value={bountyAmount} onChange={event => setBountyAmount(Number(event.target.value))} /></label>
          <label>Bounty niche<input value={bountyNiche} onChange={event => setBountyNiche(event.target.value)} /></label>
        </details>}
      />

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
    </>
  );
};

export default UnifiedPublisher;
