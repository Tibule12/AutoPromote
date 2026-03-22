import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebaseClient";
import { collection, query, where, onSnapshot, orderBy, getDocs, limit } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { toast } from "react-hot-toast";
import { API_ENDPOINTS } from "../config";
import { isSafeRedirectUrl } from "../utils/security";
import {
  buildBackendUploadError,
  inferUploadMediaType,
  uploadSourceFileViaBackend,
} from "../utils/sourceUpload";
import "./MissionControlPanel.css";
import UserLiveLogViewer from "../components/UserLiveLogViewer";

const MissionControlPanel = () => {
  const [user] = useAuthState(auth);
  const [campaigns, setCampaigns] = useState([]);
  const [availableContent, setAvailableContent] = useState([]); // List of selectable content
  const [selectedContentId, setSelectedContentId] = useState(null); // Currently selected content ID
  const [selectedContentThumbnail, setSelectedContentThumbnail] = useState(null); // Currently selected content thumbnail
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false); // New state for upload status
  const [isLocked] = useState(false);
  const [missionStatus, setMissionStatus] = useState(null);

  // Reactor State
  const [prompt, setPrompt] = useState("");
  const [powerLevel, setPowerLevel] = useState(50); // Represents Budget
  const [frequency, setFrequency] = useState(30); // Represents Duration/Intensity
  const [isStabilizing, setIsStabilizing] = useState(false);
  const [reactorState, setReactorState] = useState("idle"); // idle, charging, active, critical
  const [simulationMode, setSimulationMode] = useState(false); // TEST PROTOCOL

  // Tactical Logger (Visual only for the reactor)
  const [missionLog, setMissionLog] = useState([]);
  const addLog = msg => {
    setMissionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
  };

  // Visualization State
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadMissionStatus = async currentUser => {
      if (!currentUser) {
        if (!cancelled) setMissionStatus(null);
        return;
      }

      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(
          `${API_ENDPOINTS.MONETIZATION_SUBSCRIPTION_STATUS}?action=boost`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          }
        );

        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setMissionStatus(data);
      } catch (_error) {}
    };

    loadMissionStatus(user);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const boostLimit = missionStatus?.status?.subscription?.limits?.monthlyBoosts ?? 0;
  const boostsUsed = missionStatus?.status?.subscription?.usage?.boostsThisMonth ?? 0;
  const remainingBoosts =
    missionStatus?.remaining?.boosts ??
    (boostLimit === -1 ? -1 : Math.max(0, boostLimit - boostsUsed));

  useEffect(() => {
    if (!user) return;

    // Use engagement_campaigns instead of ads if possible?
    // Or maybe we treat "ads" as PAID missions and "engagement_campaigns" as EARNED missions.
    // For now, let's just Stick to 'paid_boosts' collection for PAID BOOSTS but rename UI.

    const q = query(
      collection(db, "paid_boosts"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const adsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCampaigns(adsData);
      setLoading(false);
    });

    // Fetch latest content for boost targeting
    const fetchContent = async () => {
      try {
        const contentQ = query(
          collection(db, "content"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(20)
        );
        const snaps = await getDocs(contentQ);

        if (!snaps.empty) {
          const contentList = snaps.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          }));
          setAvailableContent(contentList);

          // Default select the first one
          const firstDoc = contentList[0];
          setSelectedContentId(firstDoc.id);
          const thumb =
            firstDoc.thumbnailUrl ||
            firstDoc.previewUrl ||
            (firstDoc.type === "image" ? firstDoc.url : null);
          setSelectedContentThumbnail(thumb);
        }
      } catch (e) {
        console.error("Failed to fetch content list for ads:", e);
      }
    };
    fetchContent();

    return () => unsubscribe();
  }, [user]);

  // Reactor Simulation Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    const particles = [];
    const particleCount = Math.floor(powerLevel * 2);

    // Load content image if available
    let contentImg = null;
    if (selectedContentThumbnail) {
      const img = new Image();
      img.src = selectedContentThumbnail;
      // Handle cross-origin if needed, though usually standard img tags work fine on canvas if server allows
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        contentImg = img;
      };
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        angle: Math.random() * Math.PI * 2,
        velocity: Math.random() * (powerLevel / 10),
        life: Math.random() * 100,
        radius: Math.random() * (powerLevel / 20) + 1,
      });
    }

    const render = () => {
      // Clear with trail effect
      ctx.fillStyle = "rgba(5, 10, 20, 0.3)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      // Draw Content Image if available (masked circle)
      if (selectedContentThumbnail) {
        const thumb = new Image();
        thumb.src = selectedContentThumbnail;
        if (thumb.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          try {
            ctx.drawImage(thumb, centerX - 60, centerY - 60, 120, 120);
          } catch (e) {}
          // Hologram overlay
          ctx.fillStyle = `rgba(0, 255, 65, ${0.2 + Math.sin(Date.now() / 300) * 0.1})`;
          ctx.fillRect(centerX - 60, centerY - 60, 120, 120);
          ctx.restore();

          // Tech Ring
          ctx.strokeStyle = "#00ff41";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(centerX, centerY, 65, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // Draw Particles first (background layer)
      particles.forEach((p, index) => {
        p.x += Math.cos(p.angle) * p.velocity;
        p.y += Math.sin(p.angle) * p.velocity;
        p.life -= 1; // Decay

        // Reset particle
        if (p.life <= 0 || p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          p.x = centerX + (Math.random() - 0.5) * 10;
          p.y = centerY + (Math.random() - 0.5) * 10;
          p.life = 100;
          p.angle += (Math.random() - 0.5) * 0.5; // Drift
          p.velocity = Math.random() * (powerLevel / 8) + 0.5;
        }

        const colorIntensity = Math.min(255, powerLevel * 2.5);
        // Color shifts based on velocity
        const hue = (frequency * 2 + p.velocity * 20) % 360;
        ctx.fillStyle = `hsla(${120 + hue / 2}, 100%, 60%, ${p.life / 100})`;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Core Glow (Under the image)
      const gradient = ctx.createRadialGradient(centerX, centerY, 30, centerX, centerY, 150);
      gradient.addColorStop(0, `rgba(${powerLevel * 2}, 255, 100, 0.4)`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 150, 0, Math.PI * 2);
      ctx.fill();

      // Draw Content Image (The Core)
      if (contentImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, 60, 0, Math.PI * 2); // Circular clip
        ctx.closePath();
        ctx.clip();

        // Draw image centered and scaled
        // Determine aspect ratio scaling
        const scale = Math.max(120 / contentImg.width, 120 / contentImg.height);
        const w = contentImg.width * scale;
        const h = contentImg.height * scale;
        ctx.drawImage(contentImg, centerX - w / 2, centerY - h / 2, w, h);

        // Add a slight overlay tint based on reactor state
        if (reactorState === "charging") {
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3})`;
          ctx.fill();
        }

        ctx.restore();

        // Border ring around image
        ctx.strokeStyle = "#00ff41";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Fallback Core (if no image)
        const coreGradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, 40);
        coreGradient.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        coreGradient.addColorStop(0.5, "rgba(0, 255, 65, 0.6)");
        coreGradient.addColorStop(1, "rgba(0, 50, 20, 0)");
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [powerLevel, frequency, selectedContentThumbnail, reactorState]);

  const handleIgnite = async () => {
    if (!prompt.trim() && !simulationMode) {
      toast.error("MISSING CATALYST: Please enter a campaign prompt");
      return;
    }

    setIsStabilizing(true);
    setReactorState("charging");
    setMissionLog([]); // Clear previous logs
    addLog("INITIALIZING LAUNCH SEQUENCE...");
    addLog(
      `TARGET LOCK: ${selectedContentId || (simulationMode ? "SIM_TARGET_ALPHA" : "UNKNOWN_NODE")}`
    );
    addLog(`SQUAD SIZE: ${powerLevel * 10} UNITS`);

    // Simulate "Spin Up"
    setTimeout(async () => {
      try {
        if (simulationMode) {
          addLog("SIMULATION PROTOCOL ENGAGED.");
          addLog("SKIPPING ORBITAL UPLINK...");
          await new Promise(r => setTimeout(r, 1000));
          addLog("SIMULATED PAYMENT: BYPASSED");
          setReactorState("active");
          addLog("MISSION DEPLOYED SUCCESSFULLY (SIMULATION).");
          addLog(`OPERATION ID: SIM-${Date.now()}`);
          addLog("ASSETS EN ROUTE.");

          toast.success("SIMULATION SUCCESSFUL", {
            style: {
              background: "#00ff41",
              color: "black",
              fontFamily: "monospace",
            },
          });

          setPrompt("");
          setIsStabilizing(false);
          setTimeout(() => setReactorState("idle"), 3000);
          return;
        }

        addLog("ESTABLISHING SECURE CONNECTION...");
        const budget = powerLevel * 10; // $10 to $1000
        const estimatedReach = Math.floor(budget * (frequency * 0.5) * 12.5);

        if (!selectedContentId) {
          throw new Error("No content found to promote. Upload content first!");
        }

        // Call Backend API to create Boost (Real PayPal Integration)
        let token;
        if (user) token = await user.getIdToken();

        addLog("SENDING PAYLOAD TO ORBIT...");
        const response = await fetch(API_ENDPOINTS.CREATE_BOOST, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            contentId: selectedContentId,
            platform: "all", // Promote everywhere
            targetViews: estimatedReach,
            duration: Math.ceil(frequency / 3),
            budget: budget,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          if (data.code === "BOOST_LIMIT_EXCEEDED") {
            setMissionStatus(prev => ({ ...(prev || {}), ...data }));
          }
          throw new Error(data.error || "Failed to ignite campaign");
        }

        if (data.status === "pending_approval" && data.approvalUrl) {
          setReactorState("active");
          addLog("PAYMENT GATEWAY DETECTED. WAITING FOR AUTHORIZATION.");
          toast.success("CONNECTING TO MISSION CONTROL...", { icon: "🔗" });

          setTimeout(() => {
            if (!isSafeRedirectUrl(data.approvalUrl)) {
              toast.error("Untrusted payment redirect URL blocked.");
              return;
            }
            window.location.href = data.approvalUrl;
          }, 1500);
          return;
        }

        setReactorState("active");
        addLog("MISSION DEPLOYED SUCCESSFULLY.");
        addLog(`OPERATION ID: ${data.boostId || "CONFIRMED"}`);
        addLog("ASSETS EN ROUTE.");

        toast.success("MISSION LAUNCH SUCCESSFUL", {
          style: {
            background: "#00ff41",
            color: "black",
            fontFamily: "monospace",
          },
        });

        // Reset
        const refreshedStatus = await fetch(
          `${API_ENDPOINTS.MONETIZATION_SUBSCRIPTION_STATUS}?action=boost`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
          }
        );
        if (refreshedStatus.ok) {
          const refreshed = await refreshedStatus.json();
          setMissionStatus(refreshed);
        }
        setPrompt("");
        setIsStabilizing(false);
        setTimeout(() => setReactorState("idle"), 2000);
      } catch (error) {
        console.error("Launch failure:", error);
        addLog(`CRITICAL FAILURE: ${error.message}`);
        toast.error("MISSION ABORTED: " + error.message);
        setIsStabilizing(false);
        setReactorState("idle");
      }
    }, 1500);
  };

  const handleContentSelect = e => {
    const newId = e.target.value;
    setSelectedContentId(newId);

    // Find thumbnail for new selection
    const selectedItem = availableContent.find(c => c.id === newId);
    if (selectedItem) {
      const thumb =
        selectedItem.thumbnailUrl ||
        selectedItem.previewUrl ||
        (selectedItem.type === "image" ? selectedItem.url : null);
      setSelectedContentThumbnail(thumb);
    } else {
      setSelectedContentThumbnail(null);
    }
  };

  const handleFileUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    if (!user) {
      toast.error("Authentication required");
      return;
    }

    // Limit to images/video
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("INVALID PAYLOAD: Only Image/Video assets accepted");
      return;
    }

    setIsUploading(true);
    addLog(`INITIALIZING UPLOAD SEQUENCE: ${file.name}`);
    addLog(`PAYLOAD SIZE: ${(file.size / 1024 / 1024).toFixed(2)} MB`);

    try {
      addLog("SENDING ASSET TO BACKEND UPLOAD SERVICE...");
      const token = await user.getIdToken();
      const uploadResult = await uploadSourceFileViaBackend({
        file,
        token,
        mediaType: inferUploadMediaType(file),
        fileName: file.name,
      }).catch(error => {
        throw buildBackendUploadError(error);
      });
      const downloadURL = uploadResult.url;
      addLog("ASSET SECURED. REGISTERING METADATA...");

      // Register metadata with backend
      const payload = {
        title: file.name.split(".")[0] || "Mission Asset",
        type: file.type.startsWith("video/") ? "video" : "image",
        url: downloadURL,
        platform: "mission_control_direct",
        description: "Direct upload from Mission Control",
      };

      const response = await fetch(API_ENDPOINTS.CONTENT_UPLOAD, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Metadata registration failed");

      addLog("ASSET REGISTERED. MISSION READY.");
      toast.success("ASSET UPLOAD SUCCESSFUL");

      // Set as selected immediately
      const newAsset = {
        id: data.contentId || data.content?.id,
        title: payload.title,
        thumbnailUrl: downloadURL,
        url: downloadURL,
        type: payload.type,
        createdAt: { seconds: Date.now() / 1000 },
      };

      setAvailableContent(prev => [newAsset, ...prev]);
      setSelectedContentId(newAsset.id);
      setSelectedContentThumbnail(downloadURL);
    } catch (error) {
      console.error("Upload error:", error);
      addLog(`UPLOAD FAILED: ${error.message}`);
      toast.error("UPLOAD FAILED: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (isLocked) {
    return (
      <div
        className="ads-reactor-container"
        style={{
          position: "relative",
          minHeight: "400px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className="reactor-module control-core"
          style={{
            maxWidth: "500px",
            textAlign: "center",
            border: "1px solid #ff0000",
            padding: "40px",
          }}
        >
          <h1 style={{ color: "#ff0000", marginBottom: "20px" }}>🔒 MISSION CONTROL LOCKED</h1>
          <p style={{ color: "#aaa", marginBottom: "20px" }}>
            This system is currently undergoing critical upgrades. Access is restricted to
            authorized personnel only.
          </p>
          <div style={{ fontSize: "0.8rem", color: "#666", fontFamily: "monospace" }}>
            ERROR: PROTOCOL_7_MAINTENANCE_REQUIRED
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ads-reactor-container">
      <h1 className="reactor-title">VIRAL MISSION CONTROL</h1>

      {missionStatus ? (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.9rem 1rem",
            border: "1px solid #00ff4155",
            borderRadius: 12,
            background: "rgba(0, 20, 10, 0.55)",
            color: "#d1fae5",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span>
            PLAN: {(missionStatus.entitlements && missionStatus.entitlements.planName) || "Starter"}
          </span>
          <span>
            MISSION QUOTA: {remainingBoosts === -1 ? "Unlimited" : remainingBoosts} remaining this
            month
          </span>
          <span>
            USED: {boostsUsed}
            {boostLimit === -1 ? " / Unlimited" : ` / ${boostLimit}`}
          </span>
        </div>
      ) : null}

      <div className="reactor-grid">
        {/* Control Core */}
        <div className="reactor-module control-core">
          <div
            style={{
              marginBottom: "1rem",
              borderBottom: "1px solid #003311",
              paddingBottom: "0.5rem",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                color: simulationMode ? "#ffff00" : "#004411",
              }}
            >
              <input
                type="checkbox"
                checked={simulationMode}
                onChange={e => setSimulationMode(e.target.checked)}
                style={{ marginRight: "10px" }}
              />
              ⚠️ SIMULATION MODE (TEST PROTOCOL)
            </label>
          </div>
          <div className="holographic-input-group">
            <label>SELECT TARGET ASSET (CONTENT) OR UPLOAD NEW</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <select
                className="terminal-input"
                style={{ height: "50px", marginBottom: "1rem", cursor: "pointer", flex: 1 }}
                value={selectedContentId || ""}
                onChange={handleContentSelect}
              >
                <option value="" disabled>
                  -- SELECT CONTENT --
                </option>
                {availableContent.length === 0 ? (
                  <option disabled>NO ASSETS FOUND</option>
                ) : (
                  availableContent.map(content => (
                    <option key={content.id} value={content.id}>
                      {content.title ||
                        `Untitled Asset (${new Date(content.createdAt?.seconds * 1000).toLocaleDateString()})`}
                    </option>
                  ))
                )}
              </select>

              <label
                className="ignite-button"
                style={{
                  fontSize: "1rem",
                  padding: "0.5rem 1rem",
                  height: "50px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  whiteSpace: "nowrap",
                  width: "auto",
                }}
              >
                {isUploading ? "UPLOADING..." : "UPLOAD ⬆️"}
                <input
                  type="file"
                  style={{ display: "none" }}
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
              </label>
            </div>
          </div>

          <div className="holographic-input-group">
            <label>MISSION OBJECTIVE (PROMPT)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe your target audience and goal..."
              className="terminal-input"
            />
          </div>

          <div className="slider-group">
            <label>SQUAD SIZE (BUDGET: ${powerLevel * 10})</label>
            <input
              type="range"
              min="1"
              max="100"
              value={powerLevel}
              onChange={e => setPowerLevel(Number(e.target.value))}
              className="cyber-slider power-slider"
            />
          </div>

          <div className="slider-group">
            <label>VELOCITY (INTENSITY: {frequency} Ops/min)</label>
            <input
              type="range"
              min="1"
              max="100"
              value={frequency}
              onChange={e => setFrequency(Number(e.target.value))}
              className="cyber-slider freq-slider"
            />
          </div>

          <button
            className={`ignite-button ${isStabilizing ? "stabilizing" : ""}`}
            onClick={handleIgnite}
            disabled={isStabilizing || (!simulationMode && remainingBoosts === 0)}
          >
            {isStabilizing
              ? "CALCULATING..."
              : !simulationMode && remainingBoosts === 0
                ? "MISSION QUOTA EXHAUSTED"
                : "LAUNCH MISSION"}
          </button>
        </div>

        {/* Simulation Viewport */}
        <div className="reactor-module simulation-viewport">
          <div className="viewport-overlay">
            <div className="stat-corner tl">
              PROJ. REACH: {Math.floor(powerLevel * 10 * (frequency * 0.5) * 12.5).toLocaleString()}
            </div>
            <div className="stat-corner tr">
              EFFICIENCY: {Math.floor((powerLevel / frequency) * 100)}%
            </div>
            <div className="stat-corner bl">COMMUNITY: ONLINE</div>
            <div className="stat-corner br">STATUS: READY</div>

            {/* Tactical Log Overlay */}
            <div
              className="tactical-log"
              style={{
                position: "absolute",
                bottom: "40px",
                left: "10px",
                right: "10px",
                height: "100px",
                overflow: "hidden",
                pointerEvents: "none",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#00ff41",
                textShadow: "0 0 5px #00ff41",
                display: "flex",
                flexDirection: "column-reverse",
              }}
            >
              {missionLog.map((log, i) => (
                <div key={i} style={{ opacity: 1 - i * 0.2 }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
          <canvas ref={canvasRef} width={400} height={300} className="particle-canvas" />
        </div>
      </div>

      {/* Active Reactions (Campaigns) */}
      <div className="active-reactions-list">
        <h3 className="section-header">ACTIVE MISSIONS</h3>
        <div className="reactions-grid">
          {campaigns.map(camp => (
            <div key={camp.id} className="reaction-card">
              <div className="reaction-status-indicator active"></div>
              <div className="reaction-info">
                <h4>{camp.title || "Unknown Mission"}</h4>
                <div className="reaction-meta">
                  <span>SQUAD: {camp.reactorConfig?.powerLevel || 50}%</span>
                  <span>VELOCITY: {camp.reactorConfig?.frequency || 30}</span>
                </div>
              </div>
              <div className="reaction-metrics">
                <span className="metric-val">
                  {camp.metrics?.projectedReach?.toLocaleString() || 0}
                </span>
                <span className="metric-label">REACH</span>
              </div>
            </div>
          ))}
          {campaigns.length === 0 && (
            <div className="empty-state">NO ACTIVE MISSIONS. LAUNCH ONE NOW.</div>
          )}
        </div>
      </div>

      {/* Global Comms Link using the new Viewer */}
      <div style={{ marginTop: "40px", borderTop: "1px solid #00ff4133", paddingTop: "20px" }}>
        <h3 className="section-header" style={{ color: "#00ff41", marginBottom: "15px" }}>
          LIVE OPERATIONS FEED
        </h3>
        <UserLiveLogViewer />
      </div>
    </div>
  );
};

export default MissionControlPanel;
