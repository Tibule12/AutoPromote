/* eslint-disable no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import "./VideoEditor.css";
// Use the main API URL (Node.js) instead of direct Python worker
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { getAuth } from "firebase/auth";
import { storage } from "../firebaseClient";
import { ref, uploadBytes, getDownloadURL, deleteObject, getStorage } from "firebase/storage";
import ViralClipStudio from "./ViralClipStudio"; // Import the new Studio component
import { sanitizeUrl } from "../utils/security";

function VideoEditor({ file, onSave, onCancel, images = [] }) {
  const [videoSrc, setVideoSrc] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

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
  const [needsCredits, setNeedsCredits] = useState(false);
  const [showCreditShop, setShowCreditShop] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const paypalButtonsRef = useRef(null);

  const CREDIT_PACKAGES = [
    { id: "pack_small", credits: 50, price: "4.99", name: "Starter Pack" },
    { id: "pack_medium", credits: 150, price: "12.99", name: "Pro Pack" },
    { id: "pack_large", credits: 500, price: "39.99", name: "Mega Pack" },
  ];

  const [processedFile, setProcessedFile] = useState(null);
  const [clipSuggestions, setClipSuggestions] = useState(null); // Store detected clips

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
        const r = await fetch(API_ENDPOINTS.CREDITS_BALANCE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          // Some responses may be HTML/redirects in misconfigured environments.
          // Guard against JSON parse failures.
          const text = await r.text();
          try {
            const data = JSON.parse(text);
            console.log("credits/balance response:", data);
            setCreditBalance(data.balance);
            setStatusMessage(`You have ${formatBalance(data.balance)} credits available.`);
          } catch (jsonErr) {
            // Avoid dumping huge HTML into console while still keeping enough info
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

    // If we came back from a PayFast purchase (redirect), refresh balance again
    try {
      const pending = localStorage.getItem("payfastPendingPurchase");
      if (pending) {
        localStorage.removeItem("payfastPendingPurchase");
        fetchCredits();
        setStatusMessage("Purchase complete! Your updated credit balance is shown above.");
      }
    } catch (_) {
      // ignore storage errors (private browsing)
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
        document.body.appendChild(script);
      } catch (e) {
        console.warn("Failed to load PayPal SDK:", e);
      }
    };

    load();
  }, [showCreditShop, paypalLoaded]);

  // Render PayPal buttons when ready
  useEffect(() => {
    if (!paypalLoaded || !selectedPackage) return;
    if (!window.paypal || !paypalButtonsRef.current) return;

    const container = paypalButtonsRef.current;
    container.innerHTML = "";

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

      const res = await fetch(`${API_BASE_URL}/api/payments/payfast/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ packageId: pkg.id }),
      });

      try {
        localStorage.setItem("payfastPendingPurchase", "1");
      } catch (_) {
        // ignore if storage isn't available
      }

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
          (data && (data.error || data.reason)) ||
          (typeof text === "string" && text.trim()) ||
          `HTTP ${res.status}`;
        throw new Error(message);
      }

      if (!data || !data.redirectUrl || !data.params) throw new Error("invalid_payfast_response");

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
      setStatusMessage("PayFast checkout failed. Please try again.");
    }
  };

  // Phase 1 Features State
  const [options, setOptions] = useState({
    smartCrop: false, // 9:16 Vertical Crop (Face Detection)
    cropStyle: "blur", // "blur" (Fit - content safe) or "zoom" (Fill - cuts sides)
    silenceRemoval: false, // Jump Cut / Dead Air Removal
    captions: false, // Auto-Captions (Whisper)
    muteAudio: false, // Strip original audio
    addMusic: false, // Background Music
    analyzeClips: false, // 🔍 NEW: Find Viral Moments
    isSearch: false, // Use YouTube Search for Music
    safeSearch: true, // Default: Search only royalty-free music
    musicFile: "upbeat_pop.mp3", // Default filename or search query
    addHook: false, // 🎣 Viral Hook
    hookText: "WAIT FOR IT...", // Default hook text
  });

  const videoRef = useRef(null);

  // Initialize video source from file prop
  useEffect(() => {
    if (file) {
      if (file.isRemote) {
        setVideoSrc(file.url);
        setProcessedFile(file);
      } else {
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        setProcessedFile(file); // Default to original
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [file]);

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

  const handleProcess = async () => {
    if (
      !options.smartCrop &&
      !options.silenceRemoval &&
      !options.captions &&
      !options.muteAudio &&
      !options.addMusic &&
      !options.analyzeClips &&
      !options.addHook
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
      const targetFile = processedFile || file;

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
      console.log("Sending AI Request:", { fileUrl, options });

      const response = await fetch(`${API_BASE_URL}/api/media/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileUrl: fileUrl,
          options: options,
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
        let attempts = 0;
        while (true) {
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

      // Cleanup the temporary source file immediately to save space
      // Only do this if we uploaded a file (targetFile was Blob/File)
      if (tempUploadRef) {
        try {
          await deleteObject(tempUploadRef).catch(() => {});
          console.log("Deleted temporary source upload");
        } catch (cleanupError) {}
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
          videoRef.current.play().catch(e => console.warn("Auto-play blocked:", e));
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

  const handleSave = () => {
    // Return the processed file (or original if failed/skipped) to the parent form
    if (processedFile) {
      onSave(processedFile);
    } else {
      onSave(file);
    }
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
      const payload = {
        video_url: finalVideoUrl,
        start_time: selectedClip.start,
        end_time: selectedClip.end,
        overlays: overlays,
        auto_captions: !!extraOptions.autoCaptions,
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
        alert("Server error: No video URL returned. Check console for details.");
      }
    } catch (error) {
      console.error("Viral Render Error:", error);
      let msg = error.message;
      if (msg === "Failed to fetch") msg = "Network error. Is the backend running?";
      setStatusMessage("Error rendering clip: " + msg);
      alert("Error rendering clip: " + msg);
      // Do NOT re-open studio automatically, let user decide
      // setClipSuggestions(options.clipSuggestions);
    } finally {
      setProcessing(false);
    }
  };

  if (clipSuggestions) {
    return (
      <ViralClipStudio
        videoUrl={videoSrc}
        clips={clipSuggestions}
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
  }

  return (
    <div className="video-editor-container">
      <div className="video-editor-header">
        <h2>✨ Smart AI Video Editor (Phase 1)</h2>
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
                  setSelectedPackage(CREDIT_PACKAGES[0]);
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
                Buy Credits
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {needsCredits && !showCreditShop ? (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(255, 220, 220, 0.45)",
            border: "1px solid rgba(255, 100, 100, 0.5)",
            borderRadius: "8px",
            margin: "10px 20px",
            color: "#1c1c1c",
            fontSize: "0.9rem",
            fontWeight: "700",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Not enough credits to process the video.</span>
          <button
            onClick={() => {
              setShowCreditShop(true);
              setSelectedPackage(CREDIT_PACKAGES[0]);
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
            Buy Credits
          </button>
        </div>
      ) : null}

      {showCreditShop ? (
        <div
          style={{
            padding: "12px 14px",
            background: "rgba(30, 30, 30, 0.8)",
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
              marginBottom: "10px",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>Buy Growth Credits</div>
              <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                Select a package and complete payment via PayPal.
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
            {CREDIT_PACKAGES.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg)}
                style={{
                  flex: 1,
                  minWidth: "140px",
                  padding: "10px",
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
                  background: "#ff6600",
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

      <div className="editor-layout">
        <div className="video-preview">
          {videoSrc ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <video
                key={videoSrc} // Force component remount on source change
                ref={videoRef}
                src={sanitizeUrl(videoSrc)}
                controls
                style={{ width: "100%", flex: 1, objectFit: "contain" }}
              />
              <div
                style={{
                  padding: "8px",
                  textAlign: "center",
                  background: "#222",
                  marginTop: "4px",
                }}
              >
                <a
                  href={videoSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#4caf50", textDecoration: "none", fontWeight: "bold" }}
                >
                  📥 Download / Open Video
                </a>
              </div>
            </div>
          ) : (
            <div className="loading-placeholder">Loading Video...</div>
          )}
        </div>

        <div className="ai-controls">
          <h3>AI Enhancements</h3>

          <div className="options-list">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label className="ai-option">
                <input
                  type="checkbox"
                  checked={options.muteAudio}
                  onChange={() => toggleOption("muteAudio")}
                />
                <div className="option-label">
                  <div className="option-title">🔇 Mute Audio</div>
                  <div className="option-desc">Remove all original sound</div>
                </div>
              </label>

              <label className="ai-option">
                <input
                  type="checkbox"
                  checked={options.addMusic}
                  onChange={() => toggleOption("addMusic")}
                />
                <div className="option-label">
                  <div className="option-title">🎵 Add Background Music</div>
                  <div className="option-desc">Add music track (select genre or search)</div>
                </div>
              </label>

              {options.addMusic && (
                <div
                  className="music-selection"
                  style={{
                    marginTop: "10px",
                    marginLeft: "34px",
                    padding: "10px",
                    background: "#2a2a2a",
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                    <label
                      style={{
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="musicType"
                        checked={!options.isSearch}
                        onChange={() =>
                          setOptions({
                            ...options,
                            isSearch: false,
                            musicFile: "upbeat_pop.mp3",
                          })
                        }
                        style={{ marginRight: "5px" }}
                      />
                      Preset
                    </label>
                    <label
                      style={{
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="musicType"
                        checked={options.isSearch}
                        onChange={() => setOptions({ ...options, isSearch: true, musicFile: "" })}
                        style={{ marginRight: "5px" }}
                      />
                      Search (YouTube)
                    </label>
                  </div>

                  {!options.isSearch ? (
                    <select
                      value={options.musicFile}
                      onChange={e => setOptions({ ...options, musicFile: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                      }}
                    >
                      <option value="upbeat_pop.mp3">Upbeat Pop</option>
                      <option value="lofi_chill.mp3">Lofi Chill</option>
                      <option value="cinematic.mp3">Cinematic</option>
                      <option value="corporate.mp3">Corporate</option>
                    </select>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <input
                        type="text"
                        placeholder="Type song or genre (e.g. 'Amapiano Beats')"
                        value={options.musicFile}
                        onChange={e => setOptions({ ...options, musicFile: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "6px",
                          borderRadius: "4px",
                          border: "1px solid #ccc",
                        }}
                      />

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          marginTop: "6px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={options.safeSearch}
                          onChange={e => setOptions({ ...options, safeSearch: e.target.checked })}
                          style={{ marginRight: "6px" }}
                        />
                        Enable Copyright Protection (Royalty-Free Only)
                      </label>

                      {options.safeSearch ? (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#4caf50",
                            marginLeft: "20px",
                            fontStyle: "italic",
                          }}
                        >
                          ✅ Safe from strikes. Might not find famous songs.
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#ff5722",
                            marginLeft: "20px",
                            fontStyle: "italic",
                          }}
                        >
                          ⚠️ Risks account suspension if used on YouTube/TikTok.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <label className="ai-option">
                <input
                  type="checkbox"
                  checked={options.smartCrop}
                  onChange={() => toggleOption("smartCrop")}
                />
                <div className="option-label">
                  <div className="option-title">📱 Smart Crop (9:16)</div>
                  <div className="option-desc">Transform horizontal video to vertical</div>
                </div>
              </label>

              {options.smartCrop && (
                <div className="sub-options" style={{ paddingLeft: "34px", paddingBottom: "10px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontSize: "13px",
                      marginBottom: "8px",
                      cursor: "pointer",
                      color: options.cropStyle === "blur" ? "#fff" : "#aaa",
                    }}
                  >
                    <input
                      type="radio"
                      name="cropStyle"
                      value="blur"
                      checked={options.cropStyle === "blur"}
                      onChange={() => setOptions(prev => ({ ...prev, cropStyle: "blur" }))}
                      style={{ marginRight: "8px", accentColor: "#7c4dff" }}
                    />
                    <div>
                      <strong>Safe Fit (Blur Background)</strong>
                      <div style={{ fontSize: "11px", color: "#888" }}>
                        Essential for UI/Screen Recordings
                      </div>
                    </div>
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontSize: "13px",
                      cursor: "pointer",
                      color: options.cropStyle === "zoom" ? "#fff" : "#aaa",
                    }}
                  >
                    <input
                      type="radio"
                      name="cropStyle"
                      value="zoom"
                      checked={options.cropStyle === "zoom"}
                      onChange={() => {
                        console.log("User selected ZOOM style");
                        setOptions(prev => ({ ...prev, cropStyle: "zoom" }));
                      }}
                      style={{ marginRight: "8px", accentColor: "#7c4dff" }}
                    />
                    <div>
                      <strong>Full Zoom (Center Copy)</strong>
                      <div style={{ fontSize: "11px", color: "#888" }}>
                        Best for Talking Heads/Vlogs
                      </div>
                    </div>
                  </label>
                </div>
              )}
            </div>

            <label className="ai-option">
              <input
                type="checkbox"
                checked={options.silenceRemoval}
                onChange={() => toggleOption("silenceRemoval")}
              />
              <div className="option-label">
                <div className="option-title">✂️ Remove Silence</div>
                <div className="option-desc">Cuts dead air & pauses automatically</div>
              </div>
            </label>

            <label className="ai-option">
              <input
                type="checkbox"
                checked={options.captions}
                onChange={() => toggleOption("captions")}
              />
              <div className="option-label">
                <div className="option-title">📝 AI Captions & Subtitles</div>
                <div className="option-desc">
                  Auto-detects language (English, Zulu, Xhosa, Afrikaans, etc.)
                </div>
              </div>
            </label>

            <label className="ai-option">
              <input
                type="checkbox"
                checked={options.addHook}
                onChange={() =>
                  setOptions(prev => ({ ...prev, addHook: !prev.addHook, analyzeClips: false }))
                }
              />
              <div className="option-label">
                <div className="option-title">🎣 Add Viral Hook (Split-Second)</div>
                <div className="option-desc">Stops the scroll with an explosive intro text</div>
              </div>
            </label>

            {options.addHook && (
              <div
                style={{
                  marginLeft: "36px",
                  marginTop: "-8px",
                  marginBottom: "12px",
                  background: "#222",
                  padding: "8px",
                  borderRadius: "0 0 8px 8px",
                }}
              >
                <input
                  type="text"
                  value={options.hookText}
                  onChange={e => setOptions(prev => ({ ...prev, hookText: e.target.value }))}
                  placeholder="e.g. 3 Secrets They Don't Want You To Know..."
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    background: "#000",
                    color: "#fff",
                  }}
                />
              </div>
            )}

            <label
              className="ai-option viral-studio-option"
              style={{
                background: options.analyzeClips
                  ? "linear-gradient(45deg, #FF512F, #DD2476)"
                  : "#2a2a2a",
                border: options.analyzeClips ? "2px solid #fff" : "1px solid #444",
                transform: options.analyzeClips ? "scale(1.02)" : "scale(1)",
                boxShadow: options.analyzeClips ? "0 4px 15px rgba(221, 36, 118, 0.4)" : "none",
                transition: "all 0.3s ease",
              }}
            >
              <input
                type="checkbox"
                checked={options.analyzeClips}
                onChange={() => {
                  // Exclusive Logic: Turn OFF all other AI options if enabled
                  if (!options.analyzeClips) {
                    setOptions(prev => ({
                      ...prev,
                      analyzeClips: true,
                      smartCrop: false,
                      silenceRemoval: false,
                      captions: false,
                      muteAudio: false,
                      addMusic: false,
                      addHook: false,
                      musicFile: "",
                    }));
                  } else {
                    toggleOption("analyzeClips");
                  }
                }}
              />
              <div className="option-label">
                <div className="option-title" style={{ fontWeight: "800", fontSize: "1.1em" }}>
                  🔥 Viral Clip Studio
                </div>
                <div className="option-desc">
                  Launch the full multi-track editor & viral moment finder
                </div>
              </div>
            </label>
          </div>

          <div className="status-message-container">
            {statusMessage && (
              <div className="status-message">
                {processing && <span className="spinner">⏳ </span>}
                {statusMessage}
              </div>
            )}
          </div>

          <button
            className="process-btn"
            onClick={handleProcess}
            disabled={
              processing ||
              (!options.smartCrop &&
                !options.silenceRemoval &&
                !options.captions &&
                !options.muteAudio &&
                !options.addMusic &&
                !options.analyzeClips &&
                !options.addHook)
            }
          >
            {processing ? "Processing..." : "✨ Run AI Magic"}
          </button>

          <div className="video-actions">
            <button className="cancel-btn" onClick={onCancel} disabled={processing}>
              Cancel
            </button>
            <button className="save-btn" onClick={handleSave} disabled={processing}>
              Save & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoEditor;
