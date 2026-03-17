"use strict";
(globalThis.webpackChunkautopromote_frontend =
  globalThis.webpackChunkautopromote_frontend || []).push([
  [637],
  {
    8637(e, t, r) {
      (r.r(t), r.d(t, { default: () => c }));
      var n = r(5043),
        a = (r(4036), r(3316)),
        o = (r(4834), r(3768), r(3488)),
        i = r(9426),
        s = r(579);
      function c(e) {
        let { liveId: t, token: r, onExit: c } = e;
        const [l, d] = (0, n.useState)(null),
          [p, u] = (0, n.useState)(null),
          [y, h] = (0, n.useState)(!0),
          [m, f] = (0, n.useState)(!1),
          [w, g] = (0, n.useState)(null),
          [j, v] = (0, n.useState)("USD"),
          [x, b] = (0, n.useState)("0.99"),
          S = (0, n.useRef)(null),
          k =
            "undefined" === typeof window
              ? new URLSearchParams("")
              : new URLSearchParams(window.location.search),
          C = r || k.get("token") || null,
          P =
            t ||
            ("undefined" !== typeof window &&
              window.location &&
              window.location.pathname &&
              window.location.pathname.split("/").filter(Boolean)[1]) ||
            null;
        ((0, n.useEffect)(() => {
          (async () => {
            h(!0);
            try {
              if (C) {
                const e = await fetch(`/api/live/validate?token=${encodeURIComponent(C)}`),
                  t = await e.json().catch(() => ({}));
                e.ok && t.valid
                  ? (d(!0), u(t.data || {}))
                  : (d(!1), u(t || { reason: t.reason || "invalid" }));
              } else (d(!1), u({ reason: "missing_token" }));
            } catch (e) {
              (d(!1), u({ reason: "network_error" }));
            } finally {
              h(!1);
            }
          })();
        }, [C]),
          (0, n.useEffect)(() => {
            (async () => {
              try {
                const t = "https://api.autopromote.org".replace(/\/$/, ""),
                  r =
                    (o.Sn && o.Sn.PAYMENTS_PAYPAL_CONFIG) ||
                    (t
                      ? `${t}/api/payments/paypal/config`
                      : "https://autopromote.onrender.com/api/payments/paypal/config"),
                  n = await fetch(r),
                  a = await n.text();
                let i = null;
                try {
                  i = a ? JSON.parse(a) : null;
                } catch (e) {
                  console.warn("PayPal config endpoint returned invalid JSON", {
                    status: n.status,
                    text: a,
                  });
                }
                n.ok && (g((i && i.clientId) || null), v((i && i.currency) || "USD"));
              } catch (e) {}
            })();
          }, []),
          (0, n.useEffect)(() => {
            if (!m || !w) return;
            if ("undefined" === typeof window) return;
            if (window.paypal) return void t();
            const e = document.createElement("script");
            function t() {
              try {
                if (!window.paypal || !S.current) return;
                window.paypal
                  .Buttons({
                    createOrder: async (e, t) => {
                      const r = "https://api.autopromote.org".replace(/\/$/, ""),
                        n = await fetch(
                          r
                            ? `${r}/api/payments/paypal/create-order`
                            : "https://autopromote.onrender.com/api/payments/paypal/create-order",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ amount: x, currency: j }),
                          }
                        ),
                        a = await n.text();
                      let o = null;
                      try {
                        o = a ? JSON.parse(a) : null;
                      } catch (i) {
                        console.warn("create-order returned invalid JSON", {
                          status: n.status,
                          text: a,
                        });
                      }
                      if (!n.ok) {
                        const e =
                          (o && (o.error || o.reason)) ||
                          ("string" === typeof a && a.trim()) ||
                          `HTTP ${n.status}`;
                        throw new Error(e);
                      }
                      if (!o || !o.orderId) throw new Error("create_order_no_id");
                      return o.orderId;
                    },
                    onApprove: async e => {
                      const t = "https://api.autopromote.org".replace(/\/$/, ""),
                        r = await fetch(
                          t
                            ? `${t}/api/payments/paypal/capture`
                            : "https://autopromote.onrender.com/api/payments/paypal/capture",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ orderId: e.orderID, liveId: P }),
                          }
                        ),
                        n = await r.json();
                      if (r.ok && n.ok && n.url) {
                        if (!(0, i.t)(n.url))
                          return void alert("Untrusted redirect URL blocked for security.");
                        window.location.href = n.url;
                      } else alert("Payment succeeded but failed to issue viewing token");
                    },
                    onError: e => {
                      (console.error("PayPal Buttons error", e), alert("Payment error"));
                    },
                  })
                  .render(S.current);
              } catch (e) {
                console.error("render paypal error", e);
              }
            }
            ((e.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(w)}&currency=${encodeURIComponent(j)}`),
              (e.async = !0),
              (e.onload = () => t()),
              document.body.appendChild(e));
          }, [m, w, j, x]));
        const [$, I] = (0, n.useState)(!1),
          [N, T] = (0, n.useState)("0.99"),
          E = (0, n.useRef)(null),
          [O, _] = (0, n.useState)(null);
        async function U(e, t) {
          try {
            const r = await fetch(`/api/payments/${e}/create-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: t, currency: j, returnUrl: window.location.href }),
              }),
              n = await r.json().catch(() => ({}));
            if (!r.ok || !n.success || !n.order)
              throw new Error((n && n.error) || "create_order_failed");
            const a = n.order,
              o = a.redirectUrl || a.redirect_url || a.paymentUrl || null,
              i = a.params || {};
            if (!o) throw new Error("no_redirect_url_from_provider");
            const s = document.createElement("form");
            ((s.method = "POST"),
              (s.action = o),
              (s.style.display = "none"),
              Object.entries(i).forEach(e => {
                let [t, r] = e;
                const n = document.createElement("input");
                ((n.type = "hidden"),
                  (n.name = t),
                  (n.value = String(null == r ? "" : r)),
                  s.appendChild(n));
              }),
              document.body.appendChild(s),
              s.submit());
          } catch (r) {
            (console.error(`createAndRedirect(${e}) error:`, r && r.message ? r.message : r),
              alert("Payment initiation failed: " + (r && r.message ? r.message : String(r))));
          }
        }
        function R() {
          const e = document.getElementById("confetti-root");
          if (e)
            for (let t = 0; t < 24; t++) {
              const t = document.createElement("div");
              ((t.className = "confetti"),
                (t.style.left = 50 + 60 * (Math.random() - 0.5) + "%"),
                (t.style.background = ["#ff6b6b", "#ffd93d", "#6bf178", "#6bb7ff"][
                  Math.floor(4 * Math.random())
                ]),
                e.appendChild(t),
                setTimeout(() => t.remove(), 2500));
            }
        }
        function J() {
          const e = document.querySelector(".player-box");
          if (!e) return;
          const t = ["\ud83d\udd25", "\ud83d\udc96", "\ud83d\udc4f", "\u2728", "\ud83c\udf89"];
          for (let r = 0; r < 6; r++) {
            const r = document.createElement("span");
            ((r.className = "floating-emote"),
              (r.textContent = t[Math.floor(Math.random() * t.length)]),
              (r.style.left = 50 + 40 * (Math.random() - 0.5) + "%"),
              e.appendChild(r),
              setTimeout(() => r.remove(), 2400 + 800 * Math.random()));
          }
        }
        return (
          (0, n.useEffect)(() => {
            if (!$ || !w) return;
            if ("undefined" === typeof window) return;
            if (window.paypal) return void t();
            const e = document.createElement("script");
            function t() {
              try {
                if (!window.paypal || !E.current) return;
                ((E.current.innerHTML = ""),
                  window.paypal
                    .Buttons({
                      createOrder: async (e, t) => {
                        const r = "https://api.autopromote.org".replace(/\/$/, ""),
                          n = await fetch(
                            r
                              ? `${r}/api/payments/paypal/create-order`
                              : "https://autopromote.onrender.com/api/payments/paypal/create-order",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ amount: N, currency: j }),
                            }
                          ),
                          a = await n.text();
                        let o = null;
                        try {
                          o = a ? JSON.parse(a) : null;
                        } catch (i) {
                          console.warn("create-order returned invalid JSON", {
                            status: n.status,
                            text: a,
                          });
                        }
                        if (!n.ok) {
                          const e =
                            (o && (o.error || o.reason)) ||
                            ("string" === typeof a && a.trim()) ||
                            `HTTP ${n.status}`;
                          throw new Error(e);
                        }
                        if (!o || !o.orderId) throw new Error("create_order_no_id");
                        return o.orderId;
                      },
                      onApprove: async e => {
                        const t = "https://api.autopromote.org".replace(/\/$/, ""),
                          r = await fetch(
                            t
                              ? `${t}/api/payments/paypal/capture`
                              : "https://autopromote.onrender.com/api/payments/paypal/capture",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ orderId: e.orderID, liveId: P }),
                            }
                          );
                        (await r.json().catch(() => ({})),
                          r.ok ? (R(), J(), I(!1)) : alert("Payment captured but server error"));
                      },
                      onError: e => {
                        (console.error("PayPal tip error", e), alert("Payment error"));
                      },
                    })
                    .render(E.current));
              } catch (e) {
                console.error("render tip paypal error", e);
              }
            }
            ((e.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(w)}&currency=${encodeURIComponent(j)}`),
              (e.async = !0),
              (e.onload = () => t()),
              document.body.appendChild(e));
          }, [$, w, j, N, P]),
          (0, n.useEffect)(() => {
            if (!P) return;
            let e;
            try {
              ((e = new EventSource(`/api/payments/tips/stream/${encodeURIComponent(P)}`)),
                (e.onmessage = e => {
                  try {
                    const t = JSON.parse(e.data);
                    t &&
                      "tip" === t.type &&
                      (R(),
                      J(),
                      _({ amount: t.amount, currency: t.currency, payer: t.payer }),
                      setTimeout(() => _(null), 4500));
                  } catch (t) {}
                }),
                (e.onerror = () => {
                  try {
                    e.close();
                  } catch (t) {}
                }));
            } catch (t) {}
            return () => {
              try {
                e && e.close();
              } catch (t) {}
            };
          }, [P]),
          (0, n.useEffect)(() => {
            try {
              if ("undefined" === typeof window) return;
              const e = new URLSearchParams(window.location.search),
                t = e.get("provider") || e.get("payment_provider"),
                r = e.get("status") || e.get("payment_status"),
                n = e.get("orderId") || e.get("order_id") || e.get("provider_order_id");
              if (!t) return;
              const a = r && ["success", "completed", "ok", "completed"].includes(r.toLowerCase());
              (async () => {
                try {
                  const s = await fetch(`/api/payments/${t}/confirm`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        orderId: n,
                        status: r,
                        liveId: P,
                        rawQuery: Object.fromEntries(e),
                      }),
                    }),
                    c = await s.json().catch(() => ({}));
                  if (s.ok && c && c.url) {
                    try {
                      const e = window.location.origin + window.location.pathname;
                      window.history.replaceState({}, document.title, e);
                    } catch (o) {}
                    return (0, i.t)(c.url)
                      ? void (window.location.href = c.url)
                      : void alert("Untrusted redirect URL blocked for security.");
                  }
                  a
                    ? alert("Payment processed \u2014 please wait while we finalize your access.")
                    : alert(
                        "Payment status: " +
                          (r || "unknown") +
                          ". If you were charged, contact support."
                      );
                  try {
                    const e = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, document.title, e);
                  } catch (o) {}
                } catch (s) {
                  console.error("confirm provider return error", s);
                }
              })();
            } catch (e) {}
          }, [P]),
          y
            ? (0, s.jsx)("div", { style: { padding: 20 }, children: "Loading player\u2026" })
            : l
              ? (0, s.jsxs)("div", {
                  style: { padding: 20 },
                  children: [
                    c &&
                      (0, s.jsx)("button", {
                        onClick: c,
                        style: { marginBottom: 10 },
                        children: "\u2190 Back to Lobby",
                      }),
                    (0, s.jsx)("h3", { children: "Live stream" }),
                    (0, s.jsxs)("p", { children: ["Stream ID: ", p.liveId || "unknown"] }),
                    (0, s.jsx)("div", {
                      className: "player-wrap",
                      children: (0, s.jsxs)("div", {
                        className: "player-box",
                        children: [
                          (0, s.jsx)("p", {
                            className: "player-placeholder",
                            children: "Player placeholder \u2014 playback would appear here.",
                          }),
                          (0, s.jsx)("div", {
                            className: "tip-overlay",
                            children: (0, s.jsx)("button", {
                              className: "tip-btn",
                              onClick: () => I(!0),
                              "aria-label": "Tip streamer",
                              children: "Tip",
                            }),
                          }),
                          (0, s.jsx)(a.A, {
                            onLike: () => {
                              J();
                            },
                            onComment: () => alert("Open comments (placeholder)"),
                            onShare: () => alert("Share dialog (placeholder)"),
                            onCreate: () => alert("Create \u2014 open composer (placeholder)"),
                          }),
                          O &&
                            (0, s.jsxs)("div", {
                              className: "top-tipper",
                              children: [
                                O.payer ? `${O.payer} tipped ` : "Someone tipped ",
                                "$",
                                O.amount ? `${O.amount} ${O.currency}` : "",
                              ],
                            }),
                        ],
                      }),
                    }),
                    $ &&
                      (0, s.jsx)("div", {
                        className: "tip-modal",
                        role: "dialog",
                        "aria-modal": "true",
                        children: (0, s.jsxs)("div", {
                          className: "tip-modal-inner",
                          children: [
                            (0, s.jsx)("button", {
                              className: "tip-close",
                              onClick: () => I(!1),
                              children: "\xd7",
                            }),
                            (0, s.jsx)("h4", { children: "Support the streamer" }),
                            (0, s.jsx)("p", { children: "Choose an amount" }),
                            (0, s.jsxs)("div", {
                              className: "tip-options",
                              children: [
                                (0, s.jsx)("button", {
                                  onClick: () => T("0.99"),
                                  children: "$0.99",
                                }),
                                (0, s.jsx)("button", {
                                  onClick: () => T("2.99"),
                                  children: "$2.99",
                                }),
                                (0, s.jsx)("button", {
                                  onClick: () => T("4.99"),
                                  children: "$4.99",
                                }),
                              ],
                            }),
                            (0, s.jsxs)("div", {
                              style: {
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                justifyContent: "center",
                              },
                              children: [
                                (0, s.jsx)("div", { className: "tip-paypal", ref: E }),
                                (0, s.jsx)("button", {
                                  onClick: () => U("payfast", N),
                                  className: "tip-alt-btn",
                                  children: "Pay with PayFast",
                                }),
                                (0, s.jsx)("button", {
                                  onClick: () => U("paygate", N),
                                  className: "tip-alt-btn",
                                  children: "Pay with PayGate",
                                }),
                              ],
                            }),
                          ],
                        }),
                      }),
                    (0, s.jsx)("div", { id: "confetti-root", className: "confetti-root" }),
                  ],
                })
              : (0, s.jsxs)("div", {
                  style: { padding: 20 },
                  children: [
                    (0, s.jsx)("h3", { children: "Live preview" }),
                    (0, s.jsxs)("p", { children: ["Stream: ", P || "Unknown"] }),
                    (0, s.jsx)("div", {
                      style: { marginTop: 12 },
                      children: (0, s.jsxs)("div", {
                        style: {
                          width: "100%",
                          maxWidth: 900,
                          background: "#000",
                          height: 360,
                          borderRadius: 8,
                          position: "relative",
                        },
                        children: [
                          (0, s.jsx)("p", {
                            id: "teaser-countdown",
                            style: { color: "#fff", padding: 20 },
                            children: "Preview ready \u2014 click Play",
                          }),
                          !m &&
                            (0, s.jsx)("button", {
                              style: {
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-50%,-50%)",
                              },
                              onClick: () => {
                                f(!1);
                                let e = 30;
                                const t =
                                  "undefined" !== typeof document
                                    ? document.getElementById("teaser-countdown")
                                    : null;
                                t && (t.textContent = `Preview ends in ${e}s`);
                                const r = setInterval(() => {
                                  ((e -= 1),
                                    t && (t.textContent = `Preview ends in ${e}s`),
                                    e <= 0 && (clearInterval(r), f(!0)));
                                }, 1e3);
                              },
                              children: "Play Preview",
                            }),
                          m &&
                            (0, s.jsx)("div", {
                              style: {
                                position: "absolute",
                                left: 0,
                                right: 0,
                                top: 0,
                                bottom: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              },
                              children: (0, s.jsxs)("div", {
                                style: {
                                  background: "rgba(255,255,255,0.95)",
                                  padding: 18,
                                  borderRadius: 8,
                                  textAlign: "center",
                                  width: 420,
                                },
                                children: [
                                  (0, s.jsx)("h4", { children: "Keep watching?" }),
                                  (0, s.jsx)("p", {
                                    children: "Tip to continue watching the live stream.",
                                  }),
                                  (0, s.jsxs)("div", {
                                    style: {
                                      display: "flex",
                                      gap: 8,
                                      justifyContent: "center",
                                      marginBottom: 8,
                                    },
                                    children: [
                                      (0, s.jsx)("button", {
                                        onClick: () => b("0.99"),
                                        children: "$0.99",
                                      }),
                                      (0, s.jsx)("button", {
                                        onClick: () => b("2.99"),
                                        children: "$2.99",
                                      }),
                                      (0, s.jsx)("button", {
                                        onClick: () => b("4.99"),
                                        children: "$4.99",
                                      }),
                                    ],
                                  }),
                                  (0, s.jsx)("div", {
                                    style: { marginBottom: 8 },
                                    children: (0, s.jsxs)("small", {
                                      children: ["Selected: $", x, " ", j],
                                    }),
                                  }),
                                  (0, s.jsxs)("div", {
                                    style: {
                                      display: "flex",
                                      gap: 8,
                                      alignItems: "center",
                                      justifyContent: "center",
                                    },
                                    children: [
                                      (0, s.jsx)("div", { ref: S }),
                                      (0, s.jsx)("button", {
                                        onClick: () => U("payfast", x),
                                        children: "Pay with PayFast",
                                      }),
                                      (0, s.jsx)("button", {
                                        onClick: () => U("paygate", x),
                                        children: "Pay with PayGate",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            }),
                        ],
                      }),
                    }),
                  ],
                })
        );
      }
    },
  },
]);
//# sourceMappingURL=637.a02dd685.chunk.js.map
