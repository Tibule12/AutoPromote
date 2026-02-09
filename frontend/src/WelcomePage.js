import React from "react";
import "./WelcomePage.css";
import Footer from "./components/Footer";

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
                Turn every upload into a smarter decision.
              </p>
              <p
                className="new-welcome-subline"
                style={{ marginTop: "0.5rem", opacity: 0.9, fontSize: "1.1rem" }}
              >
                Test content performance before you scale it across platforms.
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
              AutoPromote is a content intelligence platform for creators and businesses who already
              publish content and want clearer signals before scaling it.
            </p>
            <p>
              Instead of blindly posting or promoting content everywhere, AutoPromote lets you run a
              controlled first publish, observe early performance, and improve presentation before
              wider amplification.
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
              Every step is opt-in. Nothing is published, tested, or changed without user approval.
            </p>
            <ol className="hp-steps">
              <li>
                <strong>Upload Once</strong>
                <p>
                  Users upload original content to AutoPromote and choose a single platform or
                  limited audience for an initial test publish.
                </p>
                <p className="small-note" style={{ fontSize: "0.9em", color: "#666" }}>
                  No mass distribution. No amplification. Just an early signal.
                </p>
              </li>
              <li>
                <strong>Observe Performance</strong>
                <p>
                  The platform monitors early performance during a short observation window
                  (typically 3–7 hours, depending on platform), focusing on initial engagement
                  signals such as retention, interaction, and response velocity.
                </p>
              </li>
              <li>
                <strong>Improve When Needed</strong>
                <p>
                  If content underperforms and the user has given consent, AutoPromote generates 1–2
                  optional AI-assisted variations.
                </p>
                <p>
                  These improvements focus on stronger hooks, better pacing, and platform-native
                  formatting — while preserving the creator’s original voice and intent.
                </p>
              </li>
              <li>
                <strong>Learn & Compare</strong>
                <p>
                  AutoPromote compares original performance against AI-assisted variations and
                  provides clear, human-readable feedback:
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
              <li>want clearer feedback before scaling or boosting</li>
              <li>care about learning and consistency, not one-off virality</li>
            </ul>
            <p className="muted" style={{ marginTop: "1rem" }}>
              It is not built for spam, mass posting, or shortcut growth.
            </p>
          </Section>

          <Section id="growth" title="Growth & Amplification (Future-Ready)">
            <p>
              AutoPromote is designed so that amplification — organic or paid — happens{" "}
              <strong>after</strong> content proves itself.
            </p>
            <p>
              When amplification features are introduced, they will be optional, informed by
              performance data, and applied only to content that has already shown positive signals.
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
