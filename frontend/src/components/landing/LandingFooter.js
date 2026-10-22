import PublicFooter from "../public/PublicFooter";
import LandingIcon from "./LandingIcon";

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
  return <PublicFooter />;
}
