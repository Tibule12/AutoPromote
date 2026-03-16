import React from "react";
import "./WelcomePage.css";
import Footer from "./components/Footer";
import PublicFeatureAvailability from "./components/PublicFeatureAvailability";

const Section = ({ id, title, children }) => (
  <section id={id} className="hp-section">
    <h2 className="hp-section-title">{title}</h2>
    <div className="hp-section-body">{children}</div>
  </section>
);

const WelcomePage = ({ onGetStarted, onSignIn }) => {
  return (
    <div className="new-welcome-root">
      <div className="new-welcome-bg-gradient" />
      <main className="new-welcome-content hp-container">
        <header className="hp-header">
          <div className="hp-brand">
            <a href="/" aria-label="Home">
              <img src="/image.png" alt="AutoPromote Logo" className="new-welcome-logo" />
            </a>
            <div>
              <h1 className="new-welcome-title">AutoPromote</h1>
              <p className="new-welcome-tagline-small">
                Cross-platform publishing control for creators who need clarity.
              </p>
              <p
                className="new-welcome-subline"
                style={{ marginTop: "0.5rem", opacity: 0.9, fontSize: "1.1rem" }}
              >
                Upload once, publish deliberately, track what happened, and learn what to improve.
              </p>
            </div>
          </div>

          <div className="new-welcome-cta">
            <button
              className="new-welcome-btn primary"
              onClick={onGetStarted}
              aria-label="Get Started"
            >
              Get Started
            </button>
            <button className="new-welcome-btn" onClick={onSignIn} aria-label="Sign In">
              Sign In
            </button>
          </div>
        </header>

        <div className="hp-main">
          <Section id="what-is" title="What is AutoPromote?">
            <p>
              AutoPromote is a cross-platform publishing control layer for creators and teams who
              already publish content and want a cleaner way to manage distribution.
            </p>
            <p>
              Instead of repeating the same workflow on every native platform, AutoPromote helps you
              upload once, choose your destinations, track publishing state, and make better
              decisions from one dashboard.
            </p>
            <p
              className="highlight-text"
              style={{
                fontWeight: 500,
                marginTop: "1rem",
                borderLeft: "3px solid var(--primary)",
                paddingLeft: "1rem",
              }}
            >
              AutoPromote helps creators test, learn, and improve content performance using real
              outcomes — not assumptions.
            </p>
          </Section>

          <Section id="philosophy" title="Core Philosophy">
            <ul className="hp-list">
              <li>Test before you scale</li>
              <li>Learn from real outcomes, not assumptions</li>
              <li>Improve presentation before amplification</li>
              <li>Every action requires explicit user consent</li>
              <li>Confidence comes from evidence, not promises</li>
            </ul>
            <p className="muted">
              AutoPromote does not guarantee virality. It guarantees smarter attempts and clearer
              learning.
            </p>
          </Section>

          <Section id="how-it-works" title="How It Works">
            <p style={{ marginBottom: "1.5rem", fontStyle: "italic" }}>
              Every publishing action starts from your chosen platforms and settings. AutoPromote
              does not push content anywhere until you submit it for those destinations.
            </p>
            <ol className="hp-steps">
              <li>
                <strong>Upload Once</strong>
                <p>
                  Upload original content once, choose the platforms you want, and decide whether it
                  should go out now or on a schedule.
                </p>
                <p className="small-note" style={{ fontSize: "0.9em", color: "#666" }}>
                  AutoPromote handles queueing, scheduling, and status tracking after you confirm
                  the upload.
                </p>
              </li>
              <li>
                <strong>Observe Performance</strong>
                <p>
                  After publishing, the dashboard tracks status, connected platform health, and the
                  analytics signals we can actually collect from linked accounts and platform post
                  records.
                </p>
              </li>
              <li>
                <strong>Improve When Needed</strong>
                <p>
                  Use the editor, caption helpers, and clip tools to improve packaging when a post
                  needs a stronger hook, clearer formatting, or a better platform fit.
                </p>
                <p>
                  AI assistance is optional and currently focused on captioning, clip generation,
                  and formatting support rather than fully rewriting your content automatically.
                </p>
              </li>
              <li>
                <strong>Learn & Compare</strong>
                <p>
                  AutoPromote brings your publishing history, platform responses, and available
                  analytics into one workflow so you can compare what worked and what to try next.
                </p>
                <div style={{ marginLeft: "1rem", marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                  • what improved
                  <br />
                  • what didn’t
                  <br />• what to try next
                </div>
                <p>The goal is learning, not guessing.</p>
              </li>
            </ol>
          </Section>

          <Section id="today" title="What Works Today">
            <ul className="hp-list">
              <li>Upload, queue, and schedule content across connected platforms</li>
              <li>Track publishing state, worker health, and platform connection status</li>
              <li>Review analytics and post-performance data that linked platforms expose</li>
              <li>Use built-in editing, clip, caption, and formatting tools before publishing</li>
              <li>Download your uploaded media and review publish history from the dashboard</li>
            </ul>
            <p className="muted">
              Some integrations and automation paths are still feature-gated or account-dependent,
              so AutoPromote only promises what your connected platforms and current plan support.
            </p>
            <p className="muted">
              If you only need one native platform, its own tools may be enough. AutoPromote is most
              useful when repeating the workflow across multiple destinations becomes the real
              bottleneck.
            </p>
          </Section>

          <Section id="not" title="What AutoPromote Is NOT">
            <ul className="hp-list">
              <li>Not an ad platform</li>
              <li>Not a guarantee of reach or virality</li>
              <li>Not a replacement for creativity</li>
              <li>Not automation without permission</li>
            </ul>
            <p className="muted">
              AutoPromote is a learning and optimization layer built on top of existing platforms.
            </p>
          </Section>

          <Section id="trust" title="User Trust & Consent">
            <ul className="hp-list">
              <li>No content is published without explicit user approval</li>
              <li>AI-assisted variations are optional and opt-in</li>
              <li>Testing and scheduling behavior is transparent</li>
              <li>All actions align with external platform policies</li>
            </ul>
          </Section>

          <Section id="who-is-it-for" title="Who AutoPromote Is For">
            <p>AutoPromote is for creators and teams who:</p>
            <ul className="hp-list" style={{ marginTop: "0.5rem" }}>
              <li>already publish content regularly</li>
              <li>reuse the same core asset across several platforms</li>
              <li>want clearer feedback before scaling or boosting</li>
              <li>care about learning and consistency, not one-off virality</li>
            </ul>
            <p className="muted" style={{ marginTop: "1rem" }}>
              It is not built for spam, mass posting, or shortcut growth.
            </p>
          </Section>

          <PublicFeatureAvailability
            title="Availability Snapshot"
            intro="A quick view of which parts of AutoPromote are live now, which depend on your setup, and which should not be treated as active promises."
          />

          <Section id="growth" title="Growth & Amplification (Future-Ready)">
            <p>
              AutoPromote is designed so that stronger promotion decisions happen{" "}
              <strong>after</strong> you have evidence from real posts, real audiences, and real
              platform responses.
            </p>
            <p>
              Additional amplification features should stay optional, transparent, and tied to
              performance data rather than broad “push everywhere” automation.
            </p>
          </Section>

          <Section id="why" title="Why This Matters">
            <p>
              Most creators fail not because their content is bad, but because they don’t know{" "}
              <strong>what part failed</strong>. AutoPromote reduces guesswork and replaces it with
              insight.
            </p>
            <p>
              Every upload should have a fairer chance, teach the creator something useful, and
              increase confidence over time.
            </p>
          </Section>

          <footer className="hp-footer">
            <h3 className="hp-northstar">
              "Every upload should give the creator a better chance and a clearer lesson than the
              last one."
            </h3>
            <div className="hp-footer-ctas">
              <button
                className="new-welcome-btn primary"
                onClick={onGetStarted}
                aria-label="Get Started"
              >
                Get Started
              </button>
              <button className="new-welcome-btn" onClick={onSignIn} aria-label="Sign In">
                Sign In
              </button>
            </div>
            <Footer />
          </footer>
        </div>
      </main>
    </div>
  );
};

export default WelcomePage;
