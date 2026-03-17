"use strict";
(globalThis.webpackChunkautopromote_frontend =
  globalThis.webpackChunkautopromote_frontend || []).push([
  [976],
  {
    2976(e, t, s) {
      (s.r(t), s.d(t, { default: () => i }));
      s(5043);
      var n = s(3216),
        l = s(5475);
      const a = [
        {
          slug: "welcome",
          title: "Welcome to AutoPromote",
          date: "2026-01-02",
          content:
            "# Welcome to AutoPromote\n\nWe're excited to share a publishing platform focused on connected uploads, scheduling, analytics, and practical workflow improvements. This blog will feature product updates, release notes, and honest guidance about what is live, what depends on your setup, and what is still evolving.\n",
        },
        {
          slug: "release-2026-01",
          title: "January 2026 Release",
          date: "2026-01-02",
          content:
            "# January 2026 Release\n\nThis release includes improved scheduling, clearer platform-status handling, and product messaging that better matches the platform's current capabilities.\n",
        },
      ];
      var o = s(579);
      const r = e => {
          let { md: t } = e;
          if (!t) return null;
          const s = t.split(/\r?\n/),
            n = [];
          return (
            s.forEach(e => {
              /^#\s+/.test(e)
                ? n.push(`<h1>${e.replace(/^#\s+/, "")}</h1>`)
                : /^##\s+/.test(e)
                  ? n.push(`<h2>${e.replace(/^##\s+/, "")}</h2>`)
                  : "" === e.trim()
                    ? n.push("<p></p>")
                    : n.push(`<p>${e}</p>`);
            }),
            (0, o.jsx)("div", { dangerouslySetInnerHTML: { __html: n.join("") } })
          );
        },
        i = () => {
          const e = (0, n.zy)().pathname.replace(/^\/blog\/?/, "");
          if (e) {
            const t = a.find(t => t.slug === e);
            return t
              ? (0, o.jsxs)("div", {
                  style: { padding: 24, maxWidth: 900, margin: "0 auto" },
                  children: [
                    (0, o.jsx)(l.N_, { to: "/blog", children: "\u2190 Back to Blog" }),
                    (0, o.jsx)("h1", { children: t.title }),
                    (0, o.jsx)("small", { children: t.date }),
                    (0, o.jsx)(r, { md: t.content }),
                  ],
                })
              : (0, o.jsx)("div", { style: { padding: 24 }, children: "Post not found." });
          }
          return (0, o.jsxs)("div", {
            style: { padding: 24, maxWidth: 900, margin: "0 auto" },
            children: [
              (0, o.jsx)("h1", { children: "Blog" }),
              (0, o.jsx)("p", { children: "Read the latest updates from the AutoPromote team." }),
              (0, o.jsx)("ul", {
                children: a.map(e =>
                  (0, o.jsx)(
                    "li",
                    {
                      children: (0, o.jsxs)(l.N_, {
                        to: `/blog/${e.slug}`,
                        children: [e.title, " \u2014 ", e.date],
                      }),
                    },
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
//# sourceMappingURL=976.f85e46b1.chunk.js.map
