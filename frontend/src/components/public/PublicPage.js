import React, { useEffect } from "react";
import { Link } from "react-router";
import AutoPromoteLogo from "../AutoPromoteLogo";
import PlatformIcon from "../PlatformIcon";
import PublicFooter from "./PublicFooter";
import "./PublicPage.css";

export function PageCard({ title, children, to, link = "Read the guide", platform, number }) {
  return (
    <section className="public-card">
      {platform ? (
        <PlatformIcon platform={platform} />
      ) : number ? (
        <span className="public-card-number" aria-hidden="true">
          {number}
        </span>
      ) : null}
      <h2>{title}</h2>
      <div>{children}</div>
      {to && (
        <Link className="public-text-link" to={to}>
          {link} <span aria-hidden="true">↗</span>
        </Link>
      )}
    </section>
  );
}

export default function PublicPage({
  eyebrow,
  title,
  intro,
  children,
  wide = false,
  pageType = "",
  next = false,
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | AutoPromote`;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    return () => {
      document.title = previous;
    };
  }, [title]);
  return (
    <div
      className={`public-site${wide ? " public-site-wide" : ""}${pageType ? ` public-site-${pageType}` : ""}`}
    >
      <a
        className="public-skip"
        href="#public-main"
        onClick={event => {
          event.preventDefault();
          const main = document.getElementById("public-main");
          main?.focus();
          main?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <header className="public-topbar">
        <Link to="/" aria-label="AutoPromote home">
          <AutoPromoteLogo />
        </Link>
        <nav aria-label="Site navigation">
          <Link to="/features">Product</Link>
          <Link to="/docs">Learn</Link>
          <Link to="/contact">Contact</Link>
          <Link className="public-button" to="/">
            Explore AutoPromote <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>
      <main id="public-main" tabIndex={-1}>
        <header className="public-hero">
          <p className="public-eyebrow">{eyebrow || "AUTOPROMOTE / THE DETAILS"}</p>
          <h1>{title}</h1>
          {intro && <p className="public-intro">{intro}</p>}
          <div className="public-hero-line" aria-hidden="true">
            <span />
          </div>
        </header>
        <div className="public-body">{children}</div>
        {next && (
          <aside className="public-next">
            <div>
              <p className="public-eyebrow">FROM AN IDEA TO ITS NEXT AUDIENCE</p>
              <h2>See where your work can go.</h2>
            </div>
            <Link className="public-button" to="/">
              Explore AutoPromote <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
