"use strict";
(globalThis.webpackChunkautopromote_frontend =
  globalThis.webpackChunkautopromote_frontend || []).push([
  [581],
  {
    2581(e, n, i) {
      (i.r(n), i.d(n, { default: () => r }));
      var t = i(5043),
        o = i(579);
      function r() {
        const [e, n] = (0, t.useState)(!1),
          [i, r] = (0, t.useState)(null),
          s =
            ("undefined" === typeof window
              ? new URLSearchParams("")
              : new URLSearchParams(window.location.search)
            ).get("token") || null,
          a =
            (("undefined" !== typeof window ? window.location.pathname : "") || "")
              .split("/")
              .filter(Boolean)[1] || null;
        (0, t.useEffect)(() => r(null), [s]);
        return (0, o.jsxs)("div", {
          style: { padding: 20, maxWidth: 760, margin: "0 auto" },
          children: [
            (0, o.jsx)("h2", { children: "Live stream landing" }),
            (0, o.jsxs)("p", { children: ["Stream: ", a || "Unknown"] }),
            (0, o.jsx)("div", {
              style: { marginTop: 24 },
              children: (0, o.jsxs)("div", {
                style: {
                  padding: 20,
                  borderRadius: 10,
                  background: "#fff",
                  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                },
                children: [
                  (0, o.jsx)("h3", { children: "Access" }),
                  (0, o.jsx)("p", {
                    children:
                      "This stream is available to authorized viewers. Use the token in the link to access.",
                  }),
                  (0, o.jsx)("div", {
                    style: { marginTop: 12 },
                    children: (0, o.jsx)("button", {
                      onClick: async () => {
                        if (s) {
                          n(!0);
                          try {
                            const e = await fetch("/api/live/redeem", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ token: s }),
                              }),
                              i = await e.json().catch(() => ({}));
                            if (!e.ok)
                              return (
                                r(i.error || i.reason || "Could not redeem token"),
                                void n(!1)
                              );
                            const t = i.token || s,
                              o = `/live/watch?token=${encodeURIComponent(t)}`;
                            "undefined" !== typeof window && (window.location.href = o);
                          } catch (e) {
                            r("Network error while redeeming token");
                          } finally {
                            n(!1);
                          }
                        } else r("Missing access token in link.");
                      },
                      disabled: e,
                      style: { padding: "10px 14px", borderRadius: 8, cursor: "pointer" },
                      children: e ? "Processing\u2026" : "Access stream",
                    }),
                  }),
                  i && (0, o.jsx)("p", { style: { marginTop: 12 }, children: i }),
                  !s &&
                    (0, o.jsx)("p", {
                      style: { marginTop: 12, color: "#666" },
                      children:
                        "This private stream requires a token in the link. Ask the streamer to resend the link.",
                    }),
                ],
              }),
            }),
          ],
        });
      }
    },
  },
]);
//# sourceMappingURL=581.03c80694.chunk.js.map
