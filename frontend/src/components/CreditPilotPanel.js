import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseClient";
import {
  creditPilotEnabled,
  pilotApi,
  refreshCreditOperations,
  savedCreditOperations,
} from "../utils/creditPilot";
import "./CreditPilotPanel.css";

const labels = {
  "studio.render": "Studio export",
  "clips.analyze": "Find Viral Clips analysis",
  "clips.render": "Clip export",
  "publisher.publish": "Publisher release",
  "queue.dispatch": "Queue delivery",
};
export default function CreditPilotPanel() {
  const [user, setUser] = useState(null),
    [account, setAccount] = useState(null);
  const [pending, setPending] = useState(null),
    [error, setError] = useState("");
  const [activity, setActivity] = useState([]);
  useEffect(() => {
    if (!creditPilotEnabled()) return undefined;
    let alive = true,
      refreshing = false;
    const update = async () => {
      if (!auth.currentUser || refreshing) return;
      refreshing = true;
      try {
        const balance = await refreshCreditOperations();
        if (alive) {
          setAccount(balance);
          setError("");
          setActivity(savedCreditOperations(auth.currentUser.uid));
        }
      } catch (problem) {
        if (alive) setError(problem.message);
      } finally {
        refreshing = false;
      }
    };
    const unsubscribe = onAuthStateChanged(auth, next => {
      setUser(next);
      setPending(previous => {
        previous?.resolve(false);
        return null;
      });
      if (next) void update();
      else {
        setAccount(null);
        setActivity([]);
      }
    });
    const consent = event =>
      setPending(previous => {
        previous?.resolve(false);
        return event.detail;
      });
    const interval = setInterval(update, 3000);
    window.addEventListener("autopromote-credit-consent", consent);
    window.addEventListener("autopromote-credit-refresh", update);
    return () => {
      alive = false;
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener("autopromote-credit-consent", consent);
      window.removeEventListener("autopromote-credit-refresh", update);
    };
  }, []);
  if (!creditPilotEnabled() || !user) return null;
  const decide = accepted => {
    pending.resolve(accepted);
    setPending(null);
  };
  return (
    <aside className="credit-pilot" aria-label="Shared credits">
      <small>LOCAL DEMO · delivery simulated · no ads/cloud</small>
      <details>
        <summary>
          <strong data-testid="shared-credit-balance">{account?.balance ?? "…"}</strong> available
          credits · {account?.reserved ?? 0} held
        </summary>
        <p>
          Isolated staging. Local CPU execution; platform delivery is simulated. Ads and paid
          workloads are disabled.
        </p>
        <p>
          {account?.monthlyAllowance} test credits per month · renewal{" "}
          {account?.renewsAt?.slice(0, 10)} (UTC).
        </p>
        <p>Editing, saving and reopening your work stay available at zero credits.</p>
        <button type="button" onClick={() => pilotApi("/account").then(setAccount)}>
          Refresh balance
        </button>
        <ul aria-label="Credit operations">
          {activity.map(item => (
            <li key={item.requestId}>
              {labels[item.operation]}: <span>{item.state}</span>
            </li>
          ))}
        </ul>
        {error && <p role="status">{error}</p>}
      </details>
      {pending && (
        <div className="credit-consent-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="credit-consent-title">
            <h2 id="credit-consent-title">{labels[pending.operation]}</h2>
            <p>
              Reserve <strong>{pending.quote.credits} test credits</strong> for this operation?
            </p>
            <p>
              {pending.quote.balance} available. Credits settle after a verified worker outcome. A
              timeout keeps the hold until recovery confirms what happened.
            </p>
            <p>These are staging test prices, not approved commercial rates.</p>
            <button type="button" onClick={() => decide(true)}>
              Approve {pending.quote.credits} credits
            </button>
            <button type="button" onClick={() => decide(false)}>
              Keep editing
            </button>
          </section>
        </div>
      )}
    </aside>
  );
}
