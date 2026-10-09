import LandingIcon from "./LandingIcon";
import { LandingBrand } from "./LandingNavbar";

export function LandingCTA({ onGetStarted }) {
  return (
    <section className="lp-final-cta" aria-labelledby="cta-heading">
      <span className="lp-cta-star" aria-hidden="true">
        <LandingIcon name="spark" />
      </span>
      <p className="lp-eyebrow">THE NEXT GREAT CLIP IS IN YOUR FOOTAGE.</p>
      <h2 id="cta-heading">
        Let’s make it <span className="lp-gradient-text">happen.</span>
      </h2>
      <p>Your perspective. Your voice. Your next creation.</p>
      <button type="button" className="lp-button lp-button-primary" onClick={onGetStarted}>
        Start Creating <LandingIcon name="arrow" />
      </button>
      <small>Free account to start · Paid creative tools and credit-based exports</small>
    </section>
  );
}

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-top">
        <div>
          <LandingBrand />
          <p>
            AI video editing.
            <br />
            Made for your next great story.
          </p>
        </div>
        <nav aria-label="Footer product">
          <span>PRODUCT</span>
          <a href="/#/features">Features</a>
          <a href="/#/pricing">Pricing</a>
          <a href="/#/docs">Documentation</a>
        </nav>
        <nav aria-label="Footer company">
          <span>AUTOPROMOTE</span>
          <a href="/#/about">About</a>
          <a href="/#/contact">Contact</a>
          <a href="/#/help">Help Center</a>
        </nav>
        <div className="lp-footer-end">
          <span>MADE TO CREATE.</span>
          <p>
            From a conversation
            <br />
            to a connection.
          </p>
        </div>
      </div>
      <div className="lp-footer-bottom">
        <span>© {new Date().getFullYear()} AutoPromote. All rights reserved.</span>
        <nav aria-label="Legal">
          <a href="/#/privacy">Privacy</a>
          <a href="/#/terms">Terms</a>
          <a href="/#/accessibility">Accessibility</a>
        </nav>
      </div>
    </footer>
  );
}
