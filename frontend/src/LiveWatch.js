import React, { useEffect, useState, useRef } from "react";
import "./LiveWatch.css";
import FloatingActions from "./components/FloatingActions";
import { auth } from "./firebaseClient";
import toast from "react-hot-toast";

function useQuery() {
  if (typeof window === "undefined") return new URLSearchParams("");
  return new URLSearchParams(window.location.search);
}

export default function LiveWatch() {
  const [valid, setValid] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [previewDone, setPreviewDone] = useState(false);
  const [clientId, setClientId] = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [selectedAmount, setSelectedAmount] = useState("0.99");
  const paypalRef = useRef(null);
  const query = useQuery();
  const token = query.get("token") || null;
  const liveId =
    (typeof window !== "undefined" &&
      window.location &&
      window.location.pathname &&
      window.location.pathname.split("/").filter(Boolean)[1]) ||
    null;

  useEffect(() => {
    const check = async () => {
      setLoading(true);
      try {
        if (token) {
          const resp = await fetch(`/api/live/validate?token=${encodeURIComponent(token)}`);
          const body = await resp.json().catch(() => ({}));
          if (resp.ok && body.valid) {
            setValid(true);
            setInfo(body.data || {});
          } else {
            setValid(false);
            setInfo(body || { reason: body.reason || "invalid" });
          }
        } else {
          setValid(false);
          setInfo({ reason: "missing_token" });
        }
      } catch (e) {
        setValid(false);
        setInfo({ reason: "network_error" });
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [token]);

  useEffect(() => {
    // fetch paypal config for client id
    const load = async () => {
      try {
        const { API_ENDPOINTS } = require("./config");
        // Use configured endpoint or relative path if not defined
        const url =
          (API_ENDPOINTS && API_ENDPOINTS.PAYMENTS_PAYPAL_CONFIG) || "/api/payments/paypal/config";
        const res = await fetch(url);
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          setClientId(body.clientId || null);
          setCurrency(body.currency || "USD");
        }
      } catch (_) {}
    };
    load();
  }, []);

  useEffect(() => {
    if (!previewDone || !clientId) return;
    // dynamically inject PayPal SDK
    if (typeof window === "undefined") return;
    if (window.paypal) {
      renderButtons();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
    s.async = true;
    s.onload = () => renderButtons();
    document.body.appendChild(s);

    function renderButtons() {
      try {
        if (!window.paypal || !paypalRef.current) return;
        window.paypal
          .Buttons({
            createOrder: async (_data, actions) => {
              // create server order
              const resp = await fetch("/api/payments/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: selectedAmount, currency }),
              });
              const body = await resp.json();
              if (!resp.ok)
                throw new Error(body && body.reason ? body.reason : "create_order_failed");
              return body.orderId;
            },
            onApprove: async data => {
              // capture on server
              const resp = await fetch("/api/payments/paypal/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: data.orderID, liveId }),
              });
              const body = await resp.json();
              if (resp.ok && body.ok && body.url) {
                // redirect to live with token
                window.location.href = body.url;
              } else {
                alert("Payment succeeded but failed to issue viewing token");
              }
            },
            onError: err => {
              console.error("PayPal Buttons error", err);
              alert("Payment error");
            },
          })
          .render(paypalRef.current);
      } catch (e) {
        console.error("render paypal error", e);
      }
    }
  }, [previewDone, clientId, currency, selectedAmount]);

  const startPreview = () => {
    // Simulated teaser: 30s countdown
    setPreviewDone(false);
    const t = 30; // seconds
    let left = t;
    const el = typeof document !== "undefined" ? document.getElementById("teaser-countdown") : null;
    el && (el.textContent = `Preview ends in ${left}s`);
    const iv = setInterval(() => {
      left -= 1;
      el && (el.textContent = `Preview ends in ${left}s`);
      if (left <= 0) {
        clearInterval(iv);
        setPreviewDone(true);
      }
    }, 1000);
  };

  // Tip modal and animation state
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState("0.99");
  const tipPaypalRef = useRef(null);
  const [topTipper, setTopTipper] = useState(null);

  // Helper to create provider order and redirect via POST form
  async function createAndRedirect(provider, amount) {
    try {
      const res = await fetch(`/api/payments/${provider}/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, currency, returnUrl: window.location.href }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success || !body.order) {
        throw new Error((body && body.error) || "create_order_failed");
      }

      const order = body.order;
      const redirectUrl = order.redirectUrl || order.redirect_url || order.paymentUrl || null;
      const params = order.params || {};
      if (!redirectUrl) throw new Error("no_redirect_url_from_provider");

      // Create and submit a hidden form to POST to provider's redirect URL
      const form = document.createElement("form");
      form.method = "POST";
      form.action = redirectUrl;
      form.style.display = "none";
      Object.entries(params).forEach(([k, v]) => {
        const inp = document.createElement("input");
        inp.type = "hidden";
        inp.name = k;
        inp.value = String(v == null ? "" : v);
        form.appendChild(inp);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      console.error(`createAndRedirect(${provider}) error:`, e && e.message ? e.message : e);
      alert("Payment initiation failed: " + (e && e.message ? e.message : String(e)));
    }
  }

  // Render PayPal buttons inside tip modal when opened
  useEffect(() => {
    if (!showTipModal || !clientId) return;
    if (typeof window === "undefined") return;
    if (window.paypal) {
      renderTipButtons();
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}`;
    s.async = true;
    s.onload = () => renderTipButtons();
    document.body.appendChild(s);

    function renderTipButtons() {
      try {
        if (!window.paypal || !tipPaypalRef.current) return;
        // clear previous
        tipPaypalRef.current.innerHTML = "";
        window.paypal
          .Buttons({
            createOrder: async (_data, _actions) => {
              const resp = await fetch("/api/payments/paypal/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: tipAmount, currency }),
              });
              const body = await resp.json();
              if (!resp.ok)
                throw new Error(body && body.reason ? body.reason : "create_order_failed");
              return body.orderId;
            },
            onApprove: async data => {
              const resp = await fetch("/api/payments/paypal/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: data.orderID, liveId }),
              });
              await resp.json().catch(() => ({}));
              if (resp.ok) {
                // show confetti and floating emote
                launchConfetti();
                launchEmotes();
                setShowTipModal(false);
              } else {
                alert("Payment captured but server error");
              }
            },
            onError: err => {
              console.error("PayPal tip error", err);
              alert("Payment error");
            },
          })
          .render(tipPaypalRef.current);
      } catch (e) {
        console.error("render tip paypal error", e);
      }
    }
  }, [showTipModal, clientId, currency, tipAmount, liveId]);

  function launchConfetti() {
    const root = document.getElementById("confetti-root");
    if (!root) return;
    for (let i = 0; i < 24; i++) {
      const el = document.createElement("div");
      el.className = "confetti";
      el.style.left = `${50 + (Math.random() - 0.5) * 60}%`;
      el.style.background = ["#ff6b6b", "#ffd93d", "#6bf178", "#6bb7ff"][
        Math.floor(Math.random() * 4)
      ];
      root.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }
  }

  function launchEmotes() {
    const box = document.querySelector(".player-box");
    if (!box) return;
    const emoji = ["🔥", "💖", "👏", "✨", "🎉"];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const span = document.createElement("span");
      span.className = "floating-emote";
      span.textContent = emoji[Math.floor(Math.random() * emoji.length)];
      span.style.left = `${50 + (Math.random() - 0.5) * 40}%`;
      box.appendChild(span);
      setTimeout(() => span.remove(), 2400 + Math.random() * 800);
    }
  }

  // SSE connect for live tips
  useEffect(() => {
    if (!liveId) return;
    let es;
    try {
      es = new EventSource(`/api/payments/tips/stream/${encodeURIComponent(liveId)}`);
      es.onmessage = e => {
        try {
          const data = JSON.parse(e.data);
          if (data && data.type === "tip") {
            // show emotes/confetti and top tipper popup
            launchConfetti();
            launchEmotes();
            setTopTipper({ amount: data.amount, currency: data.currency, payer: data.payer });
            setTimeout(() => setTopTipper(null), 4500);
          }
        } catch (_) {}
      };
      es.onerror = () => {
        try {
          es.close();
        } catch (_) {}
      };
    } catch (e) {}
    return () => {
      try {
        es && es.close();
      } catch (_) {}
    };
  }, [liveId]);

  // Handle returns from external providers (e.g., PayFast/PayGate)
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const qp = new URLSearchParams(window.location.search);
      const provider = qp.get("provider") || qp.get("payment_provider");
      const status = qp.get("status") || qp.get("payment_status");
      const orderId = qp.get("orderId") || qp.get("order_id") || qp.get("provider_order_id");
      if (!provider) return;

      // If provider returned and status indicates success, confirm with server
      const success =
        status && ["success", "completed", "ok", "completed"].includes(status.toLowerCase());
      (async () => {
        try {
          const resp = await fetch(`/api/payments/${provider}/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId, status, liveId, rawQuery: Object.fromEntries(qp) }),
          });
          const body = await resp.json().catch(() => ({}));
          // If server returns a redirect URL (e.g., tokenized live URL), follow it
          if (resp.ok && body && body.url) {
            // clean URL params before redirect
            try {
              const base = window.location.origin + window.location.pathname;
              window.history.replaceState({}, document.title, base);
            } catch (_) {}
            window.location.href = body.url;
            return;
          }
          if (success) {
            alert("Payment processed — please wait while we finalize your access.");
          } else {
            alert(
              "Payment status: " + (status || "unknown") + ". If you were charged, contact support."
            );
          }
          // remove query params to keep UX clean
          try {
            const base = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, base);
          } catch (_) {}
        } catch (e) {
          console.error("confirm provider return error", e);
        }
      })();
    } catch (e) {}
  }, [liveId]);

  if (loading) return <div style={{ padding: 20 }}>Loading player…</div>;
  if (valid) {
    // Placeholder player — in production replace with HLS/iframe/CDN-signed URL
    return (
      <div style={{ padding: 20 }}>
        <h3>Live stream</h3>
        <p>Stream ID: {info.liveId || "unknown"}</p>
        <div className="player-wrap">
          <div className="player-box">
            <p className="player-placeholder">Player placeholder — playback would appear here.</p>
            <div className="tip-overlay">
              <button
                className="tip-btn"
                onClick={() => setShowTipModal(true)}
                aria-label="Tip streamer"
              >
                Tip
              </button>
            </div>
            <FloatingActions
              onLike={() => {
                launchEmotes();
              }}
              onComment={() => alert("Open comments (placeholder)")}
              onShare={() => alert("Share dialog (placeholder)")}
              onCreate={() => alert("Create — open composer (placeholder)")}
            />
            {topTipper && (
              <div className="top-tipper">
                {topTipper.payer ? `${topTipper.payer} tipped ` : "Someone tipped "}$
                {topTipper.amount ? `${topTipper.amount} ${topTipper.currency}` : ""}
              </div>
            )}
          </div>
        </div>
        {showTipModal && (
          <div className="tip-modal" role="dialog" aria-modal="true">
            <div className="tip-modal-inner">
              <button className="tip-close" onClick={() => setShowTipModal(false)}>
                ×
              </button>
              <h4>Support the streamer</h4>
              <p>Choose an amount</p>
              <div className="tip-options">
                <button onClick={() => setTipAmount("0.99")}>$0.99</button>
                <button onClick={() => setTipAmount("2.99")}>$2.99</button>
                <button onClick={() => setTipAmount("4.99")}>$4.99</button>
              </div>
              <div
                style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}
              >
                <div className="tip-paypal" ref={tipPaypalRef} />
                <button
                  onClick={() => createAndRedirect("payfast", tipAmount)}
                  className="tip-alt-btn"
                >
                  Pay with PayFast
                </button>
                <button
                  onClick={() => createAndRedirect("paygate", tipAmount)}
                  className="tip-alt-btn"
                >
                  Pay with PayGate
                </button>
              </div>
            </div>
          </div>
        )}
        <div id="confetti-root" className="confetti-root" />
      </div>
    );
  }

  // Not valid: show teaser + paywall
  return (
    <div style={{ padding: 20 }}>
      <h3>Live preview</h3>
      <p>Stream: {liveId || "Unknown"}</p>
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            width: "100%",
            maxWidth: 900,
            background: "#000",
            height: 360,
            borderRadius: 8,
            position: "relative",
          }}
        >
          <p id="teaser-countdown" style={{ color: "#fff", padding: 20 }}>
            Preview ready — click Play
          </p>
          {!previewDone && (
            <button
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%,-50%)",
              }}
              onClick={startPreview}
            >
              Play Preview
            </button>
          )}
          <FloatingActions
            onLike={async () => {
              launchEmotes();
              try {
                const token = await auth.currentUser?.getIdToken();
                await fetch(`/api/engagement/track`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ type: "like", target: "live", id: liveId }),
                });
              } catch (e) {
                console.error("like track error", e);
              }
            }}
            onComment={async () => {
              try {
                const text = window.prompt("Leave a comment for this live stream:");
                if (!text) return;
                const token = await auth.currentUser?.getIdToken();
                const res = await fetch(`/api/community/posts`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ type: "text", caption: text, contentId: liveId }),
                });
                if (res.ok) {
                  toast.success("Comment posted to community feed");
                } else {
                  toast.error("Failed to post comment");
                }
              } catch (e) {
                console.error("comment error", e);
                toast.error("Failed to post comment");
              }
            }}
            onShare={async () => {
              try {
                const url = window.location.origin + window.location.pathname;
                if (navigator.share) {
                  await navigator.share({ title: "Live stream", url });
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copied to clipboard");
                } else {
                  window.prompt("Copy link:", url);
                }
              } catch (e) {
                console.error("share error", e);
                toast.error("Failed to share");
              }
            }}
            onCreate={() => {
              // Navigate to upload/composer area (dashboard clips)
              try {
                window.location.href = "/?tab=clips";
              } catch (e) {
                console.error(e);
              }
            }}
          />
          {previewDone && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.95)",
                  padding: 18,
                  borderRadius: 8,
                  textAlign: "center",
                  width: 420,
                }}
              >
                <h4>Keep watching?</h4>
                <p>Tip to continue watching the live stream.</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
                  <button onClick={() => setSelectedAmount("0.99")}>$0.99</button>
                  <button onClick={() => setSelectedAmount("2.99")}>$2.99</button>
                  <button onClick={() => setSelectedAmount("4.99")}>$4.99</button>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <small>
                    Selected: ${selectedAmount} {currency}
                  </small>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div ref={paypalRef} />
                  <button onClick={() => createAndRedirect("payfast", selectedAmount)}>
                    Pay with PayFast
                  </button>
                  <button onClick={() => createAndRedirect("paygate", selectedAmount)}>
                    Pay with PayGate
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
