// PayPalSubscriptionPanel.js
// PayPal subscription management component

import React, { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseClient";
import { parseJsonSafe } from "../utils/parseJsonSafe";
import { API_BASE_URL, API_ENDPOINTS } from "../config";
import toast from "react-hot-toast";
import "./PayPalSubscriptionPanel.css";

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

function normalizeSuggestedPlanId(planId) {
  if (!planId) return null;
  const normalized = String(planId).trim().toLowerCase();
  if (["starter", "free"].includes(normalized)) return "free";
  if (["basic", "premium", "creator"].includes(normalized)) return "premium";
  if (["pro", "studio"].includes(normalized)) return "pro";
  if (["enterprise", "team"].includes(normalized)) return "enterprise";
  return normalized;
}

const PAYPAL_SUBSCRIPTION_NAMESPACE = "paypalSubscriptionsSdk";
const PAYPAL_SUBSCRIPTION_SCRIPT_ID = "paypal-sdk-subscriptions";

const PayPalSubscriptionPanel = ({
  compact = false,
  highlightPlanId = null,
  onUpgradeSuccess,
  onClose,
  title,
  subtitle,
}) => {
  const [plans, setPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [paypalSdkError, setPaypalSdkError] = useState("");
  const [paypalConfig, setPaypalConfig] = useState(null);
  const [activatingPlanId, setActivatingPlanId] = useState(null);
  const [authUser, setAuthUser] = useState(() => auth.currentUser);
  const [authResolved, setAuthResolved] = useState(() => Boolean(auth.currentUser));
  const buttonContainerRefs = useRef({});
  const buttonInstancesRef = useRef({});
  const handledReturnRef = useRef(false);

  const normalizedHighlightPlanId = normalizeSuggestedPlanId(highlightPlanId);

  const getCurrentUser = () => auth.currentUser || authUser;

  const getAuthToken = async forceRefresh => {
    const currentUser = getCurrentUser();
    if (currentUser) {
      try {
        return await currentUser.getIdToken(Boolean(forceRefresh));
      } catch (_) {
        return null;
      }
    }

    if (typeof window !== "undefined" && window.__E2E_BYPASS === true && window.__E2E_TEST_TOKEN) {
      return window.__E2E_TEST_TOKEN;
    }

    return null;
  };

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
      const currentUser = getCurrentUser();
      const isE2E = typeof window !== "undefined" && window.__E2E_BYPASS === true;
      if (!currentUser && !isE2E && !authResolved) {
        return;
      }
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

      let token = await getAuthToken(false);
      const endpoint = resolveApi("/api/paypal-subscriptions/status");
      let parsed = null;

      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(endpoint, { headers });
        if (res.status === 401 && token) {
          token = await getAuthToken(true);
          const retryRes = await fetch(endpoint, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          parsed = await parseJsonSafe(retryRes);
        } else {
          parsed = await parseJsonSafe(res);
        }

        if (parsed && parsed.status === 404) {
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
        console.error("Failed to fetch PayPal subscription status:", e);
        parsed = { ok: false, status: "error", error: e.message };
      }

      if (parsed && parsed.ok && parsed.json) {
        setCurrentSubscription(parsed.json.subscription);
      } else {
        if (parsed && parsed.status === 401) {
          toast.error("Please sign in to view subscription status");
        }
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
      const token = await getAuthToken(true);
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

  const activateSubscription = async (subscriptionId, planId) => {
    if (!subscriptionId) return false;

    const currentUser = getCurrentUser();
    const isE2E = typeof window !== "undefined" && window.__E2E_BYPASS === true;
    if (!currentUser && !isE2E) {
      toast.error("Please sign in to activate your subscription");
      return false;
    }

    setProcessing(true);
    setActivatingPlanId(planId || null);
    try {
      const token = await getAuthToken(true);
      const res = await fetch(resolveApi("/api/paypal-subscriptions/activate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscriptionId, planId }),
      });
      const parsed = await parseJsonSafe(res);
      if (res.ok && parsed.ok) {
        await Promise.all([fetchCurrentSubscription(), fetchUsage()]);
        toast.success(parsed.json?.message || "Subscription activated");
        if (onUpgradeSuccess) {
          onUpgradeSuccess({ subscriptionId, planId: normalizeSuggestedPlanId(planId) });
        }
        return true;
      }

      console.error("Activation failed:", parsed);
      toast.error(
        (parsed && parsed.json && parsed.json.error) || "Failed to activate subscription"
      );
      return false;
    } catch (e) {
      console.error("Activation error:", e);
      toast.error("Failed to activate subscription");
      return false;
    } finally {
      setProcessing(false);
      setActivatingPlanId(null);
    }
  };

  const handleLegacySubscribe = async planId => {
    if (processing) return;

    const currentUser = getCurrentUser();
    const isE2E = typeof window !== "undefined" && window.__E2E_BYPASS === true;
    if (!currentUser && !isE2E) {
      toast.error("Please sign in to upgrade");
      return;
    }

    setProcessing(true);
    try {
      const token = await getAuthToken(true);
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const returnBase = compact
        ? `${window.location.origin}${window.location.pathname}${window.location.hash || ""}`
        : `${window.location.origin}/#/dashboard`;

      const querySeparator = returnBase.includes("?") ? "&" : "?";
      const res = await fetch(resolveApi("/api/paypal-subscriptions/create-subscription"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          planId,
          returnUrl: `${returnBase}${querySeparator}payment=success`,
          cancelUrl: `${returnBase}${querySeparator}payment=cancelled`,
        }),
      });

      const parsed = await parseJsonSafe(res);

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          toast.error("Please sign in to upgrade");
          return;
        }
        const errorMessage =
          (parsed && parsed.json && parsed.json.error) ||
          parsed?.error ||
          parsed?.textPreview ||
          "Failed to create subscription";
        toast.error(errorMessage);
        return;
      }

      const approvalUrl = parsed.json?.approvalUrl;
      if (approvalUrl) {
        toast.success("Opening PayPal...");
        window.open(approvalUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error("Could not obtain an approval link; please try again.");
      }
    } catch (error) {
      console.error("Error subscribing:", error);
      toast.error("Failed to process subscription");
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

    const token = await getAuthToken(true);
    if (!token) {
      toast.error("Please sign in to cancel your subscription");
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(resolveApi("/api/paypal-subscriptions/cancel"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setAuthUser(user);
      setAuthResolved(true);
    });

    fetchPlans();

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authResolved) return;

    fetchCurrentSubscription();
    fetchUsage();
  }, [authResolved, authUser?.uid]);

  useEffect(() => {
    if (!authResolved || handledReturnRef.current) return;

    try {
      const params = new URLSearchParams(window.location.search);
      if (window.location.hash && window.location.hash.includes("?")) {
        const hashQs = window.location.hash.split("?")[1];
        const hashParams = new URLSearchParams(hashQs);
        for (const [key, value] of hashParams.entries()) params.set(key, value);
      }
      const payment = params.get("payment");
      const subscriptionParam =
        params.get("subscriptionId") ||
        params.get("subscription_id") ||
        params.get("token") ||
        params.get("id");

      if (payment === "success" || payment === "cancelled") {
        handledReturnRef.current = true;
        if (payment === "success") {
          if (subscriptionParam) {
            activateSubscription(subscriptionParam, normalizedHighlightPlanId);
          } else {
            fetchCurrentSubscription();
          }
        } else {
          toast("Payment cancelled", { icon: "⚠️" });
        }

        const cleanedHash = window.location.hash ? window.location.hash.split("?")[0] : "";
        const newUrl = window.location.pathname + (cleanedHash || window.location.hash);
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch (_) {
      // ignore return parsing issues
    }
  }, [authResolved, normalizedHighlightPlanId]);

  useEffect(() => {
    let cancelled = false;

    const loadPayPalSdk = async () => {
      const paidPlans = plans.filter(plan => plan.id !== "free" && plan.paypalPlanId);
      if (paidPlans.length === 0) return;

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

        const clientId = data?.clientId || "";
        const currency = data?.currency || "USD";
        if (!clientId) {
          setPaypalSdkError("PayPal is not configured yet.");
          return;
        }

        setPaypalConfig({ clientId, currency });

        if (window[PAYPAL_SUBSCRIPTION_NAMESPACE]?.Buttons) {
          if (!cancelled) setPaypalLoaded(true);
          return;
        }

        const existing = document.getElementById(PAYPAL_SUBSCRIPTION_SCRIPT_ID);
        if (existing) {
          existing.addEventListener("load", () => {
            if (!cancelled) setPaypalLoaded(true);
          });
          existing.addEventListener("error", () => {
            if (!cancelled) setPaypalSdkError("Unable to load PayPal checkout.");
          });
          return;
        }

        const script = document.createElement("script");
        script.id = PAYPAL_SUBSCRIPTION_SCRIPT_ID;
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
          clientId
        )}&currency=${encodeURIComponent(currency)}&vault=true&intent=subscription&components=buttons`;
        script.async = true;
        script.setAttribute("data-namespace", PAYPAL_SUBSCRIPTION_NAMESPACE);
        script.onload = () => {
          if (!cancelled) setPaypalLoaded(true);
        };
        script.onerror = () => {
          if (!cancelled) setPaypalSdkError("Unable to load PayPal checkout.");
        };
        document.body.appendChild(script);
      } catch (error) {
        console.warn("Failed to load PayPal SDK:", error);
        if (!cancelled) setPaypalSdkError("Unable to load PayPal checkout.");
      }
    };

    loadPayPalSdk();

    return () => {
      cancelled = true;
    };
  }, [plans]);

  useEffect(() => {
    const paypalSdk = window[PAYPAL_SUBSCRIPTION_NAMESPACE];
    if (!paypalLoaded || !paypalSdk?.Buttons) return undefined;

    const cleanupInstances = [];
    const paidPlans = plans.filter(plan => plan.id !== "free" && plan.paypalPlanId);
    const normalizedCurrentPlan = normalizeSuggestedPlanId(currentSubscription?.planId);

    paidPlans.forEach(plan => {
      const normalizedPlanId = normalizeSuggestedPlanId(plan.id);
      const container = buttonContainerRefs.current[normalizedPlanId];
      if (!container) return;

      if (buttonInstancesRef.current[normalizedPlanId]?.close) {
        try {
          buttonInstancesRef.current[normalizedPlanId].close();
        } catch (_) {
          // ignore SDK cleanup failures
        }
      }

      container.innerHTML = "";

      if (normalizedCurrentPlan === normalizedPlanId || processing || !authUser) {
        return;
      }

      const buttons = paypalSdk.Buttons({
        style: {
          layout: "vertical",
          shape: "rect",
          color: "gold",
          label: "subscribe",
        },
        createSubscription: (_, actions) => {
          const currentUser = getCurrentUser();
          if (!currentUser) {
            toast.error("Please sign in to upgrade");
            throw new Error("not_signed_in");
          }
          return actions.subscription.create({
            plan_id: plan.paypalPlanId,
            custom_id: currentUser.uid,
            application_context: {
              shipping_preference: "NO_SHIPPING",
              user_action: "SUBSCRIBE_NOW",
            },
          });
        },
        onApprove: async data => {
          const subscriptionId = data?.subscriptionID || data?.subscriptionId;
          const activated = await activateSubscription(subscriptionId, normalizedPlanId);
          if (activated && compact && onClose) {
            onClose();
          }
        },
        onCancel: () => {
          toast("PayPal checkout cancelled", { icon: "⚠️" });
        },
        onError: err => {
          console.error("PayPal subscription buttons error", err);
          toast.error("PayPal checkout failed. You can use the fallback link instead.");
        },
      });

      buttonInstancesRef.current[normalizedPlanId] = buttons;
      cleanupInstances.push(buttons);
      buttons.render(container).catch(err => {
        console.error("Failed to render PayPal subscription buttons", err);
      });
    });

    return () => {
      cleanupInstances.forEach(instance => {
        if (instance?.close) {
          try {
            instance.close();
          } catch (_) {
            // ignore SDK cleanup failures
          }
        }
      });
    };
  }, [authUser, compact, currentSubscription?.planId, onClose, paypalLoaded, plans, processing]);

  const getFeatureIcon = feature => {
    const icons = {
      uploads: "📤",
      communityPosts: "📝",
      aiClips: "🤖",
      analytics: "📊",
      support: "🎧",
      watermark: "⭐",
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

    return (
      labels[key] ||
      key
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^./, str => str.toUpperCase())
    );
  };

  const renderFeatureValue = (key, value) => {
    if (typeof value === "boolean") return value ? "Included" : "Not included";
    if (value === "unlimited") return "Unlimited";
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
          <span className="usage-text">Unlimited</span>
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
          {used} / {limit} used
        </span>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading subscription details...</div>;
  }

  const effectiveTitle =
    title || (compact ? "Upgrade to keep publishing" : "Plans For Cross-Platform Publishing");
  const effectiveSubtitle =
    subtitle ||
    (compact
      ? "Finish the upgrade right here, then we will retry your blocked publish automatically."
      : "Paid plans are billed as monthly PayPal subscriptions. Choose a plan, subscribe inside the app, and keep your workflow moving.");

  return (
    <div className={`paypal-subscription-panel${compact ? " compact" : ""}`}>
      <div className="paypal-subscription-panel-header">
        <div>
          <h2>{effectiveTitle}</h2>
          <p className="paypal-subscription-panel-subtitle">{effectiveSubtitle}</p>
        </div>
        {compact && onClose && (
          <button type="button" className="subscription-panel-close" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      {paypalSdkError && (
        <div className="paypal-sdk-notice warning">
          {paypalSdkError} You can still use the fallback checkout link below.
        </div>
      )}

      {!compact && (
        <div className="paypal-sdk-notice neutral">
          {paypalConfig?.currency ? `Billing currency: ${paypalConfig.currency}. ` : ""}
          Subscription activation happens immediately after PayPal approval.
        </div>
      )}

      {!compact && currentSubscription && (
        <div className="current-subscription-card">
          <div className="subscription-header">
            <div>
              <h3>{currentSubscription.planName} Plan</h3>
              <span className={`status-badge ${currentSubscription.status}`}>
                {currentSubscription.status === "active"
                  ? "Active"
                  : currentSubscription.status === "cancelled"
                    ? "Cancelled"
                    : currentSubscription.status}
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

      {!compact && usage && (
        <div className="usage-section">
          <h3>Usage This Period</h3>
          <p className="period-info">
            Period: {new Date(usage.periodStart).toLocaleDateString()} -
            {usage.periodEnd ? new Date(usage.periodEnd).toLocaleDateString() : "Ongoing"}
          </p>

          <div className="usage-grid">
            <div className="usage-item">
              <label>Uploads</label>
              {renderUsageBar(usage.uploads.used, usage.uploads.limit, usage.uploads.unlimited)}
            </div>

            <div className="usage-item">
              <label>Mission Opportunities</label>
              {renderUsageBar(
                usage.viralBoosts.used,
                usage.viralBoosts.limit,
                usage.viralBoosts.unlimited
              )}
            </div>
          </div>
        </div>
      )}

      <div className="plans-section">
        <h3>{compact ? "Choose your next plan" : "Available Plans"}</h3>
        <div className="plans-grid">
          {plans.map(plan => {
            const normalizedPlanId = normalizeSuggestedPlanId(plan.id);
            const isCurrent =
              normalizedPlanId === normalizeSuggestedPlanId(currentSubscription?.planId);
            const isSuggested =
              normalizedHighlightPlanId && normalizedPlanId === normalizedHighlightPlanId;
            const canUseEmbeddedCheckout =
              paypalLoaded && Boolean(plan.paypalPlanId) && plan.id !== "free" && auth.currentUser;

            return (
              <div
                key={plan.id}
                className={`plan-card ${isCurrent ? "current-plan" : ""} ${plan.id === "pro" ? "recommended" : ""} ${isSuggested ? "suggested-plan" : ""}`}
              >
                {plan.id === "pro" && <span className="recommended-badge">Most Popular</span>}
                {isSuggested && <span className="suggested-badge">Best fit for this publish</span>}

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
                  <div className="plan-checkout-zone">
                    {canUseEmbeddedCheckout ? (
                      <>
                        <div
                          className={`paypal-subscription-button-shell ${activatingPlanId === normalizedPlanId ? "is-activating" : ""}`}
                          ref={node => {
                            buttonContainerRefs.current[normalizedPlanId] = node;
                          }}
                        />
                        <button
                          className="subscribe-btn secondary"
                          onClick={() => handleLegacySubscribe(normalizedPlanId)}
                          disabled={processing}
                        >
                          Open checkout in PayPal instead
                        </button>
                      </>
                    ) : (
                      <button
                        className="subscribe-btn"
                        onClick={() => handleLegacySubscribe(normalizedPlanId)}
                        disabled={processing}
                      >
                        {processing ? "Processing..." : `Upgrade to ${plan.name}`}
                      </button>
                    )}

                    {!auth.currentUser && (
                      <p className="checkout-helper-text">Sign in first to use in-app checkout.</p>
                    )}
                  </div>
                )}

                {isCurrent && <div className="current-plan-badge">Your Current Plan</div>}

                {plan.id === "free" && currentSubscription?.planId !== "free" && (
                  <div className="downgrade-note">
                    Cancel your subscription to return to the free tier.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {!compact && (
        <>
          <div className="secure-payment-badge">
            <img
              src="https://www.paypalobjects.com/webstatic/mktg/logo/PP_AcceptanceMarkTray_150x40.png"
              alt="PayPal"
            />
            <p>Secure subscription billing powered by PayPal</p>
          </div>

          <div className="billing-legal-footer">
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
              future renewals. Cancellations take effect at the end of the current billing period.
              For billing support or refund inquiries, please contact{" "}
              <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default PayPalSubscriptionPanel;
