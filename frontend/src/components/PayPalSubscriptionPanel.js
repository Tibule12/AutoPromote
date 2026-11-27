import React, { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseClient";
import { API_BASE_URL } from "../config";
import ProcessingUsage from "./ProcessingUsage";
import { startVisiblePoller } from "../utils/visiblePoller";
import offers from "../config/subscriptionOffers.json";
import { paypalSubscriptionReturn, clearPaypalSubscriptionReturn } from '../utils/paypalReturn';
import "./PayPalSubscriptionPanel.css";
import "./BillingContrast.css";
const api = path => `${API_BASE_URL || ""}${path}`;
export default function PayPalSubscriptionPanel({
  compact = false,
  onClose,
  closeLabel,
  onUpgradeSuccess,
}) {
  const [plans, setPlans] = useState(offers);
  const [user, setUser] = useState(auth.currentUser);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [balances, setBalances] = useState({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [verificationPending, setVerificationPending] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const verification = useRef(null);
  const usageOwner = useRef(null);
  const upgradeCallback = useRef(onUpgradeSuccess);
  useEffect(() => { upgradeCallback.current = onUpgradeSuccess; }, [onUpgradeSuccess]);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    let live = true;
    fetch(api("/api/paypal-subscriptions/plans"))
      .then(r => {
        if (!r.ok) throw Error("Pricing unavailable");
        return r.json();
      })
      .then(data => {
        if (live && data.plans?.length === 2) setPlans(data.plans);
      })
      .catch(() => {
        if (live) setNotice("Showing proposed allowances. Live billing is currently unavailable.");
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (usageOwner.current !== user?.uid) {
      usageOwner.current = user?.uid;
      setSubscription(null);
      setUsage(null);
      setBalances({});
    }
    if (!user) {
      setSubscription(null);
      setUsage(null);
      setBalances({});
      return undefined;
    }
    const load = async signal => {
      const headers = { Authorization: `Bearer ${await user.getIdToken()}` };
      if (signal.aborted) return;
      const [status, processing] = await Promise.all([
        fetch(api("/api/paypal-subscriptions/status"), { headers, signal }),
        fetch(api("/api/usage/processing"), { headers, signal }),
      ]);
      if (status.ok) {
        const data = await status.json();
        if (live && !signal.aborted) setSubscription(data.subscription);
      }
      if (processing.ok) {
        const data = await processing.json();
        if (live && !signal.aborted) {
          setUsage(data.processing);
          setBalances(data.balances || {});
        }
      } else if (live && !signal.aborted)
        setNotice(
          "Processing usage is temporarily unavailable. Your saved projects remain available."
        );
    };
    const stop = startVisiblePoller(signal => load(signal).catch(error => {
      if (live && error.name !== "AbortError") setNotice("Usage could not be loaded. Try again shortly.");
    }), 60000);
    return () => {
      live = false;
      stop();
    };
  }, [user, refreshRevision]);
  const subscribe = async plan => {
    if (!user || busy || !plan.purchaseEnabled) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(api("/api/paypal-subscriptions/create-subscription"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken(true)}`,
        },
        body: JSON.stringify({
          planId: "plus",
          returnUrl: `${window.location.origin}/pricing`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || data.error || "Checkout unavailable");
      const target = new URL(data.approvalUrl);
      if (
        target.protocol !== "https:" ||
        !["www.paypal.com", "www.sandbox.paypal.com"].includes(target.hostname)
      )
        throw Error("Invalid checkout destination");
      window.location.assign(target.href);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const subscriptionId = paypalSubscriptionReturn(window.location);
    if (!user || !subscriptionId) return;
    let live = true;
    const key = `${user.uid}:${subscriptionId}:${verificationAttempt}`;
    setCheckingPayment(true);
    setVerificationPending(true);
    if (verification.current?.key !== key) verification.current = { key, promise: (async () => {
      const response = await fetch(api("/api/paypal-subscriptions/activate"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken(true)}`,
        },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = await response.json();
      if (!response.ok) throw Error("PayPal has not confirmed a paid subscription for this account yet. Check payment status again shortly.");
      return data;
    })() };
    verification.current.promise.then(data => {
      if (live) {
        setSubscription(data.subscription);
        setNotice("Payment verified. Your increased allowance is ready.");
        setVerificationPending(false);
        setRefreshRevision(value => value + 1);
        window.history.replaceState(window.history.state, "", clearPaypalSubscriptionReturn(window.location.href));
        upgradeCallback.current?.();
      }
    }).catch(error => {
      if (live) setNotice(error.message);
    }).finally(() => {
      if (live) setCheckingPayment(false);
    });
    return () => {
      live = false;
    };
  }, [user, verificationAttempt]);
  const cancel = async () => {
    if (
      !user ||
      !window.confirm(
        "Cancel future subscription renewals? Your existing payment history and credits will be preserved."
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(api("/api/paypal-subscriptions/cancel"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken(true)}`,
        },
        body: JSON.stringify({ reason: "User requested cancellation" }),
      });
      if (!response.ok) throw Error("Cancellation could not be confirmed.");
      setNotice(
        "Future renewal cancelled. Your subscription remains subject to its existing paid period."
      );
      setRefreshRevision(value => value + 1);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`paypal-subscription-panel${compact ? " compact" : ""}`}>
      <div className="paypal-subscription-panel-header">
        <div>
          <h2>Create for free. Upgrade when you need more.</h2>
          <p>Same creativity. Same tools. More usage when you upgrade.</p>
        </div>
        {onClose && (
          <button className="subscription-panel-close" onClick={onClose}>
            {closeLabel || "Close"}
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {verificationPending && <button type="button" disabled={checkingPayment} onClick={() => setVerificationAttempt(value => value + 1)}>
        {checkingPayment ? "Checking payment…" : "Check payment status"}
      </button>}
      <div className="plans-grid free-first-plans">
        {plans
          .filter(p => ["free", "plus"].includes(p.id))
          .map(plan => (
            <article
              key={plan.id}
              className={`plan-card ${plan.id === "plus" ? "recommended" : ""}`}
              data-plan-id={plan.id}
            >
              <h3>{plan.name}</h3>
              <p className="plan-price">
                ${Number(plan.price).toFixed(2)}{" "}
                <span>
                  USD / month{plan.provisional && plan.id === "plus" ? " · proposed" : ""}
                </span>
              </p>
              <ul>
                <li>All existing production-ready creative tools</li>
                <li>All six publishing destinations</li>
                <li>No unnecessary watermarks</li>
                <li>Supported local editing stays available after processing limits</li>
                <li>
                  {plan.processing.tokens} processing tokens every{" "}
                  {plan.processing.resetHours === 144
                    ? "six days"
                    : `${plan.processing.resetHours} hours`}
                </li>
                <li>
                  {plan.processing.rolling30DayTokens.toLocaleString()} maximum tokens per rolling
                  30 days
                </li>
              </ul>
              {plan.id === "free" ? (
                <p>
                  No subscription required. <a href="/signup">Start creating</a>
                </p>
              ) : (
                <button
                  className="subscribe-btn"
                  disabled={busy || !user || !plan.purchaseEnabled}
                  onClick={() => subscribe(plan)}
                >
                  {plan.purchaseEnabled ? "Choose Plus" : plan.purchaseUnavailableReason === 'FUNDED_CAPACITY_UNAVAILABLE'
                    ? 'Plus capacity is currently full' : plan.provisional ? "Proposed · financial validation pending" : 'Checkout verification in progress'}
                </button>
              )}
            </article>
          ))}
      </div>
      <p>
        {plans.some(plan=>plan.provisional) && 'USD subscription pricing and numerical allowances are provisional until financial validation. '}
        Publishing remains subject to each platform’s requirements.
      </p>
      {user && (
        <ProcessingUsage
          usage={usage}
          purchasedCredits={balances.purchasedCredits}
          promotionalCredits={balances.promotionalCredits}
        />
      )}
      {subscription?.planId && !["free", "plus"].includes(subscription.planId) && (
        <p>
          Your existing subscription agreement and resource entitlements are retained. No automatic
          plan conversion or cancellation.
        </p>
      )}
      {subscription?.planId && subscription.planId !== "free" && (
        <button className="subscribe-btn secondary" disabled={busy} onClick={cancel}>
          Manage cancellation
        </button>
      )}
    </div>
  );
}
