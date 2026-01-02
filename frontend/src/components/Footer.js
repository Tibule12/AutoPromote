import React from "react";
import "./Footer.css";
import { PUBLIC_SITE_URL } from "../config";

const Icon = ({ name }) => {
  if (name === "github")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.1-3.2.7-3.88-1.4-3.88-1.4-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.96.1-.75.4-1.25.73-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.17-3.1-.12-.29-.51-1.45.11-3.03 0 0 .95-.3 3.12 1.18a10.8 10.8 0 0 1 2.84-.38c.96 0 1.93.13 2.84.38 2.17-1.48 3.12-1.18 3.12-1.18.62 1.58.23 2.74.11 3.03.73.81 1.17 1.84 1.17 3.1 0 4.43-2.71 5.4-5.29 5.68.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.79.55A11.52 11.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
      </svg>
    );
  if (name === "twitter")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M22 5.92c-.66.3-1.36.5-2.07.59.75-.45 1.32-1.16 1.59-2.01-.7.42-1.48.72-2.31.89A4.05 4.05 0 0 0 16.5 4c-2.23 0-4.03 1.8-4.03 4.02 0 .32.04.63.11.93C8.3 9.8 5.1 7.92 2.9 5.05c-.35.6-.55 1.3-.55 2.05 0 1.41.72 2.66 1.82 3.39-.66-.02-1.28-.2-1.82-.5v.05c0 1.97 1.4 3.62 3.27 4-.34.09-.7.14-1.07.14-.26 0-.52-.02-.77-.07.52 1.6 2.02 2.77 3.8 2.8A8.12 8.12 0 0 1 2 19.54 11.46 11.46 0 0 0 8.29 21c7.55 0 11.68-6.26 11.68-11.68v-.53A8.18 8.18 0 0 0 22 5.92z" />
      </svg>
    );
  if (name === "linkedin")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M4.98 3.5C3.88 3.5 3 4.38 3 5.5s.88 2 1.98 2h.02C6.1 7.5 7 6.62 7 5.5S6.1 3.5 4.98 3.5zM3.5 9h3v11h-3V9zm5.5 0h2.88v1.5h.04c.4-.75 1.38-1.5 2.84-1.5 3.04 0 3.6 2.01 3.6 4.63V20h-3v-4.92c0-1.17-.02-2.68-1.63-2.68-1.63 0-1.88 1.27-1.88 2.58V20h-3V9z" />
      </svg>
    );
  return null;
};

const Footer = () => {
  const site = PUBLIC_SITE_URL || "https://autopromote.org";
  return (
    <footer className="ap-footer" role="contentinfo">
      <div className="ap-footer-main">
        <div className="ap-footer-left">
          <div className="ap-logo" aria-label="AutoPromote logo">
            AutoPromote
          </div>
          <nav className="ap-footer-links" aria-label="Footer primary links">
            <a href={`${site}/docs`} target="_blank" rel="noopener noreferrer">
              Docs
            </a>
            <span className="dot">•</span>
            <a href={`${site}/blog`} target="_blank" rel="noopener noreferrer">
              Blog
            </a>
            <span className="dot">•</span>
            <a href={`${site}/about`} target="_blank" rel="noopener noreferrer">
              About
            </a>
            <span className="dot">•</span>
            <a href={`${site}/contact`} target="_blank" rel="noopener noreferrer">
              Contact
            </a>
            <span className="dot">•</span>
            <a href={`${site}/terms`} target="_blank" rel="noopener noreferrer">
              Terms of Service
            </a>
            <span className="dot">•</span>
            <a href={`${site}/privacy`} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </nav>
        </div>

        <div className="ap-footer-right">
          <div className="ap-social" aria-label="Follow AutoPromote">
            <a
              href="https://github.com/AutoPromote"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
            >
              <Icon name="github" />
            </a>
            <a
              href="https://twitter.com/AutoPromote"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Twitter"
            >
              <Icon name="twitter" />
            </a>
            <a
              href="https://www.linkedin.com/company/autopromote"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
            >
              <Icon name="linkedin" />
            </a>
          </div>
          <div className="ap-extra">
            <a
              className="ap-status"
              href="https://status.autopromote.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Status
            </a>
            <button
              type="button"
              className="ap-back-to-top"
              onClick={() => {
                if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              aria-label="Back to top"
            >
              ↑
            </button>
          </div>
        </div>
      </div>

      <div className="ap-footer-copy">
        © {new Date().getFullYear()} AutoPromote. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
