import React, { useState, useEffect, useRef } from "react";
import "./EngagementMarketplace.css";
import { auth, storage } from "./firebaseClient";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import WolfPackFeed from "./WolfPackFeed";

// --- ICONS (SVG) ---
const WolfIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" />
  </svg>
);
const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const BoltIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const CrownIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="#FFD700"
    stroke="currentColor"
    strokeWidth="1"
  >
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z" />
  </svg>
);

// eslint-disable-next-line
const VolumeIcon = ({ on }) =>
  on ? (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>
  ) : (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    </svg>
  );

const WolfHuntDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [activeMission, setActiveMission] = useState(null); // { proofId, externalUrl, minConfirmTime, expiresAt }
  const [userCredits, setUserCredits] = useState(0);
  const [proofFile, setProofFile] = useState(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [energy, setEnergy] = useState({ current: 50, max: 50 });
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);
  const [activeView, setActiveView] = useState("missions"); // 'missions' | 'intel'

  // VOICE COMMANDER STATE
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingAccepted, setBriefingAccepted] = useState(false);
  const [pendingMissionId, setPendingMissionId] = useState(null);
  const [pendingTask, setPendingTask] = useState(null); // Detailed task info for briefing

  // REVENUE STATE
  const [showBuyCredits, setShowBuyCredits] = useState(false);

  const [selectedPackage, setSelectedPackage] = useState(null); // Track selected pack for payment

  const CREDIT_PACKAGES = [
    { id: "pack_small", credits: 50, price: 4.99, name: "Cub Snack" },
    { id: "pack_medium", credits: 150, price: 12.99, name: "Wolf Meal" },
    { id: "pack_large", credits: 500, price: 39.99, name: "Alpha Feast" },
  ];

  // PAYPAL INTEGRATION
  useEffect(() => {
    if (showBuyCredits && !paypalLoaded && !document.getElementById("paypal-sdk")) {
      fetch("/api/payments/paypal/config")
        .then(r => r.json())
        .then(cfg => {
          const script = document.createElement("script");
          script.src = `https://www.paypal.com/sdk/js?client-id=${cfg.clientId || "sb"}&currency=USD`; // live/sandbox handled by backend key
          script.id = "paypal-sdk";
          script.onload = () => setPaypalLoaded(true);
          document.body.appendChild(script);
        })
        .catch(err => console.error("PayPal config load error", err));
    } else if (showBuyCredits && document.getElementById("paypal-sdk") && window.paypal) {
      setPaypalLoaded(true);
    }
  }, [showBuyCredits, paypalLoaded]);

  useEffect(() => {
    if (paypalLoaded && selectedPackage && window.paypal) {
      const container = document.getElementById("paypal-button-container-unique");
      if (container) {
        container.innerHTML = ""; // Clear previous buttons
        window.paypal
          .Buttons({
            createOrder: async (data, actions) => {
              const token = await auth.currentUser?.getIdToken();
              return fetch("/api/payments/credits/create-order", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ packageId: selectedPackage.id }),
              })
                .then(res => res.json())
                .then(order => order.id);
            },
            onApprove: async (data, actions) => {
              const token = await auth.currentUser?.getIdToken();
              return fetch("/api/payments/credits/capture-order", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  orderID: data.orderID,
                  packageId: selectedPackage.id,
                }),
              })
                .then(res => res.json())
                .then(details => {
                  if (details.success) {
                    setUserCredits(prev => prev + details.newCredits);
                    setNotification({
                      msg: `Payment Successful! +${details.newCredits} Credits`,
                      type: "success",
                    });
                    setShowBuyCredits(false);
                    setSelectedPackage(null);
                    if (voiceEnabled) {
                      const speech = new SpeechSynthesisUtterance(
                        "Funds received. Arsenal upgraded."
                      );
                      window.speechSynthesis.speak(speech);
                    }
                  } else {
                    throw new Error(details.error || "Capture failed");
                  }
                });
            },
            onError: err => {
              console.error("PayPal Error:", err);
              setNotification({ msg: "Payment prevented by tactical jammer.", type: "error" });
            },
          })
          .render("#paypal-button-container-unique");
      }
    }
  }, [
    paypalLoaded,
    selectedPackage,
    voiceEnabled,
    setShowBuyCredits,
    setNotification,
    setUserCredits,
  ]);

  const handlePurchase = async (pack, method) => {
    if (method === "PayFast") {
      showToast(`Initializing secure channel via PayFast...`);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch("/api/payments/payfast/init", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ packageId: pack.id }),
        });

        if (!res.ok) throw new Error("Server rejected payment init");

        const data = await res.json();

        // Expected { redirectUrl, params } form backend
        if (data.redirectUrl && data.params) {
          // Construct hidden form and submit to redirect user
          const form = document.createElement("form");
          form.method = "POST";
          form.action = data.redirectUrl;

          Object.keys(data.params).forEach(key => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = key;
            input.value = data.params[key];
            form.appendChild(input);
          });

          document.body.appendChild(form);
          showToast(`Redirecting to payment gateway...`, "success");
          if (voiceEnabled)
            speakCommand("Secure line established. Completing transaction off-site.");

          form.submit();
        } else {
          showToast("Payment initialization failed. Invalid response.", "error");
        }
      } catch (e) {
        console.error("PayFast Error:", e);
        showToast("Connection to PayFast failed.", "error");
      }
      return;
    }

    // Legacy/Simulation Handling (Fallback if needed, but PayPal is handled in useEffect)
    showToast(`Initiating ${method} secure checkout for ${pack.name}...`);

    setTimeout(() => {
      // This block is effectively dead code for PayPal now, but kept for future fallback
      setUserCredits(prev => prev + pack.credits);
      showToast(`Transaction Complete via ${method}. +${pack.credits} Credits added.`, "success");
      setShowBuyCredits(false);
      setSelectedPackage(null);
      if (voiceEnabled)
        speakCommand(`Arsenal reloaded. ${pack.credits} credits derived from capital injection.`);
    }, 1500);
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  // LEADERBOARD STATE
  const [leaderboard, setLeaderboard] = useState([
    { name: "SarahScale", rank: "👑 Alpha", credits: 42500, avatar: "S" },
    { name: "CryptoKing", rank: "🩸 Predator", credits: 38200, avatar: "C" },
    { name: "HustleGPT", rank: "🩸 Predator", credits: 29150, avatar: "H" },
    { name: "ViralVixen", rank: "🏹 Hunter", credits: 15400, avatar: "V" },
    { name: "You", rank: "🐶 Pup", credits: userCredits, avatar: "Y", isMe: true },
  ]);

  // Determine User Rank
  const getRank = credits => {
    if (credits >= 10000) return { title: "ALPHA", emoji: "👑", color: "#FFD700" };
    if (credits >= 2000) return { title: "PREDATOR", emoji: "🩸", color: "#FF4444" };
    if (credits >= 500) return { title: "HUNTER", emoji: "🏹", color: "#00ff88" };
    if (credits >= 100) return { title: "SCOUT", emoji: "👁️", color: "#00ccff" };
    return { title: "PUP", emoji: "🐶", color: "#888" };
  };

  const userRank = getRank(userCredits);

  // War Room Form
  const [campaignForm, setCampaignForm] = useState({
    contentId: "",
    platform: "tiktok",
    actionType: "like",
    quantity: 10,
  });

  // MOCK DATA FOR DEMO IF API FAILS OR IS EMPTY
  const MOCK_TASKS = [
    {
      id: "m1",
      title: "Viral Dance Challenge",
      platform: "tiktok",
      reward: 8,
      tags: [" FRENZY", " LAST CALL"],
      slotsLeft: 3,
      timeLeft: 4500000,
      externalUrl: "https://tiktok.com",
    },
    {
      id: "m2",
      title: "Tech Review Premiere",
      platform: "youtube",
      reward: 5,
      tags: [" ENDING SOON"],
      slotsLeft: 12,
      timeLeft: 1200000,
      externalUrl: "https://youtube.com",
    },
    {
      id: "m3",
      title: "Luxury Brand Showcase",
      platform: "instagram",
      reward: 12,
      tags: [" FRENZY"],
      slotsLeft: 1,
      timeLeft: 300000,
      externalUrl: "https://instagram.com",
    },
    {
      id: "m4",
      title: "Crypto Alpha Thread",
      platform: "reddit",
      reward: 4,
      tags: [],
      slotsLeft: 45,
      timeLeft: 8000000,
      externalUrl: "https://reddit.com",
    },
    {
      id: "m5",
      title: "Community Discussion",
      platform: "facebook",
      reward: 3,
      tags: [],
      slotsLeft: 20,
      timeLeft: 6000000,
      externalUrl: "https://facebook.com",
    },
  ];

  useEffect(() => {
    fetchFeedingGrounds();
    // Poll for updates every 30s
    const interval = setInterval(fetchFeedingGrounds, 30000);

    // WELCOME COMMAND
    setTimeout(() => {
      if (voiceEnabled) speakCommand("Welcome back to the hunting ground. Standing by for orders.");
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const showToast = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchFeedingGrounds = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();

      let apiTasks = [];
      let staminaData = null;

      if (token) {
        const res = await fetch("/api/community/wolf-hunt/tasks", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          apiTasks = data.tasks;
          staminaData = data.stamina;
        }
      }

      // FALLBACK TO MOCK IF EMPTY
      if (!apiTasks || apiTasks.length === 0) {
        console.warn("Using simulation data for feeding grounds");
        setTasks(MOCK_TASKS);
      } else {
        setTasks(apiTasks);
      }

      if (staminaData) {
        setEnergy(
          staminaData.remaining
            ? { current: staminaData.remaining, max: staminaData.max }
            : { current: 0, max: 50 }
        );
      }
    } catch (err) {
      console.error("Failed to scout:", err);
      setTasks(MOCK_TASKS); // Fallback on error
    } finally {
      setLoading(false);
    }
  };

  // --- VOICE COMMANDER ---
  const speakCommand = (text, forceSpeak = false) => {
    if ((!voiceEnabled && !forceSpeak) || !window.speechSynthesis) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    // Use Web Speech API
    const utterance = new SpeechSynthesisUtterance(text);

    // Attempt to find a "deep/commanding" voice if available
    const voices = window.speechSynthesis.getVoices();
    // Prefer "Google UK English Male" or similar if available, else default
    // Or try to pitch shift down
    const soldierVoice =
      voices.find(v => v.name.includes("Male") || v.name.includes("David")) || voices[0];

    utterance.voice = soldierVoice;
    utterance.pitch = 0.6; // Lower pitch for authority (0.1 to 2)
    utterance.rate = 1.0; // Slightly faster, like a briefing
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleBriefingAccept = () => {
    if (!briefingAccepted) return; // Must check box

    if (voiceEnabled) speakCommand("Good copy. Engage the target immediately. Dismissed.");
    setBriefingOpen(false);

    // Proceed to claim logic
    executeClaim(pendingMissionId);
    setPendingMissionId(null);
    setPendingTask(null);
  };

  // Modified handleClaim to intercept for briefing
  const handleClaim = campaignId => {
    // Find task details for briefing
    const task = tasks.find(t => t.id === campaignId) || MOCK_TASKS.find(t => t.id === campaignId);

    // STAMINA CHECK
    if (energy.current <= 0) {
      if (voiceEnabled) speakCommand("Negative. Stamina depleted. Rest or resupply immediately.");
      showToast("Not enough energy. Rest or Buy Credits.", "error");
      return;
    }

    // ALWAYS OPEN BRIEFING (Strict Workflow)
    setPendingMissionId(campaignId);
    setPendingTask(task);
    setBriefingAccepted(false); // Reset consent
    setBriefingOpen(true);

    const platform = task?.platform || "Unknown";
    const reward = task?.reward || 0;

    if (voiceEnabled) {
      speakCommand(
        `Soldier! New target acquired on ${platform}. Reward is ${reward} credits. Confirm your orders to engage.`
      );
    }
  };

  const executeClaim = async campaignId => {
    // Handling Mock Tasks
    if (typeof campaignId === "string" && campaignId.startsWith("m")) {
      const task = MOCK_TASKS.find(t => t.id === campaignId);
      showToast("SIMULATION ENGAGED: Target Locked", "success");
      setActiveMission({
        proofId: "demo_proof_" + Date.now(),
        campaignId,
        externalUrl: task.externalUrl,
        minConfirmTime: Date.now() + 5000, // Shorten for demo (5s)
        claimedAt: Date.now(),
      });
      window.open(task.externalUrl, "_blank");
      return;
    }

    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/community/wolf-hunt/claim/${campaignId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        // Start Mission
        setActiveMission({
          ...data, // includes proofId, externalUrl, instructions
          campaignId,
          claimedAt: Date.now(),
        });

        // Voice Feedback on start
        if (voiceEnabled) {
          setTimeout(() => speakCommand("Mission timer active. Execute."), 2000);
        }

        showToast("Target Locked. Engage within 15m.");
        window.open(data.externalUrl, "_blank");
      } else {
        showToast(data.error || "Prey got away.", "error");
        fetchFeedingGrounds(); // Refresh list if taken
      }
    } catch (err) {
      showToast("Network Error", "error");
    }
  };

  const handleConfirm = async () => {
    if (!activeMission) return;

    // Handle Mock Confirmation
    if (activeMission.proofId && activeMission.proofId.startsWith("demo_proof")) {
      showToast("SIMULATION: Kill Confirmed. +5 Credits", "success");
      if (voiceEnabled) speakCommand("Target neutralized. Funds transferred.");
      setUserCredits(prev => prev + 5);
      setActiveMission(null);
      return;
    }

    try {
      setUploadingProof(true);
      const token = await auth.currentUser.getIdToken();
      let proofUrl = null;

      // 1. Upload Evidence
      if (proofFile) {
        const storageRef = ref(storage, `proofs/${activeMission.proofId}/${proofFile.name}`);
        const snapshot = await uploadBytes(storageRef, proofFile);
        proofUrl = await getDownloadURL(snapshot.ref);
        showToast("Evidence Uploaded. Verifying...", "success");
      } else {
        // STRICT MODE: Fail if no proof
        showToast("Proof Screenshot Required", "error");
        if (voiceEnabled)
          speakCommand("Negative. Blind firing not authorized. Provide visual confirmation.");
        setUploadingProof(false);
        return;
      }

      // 2. Submit Claim
      const res = await fetch(`/api/community/wolf-hunt/confirm/${activeMission.proofId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proofUrl }),
      });
      const data = await res.json();

      if (data.success) {
        showToast(`Kill Confirmed. +${data.earned} Credits`, "success");
        if (voiceEnabled)
          speakCommand(`Confirmed. You earned ${data.earned} credits. Stay hungry.`);

        setUserCredits(prev => prev + data.earned);
        setEnergy(prev => ({ ...prev, current: prev.current - 1 }));
        setActiveMission(null);
        setProofFile(null); // Reset
        fetchFeedingGrounds();
      } else {
        if (voiceEnabled) speakCommand("Negative. Verification failed. Retrying scan.");
        showToast(data.error, "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Verification Failed", "error");
    } finally {
      setUploadingProof(false);
    }
  };

  const handleCreateCampaign = async e => {
    e.preventDefault();
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/community/wolf-hunt/campaign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(campaignForm),
      });
      const data = await res.json();

      if (data.success) {
        showToast(data.message);
        setCampaignForm({ ...campaignForm, contentId: "" }); // Reset
      } else {
        showToast(data.error, "error");
      }
    } catch (err) {
      showToast("Campaign Launch Failed", "error");
    }
  };

  // --- RENDER HELPERS ---
  const MissionTimer = ({ start }) => {
    // Render-safe timer
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
      const i = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
      return () => clearInterval(i);
    }, [start]);

    const timeLeft = 15 - elapsed;
    const canConfirm = timeLeft <= 0;

    return (
      <div className="mission-timer">
        {canConfirm ? (
          <span style={{ color: "#00ff88" }}>READY TO KILL</span>
        ) : (
          `WAIT ${Math.max(0, timeLeft)}s`
        )}
      </div>
    );
  };

  return (
    <div className="wolf-hunt-dashboard">
      {notification && (
        <div className={`notification-toast ${notification.type}`}>{notification.msg}</div>
      )}

      {/* HEADER */}
      <header className="hunt-header">
        <div className="brand-title">
          <h1>WOLF HUNT</h1>
          <span className="tagline">The Billionaire's Playground</span>
        </div>
        <div className="status-bar">
          {/* VOICE TOGGLE */}
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`voice-toggle-btn ${voiceEnabled ? "active" : ""}`}
            title="Toggle Voice Commander"
            style={{
              background: voiceEnabled ? "rgba(0, 255, 136, 0.1)" : "transparent",
              border: voiceEnabled ? "1px solid #00ff88" : "1px solid #333",
              color: voiceEnabled ? "#00ff88" : "#666",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              marginRight: "1rem",
              boxShadow: isSpeaking && voiceEnabled ? "0 0 15px rgba(0, 255, 136, 0.5)" : "none",
              transition: "all 0.2s",
            }}
          >
            <VolumeIcon on={voiceEnabled} />
          </button>

          <div className="stat-card rank-card" style={{ border: `1px solid ${userRank.color}` }}>
            <span className="stat-label">Your Rank</span>
            <span className="stat-value" style={{ color: userRank.color }}>
              {userRank.emoji} {userRank.title}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Growth Credits</span>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span className="stat-value gold">${userCredits.toLocaleString()}</span>
              <button
                onClick={() => setShowBuyCredits(true)}
                style={{
                  background: "#ffd700",
                  color: "black",
                  border: "none",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  fontSize: "18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Buy Credits"
              >
                +
              </button>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-label">Daily Energy</span>
            <span className="stat-value">
              {energy.current}/{energy.max}
            </span>
            <div className="energy-bar-container">
              <div
                className="energy-fill"
                style={{ width: `${(energy.current / energy.max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* VIEW NAVIGATION */}
      <div
        className="view-nav"
        style={{
          marginBottom: "2rem",
          display: "flex",
          gap: "1rem",
          borderBottom: "1px solid #333",
        }}
      >
        <button
          onClick={() => setActiveView("missions")}
          style={{
            background: activeView === "missions" ? "#222" : "transparent",
            color: activeView === "missions" ? "#00ff88" : "#888",
            border: "none",
            padding: "1rem 2rem",
            cursor: "pointer",
            fontWeight: "bold",
            borderBottom: activeView === "missions" ? "2px solid #00ff88" : "2px solid transparent",
          }}
        >
          🎯 ACTIVE HUNTS
        </button>
        <button
          onClick={() => setActiveView("intel")}
          style={{
            background: activeView === "intel" ? "#222" : "transparent",
            color: activeView === "intel" ? "#FFD700" : "#888", // Gold for Intel
            border: "none",
            padding: "1rem 2rem",
            cursor: "pointer",
            fontWeight: "bold",
            borderBottom: activeView === "intel" ? "2px solid #FFD700" : "2px solid transparent",
          }}
        >
          📡 WOLF INTEL
        </button>
      </div>

      {activeView === "intel" ? (
        <div className="intel-view">
          <WolfPackFeed />
          <div
            style={{
              marginTop: "4rem",
              padding: "2rem",
              border: "1px solid #333",
              borderRadius: "8px",
              background: "#111",
            }}
          >
            <h3>Wolf Pack HQ</h3>
            <p style={{ color: "#888" }}>Join the elite circle on Discord.</p>
            <button
              onClick={() => {
                showToast(
                  "Discord Headquarters opening soon. Stand by for coordinates.",
                  "success"
                );
                if (voiceEnabled)
                  speakCommand("Negative. Encrypted channel not yet established. Stand by.");
              }}
              style={{
                color: "#00ff88",
                background: "transparent",
                border: "none",
                fontWeight: "bold",
                fontSize: "1rem",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              ENTER THE DEN →
            </button>
          </div>
        </div>
      ) : (
        /* GRID */
        <div className="hunt-grid">
          {/* LEFT: FEEDING GROUNDS */}
          <div className="feeding-grounds-section">
            <div className="section-hud-title">Feeding Grounds (Live Tasks)</div>
            {/* BRIEFING MODAL OVERLAY */}
            {/* BRIEFING MODAL OVERLAY */}
            {briefingOpen && (
              <div
                className="briefing-overlay"
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(0,0,0,0.95)",
                  zIndex: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                }}
              >
                <div
                  className="briefing-card"
                  style={{
                    width: "90%",
                    maxWidth: "500px",
                    background: "#111",
                    border: "2px solid #00ff88",
                    padding: "2rem",
                    borderRadius: "4px",
                    textAlign: "center",
                    boxShadow: "0 0 30px rgba(0, 255, 136, 0.2)",
                  }}
                >
                  <h2
                    style={{ color: "#00ff88", textTransform: "uppercase", letterSpacing: "2px" }}
                  >
                    Mission Briefing
                  </h2>
                  <div
                    className="audio-wave"
                    style={{
                      height: "30px",
                      margin: "1rem 0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "4px",
                    }}
                  >
                    {/* Animated fake waveform */}
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        style={{
                          width: "4px",
                          height: isSpeaking ? Math.random() * 20 + 10 + "px" : "4px",
                          background: "#00ff88",
                          transition: "height 0.1s",
                        }}
                      ></div>
                    ))}
                  </div>

                  {/* DYNAMIC MISSION INFO */}
                  {pendingTask && (
                    <div
                      style={{
                        textAlign: "left",
                        background: "#222",
                        padding: "1rem",
                        borderRadius: "4px",
                        border: "1px dashed #444",
                        marginBottom: "1rem",
                      }}
                    >
                      <div style={{ color: "#888", fontSize: "0.9rem" }}>MISSION PARAMETERS:</div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.5rem",
                        }}
                      >
                        <span style={{ color: "#fff" }}>PLATFORM:</span>
                        <span style={{ color: "#00ff88", fontWeight: "bold" }}>
                          {pendingTask.platform.toUpperCase()}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.5rem",
                        }}
                      >
                        <span style={{ color: "#fff" }}>INTERACTION:</span>
                        <span style={{ color: "#fff", fontWeight: "bold" }}>
                          {pendingTask.title || "Execute Engagement"}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginTop: "0.5rem",
                        }}
                      >
                        <span style={{ color: "#fff" }}>BOUNTY:</span>
                        <span style={{ color: "#FFD700", fontWeight: "bold" }}>
                          {pendingTask.reward} Credits
                        </span>
                      </div>
                    </div>
                  )}

                  <p
                    style={{
                      color: "#ccc",
                      fontSize: "1.2rem",
                      margin: "2rem 0",
                      fontFamily: "monospace",
                    }}
                  >
                    "Target identified. Confirm you are ready to engage."
                  </p>

                  {/* VOICE CHECK WARNING */}
                  {!voiceEnabled && (
                    <div
                      style={{
                        background: "rgba(255, 0, 0, 0.2)",
                        border: "1px solid red",
                        padding: "1rem",
                        marginBottom: "2rem",
                        borderRadius: "4px",
                      }}
                    >
                      <div style={{ color: "red", fontWeight: "bold", marginBottom: "0.5rem" }}>
                        ⚠️ COMMS OFFLINE
                      </div>
                      <p style={{ color: "#ccc", fontSize: "0.9rem", marginBottom: "1rem" }}>
                        Voice Commander is disabled. You may miss critical mission updates.
                      </p>
                      <button
                        onClick={() => {
                          setVoiceEnabled(true);
                          const missionText = pendingTask
                            ? `Comms online. Mission detected. ${pendingTask.platform} target. ${pendingTask.title}. Reward ${pendingTask.reward} credits. Confirm orders to execute.`
                            : "Comms online. Awaiting mission parameters.";
                          speakCommand(missionText, true);
                        }}
                        style={{
                          background: "red",
                          color: "white",
                          border: "none",
                          padding: "5px 15px",
                          cursor: "pointer",
                          fontWeight: "bold",
                        }}
                      >
                        ENABLE COMMS
                      </button>
                    </div>
                  )}

                  <div
                    className="briefing-confirm"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      marginTop: "2rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      id="confirm-orders"
                      checked={briefingAccepted}
                      onChange={e => setBriefingAccepted(e.target.checked)}
                      style={{ transform: "scale(1.5)", accentColor: "#00ff88" }}
                    />
                    <label
                      htmlFor="confirm-orders"
                      style={{ color: "#fff", cursor: "pointer", fontWeight: "bold" }}
                    >
                      I ACKNOWLEDGE ORDERS & STRICT BAN POLICY
                    </label>
                  </div>
                  <div
                    style={{
                      marginTop: "2rem",
                      display: "flex",
                      gap: "1rem",
                      justifyContent: "center",
                    }}
                  >
                    <button
                      onClick={() => {
                        setBriefingOpen(false);
                        speakCommand("Mission aborted.");
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid #666",
                        color: "#666",
                        padding: "10px 20px",
                        cursor: "pointer",
                      }}
                    >
                      ABORT
                    </button>
                    <button
                      onClick={handleBriefingAccept}
                      disabled={!briefingAccepted}
                      style={{
                        background: briefingAccepted ? "#00ff88" : "#222",
                        border: "none",
                        color: briefingAccepted ? "#000" : "#444",
                        fontWeight: "bold",
                        padding: "10px 30px",
                        cursor: briefingAccepted ? "pointer" : "not-allowed",
                      }}
                    >
                      EXECUTE MISSION
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeMission ? (
              <div className="active-mission-panel">
                <h3> TARGET LOCKED</h3>
                <p>You have engaged the target. Complete the mission to claim the bounty.</p>

                <MissionTimer start={activeMission.claimedAt} />

                <div className="mission-steps">
                  <button className="step-btn completed">
                    <span>1. Lock Verification Slot</span>
                    <BoltIcon />
                  </button>
                  <button
                    className="step-btn"
                    onClick={() => window.open(activeMission.externalUrl, "_blank")}
                  >
                    <span>2. Re-Open Target Link</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </button>

                  {/* PROOF UPLOAD STEP */}
                  <div
                    style={{
                      padding: "1rem",
                      background: "rgba(0,0,0,0.3)",
                      border: "1px dashed #444",
                      margin: "1rem 0",
                      borderRadius: "4px",
                      textAlign: "center",
                    }}
                  >
                    <label
                      style={{
                        display: "block",
                        color: "#888",
                        marginBottom: "0.5rem",
                        fontSize: "0.9rem",
                      }}
                    >
                      3. UPLOAD PROOF OF ENGAGEMENT
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => setProofFile(e.target.files[0])}
                      style={{
                        background: "#222",
                        color: "#fff",
                        border: "none",
                        padding: "0.5rem",
                        width: "100%",
                        borderRadius: "4px",
                      }}
                    />
                    {proofFile && (
                      <div style={{ color: "#00ff88", fontSize: "0.8rem", marginTop: "5px" }}>
                        File Selected: {proofFile.name}
                      </div>
                    )}
                  </div>

                  <button
                    className="step-btn primary"
                    onClick={handleConfirm}
                    disabled={uploadingProof}
                  >
                    {uploadingProof ? "VERIFYING EVIDENCE..." : "CONFIRM KILL (COLLECT BOUNTY)"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bounty-list">
                {/* Show loading only if no tasks found at all */}
                {loading && tasks.length === 0 ? (
                  <p>Scouting for prey...</p>
                ) : (
                  tasks.map(task => (
                    <div
                      key={task.id}
                      className={`bounty-card ${task.tags.includes(" FRENZY") ? "frenzy" : ""}`}
                    >
                      <div className="bounty-info">
                        <h3>
                          {task.title}
                          <span className="platform-tag">{task.platform}</span>
                        </h3>
                        <div className="bounty-meta">
                          <span className="meta-item">
                            <ClockIcon /> {Math.ceil(task.timeLeft / 1000 / 60)}m left
                          </span>
                          <span className="meta-item urgent">{task.slotsLeft} slots remaining</span>
                        </div>
                      </div>
                      <div className="bounty-action">
                        <span className="reward-badge">+{task.reward}</span>
                        <button
                          className="hunt-btn"
                          onClick={() => handleClaim(task.id)}
                          disabled={energy.current <= 0}
                        >
                          {energy.current > 0 ? "CLAIM PREY" : "REST"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
                {tasks.length === 0 && !loading && (
                  <div style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
                    No prey in sight. The wolves are sleeping.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: WAR ROOM */}
          <div className="war-room-section">
            <div className="section-hud-title">
              War Room (Create Campaign)
              <button
                onClick={() => {
                  if (voiceEnabled) {
                    speakCommand(
                      "Listen closely. This is where you deploy the Wolf Pack. " +
                        "Paste any public link from TikTok, YouTube, Instagram, Facebook, Reddit or X. " +
                        "Select your strategy: Boost Likes or Boost Comments. " +
                        "The pack will then swarm your target until the job is done. " +
                        "Quality is guaranteed. Now, unleash hell.",
                      true
                    );
                  } else {
                    showToast("Enable Comms (Voice) to hear the briefing.", "error");
                  }
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #00ff88",
                  color: "#00ff88",
                  borderRadius: "50%",
                  width: "24px",
                  height: "24px",
                  fontSize: "14px",
                  cursor: "pointer",
                  marginLeft: "10px",
                }}
                title="Hear Mission Ops Briefing"
              >
                ?
              </button>
            </div>
            <form onSubmit={handleCreateCampaign} className="create-campaign-form">
              <div className="form-group">
                <label>Target URL (Link to Post)</label>
                <input
                  className="dark-input"
                  placeholder="https://tiktok.com/@user/video/..."
                  value={campaignForm.contentId}
                  onChange={e => setCampaignForm({ ...campaignForm, contentId: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Platform</label>
                <select
                  className="dark-select"
                  value={campaignForm.platform}
                  onChange={e => setCampaignForm({ ...campaignForm, platform: e.target.value })}
                >
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="reddit">Reddit</option>
                  <option value="twitter">Twitter / X</option>
                </select>
              </div>

              <div className="form-group">
                <label>Strategy (Action)</label>
                <select
                  className="dark-select"
                  value={campaignForm.actionType}
                  onChange={e => setCampaignForm({ ...campaignForm, actionType: e.target.value })}
                >
                  <option value="like">Boost Likes (2 Cr/unit)</option>
                  <option value="comment">Boost Comments (5 Cr/unit)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Quantity (Wolf Pack Size)</label>
                <input
                  type="number"
                  className="dark-input"
                  min="10"
                  max="1000"
                  value={campaignForm.quantity}
                  onChange={e =>
                    setCampaignForm({ ...campaignForm, quantity: parseInt(e.target.value) })
                  }
                />
              </div>

              <div className="cost-summary">
                <span>Estimated Cost</span>
                <strong style={{ color: "#FFD700", fontSize: "1.2rem" }}>
                  {(campaignForm.actionType === "comment" ? 5 : 2) * campaignForm.quantity} Cr
                </strong>
              </div>

              <button type="submit" className="launch-btn">
                UNLEASH THE PACK
              </button>
            </form>

            {/* LEADERBOARD SECTION */}
            <div
              className="leaderboard-section"
              style={{
                marginTop: "2rem",
                padding: "1.5rem",
                background: "#0a0a0a",
                borderRadius: "8px",
                border: "1px solid #333",
              }}
            >
              <div
                className="section-hud-title"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <CrownIcon /> TOP PREDATORS (Weekly)
              </div>
              <div className="leaderboard-list">
                {leaderboard.map((user, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 0",
                      borderBottom: "1px solid #1a1a1a",
                      color: user.isMe ? "#00ff88" : "#888",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          fontWeight: "bold",
                          width: "20px",
                          color: idx === 0 ? "#FFD700" : "#666",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: "#333",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                        }}
                      >
                        {user.avatar}
                      </div>
                      <span style={{ fontWeight: user.isMe ? "bold" : "normal" }}>{user.name}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "0.8rem", color: user.isMe ? "#00ff88" : "#666" }}>
                        {user.rank}
                      </span>
                      <span style={{ fontWeight: "bold", color: "#FFD700" }}>
                        {user.credits.toLocaleString()} Cr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVENUE: CREDIT PURCHASE MODAL */}
      {showBuyCredits && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowBuyCredits(false)}
        >
          <div
            style={{
              background: "#1a1d24",
              border: "1px solid #ffd700",
              padding: "2rem",
              borderRadius: "12px",
              minWidth: "400px",
              boxShadow: "0 0 30px rgba(255, 215, 0, 0.2)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: "#ffd700", marginTop: 0 }}>Alpha Re-Supply</h3>

            {/* STEP 1: SELECT PACKAGE */}
            {!selectedPackage ? (
              <>
                <p style={{ color: "#aaa", marginBottom: "1.5rem" }}>
                  Running low on ammo? Feed the machine to dominate the feed.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {CREDIT_PACKAGES.map(pack => (
                    <div
                      key={pack.id}
                      onClick={() => setSelectedPackage(pack)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "1rem",
                        background: "#252a33",
                        borderRadius: "8px",
                        cursor: "pointer",
                        border: "1px solid #333",
                        transition: "0.2s",
                      }}
                      onMouseOver={e => (e.currentTarget.style.borderColor = "#ffd700")}
                      onMouseOut={e => (e.currentTarget.style.borderColor = "#333")}
                    >
                      <div>
                        <div style={{ fontWeight: "bold", color: "white" }}>{pack.name}</div>
                        <div style={{ fontSize: "0.9em", color: "#ffd700" }}>
                          {pack.credits} Credits
                        </div>
                      </div>
                      <div
                        style={{
                          background: "#ffd700",
                          color: "black",
                          fontWeight: "bold",
                          padding: "0.3rem 0.8rem",
                          borderRadius: "4px",
                        }}
                      >
                        ${pack.price}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* STEP 2: SELECT PAYMENT METHOD */
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  <div style={{ color: "#888", fontSize: "0.9rem", marginBottom: "0.5rem" }}>
                    SELECTED PACKAGE
                  </div>
                  <div
                    style={{
                      background: "rgba(255, 215, 0, 0.1)",
                      border: "1px solid #ffd700",
                      padding: "1rem",
                      borderRadius: "8px",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span style={{ color: "white", fontWeight: "bold" }}>
                      {selectedPackage.name}
                    </span>
                    <span style={{ color: "#ffd700" }}>${selectedPackage.price}</span>
                  </div>
                </div>

                <p style={{ color: "#aaa", marginBottom: "1rem" }}>Select secure payment method:</p>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {/* PAYPAL (Real Integration) */}
                  <div id="paypal-button-container-unique" style={{ minHeight: "50px", zIndex: 1 }}>
                    {!paypalLoaded && (
                      <div
                        style={{
                          padding: "1rem",
                          background: "#333",
                          color: "#888",
                          borderRadius: "4px",
                          textAlign: "center",
                          fontSize: "0.9rem",
                        }}
                      >
                        Establishing Secure Uplink...
                      </div>
                    )}
                  </div>

                  {/* PAYFAST */}
                  <button
                    onClick={() => handlePurchase(selectedPackage, "PayFast")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                      padding: "1rem",
                      background: "#e01e26",
                      color: "white",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer" /* PayFast Red */,
                      fontWeight: "bold",
                      fontSize: "1rem",
                    }}
                  >
                    💳 Pay with PayFast (ZA)
                  </button>
                </div>

                <button
                  onClick={() => setSelectedPackage(null)}
                  style={{
                    marginTop: "1rem",
                    width: "100%",
                    padding: "0.8rem",
                    background: "transparent",
                    border: "none",
                    color: "#888",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  ← Back to Packages
                </button>
              </>
            )}

            <button
              onClick={() => {
                setShowBuyCredits(false);
                setSelectedPackage(null);
              }}
              style={{
                marginTop: "1.5rem",
                width: "100%",
                padding: "0.8rem",
                background: "transparent",
                border: "1px solid #555",
                color: "#888",
                cursor: "pointer",
                borderRadius: "4px",
              }}
            >
              Cancel Supply Drop
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WolfHuntDashboard;
