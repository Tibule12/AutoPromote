import React from "react";
import docs from "./docs/content";

const MarkdownRenderer = ({ md }) => {
  if (!md) return null;
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  lines.forEach(l => {
    if (/^#\s+/.test(l)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h1>${l.replace(/^#\s+/, "")}</h1>`);
    } else if (/^##\s+/.test(l)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h2>${l.replace(/^##\s+/, "")}</h2>`);
    } else if (/^-\s+/.test(l)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${l.replace(/^-\s+/, "")}</li>`);
    } else if (l.trim() === "") {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<p></p>`);
    } else {
      out.push(`<p>${l}</p>`);
    }
  });
  if (inList) out.push("</ul>");
  return <div dangerouslySetInnerHTML={{ __html: out.join("") }} />;
};

const Docs = () => {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/docs";
  const slug = pathname.replace(/^\/docs\/?/, "");
  if (slug) {
    const doc = docs.find(d => d.slug === slug);
    if (!doc) return <div style={{ padding: 24 }}>Document not found.</div>;
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1>{doc.title}</h1>
        <MarkdownRenderer md={doc.content} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Documentation</h1>
      <p>Welcome to the AutoPromote documentation. Choose a topic below.</p>
      <ul>
        {docs.map(d => (
          <li key={d.slug}>
            <a href={`/docs/${d.slug}`}>{d.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Docs;
