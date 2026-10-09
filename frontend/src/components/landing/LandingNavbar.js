import { useState } from "react";
import LandingIcon from "./LandingIcon";

export const LANDING_SECTIONS = [
  ["The Workspace", "workspace"],
  ["Features", "features"],
  ["Product Tour", "workflow"],
];

// HashRouter owns URL hashes. Section buttons scroll without replacing the route.
export function scrollToLandingSection(id) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

export function LandingBrand() {
  return (
    <a className="lp-brand" href="/#/" aria-label="AutoPromote home">
      <span className="lp-brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="24" height="24" fill="none" focusable="false">
          <path d="M5 25 16 7l11 18M10 21h12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span>
        AutoPromote<span className="lp-brand-dot">.</span>
      </span>
    </a>
  );
}

export default function LandingNavbar({ onGetStarted, onSignIn }) {
  const [open, setOpen] = useState(false);
  const goToSection = id => {
    scrollToLandingSection(id);
    setOpen(false);
  };
  return (
    <header
      className="lp-navbar"
      onKeyDown={event => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          document.querySelector(".lp-menu-button")?.focus();
        }
      }}
    >
      <LandingBrand />
      <nav
        className={`lp-navigation ${open ? "is-open" : ""}`}
        id="landing-navigation"
        aria-label="Primary"
      >
        {LANDING_SECTIONS.map(([label, id]) => (
          <button key={id} type="button" onClick={() => goToSection(id)}>
            {label}
          </button>
        ))}
        <a href="/#/pricing">Pricing</a>
      </nav>
      <div className="lp-nav-actions">
        <button className="lp-sign-in" type="button" onClick={onSignIn}>
          Sign In
        </button>
        <button
          className="lp-button lp-button-primary lp-nav-cta"
          type="button"
          onClick={onGetStarted}
        >
          Start Creating <LandingIcon name="arrow" />
        </button>
        <button
          className="lp-menu-button"
          type="button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="landing-navigation"
          onClick={() => setOpen(!open)}
        >
          <LandingIcon name={open ? "close" : "menu"} />
        </button>
      </div>
    </header>
  );
}
