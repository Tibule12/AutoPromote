/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import "./VideoEditor.css";
// Use the main API URL (Node.js) instead of direct Python worker
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL, deleteObject, getStorage } from "firebase/storage";
import MultiCamCombiner from "./MultiCamCombiner";
import ViralClipStudio from "./ViralClipStudio"; // Import the new Studio component
import ThumbnailGenerator from "./ThumbnailGenerator";
import { sanitizeUrl } from "../utils/security";
import useCinematicEffects from "../hooks/useCinematicEffects";
import CinematicEffectsPanel from "./CinematicEffectsPanel";

function VideoEditor({ file, onSave, onCancel, images = [] }) {
  const [videoSrc, setVideoSrc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const abortRef = useRef(false);

  const formatBalance = balance => {
    if (balance === null || typeof balance === "undefined") return 0;
    if (typeof balance === "number" || typeof balance === "string") return balance;
    if (typeof balance === "object") {
      if (typeof balance.balance !== "undefined") return balance.balance;
      if (typeof balance.amount !== "undefined") return balance.amount;
      return JSON.stringify(balance);
    }
    return String(balance);
  };
  const [creditBalance, setCreditBalance] = useState(null);
  const [creditBreakdown, setCreditBreakdown] = useState(null);
  const [creditCosts, setCreditCosts] = useState(null);
  const [topUpPacks, setTopUpPacks] = useState([]);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const paypalButtonsRef = useRef(null);

  const CREDIT_PACKAGES = [
    { id: "pack_boost", credits: 50, price: "4.99", name: "Boost Pack" },
    { id: "pack_pro", credits: 200, price: "14.99", name: "Pro Pack", savings: "25%" },
    { id: "pack_studio", credits: 500, price: "29.99", name: "Studio Pack", savings: "40%" },
  ];

  // Prefer API-fetched packs, fall back to hardcoded defaults
  const effectivePackages = topUpPacks.length > 0 ? topUpPacks : CREDIT_PACKAGES;

  const [processedFile, setProcessedFile] = useState(null);
  const [clipSuggestions, setClipSuggestions] = useState(null); // Store detected clips or manual studio entry
  const [showMultiCamCombiner, setShowMultiCamCombiner] = useState(false);
  const autoOpenedStudioRef = useRef(false);

  const getDownloadFileName = () => {
    const candidateName = processedFile?.name || file?.name || "edited-video.mp4";
    const safeName = String(candidateName || "edited-video.mp4")
      .replace(/\?.*$/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (/\.[a-z0-9]{2,5}$/i.test(safeName)) return safeName;
    return `${safeName || "edited-video"}.mp4`;
  };

  const handleDownloadVideo = async () => {
    if (!videoSrc) {
      setStatusMessage("No processed video is available to download yet.");
      return;
    }

    try {
      const downloadName = getDownloadFileName();

      if (processedFile instanceof File || processedFile instanceof Blob) {
        const objectUrl = URL.createObjectURL(processedFile);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
        setStatusMessage("Download started.");
        return;
      }

      const response = await fetch(videoSrc, { mode: "cors" });
      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      setStatusMessage("Download started.");
    } catch (error) {
      console.warn("Direct download failed, opening video in a new tab instead.", error);
      window.open(sanitizeUrl(videoSrc), "_blank", "noopener,noreferrer");
      setStatusMessage("Opened the processed video in a new tab.");
    }
  };

  // fetch credit balance on mount so user sees it immediately
  useEffect(() => {
    // Warn if the configured API base URL appears to point at the frontend host (common misconfiguration)
    try {
      const apiUrl = new URL(API_BASE_URL);
      if (window && window.location && apiUrl.origin === window.location.origin) {
        console.warn(
          "API_BASE_URL appears to point to the frontend host. This may cause API calls to return HTML instead of JSON.",
          { API_BASE_URL, origin: window.location.origin }
        );
        setStatusMessage(
          "Warning: API base URL may be misconfigured; some features may not work properly."
        );
      }
    } catch (_) {
      // ignore invalid URL
    }

    async function fetchCredits() {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return; // not logged in yet
        const token = await user.getIdToken();
        const r = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/api/media/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const text = await r.text();
          try {
            const data = JSON.parse(text);
            setCreditBalance(data.balance);
            setCreditBreakdown(data.monthly || null);
            setCreditCosts(data.costs || null);
            if (data.topUpPacks) setTopUpPacks(data.topUpPacks);
            const monthlyInfo = data.monthly
              ? ` (${data.monthly.remaining} monthly + ${data.topUp || 0} top-up)`
              : "";
            setStatusMessage(
              `You have ${formatBalance(data.balance)} editing credits available${monthlyInfo}.`
            );
          } catch (jsonErr) {
            const snippet = (text || "").slice(0, 400).replace(/\s+/g, " ");
            console.warn(
              "Credits endpoint returned non-JSON response (likely misconfigured API base URL)",
              { status: r.status, snippet }
            );
            setStatusMessage(
              "Unable to load credit balance (API endpoint misconfigured or unavailable)."
            );
          }
        } else {
          const errorText = await r.text();
          console.warn("Credits endpoint error", r.status, errorText);
          if (r.status === 401) {
            setStatusMessage(
              "Not signed in or session expired. Please log in again to access credit balance."
            );
          } else {
            setStatusMessage("Unable to load credit balance (server error).");
          }
        }
      } catch (e) {
        console.warn("Failed to fetch credit balance", e);
      }
    }

    fetchCredits();

    try {
      const pending = localStorage.getItem("payfastPendingPurchase");
      const url = new URL(window.location.href);
      if (pending || url.searchParams.get("payment") === "success") {
        localStorage.removeItem("payfastPendingPurchase");
        fetchCredits();
        setStatusMessage("Purchase complete! Your updated credit balance is shown above.");
      }
    } catch (_) {
      // ignore storage and URL parsing errors
    }
  }, []);

  // Load PayPal SDK when the credit shop is visible
  useEffect(() => {
    if (!showCreditShop || paypalLoaded) return;

    const load = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.PAYMENTS_PAYPAL_CONFIG);
        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          console.warn("PayPal config endpoint returned invalid JSON", {
            status: res.status,
            text,
          });
        }
        const clientId = (data && data.clientId) || "sb";
        const currency = (data && data.currency) || "USD";

        if (document.getElementById("paypal-sdk-video-editor")) {
          setPaypalLoaded(true);
          return;
        }

        const script = document.createElement("script");
        script.id = "paypal-sdk-video-editor";
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
          clientId
        )}&currency=${encodeURIComponent(currency)}`;
        script.async = true;
        script.onload = () => setPaypalLoaded(true);
        script.onerror = () => {
          console.warn("PayPal SDK failed to load");
          setStatusMessage(
            "Credit purchase unavailable — payment SDK failed to load. Try refreshing."
          );
        };
        document.body.appendChild(script);
      } catch (e) {
        console.warn("Failed to load PayPal SDK:", e);
        setStatusMessage("Credit purchase unavailable — payment SDK failed to load.");
      }
    };

    load();
  }, [showCreditShop, paypalLoaded]);

  // Render PayPal buttons when ready
  useEffect(() => {
    if (!paypalLoaded || !selectedPackage) return;
    if (!window.paypal || !paypalButtonsRef.current) return;

    const container = paypalButtonsRef.current;
    container.replaceChildren();

    window.paypal
      .Buttons({
        createOrder: async () => {
          const auth = getAuth();
          const user = auth.currentUser;
          const token = user ? await user.getIdToken() : null;

          const res = await fetch(
            `${API_BASE_URL.replace(/\/$/, "")}/api/payments/credits/create-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ packageId: selectedPackage.id }),
            }
          );

          const text = await res.text();
          let data = null;
          try {
            data = text ? JSON.parse(text) : null;
          } catch (e) {
            console.warn("create-order returned invalid JSON", { status: res.status, text });
          }

          if (!res.ok) {
            const message =
              (data && (data.error || data.reason)) ||
              (typeof text === "string" && text.trim()) ||
              `HTTP ${res.status}`;
            throw new Error(message);
          }

          if (!data || !data.id) {
            throw new Error("create_order_no_id");
          }
          return data.id;
        },
        onApprove: async data => {
          const auth = getAuth();
          const user = auth.currentUser;
          const token = user ? await user.getIdToken() : null;

          const res = await fetch(
            `${API_BASE_URL.replace(/\/$/, "")}/api/payments/credits/capture-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ orderID: data.orderID, packageId: selectedPackage.id }),
            }
          );

          const details = await res.json();
          console.log("capture-order response:", details);
          if (!res.ok || !details.success) {
            throw new Error(details.error || "capture_failed");
          }

          const newBalance = typeof details.balance === "number" ? details.balance : null;
          const addedCredits = typeof details.newCredits === "number" ? details.newCredits : null;

          if (newBalance !== null) {
            setCreditBalance(newBalance);
          } else {
            setCreditBalance(prev => {
              const prevNum = typeof prev === "number" ? prev : Number(prev) || 0;
              return prevNum + (addedCredits || 0);
            });
          }

          setNeedsCredits(false);
          setStatusMessage(
            `Purchase complete! +${addedCredits != null ? addedCredits : "?"} credits added. (balance: ${
              newBalance != null ? newBalance : "?"
            })`
          );
          setShowCreditShop(false);
          setSelectedPackage(null);
        },
        onError: err => {
          console.error("PayPal Error:", err);
          setStatusMessage("Payment failed. Please try again.");
        },
      })
      .render(container);
  }, [paypalLoaded, selectedPackage]);

  const initiatePayFastCheckout = async pkg => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : null;
      const returnPath = `${window.location.pathname}${window.location.search}`;

      const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/api/payments/payfast/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          packageId: pkg.id,
          returnPath,
          cancelPath: returnPath,
        }),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        console.warn("PayFast init endpoint returned invalid JSON", {
          status: res.status,
          text: text && text.slice ? text.slice(0, 800) : text,
        });
      }

      if (!res.ok) {
        const message =
          (data && (data.details || data.error || data.reason)) ||
          (typeof text === "string" && text.trim()) ||
          `HTTP ${res.status}`;
        throw new Error(message);
      }

      if (!data || !data.redirectUrl || !data.params) {
        throw new Error("invalid_payfast_response");
      }

      try {
        localStorage.setItem("payfastPendingPurchase", "1");
      } catch (_) {
        // ignore if storage isn't available
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.redirectUrl;
      form.style.display = "none";

      Object.entries(data.params).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      console.error("PayFast checkout failed", e);
      setStatusMessage(`PayFast checkout failed: ${e.message || "Please try again."}`);
    }
  };

  // Phase 1 Features State
  const [options, setOptions] = useState({
    smartCrop: false, // 9:16 Vertical Crop (Face Detection)
    cropStyle: "blur", // "blur" (Fit - content safe) or "zoom" (Fill - cuts sides)
    silenceRemoval: false, // Jump Cut / Dead Air Removal
    silenceThreshold: -35, // Silence threshold in dB
    minSilenceDuration: 0.75, // Minimum pause before trimming
    captions: false, // Auto-Captions (Whisper)
    muteAudio: false, // Strip original audio
    addMusic: false, // Background Music
    musicVolume: 0.15, // Base BGM volume
    musicDucking: true, // Lower music while speech is active
    musicDuckingStrength: 0.35, // Speech ducking intensity
    removeWatermark: false, // 🚫 Remove TikTok/Reels Watermark
    watermarkMode: "adaptive", // adaptive, corners, top_right, bottom_left, all
    analyzeClips: false, // 🔍 NEW: Find Viral Moments
    isSearch: false, // Use YouTube Search for Music
    safeSearch: true, // Default: Search only royalty-free music
    musicFile: "upbeat_pop.mp3", // Default filename or search query
    addHook: false, // 🎣 Viral Hook
    hookText: "WAIT FOR IT...", // Default hook text
  });

  const videoRef = useRef(null);
  const blobUrlRef = useRef(null);
  const [showThumbnailGenerator, setShowThumbnailGenerator] = useState(false);
  const [thumbnailData, setThumbnailData] = useState(null); // { dataUrl, storageUrl, text, time }

  // Cinematic Effects — all CSS-based, no backend needed
  const {
    fx,
    showPanel: showEffectsPanel,
    setShowPanel: setShowEffectsPanel,
    applyPreset,
    updateFx,
    resetFx,
    mediaStyle: effectsMediaStyle,
    edgeBlurStyle,
    vignetteStyle,
    overlayStyle,
    grainStyle,
    letterboxStyle,
    fadeStyle,
    hasEffects,
    attachVideo,
  } = useCinematicEffects();

  // Attach video element for timed effects (blur timing, fade)
  useEffect(() => {
    if (videoRef.current) attachVideo(videoRef.current);
  });

  // Initialize video source from file prop
  useEffect(() => {
    if (file) {
      if (file.isRemote) {
        setVideoSrc(file.url);
        setProcessedFile(file);
      } else if (file instanceof File || file instanceof Blob) {
        // Revoke the previous blob URL only if we're creating a new one for a different file
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = null;
        }
        const url = URL.createObjectURL(file);
        blobUrlRef.current = url;
        setVideoSrc(url);
        setProcessedFile(file);
      } else if (typeof file === "string") {
        setVideoSrc(file);
      }
    }
  }, [file]);

  // Revoke blob URL only on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (autoOpenedStudioRef.current || clipSuggestions || processing || !videoSrc) return;
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const isSmallTouchDevice =
      window.matchMedia?.("(max-width: 768px)")?.matches &&
      Number(navigator.maxTouchPoints || 0) > 0;
    const isIosDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent || "");

    if (!isSmallTouchDevice && !isIosDevice) return;

    autoOpenedStudioRef.current = true;
    handleLaunchStudio();
  }, [clipSuggestions, processing, videoSrc]);

  const toggleOption = key => {
    // Allow users to stack multiple AI features comfortably
    if (key === "analyzeClips") {
      // "Find Viral Moments" is a special mode that changes the UI flow
      // so we might want to keep it exclusive or handle it carefully.
      // For now, let's keep analyze separate as it returns data, not a video.
      setOptions(prev => ({
        ...prev,
        analyzeClips: !prev.analyzeClips,
        // If turning ON analysis, disable render-heavy opts to avoid confusion
        // (or we can leave them and the backend handles it)
        smartCrop: !prev.analyzeClips ? false : prev.smartCrop,
        silenceRemoval: !prev.analyzeClips ? false : prev.silenceRemoval,
        captions: !prev.analyzeClips ? false : prev.captions,
        addMusic: !prev.analyzeClips ? false : prev.addMusic,
      }));
    } else {
      // For all other enhancements (Crop, Silence, Captions, Music), allow stacking!
      setOptions(prev => ({
        ...prev,
        [key]: !prev[key],
        // content analysis is mutually exclusive with direct rendering usually
        analyzeClips: false,
      }));
    }
  };

  const handleProcess = async (targetOverride = null, optionsOverride = null) => {
    const effectiveOptions = optionsOverride || options;

    if (
      !effectiveOptions.smartCrop &&
      !effectiveOptions.silenceRemoval &&
      !effectiveOptions.captions &&
      !effectiveOptions.muteAudio &&
      !effectiveOptions.addMusic &&
      !effectiveOptions.removeWatermark &&
      !effectiveOptions.analyzeClips &&
      !effectiveOptions.addHook
    ) {
      setStatusMessage("Please select at least one AI feature.");
      return;
    }

    setProcessing(true);
    setStatusMessage("Initializing AI Processing...");

    try {
      // 1. Get Auth Token
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in to use AI tools.");
      let token = await user.getIdToken();

      // 2. Upload File (if local)
      let fileUrl = "";
      // Track original uploaded path for cleanup
      let tempUploadRef = null;

      // Use the CURRENT processed file (initially clean, then result of previous op)
      const targetFile = targetOverride || processedFile || file;

      if (targetFile instanceof File || targetFile instanceof Blob) {
        setStatusMessage("Uploading video for processing...");
        const storagePath = `temp_uploads/${user.uid}/${Date.now()}_source.mp4`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, targetFile);
        fileUrl = await getDownloadURL(storageRef);
        tempUploadRef = storageRef;
      } else {
        // Assume it's already a URL if passed as string or object with url
        // This handles our "fakeFile" produced by previous steps (with .url property)
        fileUrl = targetFile && targetFile.url ? targetFile.url : targetFile;
      }

      setStatusMessage("Processing Video (This may take a minute)...");

      // 3. Call Node.js Backend
      console.log("Sending AI Request:", { fileUrl, options: effectiveOptions });

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: fileUrl,
          options: effectiveOptions,
        }),
      });

      if (!response.ok) {
        if (response.status === 403 || response.status === 402) {
          // STRICT CREDIT BILLING: AI Features are Pay-As-You-Go
          setNeedsCredits(true);
          setShowCreditShop(true);
          setStatusMessage("Not enough credits to process the video. Purchase more to continue.");
          return;
        }
        const errorData = await response.json();
        // Include detailed error message from backend if available
        const message = errorData.details
          ? `${errorData.message}: ${errorData.details}`
          : errorData.message || "Processing Failed";
        throw new Error(message);
      }

      let result = await response.json();

      // ASYNC POLLING SUPPORT: If backend returns a jobId, we must poll for completion
      if (result.jobId) {
        const jobId = result.jobId;
        setStatusMessage("Job Queued. Waiting for worker...");

        // Poll loop
        abortRef.current = false;
        let attempts = 0;
        while (true) {
          if (abortRef.current) throw new Error("Processing cancelled by user.");
          if (attempts > 1800) throw new Error("Processing timed out (1h limit)"); // Extended to 1h for long 0.3x renders
          await new Promise(r => setTimeout(r, 2000)); // Sleep 2s
          attempts++;

          let statusRes = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // Handle Token Expiry (401)
          if (statusRes.status === 401) {
            console.warn("Token expired during polling, refreshing...");
            try {
              // Refresh Firebase token
              token = await user.getIdToken(true);
              // Retry request with new token
              statusRes = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
            } catch (err) {
              console.error("Token refresh failed:", err);
              throw new Error("Authentication session expired.");
            }
          }

          if (!statusRes.ok) {
            console.warn(`Status check failed (${statusRes.status}), retrying...`);
            continue;
          }

          const statusData = await statusRes.json();
          console.log(`Job ${jobId} status: ${statusData.status}`);

          if (statusData.status === "failed") {
            throw new Error(statusData.error || "Processing failed on server");
          }

          if (statusData.status === "completed") {
            // FIX: If result is nested, use it. Otherwise, assume statusData IS the result.
            // Also ensure we don't accidentally set 'result' to undefined.
            result = statusData.result || statusData;
            break;
          }

          // Updates
          const progress = statusData.progress || 0;
          const detail = statusData.detail ? ` - ${statusData.detail}` : "";
          setStatusMessage(`Processing Video... ${progress}%${detail}`); // Dynamic updates
        }
      }

      // Ensure we handle cases where result.remainingCredits might be undefined/hidden
      const creditsMsg =
        result.remainingCredits !== undefined
          ? ` Remaining Credits: ${result.remainingCredits}`
          : "";
      setStatusMessage(`Success!${creditsMsg}`);

      // If we got Viral Clips back (check both top-level and nested scenarios), switch to Studio Mode
      const suggestions = result.clipSuggestions || (result.data && result.data.clipSuggestions);

      if (suggestions && suggestions.length > 0) {
        setClipSuggestions(suggestions);
        setProcessing(false);
        return;
      }

      // Do not attempt to delete temp uploads from the browser. The client often
      // lacks Firebase Storage delete permission, which creates noisy 403 errors.
      // Lifecycle cleanup on the bucket should handle these temporary files.
      if (tempUploadRef) {
        console.info(
          "Skipping client-side temp upload deletion; relying on backend/storage cleanup."
        );
      } else if (fileUrl && fileUrl.includes("temp_uploads") && targetFile.url) {
        // If we used a previous result which was also temp, maybe clean it?
        // But we might need it if user hits 'undo'. Let's keep it for now.
        // Or rely on lifecycle rules.
      }

      // Ensure we don't accidentally set 'result' to undefined.
      const finalResult = result;

      const finalUrl = finalResult.output_url || finalResult.url;
      if (finalUrl) {
        // Force UI refresh by ensuring the URL is treated as new.
        // SIGNED URL SAFEGUARDS: Do NOT append cache busters to Signed URLs (Google/AWS) or Firebase Tokens.
        // Modifying the query string invalidates the signature!
        const isSigned =
          finalUrl.includes("Signature") ||
          finalUrl.includes("token=") ||
          finalUrl.includes("Expires");

        const urlWithCacheBuster = isSigned
          ? finalUrl
          : finalUrl.includes("?")
            ? `${finalUrl}&t=${Date.now()}`
            : `${finalUrl}?t=${Date.now()}`;

        console.log("Setting Video Source:", urlWithCacheBuster);
        setVideoSrc(urlWithCacheBuster);

        // FORCE RE-RENDER OF VIDEO ELEMENT using the correct ref
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.play().catch(e => {
            if (e?.name !== "AbortError") {
              console.warn("Auto-play blocked:", e);
            }
          });
        }

        try {
          // Note: This fetch might fail if CORS is not configured on the Storage bucket.
          // If it fails, we will wrap the URL in a File-like object or pass the URL directly.
          // For Signed URLs, we use the EXACT URL without modification.
          const videoBlob = await fetch(urlWithCacheBuster, { mode: "cors" }).then(r => {
            if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
            return r.blob();
          });
          // Update state so next step uses THIS new file instead of original
          const newFile = new File([videoBlob], "processed_video.mp4", { type: "video/mp4" });
          setProcessedFile(newFile);
        } catch (e) {
          console.warn(
            "Could not fetch blob (likely CORS or Signature). Using remote URL directly."
          );
          const fakeFile = {
            name: "processed_video_remote.mp4",
            type: "video/mp4",
            url: urlWithCacheBuster,
            isRemote: true,
          };
          setProcessedFile(fakeFile);
        }
      }
    } catch (error) {
      console.error("Processing error:", error);
      setStatusMessage(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleLaunchStudio = durationOverride => {
    const explicitDuration = Number(durationOverride || 0);
    const previewDuration = Number(videoRef.current?.duration || 0);
    const fallbackDuration =
      Number.isFinite(explicitDuration) && explicitDuration > 0
        ? explicitDuration
        : Number.isFinite(previewDuration) && previewDuration > 0
          ? previewDuration
          : 30;

    setStatusMessage("");
    setClipSuggestions([
      {
        id: "full-video",
        start: 0,
        end: fallbackDuration,
        duration: fallbackDuration,
        reason: "Full source video loaded for manual editing",
      },
    ]);
  };

  const handleThumbnailSelect = (thumbData) => {
    setThumbnailData(thumbData);
    setShowThumbnailGenerator(false);
  };

  const handleSave = () => {
    const payload = processedFile || file;
    if (thumbnailData) {
      payload.thumbnailFrame = thumbnailData.dataUrl;
      payload.coverFrame = thumbnailData.dataUrl;
      payload.thumbnailUrl = thumbnailData.storageUrl;
    }
    onSave(payload);
  };

  const handleViralRender = async (selectedClip, overlays, extraOptions = {}) => {
    setStatusMessage("Rendering your viral clip with overlays...");
    setProcessing(true);
    setClipSuggestions(null); // Close studio but keep processing state

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in.");
      let token = await user.getIdToken();

      // FIX: Ensure videoSrc is a Real URL (Firebase/Cloud), not a Local Blob.
      // If it's a blob, we must upload it first.
      let finalVideoUrl = videoSrc;
      if (videoSrc.startsWith("blob:")) {
        setStatusMessage("Uploading local video to cloud for processing...");
        const blob = await fetch(videoSrc).then(r => r.blob());
        const auth = getAuth();
        const storage = getStorage();
        const fileName = `temp_uploads/${auth.currentUser.uid}/${Date.now()}_source.mp4`;
        const fileRef = ref(storage, fileName);
        await uploadBytes(fileRef, blob);
        finalVideoUrl = await getDownloadURL(fileRef);
        console.log("Uploaded local blob to:", finalVideoUrl);
      }

      // Prepare payload
      const timelineSegments =
        Array.isArray(extraOptions.timelineSegments) && extraOptions.timelineSegments.length > 0
          ? extraOptions.timelineSegments
          : [
              {
                id: "main",
                url: finalVideoUrl,
                start_time: selectedClip.start,
                end_time: selectedClip.end,
                duration: selectedClip.end - selectedClip.start,
              },
            ];
      const totalDuration = timelineSegments.reduce(
        (sum, segment) => sum + Math.max(0, Number(segment.duration || 0)),
        0
      );
      const payload = {
        video_url: finalVideoUrl,
        start_time: 0,
        end_time: totalDuration || selectedClip.end - selectedClip.start,
        overlays: overlays,
        auto_captions: !!extraOptions.autoCaptions,
        timeline_segments: timelineSegments,
        background_audio: extraOptions.backgroundAudio || null,
        hook_focus_point: extraOptions.hookFocusPoint || null,
        cover_frame: extraOptions.coverFrame || null,
        thumbnail_frame: extraOptions.thumbnailFrame || extraOptions.coverFrame || null,
        // smart_crop: !!extraOptions.smartCrop, // Backend supports this? Check Python worker.
      };

      // NOTE: backend 'mediaRoutes.js' expects 'fileUrl' and 'options'.
      // But 'videoEditingService.js' puts 'payload' inside 'options.viralData'.
      // So detailed fields go into 'payload' (viralData).
      // Let's pass smartCrop in both places to be safe if backend logic varies.

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: finalVideoUrl,
          options: {
            ...options,
            ...(extraOptions.addMusic !== undefined ? { addMusic: !!extraOptions.addMusic } : {}),
            ...(extraOptions.musicFile !== undefined ? { musicFile: extraOptions.musicFile } : {}),
            ...(extraOptions.isSearch !== undefined ? { isSearch: !!extraOptions.isSearch } : {}),
            ...(extraOptions.safeSearch !== undefined
              ? { safeSearch: !!extraOptions.safeSearch }
              : {}),
            ...(extraOptions.musicVolume !== undefined
              ? { musicVolume: Number(extraOptions.musicVolume) }
              : {}),
            ...(extraOptions.musicDucking !== undefined
              ? { musicDucking: !!extraOptions.musicDucking }
              : {}),
            ...(extraOptions.musicDuckingStrength !== undefined
              ? { musicDuckingStrength: Number(extraOptions.musicDuckingStrength) }
              : {}),
            ...(extraOptions.muteAudio !== undefined
              ? { muteAudio: !!extraOptions.muteAudio }
              : {}),
            ...(extraOptions.silenceRemoval !== undefined
              ? { silenceRemoval: !!extraOptions.silenceRemoval }
              : {}),
            ...(extraOptions.silenceThreshold !== undefined
              ? { silenceThreshold: Number(extraOptions.silenceThreshold) }
              : {}),
            ...(extraOptions.minSilenceDuration !== undefined
              ? { minSilenceDuration: Number(extraOptions.minSilenceDuration) }
              : {}),
            ...(extraOptions.removeWatermark !== undefined
              ? { removeWatermark: !!extraOptions.removeWatermark }
              : {}),
            ...(extraOptions.watermarkMode !== undefined
              ? { watermarkMode: extraOptions.watermarkMode }
              : {}),
            ...(extraOptions.manualWatermarkRegions !== undefined
              ? { manualWatermarkRegions: extraOptions.manualWatermarkRegions }
              : {}),
            ...(extraOptions.addHook !== undefined ? { addHook: !!extraOptions.addHook } : {}),
            ...(extraOptions.hookText !== undefined ? { hookText: extraOptions.hookText } : {}),
            ...(extraOptions.hookIntroSeconds !== undefined
              ? { hookIntroSeconds: Number(extraOptions.hookIntroSeconds) }
              : {}),
            ...(extraOptions.hookTemplate !== undefined
              ? { hookTemplate: extraOptions.hookTemplate }
              : {}),
            ...(extraOptions.hookStartTime !== undefined
              ? { hookStartTime: Number(extraOptions.hookStartTime) }
              : {}),
            ...(extraOptions.hookBlurBackground !== undefined
              ? { hookBlurBackground: !!extraOptions.hookBlurBackground }
              : {}),
            ...(extraOptions.hookDarkOverlay !== undefined
              ? { hookDarkOverlay: !!extraOptions.hookDarkOverlay }
              : {}),
            ...(extraOptions.hookFreezeFrame !== undefined
              ? { hookFreezeFrame: !!extraOptions.hookFreezeFrame }
              : {}),
            ...(extraOptions.hookZoomScale !== undefined
              ? { hookZoomScale: Number(extraOptions.hookZoomScale) }
              : {}),
            ...(extraOptions.hookTextAnimation !== undefined
              ? { hookTextAnimation: extraOptions.hookTextAnimation }
              : {}),
            ...(extraOptions.hookFocusPoint !== undefined
              ? { hookFocusPoint: extraOptions.hookFocusPoint }
              : {}),
            ...(extraOptions.coverFrame !== undefined
              ? { coverFrame: extraOptions.coverFrame }
              : {}),
            ...(extraOptions.thumbnailFrame !== undefined
              ? { thumbnailFrame: extraOptions.thumbnailFrame }
              : {}),
            ...(extraOptions.enhanceQuality !== undefined
              ? { enhanceQuality: !!extraOptions.enhanceQuality }
              : {}),
            ...(extraOptions.hookEndTime !== undefined
              ? { hookEndTime: Number(extraOptions.hookEndTime) }
              : {}),
            ...(extraOptions.hookSourceStartTime !== undefined
              ? { hookSourceStartTime: Number(extraOptions.hookSourceStartTime) }
              : {}),
            ...(extraOptions.hookSourceEndTime !== undefined
              ? { hookSourceEndTime: Number(extraOptions.hookSourceEndTime) }
              : {}),
            ...(extraOptions.exportDestination !== undefined
              ? { exportDestination: extraOptions.exportDestination }
              : {}),
            renderViral: true,
            analyzeClips: false,
            viralData: payload,
            // Pass simple flags at top level if needed by other services
            smartCrop: !!extraOptions.smartCrop,
          },
        }),
      });

      if (!response.ok) {
        const debugText = await response.text();
        console.error("Backend Error Text:", debugText);
        try {
          const errJson = JSON.parse(debugText);
          throw new Error(errJson.detail || errJson.message || "Rendering failed");
        } catch (e) {
          throw new Error(`Rendering failed: ${response.status} ${response.statusText}`);
        }
      }

      let result = await response.json();

      // ASYNC POLLING (Viral Clip Render)
      if (result.jobId) {
        const jobId = result.jobId;
        setStatusMessage("Queued for Rendering...");

        let attempts = 0;
        while (true) {
          if (attempts > 300) throw new Error("Rendering timed out");
          await new Promise(r => setTimeout(r, 2000));
          attempts++;

          let statusRes = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // Handle Token Expiry (401)
          if (statusRes.status === 401) {
            console.warn("Token expired during viral render polling, refreshing...");
            try {
              token = await user.getIdToken(true);
              statusRes = await fetch(`${API_BASE_URL}/api/media/status/${jobId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
            } catch (err) {
              console.error("Token refresh failed:", err);
              throw new Error("Authentication session expired.");
            }
          }

          if (!statusRes.ok) continue;
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            throw new Error(statusData.error || "Rendering failed on server");
          }

          if (statusData.status === "completed") {
            result = statusData.result;
            break;
          }

          setStatusMessage(`Rendering Clip... ${statusData.progress || 0}%`);
        }
      }
      // Update the main editor with the final rendered clip
      if (result.url) {
        const urlWithCacheBuster = `${result.url}?t=${Date.now()}`;
        setVideoSrc(urlWithCacheBuster);
        const fakeFile = {
          name: `viral_clip_rendered.mp4`,
          type: "video/mp4",
          url: result.url,
          thumbnailUrl: result.thumbnailUrl || null,
          coverFrame: result.coverFrame || null,
          thumbnailFrame: result.thumbnailFrame || null,
          isRemote: true,
        };
        setProcessedFile(fakeFile);
        setStatusMessage("Viral Clip Rendered! Auto-saving...");

        // Automatically save back to parent if onSave is provided
        if (onSave) {
          onSave(fakeFile);
        }
      } else {
        console.error("Rendering succeeded but no URL returned:", result);
        setStatusMessage("Error: Server returned success but no video URL.");
      }
    } catch (error) {
      console.error("Viral Render Error:", error);
      let msg = error.message;
      if (msg === "Failed to fetch") msg = "Network error. Is the backend running?";
      setStatusMessage("Error rendering clip: " + msg);
      // Do NOT re-open studio automatically, let user decide
      // setClipSuggestions(options.clipSuggestions);
    } finally {
      setProcessing(false);
    }
  };

  const handleMultiCamComplete = async multiCamFile => {
    const finalUrl =
      multiCamFile?.url || (multiCamFile?.file ? URL.createObjectURL(multiCamFile.file) : "");

    if (!finalUrl) {
      setStatusMessage("Multi-camera render finished without a usable output URL.");
      return;
    }

    const workflowAction = multiCamFile.workflowAction || "rendered-master";
    const isBlobUrl = finalUrl.startsWith("blob:");
    const isSigned =
      finalUrl.includes("Signature") || finalUrl.includes("token=") || finalUrl.includes("Expires");
    const urlWithCacheBuster = isSigned
      ? finalUrl
      : isBlobUrl
        ? finalUrl
        : finalUrl.includes("?")
          ? `${finalUrl}&t=${Date.now()}`
          : `${finalUrl}?t=${Date.now()}`;

    autoOpenedStudioRef.current = true;
    setProcessedFile(multiCamFile.file || multiCamFile);
    setVideoSrc(urlWithCacheBuster);
    setShowMultiCamCombiner(false);

    if (workflowAction === "generate-clips") {
      setStatusMessage("Preparing AI clip analysis from the preview master...");
      await handleProcess(multiCamFile.file || multiCamFile, {
        smartCrop: false,
        silenceRemoval: false,
        captions: false,
        muteAudio: false,
        addMusic: false,
        removeWatermark: false,
        analyzeClips: true,
        addHook: false,
      });
      return;
    }

    if (workflowAction === "refine-full-video") {
      setStatusMessage("Opening Viral Clip Studio with the preview master...");
      handleLaunchStudio(multiCamFile.duration || 30);
      return;
    }

    handleLaunchStudio(multiCamFile.duration || 30);
  };

  if (clipSuggestions) {
    const studio = (
      <ViralClipStudio
        videoUrl={videoSrc}
        clips={clipSuggestions}
        images={images}
        onSave={handleViralRender}
        onCancel={() => setClipSuggestions(null)}
        onStatusChange={setStatusMessage}
        // Pass down music state
        currentMusic={options.musicFile}
        onMusicChange={(newMusic, isSearchMode) => {
          setOptions(prev => ({ ...prev, musicFile: newMusic, isSearch: isSearchMode }));
        }}
      />
    );

    if (typeof document !== "undefined" && document.body) {
      return createPortal(studio, document.body);
    }

    return studio;
  }

  if (showMultiCamCombiner) {
    const combiner = (
      <MultiCamCombiner
        primaryFile={processedFile || file}
        onCancel={() => setShowMultiCamCombiner(false)}
        onComplete={handleMultiCamComplete}
        onStatusChange={setStatusMessage}
      />
    );

    if (typeof document !== "undefined" && document.body) {
      return createPortal(combiner, document.body);
    }

    return combiner;
  }

  return (
    <div className="video-editor-container">
      <div className="video-editor-header">
        <h2>Video Editing Workspace</h2>
        <button className="close-btn" onClick={onCancel}>
          &times;
        </button>
      </div>

      {statusMessage ? (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255, 235, 160, 0.35)",
            border: "1px solid rgba(255, 204, 0, 0.5)",
            borderRadius: "8px",
            margin: "10px 20px",
            color: "#1c1c1c",
            fontSize: "0.9rem",
            fontWeight: "700",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ flex: 1 }}>{statusMessage}</span>
            {creditBalance !== null ? (
              <button
                onClick={() => {
                  setShowCreditShop(true);
                  setSelectedPackage(effectivePackages[0]);
                }}
                style={{
                  marginLeft: "12px",
                  background: "#222",
                  color: "#ffd700",
                  border: "1px solid #ffd700",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontWeight: "700",
                }}
              >
                Top Up Credits
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {needsCredits && !showCreditShop ? (
        <div
          style={{
            padding: "14px 18px",
            background: "rgba(255, 220, 220, 0.45)",
            border: "1px solid rgba(255, 100, 100, 0.5)",
            borderRadius: "8px",
            margin: "10px 20px",
            color: "#1c1c1c",
            fontSize: "0.9rem",
            fontWeight: "700",
          }}
        >
          <div style={{ marginBottom: "8px" }}>Not enough credits for this operation.</div>
          <div
            style={{ fontSize: "0.82rem", fontWeight: 500, opacity: 0.85, marginBottom: "10px" }}
          >
            {creditBreakdown
              ? `Monthly: ${creditBreakdown.remaining} remaining · Top-up: ${formatBalance(creditBalance) - (creditBreakdown.remaining || 0)} available`
              : `Balance: ${formatBalance(creditBalance)} credits`}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setShowCreditShop(true);
                setSelectedPackage(effectivePackages[0]);
              }}
              style={{
                background: "#222",
                color: "#ffd700",
                border: "1px solid #ffd700",
                borderRadius: "6px",
                padding: "8px 14px",
                cursor: "pointer",
                fontWeight: "700",
              }}
            >
              Buy Credit Top-Up
            </button>
          </div>
        </div>
      ) : null}

      {showCreditShop ? (
        <div
          style={{
            padding: "16px 18px",
            background: "rgba(30, 30, 30, 0.9)",
            border: "1px solid rgba(150, 150, 150, 0.3)",
            borderRadius: "10px",
            margin: "10px 20px",
            color: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>Credit Top-Up</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                Credits added here stack on top of your monthly plan allocation.
              </div>
            </div>
            <button
              onClick={() => setShowCreditShop(false)}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: "6px",
                color: "#fff",
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {effectivePackages.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg)}
                style={{
                  flex: 1,
                  minWidth: "140px",
                  padding: "12px",
                  borderRadius: "10px",
                  border:
                    selectedPackage?.id === pkg.id
                      ? "2px solid #4caf50"
                      : "1px solid rgba(255,255,255,0.2)",
                  background:
                    selectedPackage?.id === pkg.id ? "rgba(76, 175, 80, 0.15)" : "rgba(0,0,0,0.35)",
                  color: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>{pkg.name}</div>
                <div style={{ fontSize: "0.85rem", opacity: 0.86 }}>
                  {pkg.credits} credits • ${pkg.price}
                </div>
                {pkg.savings ? (
                  <div style={{ fontSize: "0.78rem", color: "#4caf50", marginTop: "4px" }}>
                    Save {pkg.savings}
                  </div>
                ) : null}
              </button>
            ))}
          </div>

          <div style={{ marginTop: "14px" }}>
            <div ref={paypalButtonsRef} />
            <div style={{ marginTop: "10px", fontSize: "0.82rem", opacity: 0.8 }}>
              Payments handled securely by PayPal.
            </div>

            <div style={{ marginTop: "16px" }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>Or pay with PayFast</div>
              <button
                onClick={() => {
                  if (!selectedPackage) return;
                  initiatePayFastCheckout(selectedPackage);
                }}
                style={{
                  background: "#f97316",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Pay with PayFast
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="editor-layout studio-first">
        <div
          className="video-preview"
          style={{ display: "flex", overflow: "hidden", position: "relative" }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              height: "100%",
            }}
          >
            {videoSrc ? (
              <>
                {/* Video wrapped with effects layer */}
                <div
                  className="cep-media-wrapper"
                  style={{ flex: 1, background: "#000", position: "relative", overflow: "hidden" }}
                >
                  {thumbnailData && (
                    <div
                      style={{
                        position: "absolute", top: 8, right: 8, zIndex: 10,
                        background: "rgba(0,0,0,0.7)", borderRadius: 8, padding: 4,
                        border: "2px solid #a78bfa",
                      }}
                    >
                      <img
                        src={thumbnailData.dataUrl}
                        alt="Thumbnail preview"
                        style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 4, display: "block" }}
                      />
                      <div style={{ color: "#a78bfa", fontSize: 9, textAlign: "center", marginTop: 2 }}>
                        Thumbnail
                      </div>
                    </div>
                  )}
                  <video
                    key={videoSrc}
                    ref={videoRef}
                    src={sanitizeUrl(videoSrc)}
                    controls
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      ...effectsMediaStyle,
                    }}
                  />
                  {/* Edge blur overlay (depth-of-field) */}
                  {edgeBlurStyle && <div style={edgeBlurStyle} />}
                  {/* Vignette overlay */}
                  {vignetteStyle && <div style={vignetteStyle} />}
                  {/* Color / gradient overlay */}
                  {overlayStyle && <div style={overlayStyle} />}
                  {/* Film grain */}
                  {grainStyle && <div style={grainStyle} />}
                  {/* Letterbox bars */}
                  {letterboxStyle && (
                    <>
                      <div style={letterboxStyle.top} />
                      <div style={letterboxStyle.bottom} />
                    </>
                  )}
                  {/* Fade in/out */}
                  {fadeStyle && <div style={fadeStyle} />}
                </div>

                {/* Bottom bar: Effects toggle + Download */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#111",
                    gap: "10px",
                    flexShrink: 0,
                  }}
                >
                  <button
                    type="button"
                    className={`cep-toggle-btn ${showEffectsPanel ? "is-active" : ""}`}
                    onClick={() => setShowEffectsPanel(v => !v)}
                    title="Toggle Cinematic Effects panel"
                  >
                    {hasEffects && <span className="cep-dot" />}✨{" "}
                    {showEffectsPanel ? "Hide Effects" : "Effects"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadVideo}
                    style={{
                      color: "#4caf50",
                      background: "none",
                      border: "none",
                      fontWeight: "bold",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    📥 Download
                  </button>
                </div>
              </>
            ) : (
              <div className="loading-placeholder">Loading Video...</div>
            )}
          </div>

          {/* Cinematic Effects Panel — slides in from the right */}
          {showEffectsPanel && (
            <CinematicEffectsPanel
              fx={fx}
              onUpdate={(key, val) => updateFx(key, val)}
              onApplyPreset={applyPreset}
              onReset={resetFx}
              hasEffects={hasEffects}
            />
          )}
        </div>

        <div className="ai-controls">
          <div className="studio-launch-card">
            <div className="studio-launch-eyebrow">Primary workflow</div>
            <h3>Open Viral Clip Studio</h3>
            <p>
              Edit timing, overlays, captions, donor audio, and export — all from one workspace.
            </p>
            {creditCosts && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  margin: "8px 0 12px",
                  fontSize: "0.78rem",
                  opacity: 0.85,
                }}
              >
                <span
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                  }}
                >
                  Render clip: {creditCosts["render-clip"] || 5} cr
                </span>
                <span
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                  }}
                >
                  Full process: {creditCosts.process || 10} cr
                </span>
                <span
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                  }}
                >
                  Analyze: {creditCosts.analyze || 8} cr
                </span>
                <span
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "3px 8px",
                    borderRadius: "4px",
                  }}
                >
                  Transcribe: {creditCosts.transcribe || 3} cr
                </span>
              </div>
            )}
            <div className="studio-launch-actions">
              <button
                className="process-btn studio-launch-btn"
                onClick={handleLaunchStudio}
                disabled={processing}
              >
                {processing ? "Launching Studio..." : "🔥 Launch Viral Clip Studio"}
              </button>
              <button
                className="legacy-toggle-btn multicam-launch-btn"
                onClick={() => {
                  setStatusMessage("");
                  setShowMultiCamCombiner(true);
                }}
                disabled={processing}
                type="button"
              >
                Combine Multi-Camera Angles First
              </button>
            </div>
          </div>

          <div className="status-message-container">
            {statusMessage && (
              <div className="status-message">
                {processing && <span className="spinner">⏳ </span>}
                {statusMessage}
                {processing && (
                  <button
                    className="cancel-btn"
                    style={{ marginLeft: "12px", padding: "4px 12px", fontSize: "0.8rem" }}
                    onClick={() => {
                      abortRef.current = true;
                      setStatusMessage("Cancelling...");
                    }}
                  >
                    Cancel Processing
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="video-actions">
            <button
              type="button"
              onClick={() => setShowThumbnailGenerator(true)}
              disabled={!videoSrc || processing}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "2px solid #a78bfa",
                background: thumbnailData ? "rgba(167,139,250,0.15)" : "transparent",
                color: thumbnailData ? "#c4b5fd" : "#a78bfa",
                fontWeight: 600, fontSize: 14, cursor: videoSrc ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {thumbnailData ? "📸 ✓ Thumbnail Ready" : "🎬 Generate Thumbnail"}
            </button>
            <button className="cancel-btn" onClick={onCancel} disabled={processing}>
              Cancel
            </button>
            <button className="save-btn" onClick={handleSave} disabled={processing}>
              Save & Continue
            </button>
          </div>
        </div>
      </div>
      {showThumbnailGenerator && (
        <ThumbnailGenerator
          videoSrc={videoSrc}
          videoRef={videoRef}
          onSelect={handleThumbnailSelect}
          onClose={() => setShowThumbnailGenerator(false)}
        />
      )}
    </div>
  );
}

export default VideoEditor;
