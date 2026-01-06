import React, { useState, useEffect, useRef } from "react";
import { db, auth } from "../firebase";
import { collection, addDoc, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";
import { toast } from "react-hot-toast";
import "./AdsPanel.css"; // Ensure we use the new styles

const AdsPanel = () => {
  const [user] = useAuthState(auth);
  const [campaigns, setCampaigns] = useState([]);
  const [, setLoading] = useState(true);

  // Reactor State
  const [prompt, setPrompt] = useState("");
  const [powerLevel, setPowerLevel] = useState(50); // Represents Budget
  const [frequency, setFrequency] = useState(30); // Represents Duration/Intensity
  const [isStabilizing, setIsStabilizing] = useState(false);
  const [, setReactorState] = useState("idle"); // idle, charging, active, critical

  // Visualization State
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "ads"),
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

    return () => cancelAnimationFrame(animationFrameId);
  }, [powerLevel, frequency]);

  const handleIgnite = async () => {
    if (!prompt.trim()) {
      toast.error("Reactor needs fuel (prompt)!");
      return;
    }

    setIsStabilizing(true);
    setReactorState("charging");

    // Simulate "Charging"
    setTimeout(async () => {
      try {
        const budget = powerLevel * 10; // $10 to $1000
        const estimatedReach = Math.floor(budget * (frequency * 0.5) * 12.5);

        await addDoc(collection(db, "ads"), {
          userId: user.uid,
          title: prompt.substring(0, 30) + (prompt.length > 30 ? "..." : ""),
          description: prompt,
          budget: budget,
          duration: Math.ceil(frequency / 3), // Days
          status: "active", // Direct to active for "Ignite" feel
          createdAt: new Date().toISOString(),
          type: "flux_campaign",
          metrics: {
            impressions: 0,
            clicks: 0,
            ctr: 0,
            projectedReach: estimatedReach,
          },
          reactorConfig: {
            powerLevel,
            frequency,
          },
        });

        setReactorState("active");
        toast.success("CAMPAIGN IGNITION SUCCESSFUL", {
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
        console.error("Ignition failure:", error);
        toast.error("Containment Breach: " + error.message);
        setIsStabilizing(false);
        setReactorState("idle");
      }
    }, 1500);
  };

  return (
    <div className="ads-reactor-container">
      <h1 className="reactor-title">QUANTUM CAMPAIGN REACTOR</h1>

      <div className="reactor-grid">
        {/* Control Core */}
        <div className="reactor-module control-core">
          <div className="holographic-input-group">
            <label>CAMPAIGN SEED (PROMPT)</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe your promotion target parameters..."
              className="terminal-input"
            />
          </div>

          <div className="slider-group">
            <label>POWER LEVEL (BUDGET: ${powerLevel * 10})</label>
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
            <label>FREQUENCY (INTENSITY: {frequency}Hz)</label>
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
            {isStabilizing ? "STABILIZING..." : "IGNITE CORE"}
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
            <div className="stat-corner bl">CORE TEMP: {powerLevel * 50}°K</div>
            <div className="stat-corner br">FLUX: STABLE</div>
          </div>
          <canvas ref={canvasRef} width={400} height={300} className="particle-canvas" />
        </div>
      </div>

      {/* Active Reactions (Campaigns) */}
      <div className="active-reactions-list">
        <h3 className="section-header">ACTIVE REACTIONS</h3>
        <div className="reactions-grid">
          {campaigns.map(camp => (
            <div key={camp.id} className="reaction-card">
              <div className="reaction-status-indicator active"></div>
              <div className="reaction-info">
                <h4>{camp.title || "Unknown Reaction"}</h4>
                <div className="reaction-meta">
                  <span>PWR: {camp.reactorConfig?.powerLevel || 50}%</span>
                  <span>FREQ: {camp.reactorConfig?.frequency || 30}Hz</span>
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
            <div className="empty-state">CORE IDLE. NO ACTIVE REACTIONS.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdsPanel;
