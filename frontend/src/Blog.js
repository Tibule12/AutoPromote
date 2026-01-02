import React from "react";
import posts from "./blog/posts";

const MarkdownRenderer = ({ md }) => {
  if (!md) return null;
  const lines = md.split(/\r?\n/);
  const out = [];
  lines.forEach(l => {
    if (/^#\s+/.test(l)) out.push(`<h1>${l.replace(/^#\s+/, "")}</h1>`);
    else if (/^##\s+/.test(l)) out.push(`<h2>${l.replace(/^##\s+/, "")}</h2>`);
    else if (l.trim() === "") out.push(`<p></p>`);
    else out.push(`<p>${l}</p>`);
  });
  return <div dangerouslySetInnerHTML={{ __html: out.join("") }} />;
};

const Blog = () => {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/blog";
  const slug = pathname.replace(/^\/blog\/?/, "");
  if (slug) {
    const post = posts.find(p => p.slug === slug);
    if (!post) return <div style={{ padding: 24 }}>Post not found.</div>;
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
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
            <a href={`/blog/${p.slug}`}>
              {p.title} — {p.date}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Blog;
