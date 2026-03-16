// PayPalSubscriptionPanel.js
// PayPal subscription management component

import React, { useState, useEffect } from "react";
import { auth } from "../firebaseClient";
import { parseJsonSafe } from "../utils/parseJsonSafe";
import { API_BASE_URL } from "../config";
import toast from "react-hot-toast";
import "./PayPalSubscriptionPanel.css";

// Return a resolved API URL that prefers same-origin during local development
function resolveApi(path) {
  try {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const isLocal =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname) || hostname.endsWith(".local");
    const base = !isLocal && API_BASE_URL ? API_BASE_URL : "";
    return `${base || ""}${path}`;
  } catch (e) {
    return `${API_BASE_URL || ""}${path}`;
  }
}

const PayPalSubscriptionPanel = () => {
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchCurrentSubscription();
    fetchUsage();

    // Detect return from PayPal (e.g., /dashboard?payment=success or ?payment=cancelled)
    try {
      // Collect params from both search and hash (hash may contain query when using hash-routing)
      const params = new URLSearchParams(window.location.search);
      if (window.location.hash && window.location.hash.includes("?")) {
        const hashQs = window.location.hash.split("?")[1];
        const hashParams = new URLSearchParams(hashQs);
        for (const [k, v] of hashParams.entries()) params.set(k, v);
      }
      const payment = params.get("payment");
      const subscriptionParam =
        params.get("subscriptionId") ||
        params.get("subscription_id") ||
        params.get("token") ||
        params.get("id");
      if (payment === "success" || payment === "cancelled") {
        if (payment === "success") {
          if (subscriptionParam) {
            activateSubscription(subscriptionParam);
          } else {
            fetchCurrentSubscription();
          }
        } else if (payment === "cancelled") {
          toast("Payment cancelled", { icon: "⚠️" });
        }
        // Remove query params to clean URL after handling
        const cleanedHash = window.location.hash ? window.location.hash.split("?")[0] : "";
        const newUrl = window.location.pathname + (cleanedHash || window.location.hash);
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchPlans = async () => {
    try {
      const url = resolveApi("/api/paypal-subscriptions/plans");
      const res = await fetch(url);
      const parsed = await parseJsonSafe(res);
      if (parsed.ok && parsed.json && Array.isArray(parsed.json.plans)) {
        setPlans(parsed.json.plans || []);
      }
    } catch (error) {
      console.error("Error fetching plans:", error);
    }
  };

  const fetchCurrentSubscription = async () => {
    try {
      const currentUser = auth.currentUser;
      const isE2E = typeof window !== "undefined" && window.__E2E_BYPASS === true;
      // If no signed-in user, show free plan directly
      if (!currentUser && !isE2E) {
        setCurrentSubscription({
          planId: "free",
          planName: "Free",
          status: "active",
          features: {},
        });
        setLoading(false);
        return;
      }

      let token = null;
      try {
        token = await currentUser.getIdToken();
      } catch (e) {
        token = null;
      }

      const endpoint = resolveApi("/api/paypal-subscriptions/status");
      let parsed = null;
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(endpoint, { headers });
        // If 401, try forced token refresh once
        if (res.status === 401 && token) {
          try {
            token = await currentUser.getIdToken(true);
            const retryRes = await fetch(endpoint, {
              headers: { Authorization: `Bearer ${token}` },
            });
            parsed = await parseJsonSafe(retryRes);
          } catch (e) {
            parsed = { ok: false, status: "error", error: e.message };
          }
        } else {
          parsed = await parseJsonSafe(res);
        }

        // If endpoint not found (404), fall back to free plan silently
        if (parsed && parsed.status === 404) {
          console.warn(
            "PayPal subscription status endpoint returned 404; falling back to free plan"
          );
          setCurrentSubscription({
            planId: "free",
            planName: "Free",
            status: "active",
            features: {},
          });
          setLoading(false);
          return;
        }
      } catch (e) {
        // Network or other fetch error: if we're on localhost, try same-origin fallback
        const hostname = typeof window !== "undefined" ? window.location.hostname : "";
        const isLocal =
          /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname) || hostname.endsWith(".local");
        if (isLocal) {
          try {
            const fallbackRes = await fetch("/api/paypal-subscriptions/status", {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            parsed = await parseJsonSafe(fallbackRes);
          } catch (fallbackErr) {
            console.error("Failed to fetch PayPal subscription status (fallback):", fallbackErr);
            parsed = { ok: false, status: "error", error: fallbackErr.message };
          }
        } else {
          console.error("Failed to fetch PayPal subscription status:", e);
          parsed = { ok: false, status: "error", error: e.message };
        }
      }

      if (parsed && parsed.ok && parsed.json) {
        setCurrentSubscription(parsed.json.subscription);
      } else {
        if (parsed && parsed.status === 401) {
          // Unauthorized after refresh: prompt user
          toast.error("Please sign in to view subscription status");
        } else if (parsed && parsed.status === 404) {
          // Already handled above, but be defensive
          console.warn("PayPal subscription status not available (404)");
        } else if (parsed && parsed.status === "error") {
          // Non-fatal network/config issue
          console.warn(
            "PayPal subscription fetch error:",
            parsed.error || parsed.textPreview || parsed.status
          );
        }

        // Always fallback to free plan
        setCurrentSubscription({
          planId: "free",
          planName: "Free",
          status: "active",
          features: {},
        });
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      setLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setUsage(null);
        return;
      }
      let token;
      try {
        token = await currentUser.getIdToken(true);
      } catch (e) {
        token = null;
      }
      if (!token) {
        setUsage(null);
        return;
      }
      const usageUrl = resolveApi("/api/paypal-subscriptions/usage");
      const res = await fetch(usageUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsed = await parseJsonSafe(res);
      if (parsed.ok && parsed.json) {
        setUsage(parsed.json.usage);
      }
    } catch (error) {
      console.error("Error fetching usage:", error);
    }
  };

  const handleSubscribe = async planId => {
    if (processing) return;

    const currentUser = auth.currentUser;
    const isE2E = typeof window !== "undefined" && window.__E2E_BYPASS === true;
    if (!currentUser && !isE2E) {
      toast.error("Please sign in to upgrade");
      return;
    }

    setProcessing(true);
    try {
      let token = null;
      try {
        if (currentUser) token = await currentUser.getIdToken(true);
      } catch (_) {
        token = null;
      }
      if (!token && isE2E && typeof window !== "undefined") token = window.__E2E_TEST_TOKEN || null;
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/create-subscription`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          planId,
          returnUrl: `${window.location.origin}/#/dashboard?payment=success`,
          cancelUrl: `${window.location.origin}/#/dashboard?payment=cancelled`,
        }),
      });

      const parsed = await parseJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          toast.error("Please sign in to upgrade");
          return;
        }
        console.error("Failed to create subscription:", parsed);
        const errorMessage =
          (parsed && parsed.json && parsed.json.error) ||
          parsed?.error ||
          parsed?.textPreview ||
          "Failed to create subscription";
        if (errorMessage && String(errorMessage).toLowerCase().includes("paypal sdk")) {
          toast.error(
            "Payment service unavailable; the PayPal SDK is not available on the server. Please contact support."
          );
        } else {
          toast.error(errorMessage);
        }
        return;
      }

      const data = parsed.json || null;
      if (data && data.approvalUrl) {
        const approvalUrl = data.approvalUrl;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
        toast.success("Opening PayPal...");
        if (isMobile) {
          window.location.href = approvalUrl;
        } else {
          window.open(approvalUrl, "_blank", "noopener,noreferrer");
        }
      } else {
        console.warn("Create subscription returned no approval URL:", parsed);
        toast.error("Could not obtain an approval link; please try again or contact support");
      }
    } catch (error) {
      console.error("Error subscribing:", error);
      toast.error("Failed to process subscription");
    } finally {
      setProcessing(false);
    }
  };

  const activateSubscription = async subscriptionId => {
    if (!subscriptionId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("Please sign in to activate your subscription");
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken(true);
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ subscriptionId }),
      });
      const parsed = await parseJsonSafe(res);
      if (res.ok && parsed.ok) {
        toast.success(parsed.json?.message || "Subscription activated");
        fetchCurrentSubscription();
      } else {
        console.error("Activation failed:", parsed);
        toast.error(
          (parsed && parsed.json && parsed.json.error) || "Failed to activate subscription"
        );
      }
    } catch (e) {
      console.error("Activation error:", e);
      toast.error("Failed to activate subscription");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (
      !window.confirm(
        "Are you sure you want to cancel your subscription? You'll retain access until the end of your billing period."
      )
    ) {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error("Please sign in to cancel your subscription");
      return;
    }

    setProcessing(true);
    try {
      const token = await currentUser.getIdToken(true);
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${API_BASE_URL}/api/paypal-subscriptions/cancel`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: "User requested cancellation" }),
      });

      if (res.ok) {
        toast.success("Subscription cancelled successfully");
        fetchCurrentSubscription();
      } else {
        const parsed = await parseJsonSafe(res);
        toast.error(
          (parsed && parsed.json && parsed.json.error) || "Failed to cancel subscription"
        );
      }
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      toast.error("Failed to cancel subscription");
    } finally {
      setProcessing(false);
    }
  };

  const getFeatureIcon = feature => {
    const icons = {
      uploads: "📤",
      communityPosts: "📝",
      aiClips: "🤖",
      analytics: "📊",
      support: "🎧",
      watermark: "�",
      viralBoost: "🚀",
      priorityModeration: "⚡",
      creatorTipping: "💰",
      sponsoredPosts: "📢",
      apiAccess: "🔌",
      teamSeats: "👥",
      whiteLabel: "🎨",
      wolfHuntTasks: "🐺",
    };
    return icons[feature] || "✨";
  };

  const getFeatureLabel = key => {
    const labels = {
      uploads: "Monthly uploads",
      platformLimit: "Connected platforms",
      analytics: "Analytics depth",
      support: "Support",
      communityPosts: "Community posts",
      aiClips: "AI clip tools",
      watermark: "Watermark removal",
      viralBoost: "Priority promotion tools",
      priorityModeration: "Priority review",
      creatorTipping: "Creator tipping",
      sponsoredPosts: "Sponsored posts",
      apiAccess: "API access",
      teamSeats: "Team seats",
      whiteLabel: "White-label",
      wolfHuntTasks: "Mission opportunities",
    };
    return labels[key] || key.replace(/([A-Z])/g, " $1").trim().replace(/^./, str => str.toUpperCase());
  };

  const renderFeatureValue = (key, value) => {
    if (typeof value === "boolean") {
      return value ? "✅ Included" : "❌ Not included";
    }
    if (value === "unlimited") {
      return "♾️ Unlimited";
    }
    if (key === "platformLimit" && typeof value === "number") {
      return `${value} platform${value === 1 ? "" : "s"}`;
    }
    if (key === "wolfHuntTasks" && typeof value === "number") {
      return `${value} mission actions`;
    }
    if (typeof value === "number") {
      return `${value} ${key === "teamSeats" ? "seats" : "per month"}`;
    }
    return value;
  };

  const renderUsageBar = (used, limit, unlimited) => {
    if (unlimited) {
      return (
        <div className="usage-bar">
          <div className="usage-bar-fill unlimited" style={{ width: "100%" }} />
          <span className="usage-text">♾️ Unlimited</span>
        </div>
      );
    }

    const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    const isOverLimit = used > limit;

    return (
      <div className="usage-bar">
        <div
          className={`usage-bar-fill ${isOverLimit ? "over-limit" : ""}`}
          style={{ width: `${percentage}%` }}
        />
        <span className="usage-text">
          {used} / {limit} used {isOverLimit && "⚠️"}
        </span>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading subscription details...</div>;
  }

  // current plan resolved but not currently used in UI

  return (
    <div className="paypal-subscription-panel">
      <h2>💳 Plans For Cross-Platform Publishing</h2>
      <p style={{ marginTop: "0.5rem", color: "#4b5563", maxWidth: 760 }}>
        Paid plans are billed as monthly PayPal subscriptions. You are paying for more publishing
        throughput, more connected destinations, deeper workflow visibility, and better support as
        your operation grows.
      </p>
      <div
        style={{
          marginTop: "1rem",
          marginBottom: "1.5rem",
          padding: "14px 16px",
          borderRadius: 14,
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          color: "#374151",
        }}
      >
        <strong>When billing starts:</strong> you choose a paid plan here, approve the PayPal
        checkout, and the subscription is activated on return. Cancellation keeps access active
        until the end of the current billing period.
      </div>

      {/* Current Subscription Status */}
      {currentSubscription && (
        <div className="current-subscription-card">
          <div className="subscription-header">
            <div>
              <h3>{currentSubscription.planName} Plan</h3>
              <span className={`status-badge ${currentSubscription.status}`}>
                {currentSubscription.status === "active"
                  ? "✅ Active"
                  : currentSubscription.status === "cancelled"
                    ? "⚠️ Cancelled"
                    : "⏸️ " + currentSubscription.status}
              </span>
            </div>
            {currentSubscription.amount > 0 && (
              <div className="subscription-price">
                <span className="price">${currentSubscription.amount}</span>
                <span className="period">/month</span>
              </div>
            )}
          </div>

          {currentSubscription.nextBillingDate && currentSubscription.status === "active" && (
            <p className="billing-date">
              Next billing: {new Date(currentSubscription.nextBillingDate).toLocaleDateString()}
            </p>
          )}

          {currentSubscription.expiresAt && currentSubscription.status === "cancelled" && (
            <p className="expiry-date">
              Access expires: {new Date(currentSubscription.expiresAt).toLocaleDateString()}
            </p>
          )}

          {currentSubscription.status === "active" && currentSubscription.planId !== "free" && (
            <button className="cancel-btn" onClick={handleCancelSubscription} disabled={processing}>
              Cancel Subscription
            </button>
          )}
        </div>
      )}

      {/* Usage Stats */}
      {usage && (
        <div className="usage-section">
          <h3>📊 Usage This Period</h3>
          <p className="period-info">
            Period: {new Date(usage.periodStart).toLocaleDateString()} -
            {usage.periodEnd ? new Date(usage.periodEnd).toLocaleDateString() : "Ongoing"}
          </p>

          <div className="usage-grid">
            <div className="usage-item">
              <label>📤 Uploads</label>
              {renderUsageBar(usage.uploads.used, usage.uploads.limit, usage.uploads.unlimited)}
            </div>

            <div className="usage-item">
              <label> Mission Opportunities</label>
              {renderUsageBar(
                usage.viralBoosts.used,
                usage.viralBoosts.limit,
                usage.viralBoosts.unlimited
              )}
            </div>
          </div>
        </div>
      )}

      {/* Available Plans */}
      <div className="plans-section">
        <h3>💎 Available Plans</h3>
        <div className="plans-grid">
          {plans.map(plan => {
            const isCurrent = plan.id === currentSubscription?.planId;

            return (
              <div
                key={plan.id}
                className={`plan-card ${isCurrent ? "current-plan" : ""} ${plan.id === "pro" ? "recommended" : ""}`}
              >
                {plan.id === "pro" && <span className="recommended-badge">⭐ Most Popular</span>}

                <h4>{plan.name}</h4>

                <div className="plan-price">
                  {plan.price === 0 ? (
                    <span className="free-label">Start Free</span>
                  ) : (
                    <>
                      <span className="price">${plan.price}</span>
                      <span className="period">/month</span>
                    </>
                  )}
                </div>

                <div className="plan-features">
                  {Object.entries(plan.features || {}).map(([key, value]) => (
                    <div key={key} className="feature-item">
                      <span className="feature-icon">{getFeatureIcon(key)}</span>
                      <span className="feature-name">{getFeatureLabel(key)}:</span>
                      <span className="feature-value">{renderFeatureValue(key, value)}</span>
                    </div>
                  ))}
                </div>

                {!isCurrent && plan.id !== "free" && (
                  <button
                    className="subscribe-btn"
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={processing}
                  >
                    {processing ? "Processing..." : `Upgrade to ${plan.name}`}
                  </button>
                )}

                {isCurrent && <div className="current-plan-badge">✅ Your Current Plan</div>}

                {plan.id === "free" && currentSubscription?.planId !== "free" && (
                  <div className="downgrade-note">
                    Cancel your subscription to return to free tier
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Secure Payment Badge */}
      <div
        className="secure-payment-badge"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img
            src="https://www.paypalobjects.com/webstatic/mktg/logo/PP_AcceptanceMarkTray_150x40.png"
            alt="PayPal"
            style={{ height: "40px" }}
          />
        </div>
        <p style={{ marginTop: "5px", color: "#666", fontSize: "0.9rem" }}>
          Secure subscription billing powered by PayPal
        </p>
      </div>

      <div
        className="billing-legal-footer"
        style={{
          marginTop: "2rem",
          borderTop: "1px solid #e5e7eb",
          paddingTop: "1rem",
          fontSize: "0.8rem",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        <p>
          By subscribing, you agree to our{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          . Subscriptions auto-renew monthly through PayPal. You may cancel at any time to stop
          future renewals. Cancellations take effect at the end of the current billing period. For
          billing support or refund inquiries, please contact{" "}
          <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>.
        </p>
      </div>
    </div>
  );
};

export default PayPalSubscriptionPanel;
