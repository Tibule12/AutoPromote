import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebaseClient";
import { collection, query, where, onSnapshot, orderBy, getDocs, limit } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { toast } from "react-hot-toast";
import { API_ENDPOINTS } from "../config";
import "./MissionControlPanel.css";
import UserLiveLogViewer from "../components/UserLiveLogViewer";

const MissionControlPanel = () => {
  const [user] = useAuthState(auth);
  const [campaigns, setCampaigns] = useState([]);
  const [latestContentId, setLatestContentId] = useState(null); // Store latest content ID
  const [loading, setLoading] = useState(true);

  // Reactor State
  const [prompt, setPrompt] = useState("");
  const [powerLevel, setPowerLevel] = useState(50); // Represents Budget
  const [frequency, setFrequency] = useState(30); // Represents Duration/Intensity
  const [isStabilizing, setIsStabilizing] = useState(false);
  const [reactorState, setReactorState] = useState("idle"); // idle, charging, active, critical

  // Tactical Logger (Visual only for the reactor)
  const [missionLog, setMissionLog] = useState([]);
  const addLog = msg => {
    setMissionLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));
  };

  // Visualization State
  const canvasRef = useRef(null);

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
          limit(1)
        );
        const snaps = await getDocs(contentQ);
        if (!snaps.empty) {
          setLatestContentId(snaps.docs[0].id);
        }
      } catch (e) {
        console.error("Failed to fetch latest content for ads:", e);
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

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        angle: Math.random() * Math.PI * 2,
        velocity: Math.random() * (powerLevel / 10),
        life: Math.random() * 100,
      });
    }

    const render = () => {
      ctx.fillStyle = "rgba(10, 15, 30, 0.2)"; // Trail effect
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      particles.forEach((p, index) => {
        p.x += Math.cos(p.angle) * p.velocity;
        p.y += Math.sin(p.angle) * p.velocity;
        p.life -= 1;

        // Reset particle
        if (p.life <= 0 || p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
          p.x = centerX;
          p.y = centerY;
          p.life = 100;
          p.angle += 0.1; // Spiral effect
        }

        const colorIntensity = Math.min(255, powerLevel * 2.5);
        ctx.fillStyle = `rgba(${colorIntensity}, ${100 + frequency}, 255, ${p.life / 100})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, powerLevel / 20), 0, Math.PI * 2);
        ctx.fill();
      });

      // Core Glow
      const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, 50);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
      gradient.addColorStop(1, `rgba(${powerLevel * 2}, 100, 255, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50, 0, Math.PI * 2);
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [powerLevel, frequency]);

  const handleIgnite = async () => {
    if (!prompt.trim()) {
      toast.error("MISSING CATALYST: Please enter a campaign prompt");
      return;
    }

    setIsStabilizing(true);
    setReactorState("charging");
    setMissionLog([]); // Clear previous logs
    addLog("INITIALIZING LAUNCH SEQUENCE...");
    addLog(`TARGET LOCK: ${latestContentId || "UNKNOWN_NODE"}`);
    addLog(`SQUAD SIZE: ${powerLevel * 10} UNITS`);

    // Simulate "Spin Up"
    setTimeout(async () => {
      try {
        addLog("ESTABLISHING SECURE CONNECTION...");
        const budget = powerLevel * 10; // $10 to $1000
        const estimatedReach = Math.floor(budget * (frequency * 0.5) * 12.5);

        if (!latestContentId) {
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
            contentId: latestContentId,
            platform: "all", // Promote everywhere
            targetViews: estimatedReach,
            duration: Math.ceil(frequency / 3),
            budget: budget,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to ignite campaign");
        }

        if (data.status === "pending_approval" && data.approvalUrl) {
          setReactorState("active");
          addLog("PAYMENT GATEWAY DETECTED. WAITING FOR AUTHORIZATION.");
          toast.success("CONNECTING TO MISSION CONTROL...", { icon: "🔗" });

          setTimeout(() => {
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

  return (
    <div className="ads-reactor-container">
      <h1 className="reactor-title">VIRAL MISSION CONTROL</h1>

      <div className="reactor-grid">
        {/* Control Core */}
        <div className="reactor-module control-core">
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
            disabled={isStabilizing}
          >
            {isStabilizing ? "CALCULATING..." : "LAUNCH MISSION"}
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
