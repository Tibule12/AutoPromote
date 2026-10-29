import React from "react";
import { Link, useLocation } from "react-router";
import ReactMarkdown from "react-markdown";
import PublicPage, { PageCard } from "./components/public/PublicPage";
import posts from "./blog/posts";

export default function Blog() {
  const slug = useLocation().pathname.replace(/^\/blog\/?/, "");
  const post = posts.find(p => p.slug === slug);
  return (
    <PublicPage
      eyebrow="NOTES / MAKING & RELEASING"
      title={
        slug
          ? post?.title || "That article could not be found."
          : "AutoPromote blog"
      }
      intro={
        slug
          ? post?.date
          : "Practical notes on editing, packaging and learning from what you publish."
      }
    >
      {slug ? (
        <>
          <Link className="public-back" to="/blog">
            ← All articles
          </Link>
          {post && (
            <article className="public-prose">
              <ReactMarkdown>{post.content.replace(/^#\s+[^\n]+\n/, "")}</ReactMarkdown>
            </article>
          )}
        </>
      ) : (
        <div className="public-grid public-grid-two">
          {posts.map(p => (
            <PageCard key={p.slug} title={p.title} to={`/blog/${p.slug}`} link="Read article">
              <p className="public-section-label">{p.date}</p>
              <p>{p.excerpt || "An earlier note from the AutoPromote team."}</p>
            </PageCard>
          ))}
        </div>
      )}
    </PublicPage>
  );
}
