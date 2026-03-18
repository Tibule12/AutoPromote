import React, { useState, useRef, useEffect } from "react";
import "./ViralScanner.css";
import { storage, auth } from "../firebaseClient";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import { sanitizeUrl } from "../utils/security";

const ViralScanner = ({ file, onSelectClip, onClose }) => {
  const videoRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [previewClip, setPreviewClip] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [videoSrc, setVideoSrc] = useState(null);

  // --- Credit System State ---
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

  useEffect(() => {
    if (file) {
      if (typeof file === "string") {
        setVideoSrc(file);
      } else {
        const url = URL.createObjectURL(file);
        setVideoSrc(url);
        return () => URL.revokeObjectURL(url);
      }
    }
  }, [file]);

  // Fetch Credits on Mount
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const r = await fetch(API_ENDPOINTS.CREDITS_BALANCE, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.ok) {
          const text = await r.text();
          try {
            const data = JSON.parse(text);
            setCreditBalance(data.balance);
          } catch (e) {
            console.warn("Failed to parse credits", e);
          }
        }
      } catch (e) {
        console.warn("Failed to fetch credits", e);
      }
    };
    fetchCredits();
  }, []);

  // PayPal SDK Loader
  useEffect(() => {
    if (!showCreditShop || paypalLoaded) return;
    const load = async () => {
      try {
        const res = await fetch(API_ENDPOINTS.PAYMENTS_PAYPAL_CONFIG);
        const data = await res.json();
        const clientId = data.clientId || "sb";
        const currency = data.currency || "USD";

        if (document.getElementById("paypal-sdk-viral")) {
          setPaypalLoaded(true);
          return;
        }
        const script = document.createElement("script");
        script.id = "paypal-sdk-viral";
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
        script.async = true;
        script.onload = () => setPaypalLoaded(true);
        document.body.appendChild(script);
      } catch (e) {
        console.warn("Failed to load PayPal SDK:", e);
      }
    };
    load();
  }, [showCreditShop, paypalLoaded]);

  // Render PayPal Buttons
  useEffect(() => {
    if (!paypalLoaded || !selectedPackage || !window.paypal || !paypalButtonsRef.current) return;
    const container = paypalButtonsRef.current;
    container.innerHTML = "";

    window.paypal
      .Buttons({
        createOrder: async () => {
          const user = auth.currentUser;
          const token = user ? await user.getIdToken() : null;
          const res = await fetch(
            `${API_BASE_URL.replace(/\/$/, "")}/api/payments/credits/create-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ packageId: selectedPackage.id }),
            }
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Order failed");
          return data.id;
        },
        onApprove: async data => {
          const user = auth.currentUser;
          const token = user ? await user.getIdToken() : null;
          const res = await fetch(
            `${API_BASE_URL.replace(/\/$/, "")}/api/payments/credits/capture-order`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ orderID: data.orderID, packageId: selectedPackage.id }),
            }
          );
          const details = await res.json();
          if (details.success) {
            const newBal =
              typeof details.balance === "number" ? details.balance : details.newCredits;
            setCreditBalance(newBal);
            setNeedsCredits(false);
            setShowCreditShop(false);
            setStatusMessage("Credits added! You can now scan.");
          }
        },
        onError: err => {
          console.error("PayPal Error", err);
          setStatusMessage("Payment failed. Please try again.");
        },
      })
      .render(container);
  }, [paypalLoaded, selectedPackage]);

  const startScan = async () => {
    setIsScanning(true);
    setScanProgress(0);
    setResults([]);
    setStatusMessage("Preparing video for AI analysis...");

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in.");
      const token = await user.getIdToken();

      let fileUrl = "";

      // 1. Upload if necessary
      if (file instanceof File || file instanceof Blob) {
        setStatusMessage("Uploading video to cloud for processing...");
        const storagePath = `temp_scans/${Date.now()}_${file.name || "scan.mp4"}`;
        const storageRef = ref(storage, storagePath);
        const uploadTask = uploadBytesResumable(storageRef, file);

        await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            snapshot => {
              const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setScanProgress(Math.round(prog / 2)); // First 50% is upload
            },
            error => reject(error),
            async () => {
              fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            }
          );
        });
      } else if (typeof file === "string") {
        fileUrl = file;
        setScanProgress(50);
      }

      // 2. Call Node.js Backend (proxies to Python + Deducts Credits)
      setStatusMessage("AI Agent watching video...");

      const response = await fetch(`${API_BASE_URL}/api/media/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileUrl: fileUrl,
        }),
      });

      if (response.status === 403 || response.status === 402) {
        setNeedsCredits(true);
        setShowCreditShop(true);
        setStatusMessage("Insufficient credits. Please top up to continue.");
        setIsScanning(false);
        setScanProgress(0);
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Analysis Error: ${response.status} ${errText}`);
      }

      const data = await response.json();

      if (data.remainingCredits !== undefined) {
        setCreditBalance(data.remainingCredits);
      }

      const validScenes = (data.scenes || []).map((s, idx) => ({
        id: idx,
        start: s.start_time || s.start,
        end: s.end_time || s.end,
        score: s.viral_score || s.score || 80,
        reason: s.label || s.reason || "High engagement potential detected",
      }));

      if (validScenes.length === 0) {
        setStatusMessage("No specific viral moments found.");
        // Fallback demo clip if empty?
      } else {
        setStatusMessage("Analysis Complete.");
      }

      setResults(validScenes);
    } catch (err) {
      console.error("Scan failed:", err);
      setStatusMessage("Error: " + err.message);
    } finally {
      setIsScanning(false);
      setScanProgress(100);
    }
  };

  const handlePreviewClip = clip => {
    if (videoRef.current) {
      videoRef.current.currentTime = clip.start;
      videoRef.current.play();
      setPreviewClip(clip);

      const stopHandler = () => {
        if (videoRef.current.currentTime >= clip.end) {
          videoRef.current.pause();
          videoRef.current.removeEventListener("timeupdate", stopHandler);
          setPreviewClip(null);
        }
      };
      videoRef.current.addEventListener("timeupdate", stopHandler);
    }
  };

  const formatTime = seconds => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? "0" + sec : sec}`;
  };

  return (
    <div className="viral-scanner-overlay" onClick={onClose}>
      <div className="viral-scanner-modal" onClick={e => e.stopPropagation()}>
        <header className="scanner-header">
          <h3>
            <span style={{ fontSize: "1.5rem" }}>🔥</span> Viral Moment Scanner
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Credit Display */}
            {creditBalance !== null && (
              <div
                style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid #444",
                  fontSize: "0.9rem",
                  color: "#ffd700",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => setShowCreditShop(true)}
              >
                💎 {formatBalance(creditBalance)} Credits
              </div>
            )}
            <button className="scanner-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </header>

        {/* Credit Shop Modal */}
        {showCreditShop && (
          <div
            style={{
              position: "absolute",
              top: 60,
              left: 20,
              right: 20,
              zIndex: 100,
              background: "#1a1a1a",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #444",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
              <h3 style={{ color: "#fff", margin: 0 }}>Get More Credits</h3>
              <button
                onClick={() => setShowCreditShop(false)}
                style={{
                  background: "none",
                  border: "1px solid #555",
                  borderRadius: "4px",
                  color: "#fff",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Close
              </button>
            </div>
            <p style={{ color: "#ccc", fontSize: "0.9rem", marginBottom: "10px" }}>
              Viral scans cost roughly <strong>20 credits</strong> per video.
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "15px" }}>
              {CREDIT_PACKAGES.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  style={{
                    flex: 1,
                    minWidth: "120px",
                    padding: "12px",
                    borderRadius: "10px",
                    border: selectedPackage?.id === pkg.id ? "2px solid #4caf50" : "1px solid #444",
                    background: selectedPackage?.id === pkg.id ? "rgba(76, 175, 80, 0.2)" : "#222",
                    color: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{pkg.name}</div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                    {pkg.credits} credits • ${pkg.price}
                  </div>
                </button>
              ))}
            </div>
            <div ref={paypalButtonsRef} style={{ minHeight: "150px" }} />
          </div>
        )}

        <div className="scanner-body">
          <div className="scanner-video-column">
            {videoSrc ? (
              <video
                ref={videoRef}
                src={sanitizeUrl(videoSrc)}
                controls
                style={{ borderRadius: "8px" }}
              />
            ) : (
              <div style={{ color: "#fff" }}>No video loaded</div>
            )}
          </div>

          <aside className="scanner-sidebar">
            <div className="scanner-controls">
              {!isScanning && results.length === 0 ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ color: "#cbd5e1", marginBottom: "15px" }}>
                    AI will analyze your video for engagement spikes, hooks, and retention drivers.
                  </p>

                  {needsCredits ? (
                    <div>
                      <p
                        style={{
                          color: "#ef4444",
                          fontWeight: "bold",
                          fontSize: "0.9rem",
                          marginBottom: "8px",
                        }}
                      >
                        Not enough credits to scan.
                      </p>
                      <button
                        className="scan-btn"
                        onClick={() => setShowCreditShop(true)}
                        style={{ background: "#f59e0b" }}
                      >
                        Buy Credits
                      </button>
                    </div>
                  ) : (
                    <button className="scan-btn" onClick={startScan}>
                      Start AI Scan{" "}
                      <span style={{ fontSize: "0.8em", opacity: 0.8, marginLeft: "5px" }}>
                        (20 💎)
                      </span>
                    </button>
                  )}
                </div>
              ) : isScanning ? (
                <div className="scanning-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${scanProgress}%` }}></div>
                  </div>
                  <div className="scanning-text">
                    {statusMessage || `Analyzing frames... ${Math.round(scanProgress)}%`}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center" }}>
                  <h4 style={{ color: "#f8fafc", margin: "0 0 5px 0" }}>Scan Complete!</h4>
                  <p style={{ color: "#cbd5e1", fontSize: "0.9rem" }}>
                    Found {results.length} viral opportunities.
                  </p>
                  <button
                    className="scan-btn"
                    onClick={startScan}
                    style={{
                      marginTop: "10px",
                      fontSize: "0.9rem",
                      padding: "8px 16px",
                      background: "#334155",
                    }}
                  >
                    Rescan
                  </button>
                </div>
              )}
            </div>

            <div className="results-list">
              {results.map(clip => (
                <div
                  key={clip.id}
                  className={`result-card ${previewClip?.id === clip.id ? "active" : ""}`}
                  onClick={() => handlePreviewClip(clip)}
                >
                  <div className="result-header">
                    <span className="result-time">
                      {formatTime(clip.start)} - {formatTime(clip.end)}
                    </span>
                    <span className="viral-score">⚡ {clip.score}</span>
                  </div>
                  <p className="result-reason">{clip.reason}</p>
                  <button
                    className="use-clip-btn"
                    onClick={e => {
                      e.stopPropagation();
                      onSelectClip(clip);
                    }}
                  >
                    Use This Clip
                  </button>
                </div>
              ))}
              {results.length === 0 && !isScanning && !needsCredits && (
                <div className="empty-state">
                  Click "Start AI Scan" to identify the best parts of your video automatically.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ViralScanner;
