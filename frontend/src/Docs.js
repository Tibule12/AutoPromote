import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import ReactMarkdown from "react-markdown";
import { API_BASE_URL } from "./config";
import PublicPage, { PageCard } from "./components/public/PublicPage";
import docs from "./docs/content";

const DOC_BASE = "https://autopromote-docs.invalid/";
// The generated reference uses explicit stable anchors. Accept only this exact
// empty-anchor form; other raw HTML keeps ReactMarkdown's default treatment.
export function guideAnchorPlugin() {
  return tree => {
    const visit = node => {
      if (node.type === "raw") {
        const match = node.value.match(/^<a id="([a-z0-9_-]{1,160})"><\/a>$/i);
        if (match)
          Object.assign(node, {
            type: "element",
            tagName: "span",
            properties: { id: match[1] },
            children: [],
          });
      }
      // Inline HTML is parsed as two adjacent raw nodes by remark-rehype.
      node.children?.forEach((child, index, children) => {
        const match = child.type === "raw" && child.value.match(/^<a id="([a-z0-9_-]{1,160})">$/i);
        const next = children[index + 1];
        if (match && next?.type === "raw" && next.value === "</a>") {
          Object.assign(child, {
            type: "element",
            tagName: "span",
            properties: { id: match[1] },
            children: [],
          });
          Object.assign(next, { type: "text", value: "" });
        }
      });
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
export function documentFile(slug) {
  const topic = docs.find(d => d.slug === slug);
  const file = topic?.file || (slug ? `${slug}.md` : null);
  return file && file.length <= 200 && /^[a-z0-9_/-]+\.md$/.test(file) && !file.includes("..")
    ? file
    : null;
}
export function documentationLink(href, file) {
  try {
    const url = new URL(href, new URL(file, DOC_BASE));
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    if (url.origin !== new URL(DOC_BASE).origin) return { href: url.href };
    const path = url.pathname.slice(1);
    if (path.endsWith(".md") && documentFile(path.slice(0, -3)))
      return { to: `/docs/${path.slice(0, -3)}${url.hash}` };
    if (/^[a-z0-9_./-]+\.(json|jsonl)$/.test(path) && !path.includes(".."))
      return { href: `${API_BASE_URL}/api/product-assistance/docs/${path}` };
  } catch (_) {
    /* Malformed document links remain plain text. */
  }
  return null;
}

export default function Docs() {
  const location = useLocation();
  const slug = location.pathname.replace(/^\/docs\/?/, "");
  const file = documentFile(slug);
  const [state, setState] = useState({ file: null, text: "", error: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!slug || !file) return undefined;
    const controller = new AbortController();
    setState({ file, text: "", error: "" });
    fetch(`${API_BASE_URL}/api/product-assistance/docs/${file}`, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
    })
      .then(async response => {
        if (!response.ok)
          throw Error(
            response.status === 404
              ? "This guide could not be found."
              : "The documentation is unavailable right now."
          );
        const text = await response.text();
        if (!controller.signal.aborted) setState({ file, text, error: "" });
      })
      .catch(error => {
        if (!controller.signal.aborted)
          setState({ file, text: "", error: error.message || "The guide could not be loaded." });
      });
    return () => controller.abort();
  }, [slug, file, retry]);
  const current = state.file === file ? state : { text: "", error: "" };
  useEffect(() => {
    if (!current.text || !location.hash) return undefined;
    let id;
    try {
      id = decodeURIComponent(location.hash.slice(1));
    } catch (_) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [current.text, location.hash]);
  const topic = docs.find(d => d.slug === slug || d.file === file);
  const title = slug
    ? current.text.match(/^#\s+(.+)/m)?.[1] || topic?.title || "Product guide"
    : "A clearer path from edit to release.";
  return (
    <PublicPage
      eyebrow="LEARN / PRODUCT DOCUMENTATION"
      title={title}
      intro={
        slug
          ? "The current product guide, served from AutoPromote’s reviewed documentation."
          : "Start with the workflow you need. These guides use the same product knowledge as AutoPromote’s help system."
      }
    >
      {!slug ? (
        <>
          <div className="public-grid public-grid-two">
            {docs.map(d => (
              <PageCard key={d.slug} title={d.title} to={`/docs/${d.slug}`} link="Open guide">
                <p>{d.description}</p>
              </PageCard>
            ))}
          </div>
          <div className="public-callout">
            Choose a guide for the task, then check the available options in your account. Editing
            access, processing costs and connected-platform permissions can vary.
          </div>
        </>
      ) : (
        <>
          <Link className="public-back" to="/docs">
            ← All guides
          </Link>
          {!file ? (
            <div role="alert" className="public-callout">
              This guide could not be found.
            </div>
          ) : current.error ? (
            <div className="public-callout" role="alert">
              <p>{current.error}</p>
              <button className="public-button" type="button" onClick={() => setRetry(v => v + 1)}>
                Try again
              </button>
            </div>
          ) : !current.text ? (
            <p role="status">Loading the guide…</p>
          ) : (
            <article className="public-prose">
              <ReactMarkdown
                rehypePlugins={[guideAnchorPlugin]}
                components={{
                  a: ({ href, children }) => {
                    const target = documentationLink(href, file);
                    return target?.to ? (
                      <Link to={target.to}>{children}</Link>
                    ) : target?.href ? (
                      <a href={target.href} target="_blank" rel="noopener noreferrer">
                        {children}
                      </a>
                    ) : (
                      <span>{children}</span>
                    );
                  },
                }}
              >
                {current.text.replace(/^#\s+[^\n]+\n/, "")}
              </ReactMarkdown>
            </article>
          )}
        </>
      )}
    </PublicPage>
  );
}
