import LandingIcon from "./LandingIcon";
import { scrollToLandingSection } from "./LandingNavbar";

export default function DirectorShowcase() {
  return (
    <section
      className="lp-section lp-director-section"
      id="director"
      aria-labelledby="director-heading"
    >
      <div className="lp-director-copy">
        <p className="lp-eyebrow">MEET YOUR AI DIRECTOR</p>
        <h2 id="director-heading">
          Creative support.
          <br />
          <span>Creator in control.</span>
        </h2>
        <p>
          A second perspective on your project. Review split and trim suggestions, see what will
          change, and approve the edits that serve your story.
        </p>
        <p className="lp-director-principle">
          <LandingIcon name="check" /> Every proposed edit starts with your review.
        </p>
        <button
          type="button"
          className="lp-text-button"
          onClick={() => scrollToLandingSection("workflow")}
        >
          See the creative workflow <LandingIcon name="arrow" />
        </button>
      </div>
      <div
        className="lp-director-visual"
        aria-label="Project context feeds AI Director split and trim suggestions for human review"
      >
        <div className="lp-director-inputs">
          <span>PROJECT CONTEXT</span>
          <div>
            <i>Dialogue</i>
            <i>Shots</i>
            <i>Speakers</i>
            <i>Audio</i>
            <i>Moments</i>
            <i>Captions</i>
          </div>
        </div>
        <div className="lp-director-core">
          <div className="lp-core-ring" aria-hidden="true" />
          <LandingIcon name="spark" />
          <strong>AI Director</strong>
          <span>Understand. Suggest. Review.</span>
        </div>
        <div className="lp-director-plan">
          <div>
            <span>PROPOSED EDITS</span>
            <b>For your review</b>
          </div>
          <p>
            <LandingIcon name="cut" />
            <span>Split at a chosen moment</span>
            <em>Review</em>
          </p>
          <p>
            <LandingIcon name="cut" />
            <span>Trim the clip edges</span>
            <em>Review</em>
          </p>
          <div className="lp-director-manual">
            <span>CONTINUE IN THE EDITOR</span>
            <p>Reframe · Caption · B-roll · Zoom · Music · Social version</p>
            <small>Your tools. Your creative decisions.</small>
          </div>
        </div>
      </div>
    </section>
  );
}
