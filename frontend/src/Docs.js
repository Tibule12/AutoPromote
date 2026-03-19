import React from "react";
import { useLocation, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import docs from "./docs/content";
import PublicFeatureAvailability from "./components/PublicFeatureAvailability";

const MarkdownRenderer = ({ md }) => {
  if (!md) return null;
  return <ReactMarkdown>{md}</ReactMarkdown>;
};

const Docs = () => {
  const location = useLocation();
  const path = location.pathname;
  const slug = path.replace(/^\/docs\/?/, "");

  if (slug) {
    const doc = docs.find(d => d.slug === slug);
    if (!doc) return <div style={{ padding: 24 }}>Document not found.</div>;
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <Link to="/docs">&larr; Back to Docs</Link>
        <h1>{doc.title}</h1>
        <MarkdownRenderer md={doc.content} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Documentation</h1>
      <p>Welcome to the AutoPromote documentation. Choose a topic below.</p>
      <p>
        These docs focus on the current product: connected publishing, scheduling, analytics,
        editing workflows, and the current monetization posture.
      </p>
      <PublicFeatureAvailability
        title="Before You Dive In"
        intro="Use this snapshot to separate supported workflows from environment-dependent or retired behavior before following the guides below."
      />
      <ul>
        {docs.map(d => (
          <li key={d.slug}>
            <Link to={`/docs/${d.slug}`}>{d.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Docs;
