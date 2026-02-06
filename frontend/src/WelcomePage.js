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
            <img src="/image.png" alt="AutoPromote Logo" className="new-welcome-logo" />
            <div>
              <h1 className="new-welcome-title">AutoPromote</h1>
              <p className="new-welcome-tagline-small">
                Turn every upload into a smarter opportunity.
              </p>
            </div>
          </div>

          <div className="new-welcome-cta">
            <button className="new-welcome-btn primary" onClick={onGetStarted}>
              Get Started
            </button>
            <button className="new-welcome-btn" onClick={onSignIn}>
              Login
            </button>
          </div>
        </header>

        <Section id="what-is" title="What is AutoPromote?">
          <p>
            AutoPromote is a content intelligence platform that helps creators and businesses
            <strong> test, learn, and improve content performance before scaling it</strong> across
            external platforms. Instead of blindly posting or promoting content, AutoPromote
            observes early performance, runs controlled improvements (AI clips), and delivers clear
            feedback so creators understand what actually works for their audience.
          </p>
        </Section>

        <Section id="philosophy" title="Core Philosophy">
          <ul className="hp-list">
            <li>Test before you scale</li>
            <li>Learn from real outcomes, not assumptions</li>
            <li>Improve presentation before amplification</li>
            <li>Every action requires user consent</li>
            <li>Confidence comes from evidence, not promises</li>
          </ul>
          <p className="muted">
            AutoPromote does not guarantee virality. It guarantees smarter attempts and clearer
            learning.
          </p>
        </Section>

        <Section id="how-it-works" title="How It Works">
          <ol className="hp-steps">
            <li>
              <strong>Upload Once</strong>
              <p>
                Users upload their original content and select the platforms they want to publish
                to.
              </p>
            </li>
            <li>
              <strong>Observe Performance</strong>
              <p>
                The platform monitors early performance during a defined observation window (e.g.
                3–7 hours depending on platform).
              </p>
            </li>
            <li>
              <strong>Improve When Needed</strong>
              <p>
                If content underperforms and the user has given consent, AutoPromote generates 1–2
                AI-optimized clips focused on stronger hooks, better pacing, and platform-native
                formatting.
              </p>
            </li>
            <li>
              <strong>Learn & Compare</strong>
              <p>
                AutoPromote compares original performance vs AI clips and provides clear,
                human-readable feedback: what improved, what didn’t, and what to try next.
              </p>
            </li>
          </ol>
        </Section>

        <Section id="not" title="What AutoPromote Is NOT">
          <ul className="hp-list">
            <li>Not an ad platform</li>
            <li>Not a guarantee of reach</li>
            <li>Not a replacement for creativity</li>
            <li>Not automation without permission</li>
          </ul>
          <p className="muted">
            AutoPromote is a learning and optimization layer on top of existing platforms.
          </p>
        </Section>

        <Section id="trust" title="User Trust & Consent">
          <ul className="hp-list">
            <li>No content is published without explicit user approval</li>
            <li>AI clips are optional and opt-in</li>
            <li>Scheduling and testing behavior is transparent</li>
            <li>All actions align with external platform policies</li>
          </ul>
        </Section>

        <Section id="growth" title="Growth & Amplification (Future-Ready)">
          <p>
            AutoPromote is designed so that amplification — organic or paid — happens{" "}
            <strong>after</strong> content proves itself. When amplification features are
            introduced, they will be optional, informed by performance data, and apply only to
            content that has already shown positive signals.
          </p>
        </Section>

        <Section id="why" title="Why This Matters">
          <p>
            Most creators fail not because their content is bad, but because they don’t know{" "}
            <strong>what part failed</strong>. AutoPromote reduces guesswork and replaces it with
            insight. Every upload should have a fairer chance, teach the creator something, and
            increase confidence over time.
          </p>
        </Section>

        <footer className="hp-footer">
          <h3 className="hp-northstar">
            "Every upload should give the creator a better chance and a clearer lesson than the last
            one."
          </h3>
          <div className="hp-footer-ctas">
            <button className="new-welcome-btn primary" onClick={onGetStarted}>
              Get Started
            </button>
            <button className="new-welcome-btn" onClick={onSignIn}>
              Sign In
            </button>
          </div>
          <Footer />
        </footer>
      </main>
    </div>
  );
};

export default WelcomePage;
