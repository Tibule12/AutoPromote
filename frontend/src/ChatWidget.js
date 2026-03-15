import React, { useState } from "react";
import "./ChatWidget.css";
import { auth } from "./firebaseClient";
import { API_BASE_URL } from "./config";

const ChatWidget = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Check access: Admin, Credits > 0, or Active Subscription
  const hasAccess =
    user?.isAdmin ||
    (user?.aiCredits && user.aiCredits > 0) ||
    (user?.aiSubscriptionEnd && user.aiSubscriptionEnd > Date.now());

  const AI_URL = "https://thulani-frontend-341498038874.us-central1.run.app";

  const handlePurchase = async (type, amount) => {
    if (!auth.currentUser) return;
    setLoadingPayment(true);
    try {
      const token = await auth.currentUser.getIdToken();
      // Use existing billing route, passing type to specify AI purchase
      const res = await fetch(`${API_BASE_URL}/api/credits/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          currency: "USD",
          type, // 'ai_credits' or 'ai_subscription'
        }),
      });

      const data = await res.json();
      if (data.ok && data.approve) {
        // Redirect to PayPal approval
        window.location.href = data.approve;
      } else {
        alert("Payment initialization failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      console.error(e);
      alert("Error starting payment process. Please try again.");
    } finally {
      setLoadingPayment(false);
    }
  };

  return (
    <div className="chat-widget-container">
      {/* Chat Window */}
      {isOpen && (
        <div
          className="chat-window"
          style={{ display: "flex", flexDirection: "column", background: "white" }}
        >
          {hasAccess ? (
            <iframe
              src={AI_URL}
              className="chat-iframe"
              title="Thulani AI Assistant"
              allow="microphone; camera; clipboard-write; autoplay"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div
              className="paywall-overlay"
              style={{
                padding: "24px",
                textAlign: "center",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                overflowY: "auto",
              }}
            >
              <h3 style={{ marginBottom: "12px", color: "#111827" }}>Thulani AI Premium</h3>
              <p style={{ color: "#6b7280", marginBottom: "24px", fontSize: "0.95rem" }}>
                Unlock our advanced AI assistant to boost your productivity.
              </p>

              <div
                className="pricing-options"
                style={{ width: "100%", display: "flex", flexDirection: "column", gap: "16px" }}
              >
                {/* Pay As You Go Option */}
                <div
                  className="price-card"
                  onClick={() => !loadingPayment && handlePurchase("ai_credits", 5.0)}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    cursor: loadingPayment ? "wait" : "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                  }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseOut={e => (e.currentTarget.style.borderColor = "#e5e7eb")}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Pay As You Go</h4>
                    <span style={{ fontWeight: 700, color: "#6366f1" }}>$5.00</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
                    50 Credits (Quick Help)
                  </p>
                </div>

                {/* Pro Bundle Option */}
                <div
                  className="price-card"
                  onClick={() => !loadingPayment && handlePurchase("ai_credits", 19.99)}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: "1px solid #e5e7eb",
                    cursor: loadingPayment ? "wait" : "pointer",
                    textAlign: "left",
                  }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = "#6366f1")}
                  onMouseOut={e => (e.currentTarget.style.borderColor = "#e5e7eb")}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Pro Bundle</h4>
                    <span style={{ fontWeight: 700, color: "#6366f1" }}>$19.99</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#6b7280" }}>
                    250 Credits (Best Value)
                  </p>
                </div>

                {/* Unlimited Monthly Option */}
                <div
                  className="price-card"
                  onClick={() => !loadingPayment && handlePurchase("ai_subscription", 29.99)}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: "2px solid #6366f1",
                    backgroundColor: "#eff6ff",
                    cursor: loadingPayment ? "wait" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#1e40af" }}>
                      Unlimited
                    </h4>
                    <span style={{ fontWeight: 700, color: "#1e40af" }}>$29.99</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.875rem", color: "#1e40af" }}>
                    Unlimited Access (30 Days)
                  </p>
                </div>
              </div>

              {loadingPayment && (
                <p style={{ marginTop: "16px", fontSize: "0.875rem", color: "#6366f1" }}>
                  Redirecting to PayPal...
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`chat-widget-button ${isOpen ? "is-open" : ""}`}
        aria-label={isOpen ? "Close Chat" : "Open Chat"}
      >
        {isOpen ? (
          // Close Icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          // Chat Icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        )}
      </button>
    </div>
  );
};

export default ChatWidget;
