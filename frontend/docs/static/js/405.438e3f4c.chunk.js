"use strict";
(globalThis.webpackChunkautopromote_frontend =
  globalThis.webpackChunkautopromote_frontend || []).push([
  [405],
  {
    6405(e, n, t) {
      (t.r(n), t.d(n, { default: () => c }));
      t(5043);
      var o = t(3216),
        s = t(5475);
      const r = [
        {
          slug: "getting-started",
          title: "Getting Started",
          content:
            "# Getting Started\n\n  Welcome to AutoPromote. This quickstart helps you connect platforms, publish deliberately, and learn from the resulting analytics.\n\n## Steps\n\n- Create an account\n- Connect your platforms under Connections\n- Upload content and choose platforms\n- Schedule or post immediately\n\n## Tips\n\nUse the analytics panel to monitor performance and iterate.\nShort-link and landing-page behavior may depend on deployment configuration, so treat those features as environment-specific unless your workspace has them enabled.\n",
        },
        {
          slug: "api-reference",
          title: "API Reference",
          content:
            "# API Reference\n\nThe platform exposes a small set of REST endpoints under /api. For example:\n\n- POST /api/content/upload \u2014 create a new content upload\n- GET /api/users/me \u2014 current user info\n\nContact support for API keys and expanded documentation.\n",
        },
      ];
      var a = t(1739),
        i = t(579);
      const l = e => {
          let { md: n } = e;
          if (!n) return null;
          const t = n.split(/\r?\n/),
            o = [];
          let s = !1;
          return (
            t.forEach(e => {
              /^#\s+/.test(e)
                ? (s && (o.push("</ul>"), (s = !1)), o.push(`<h1>${e.replace(/^#\s+/, "")}</h1>`))
                : /^##\s+/.test(e)
                  ? (s && (o.push("</ul>"), (s = !1)),
                    o.push(`<h2>${e.replace(/^##\s+/, "")}</h2>`))
                  : /^-\s+/.test(e)
                    ? (s || (o.push("<ul>"), (s = !0)),
                      o.push(`<li>${e.replace(/^-\s+/, "")}</li>`))
                    : "" === e.trim()
                      ? (s && (o.push("</ul>"), (s = !1)), o.push("<p></p>"))
                      : o.push(`<p>${e}</p>`);
            }),
            s && o.push("</ul>"),
            (0, i.jsx)("div", { dangerouslySetInnerHTML: { __html: o.join("") } })
          );
        },
        c = () => {
          const e = (0, o.zy)().pathname.replace(/^\/docs\/?/, "");
          if (e) {
            const n = r.find(n => n.slug === e);
            return n
              ? (0, i.jsxs)("div", {
                  style: { padding: 24, maxWidth: 900, margin: "0 auto" },
                  children: [
                    (0, i.jsx)(s.N_, { to: "/docs", children: "\u2190 Back to Docs" }),
                    (0, i.jsx)("h1", { children: n.title }),
                    (0, i.jsx)(l, { md: n.content }),
                  ],
                })
              : (0, i.jsx)("div", { style: { padding: 24 }, children: "Document not found." });
          }
          return (0, i.jsxs)("div", {
            style: { padding: 24, maxWidth: 900, margin: "0 auto" },
            children: [
              (0, i.jsx)("h1", { children: "Documentation" }),
              (0, i.jsx)("p", {
                children: "Welcome to the AutoPromote documentation. Choose a topic below.",
              }),
              (0, i.jsx)("p", {
                children:
                  "These docs focus on the current product: connected publishing, scheduling, analytics, editing workflows, and the current monetization posture.",
              }),
              (0, i.jsx)(a.A, {
                title: "Before You Dive In",
                intro:
                  "Use this snapshot to separate supported workflows from environment-dependent or retired behavior before following the guides below.",
              }),
              (0, i.jsx)("ul", {
                children: r.map(e =>
                  (0, i.jsx)(
                    "li",
                    { children: (0, i.jsx)(s.N_, { to: `/docs/${e.slug}`, children: e.title }) },
                    e.slug
                  )
                ),
              }),
            ],
          });
        };
    },
  },
]);
//# sourceMappingURL=405.438e3f4c.chunk.js.map
