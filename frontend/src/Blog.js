import React from "react";
import { useLocation, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import posts from "./blog/posts";

const MarkdownRenderer = ({ md }) => {
  if (!md) return null;
  return <ReactMarkdown>{md}</ReactMarkdown>;
};

const Blog = () => {
  const location = useLocation();
  // With HashRouter, location.pathname will be the path inside the hash (e.g. "/blog" or "/blog/post-1")
  const path = location.pathname;
  // Remove leading /blog and optional slash
  const slug = path.replace(/^\/blog\/?/, "");

  if (slug) {
    const post = posts.find(p => p.slug === slug);
    if (!post) return <div style={{ padding: 24 }}>Post not found.</div>;
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <Link to="/blog">&larr; Back to Blog</Link>
        <h1>{post.title}</h1>
        <small>{post.date}</small>
        <MarkdownRenderer md={post.content} />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Blog</h1>
      <p>Read the latest updates from the AutoPromote team.</p>
      <ul>
        {posts.map(p => (
          <li key={p.slug}>
            <Link to={`/blog/${p.slug}`}>
              {p.title} — {p.date}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Blog;
