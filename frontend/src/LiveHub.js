import React, { useState } from "react";
import LiveWatch from "./LiveWatch";
import StreamerDashboard from "./StreamerDashboard";

// Mock Data for "Live Business Discussions"
const MOCK_STREAMS = [
  {
    id: "biz-101",
    title: "Real Estate Tech Trends 2026",
    host: "Sarah Jenkings",
    price: 0, // Free
    viewers: 142,
    tags: ["Real Estate", "Tech"],
  },
  {
    id: "crypto-26",
    title: "Crypto Market Outlook Q2",
    host: "CryptoKing",
    price: 15.0,
    currency: "USD",
    viewers: 850,
    tags: ["Finance", "Crypto"],
  },
  {
    id: "startup-pitch",
    title: "Live Startup Pitches - Batch #4",
    host: "LaunchPad",
    price: 5.0,
    currency: "USD",
    viewers: 45,
    tags: ["Startups", "Business"],
  },
];

export default function LiveHub({ user }) {
  const [viewState, setViewState] = useState("lobby"); // 'lobby', 'watching', 'broadcasting'
  const [selectedStream, setSelectedStream] = useState(null);
  const [paymentPending, setPaymentPending] = useState(null);

  // User wants to GO LIVE
  const startBroadcasting = () => {
    // In a real app, this would create a session on the backend first
    setViewState("broadcasting");
  };

  // User wants to JOIN a stream
  const joinStream = stream => {
    if (stream.price > 0) {
      setPaymentPending(stream);
    } else {
      setSelectedStream(stream);
      setViewState("watching");
    }
  };

  // Mock Payment Success
  const handlePaymentSuccess = () => {
    alert(`Payment of $${paymentPending.price} successful! Joining stream...`);
    setSelectedStream(paymentPending);
    setPaymentPending(null);
    setViewState("watching");
  };

  if (viewState === "broadcasting") {
    return (
      <div className="live-hub-container">
        <button className="back-btn" onClick={() => setViewState("lobby")}>
          &larr; Exit Studio
        </button>
        <StreamerDashboard />
      </div>
    );
  }

  if (viewState === "watching" && selectedStream) {
    return (
      <LiveWatch
        liveId={selectedStream.id}
        // In reality, we'd pass a newly purchased token here
        token={selectedStream.price === 0 ? "free-token" : "paid-token"}
        onExit={() => setViewState("lobby")}
      />
    );
  }

  return (
    <div className="live-hub-lobby" style={{ padding: "20px", color: "white" }}>
      <header className="lobby-header" style={{ marginBottom: "30px" }}>
        <h2>Live Business Hub</h2>
        <p style={{ color: "#aaa" }}>Join live discussions, webinars, and networking events.</p>
        <div style={{ marginTop: "15px" }}>
          <button
            onClick={startBroadcasting}
            style={{
              padding: "10px 20px",
              background: "#e11d48",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Go Live Now
          </button>
        </div>
      </header>

      {/* Payment Modal for paid streams */}
      {paymentPending && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#1e293b",
              padding: "30px",
              borderRadius: "12px",
              maxWidth: "400px",
              textAlign: "center",
            }}
          >
            <h3>Purchase Ticket</h3>
            <p>
              To join <strong>{paymentPending.title}</strong>, you need a ticket.
            </p>
            <h2 style={{ margin: "20px 0", color: "#4ade80" }}>
              ${paymentPending.price.toFixed(2)}
            </h2>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={handlePaymentSuccess}
                style={{
                  padding: "10px 20px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Confirm Payment
              </button>
              <button
                onClick={() => setPaymentPending(null)}
                style={{
                  padding: "10px 20px",
                  background: "#475569",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="active-streams">
        <h3 style={{ borderBottom: "1px solid #334155", paddingBottom: "10px" }}>
          Broadcasting Now
        </h3>
        <div className="streams-grid" style={{ display: "grid", gap: "20px", marginTop: "20px" }}>
          {MOCK_STREAMS.map(stream => (
            <div
              key={stream.id}
              style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "8px",
                padding: "15px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span
                  style={{
                    background: "#ef4444",
                    color: "white",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: "bold",
                  }}
                >
                  LIVE
                </span>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  {stream.viewers} watching
                </span>
              </div>
              <h4 style={{ margin: 0, fontSize: "1.1rem" }}>{stream.title}</h4>
              <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.9rem" }}>Host: {stream.host}</p>
              <div style={{ display: "flex", gap: "5px" }}>
                {stream.tags.map(tag => (
                  <span
                    key={tag}
                    style={{
                      background: "#334155",
                      color: "#e2e8f0",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div
                style={{
                  marginTop: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontWeight: "bold", color: "#4ade80" }}>
                  {stream.price === 0 ? "Free" : `$${stream.price.toFixed(2)}`}
                </div>
                <button
                  onClick={() => joinStream(stream)}
                  style={{
                    padding: "8px 16px",
                    background: stream.price > 0 ? "#2563eb" : "#475569",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: "500",
                  }}
                >
                  {stream.price > 0 ? "Buy Ticket" : "Join Stream"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
