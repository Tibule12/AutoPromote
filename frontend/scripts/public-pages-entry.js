import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import About from "../src/About";
import Contact from "../src/Contact";
import { FOOTER_GROUPS } from "../src/components/public/PublicFooter";
import InformationPage from "../src/components/public/InformationPage";
import HelpCenter from "../src/HelpCenter";
import Docs from "../src/Docs";
import Blog from "../src/Blog";
import Changelog from "../src/Changelog";
import guides from "../src/docs/content";
import posts from "../src/blog/posts";

export const footerRoutes = FOOTER_GROUPS.flatMap(([, links]) => links.map(([, route]) => route));
export const nestedRoutes = [
  ...guides.map(guide => `/docs/${guide.slug}`),
  ...guides.filter(guide => guide.file).map(guide => `/docs/${guide.file.replace(/\.md$/, "")}`),
  ...posts.map(post => `/blog/${post.slug}`),
  "/support",
  "/forgot-password",
  "/reset-password",
];

// Use the same components as the application, with no duplicate page copy.
export function renderPublicPage(route) {
  const components = {
    "/about": About,
    "/contact": Contact,
    "/help": HelpCenter,
    "/docs": Docs,
    "/blog": Blog,
    "/changelog": Changelog,
  };
  const info = {
    "/features": "features",
    "/integrations": "integrations",
    "/metrics": "metrics",
    "/careers": "careers",
    "/partners": "partners",
    "/api-docs": "api",
    "/security": "security",
    "/accessibility": "accessibility",
    "/cookies": "cookies",
  };
  const Page =
    components[route] ||
    (info[route]
      ? () => <InformationPage page={info[route]} />
      : route.startsWith("/blog/")
        ? Blog
        : null);
  if (!Page) return null;
  return renderToStaticMarkup(
    <StaticRouter location={route}>
      <Page />
    </StaticRouter>
  );
}
