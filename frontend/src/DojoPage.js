import React, { useState, useEffect } from "react";
import { db, auth } from "./firebaseClient";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";
import "./App.css";

const DojoPage = () => {
  const [coins, setCoins] = useState(0);
  const [trends, setTrends] = useState([]);
  const [analyzing, setAnalyzing] = useState(null); // ID of trend being analyzed
  const [logs, setLogs] = useState([]);
  const [showStore, setShowStore] = useState(false);

  // Mock Trend Data generator
  const generateTrend = () => {
    const niches = ["Crypto", "Fitness", "ASMR", "Gaming", "Tech", "Beauty"];
    const keywords = ["Moon", "Challenge", "Routine", "Fail", "Hack", "Review"];
    const niche = niches[Math.floor(Math.random() * niches.length)];
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    return {
      id: Date.now() + Math.random(),
      niche,
      topic: `#${niche}${keyword}`,
      velocity: Math.floor(Math.random() * 1000) + " tweets/min",
      opportunity: Math.floor(Math.random() * 99) + "%",
    };
  };

  useEffect(() => {
    // Load User Coins
    const fetchCoins = async () => {
      if (!auth.currentUser) return;
      const ref = doc(db, "user_credits", auth.currentUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setCoins(snap.data().growth_credits || 0);
      }
    };
    fetchCoins();

    // Trend Feed Simulation
    const interval = setInterval(() => {
      setTrends(prev => [generateTrend(), ...prev.slice(0, 4)]);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const buyPackage = async (amount, cost) => {
    if (!auth.currentUser) return;
    // Simulate Payment Processing
    setLogs(prev => [`🛒 Processing Transaction ($${cost})...`, ...prev]);
    await new Promise(r => setTimeout(r, 1500));

    const ref = doc(db, "user_credits", auth.currentUser.uid);
    await updateDoc(ref, {
      growth_credits: increment(amount),
    }).catch(async () => {});

    setCoins(prev => prev + amount);
    setLogs(prev => [`💰 PURCHASE SUCCESSFUL! +${amount} COINS ADDED.`, ...prev]);
    setShowStore(false);
  };

  const handleAnalyze = async trend => {
    if (analyzing) return;
    setAnalyzing(trend.id);

    // Simulate Analysis "Work"
    setLogs(prev => [`🔍 Scanning ${trend.topic} metadata...`, ...prev]);
    await new Promise(r => setTimeout(r, 800));
    setLogs(prev => [`📊 Correlating with global vectors...`, ...prev]);
    await new Promise(r => setTimeout(r, 800));
    setLogs(prev => [`✅ Opportunity verified! Earning 5 Viral Coins.`, ...prev]);

    // Award Coins
    if (auth.currentUser) {
      const ref = doc(db, "user_credits", auth.currentUser.uid);
      await updateDoc(ref, {
        growth_credits: increment(5),
      }).catch(async () => {
        // Create if not exists (lazy init)
        // In real app, revenueEngine handles this safely
      });
      setCoins(prev => prev + 5);
    }

    setAnalyzing(null);
  };

  return (
    <div
      className="dojo-container"
      style={{
        background: "#0f0f1a",
        minHeight: "100vh",
        color: "#e0e0e0",
        padding: "40px",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #333",
          paddingBottom: "20px",
          marginBottom: "30px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ color: "#e94560", margin: 0 }}>🥋 VIRAL DOJO</h1>
          <p style={{ margin: "5px 0", color: "#666" }}>Trend Analysis & Strategy Training</p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => setShowStore(true)}
            style={{
              background: "#22c55e",
              color: "black",
              border: "none",
              padding: "10px 20px",
              fontWeight: "bold",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            🛒 BUY COINS
          </button>
          <div
            style={{
              background: "linear-gradient(45deg, #ffd700, #f59e0b)",
              color: "black",
              padding: "10px 20px",
              borderRadius: "4px",
              fontWeight: "bold",
              boxShadow: "0 0 15px rgba(255, 215, 0, 0.3)",
            }}
          >
            💰 BALANCE: {coins} COINS
          </div>
        </div>
      </header>

      {showStore && (
        <div
          className="store-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 100,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#1a1a2e",
              padding: "30px",
              borderRadius: "10px",
              width: "500px",
              border: "2px solid #e94560",
            }}
          >
            <h2 style={{ color: "#e94560", textAlign: "center", marginTop: 0 }}>
              STORE: FAST TRACK
            </h2>
            <div style={{ display: "grid", gap: "15px" }}>
              <button
                onClick={() => buyPackage(100, 0.99)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "15px",
                  background: "#333",
                  border: "1px solid #555",
                  color: "white",
                  cursor: "pointer",
                  borderRadius: "5px",
                  fontSize: "1rem",
                }}
              >
                <span>Starter Sack</span>
                <span>100 Coins - $0.99</span>
              </button>
              <button
                onClick={() => buyPackage(550, 4.99)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "15px",
                  background: "#333",
                  border: "2px solid #ffd700",
                  color: "white",
                  cursor: "pointer",
                  borderRadius: "5px",
                  fontSize: "1rem",
                }}
              >
                <span>Grinder's Box (Popular)</span>
                <span>550 Coins - $4.99</span>
              </button>
              <button
                onClick={() => buyPackage(1200, 9.99)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "15px",
                  background: "#333",
                  border: "1px solid #555",
                  color: "white",
                  cursor: "pointer",
                  borderRadius: "5px",
                  fontSize: "1rem",
                }}
              >
                <span>Whale Chest</span>
                <span>1200 Coins - $9.99</span>
              </button>
            </div>
            <button
              onClick={() => setShowStore(false)}
              style={{
                marginTop: "20px",
                width: "100%",
                padding: "10px",
                background: "transparent",
                border: "1px solid #666",
                color: "#888",
                cursor: "pointer",
              }}
            >
              CANCEL
            </button>
            <p
              style={{ fontSize: "0.8rem", color: "#666", textAlign: "center", marginTop: "10px" }}
            >
              * Simulated Payment Environment
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "30px" }}>
        {/* LEFT: Trend Scanner */}
        <div className="trend-feed">
          <h3 style={{ color: "#4cc9f0" }}>📡 LIVE TREND INTERCEPT</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "20px" }}>
            {trends.map(trend => (
              <div
                key={trend.id}
                style={{
                  background: "#1a1a2e",
                  border: "1px solid #333",
                  padding: "15px",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  animation: "fadeIn 0.5s ease-in",
                }}
              >
                <div>
                  <strong style={{ color: "#e94560", fontSize: "1.2rem" }}>{trend.topic}</strong>
                  <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "5px" }}>
                    Niche: {trend.niche} | Velocity: {trend.velocity}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      textAlign: "right",
                      marginBottom: "5px",
                      color: "#4cc9f0",
                      fontWeight: "bold",
                    }}
                  >
                    {trend.opportunity} Match
                  </div>
                  <button
                    onClick={() => handleAnalyze(trend)}
                    disabled={!!analyzing}
                    style={{
                      background: analyzing === trend.id ? "#333" : "#e94560",
                      color: "white",
                      border: "none",
                      padding: "8px 16px",
                      cursor: analyzing ? "wait" : "pointer",
                      borderRadius: "4px",
                      opacity: analyzing && analyzing !== trend.id ? 0.3 : 1,
                    }}
                  >
                    {analyzing === trend.id ? "SCANNING..." : "ANALYZE (+5 💰)"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Console Logs */}
        <div
          className="console-logs"
          style={{
            background: "#000",
            border: "1px solid #333",
            padding: "20px",
            borderRadius: "8px",
            height: "600px",
            overflowY: "auto",
          }}
        >
          <h3 style={{ color: "#0f0", marginTop: 0 }}>_SYSTEM_LOGS</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.9rem" }}>
            {logs.map((log, i) => (
              <div key={i} style={{ color: log.includes("✅") ? "#4cc9f0" : "#0f0" }}>
                {`> ${log}`}
              </div>
            ))}
            <div className="blinking-cursor" style={{ color: "#0f0" }}>
              {">_"}
            </div>
          </div>
        </div>
      </div>

      <style>{`
         @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
         .blinking-cursor { animation: blink 1s step-end infinite; }
         @keyframes blink { 50% { opacity: 0; } }
      `}</style>
    </div>
  );
};

export default DojoPage;
