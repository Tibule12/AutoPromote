import LandingIcon from "./LandingIcon";

export default function HeroSection({ onGetStarted, onWatchDemo }) {
  return (
    <section className="lp-editorial-hero" aria-labelledby="landing-headline">
      <div className="lp-editorial-hero-copy">
        <p className="lp-eyebrow">
          <i aria-hidden="true" /> THE CREATOR’S CUTTING ROOM
        </p>
        <h1 id="landing-headline">
          One recording.
          <br />
          More <em>great clips.</em>
        </h1>
        <p className="lp-editorial-intro">
          Find promising moments with AI. Edit the timing, framing, captions and sound in Studio.
          Prepare each clip for your connected social channels.
        </p>
        <div className="lp-hero-actions">
          <button className="lp-button lp-button-primary" type="button" onClick={onGetStarted}>
            Start Creating <LandingIcon name="arrow" />
          </button>
          <button className="lp-editorial-demo" type="button" onClick={onWatchDemo}>
            <span>
              <LandingIcon name="play" />
            </span>{" "}
            Watch Demo <small>36 sec</small>
          </button>
        </div>
        <p className="lp-editorial-account">
          Free account to start. Your creative decisions, throughout.
        </p>
        <div className="lp-editorial-tools" aria-label="Your creative workflow">
          <span>Find the moment</span>
          <i aria-hidden="true">/</i>
          <span>Make the cut</span>
          <i aria-hidden="true">/</i>
          <span>Share the story</span>
        </div>
      </div>
      <figure className="lp-editorial-hero-visual">
        <div className="lp-editorial-source">
          <img
            src="/landing/podcast-conversation.webp"
            alt="Two speakers in a podcast recording session"
            width="1920"
            height="1080"
            fetchPriority="high"
          />
          <div className="lp-editorial-source-label">
            <span>THE CONVERSATION</span>
            <span>01 / SOURCE</span>
          </div>
          <div className="lp-editorial-cut-mark" aria-hidden="true" />
        </div>
        <div className="lp-editorial-edit">
          <div className="lp-editorial-edit-label">
            <span>
              <i aria-hidden="true" /> AUTOPROMOTE STUDIO
            </span>
            <span>02 / THE EDIT</span>
          </div>
          <img
            src="/landing/workspace-studio.png"
            alt="Actual AutoPromote Studio showing source comparison, reframing controls, video timeline and original audio"
            width="1600"
            height="900"
            fetchPriority="high"
          />
        </div>
        <figcaption>
          One conversation. A whole new creative direction.
          <span>Actual editor · Sample project</span>
        </figcaption>
      </figure>
    </section>
  );
}
