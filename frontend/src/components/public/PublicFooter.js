import React, { useState } from "react";
import { Link } from "react-router";
import AutoPromoteLogo from "../AutoPromoteLogo";
import NewsletterSubscribe from "../NewsletterSubscribe";
import "./PublicPage.css";

export const FOOTER_GROUPS = [
  [
    "Product",
    [
      ["Features", "/features"],
      ["Integrations", "/integrations"],
      ["Analytics", "/metrics"],
      ["Pricing", "/pricing"],
      ["Changelog", "/changelog"],
    ],
  ],
  [
    "Resources",
    [
      ["Documentation", "/docs"],
      ["Help Center", "/help"],
      ["Blog", "/blog"],
      ["API Access", "/api-docs"],
    ],
  ],
  [
    "Company",
    [
      ["About Us", "/about"],
      ["Contact", "/contact"],
      ["Careers", "/careers"],
      ["Partners", "/partners"],
    ],
  ],
  [
    "Legal",
    [
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Cookie Policy", "/cookies"],
      ["Security", "/security"],
      ["Accessibility", "/accessibility"],
    ],
  ],
];

export default function PublicFooter({ newsletter = false }) {
  const [subscribe, setSubscribe] = useState(false);
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="site-footer-brand">
          <Link to="/" aria-label="AutoPromote home">
            <AutoPromoteLogo />
          </Link>
          <p>
            Make something worth watching.
            <br />
            Give it a place to go.
          </p>
          {newsletter && (
            <>
              <p>Subscribe to our newsletter for product updates.</p>
              <button
                type="button"
                onClick={() => setSubscribe(v => !v)}
                aria-expanded={subscribe}
                aria-controls="footer-newsletter"
              >
                Subscribe
              </button>
            </>
          )}
        </div>
        {FOOTER_GROUPS.map(([title, links]) => (
          <nav key={title} aria-label={`Footer ${title.toLowerCase()}`}>
            <h2>{title}</h2>
            {links.map(([label, to]) => (
              <Link key={to} to={to}>
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      {subscribe && (
        <div id="footer-newsletter" className="site-footer-newsletter">
          <NewsletterSubscribe />
        </div>
      )}
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} AutoPromote. All rights reserved.</span>
        <Link to="/contact">
          Built around your next creation <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </footer>
  );
}
