


import React from 'react';
import './WelcomePage.css';

const WelcomePage = ({ onGetStarted }) => (
  <div className="welcome-root">
    <header className="welcome-header-row">
      <div className="welcome-logo-title">
        <span className="welcome-title-text">Auto-Promote</span>
      </div>
      <button className="sign-in-btn-outline" onClick={onGetStarted}>Sign in</button>
    </header>
    <main className="welcome-main-row">
      <section className="welcome-hero-col">
        <h1 className="hero-headline-big">Promote Your Content For Free,<br />Earn Revenue On Autopilot!</h1>
        <p className="hero-desc-purple">Reach milions, monetize instamly—Auto-Promote handles the rest. No cost, ust clicks all dash.</p>
        <div className="welcome-features-icons-row">
          <div className="feature-icon-col">
            <span className="feature-svg">�</span>
            <span>Free Multi-Platform Boosting</span>
          </div>
          <div className="feature-icon-col">
            <span className="feature-svg">⚪</span>
            <span>Automated Monetisation</span>
          </div>
          <div className="feature-icon-col">
            <span className="feature-svg">📊</span>
            <span>Ahidlytics & Growth Tools</span>
          </div>
        </div>
        <button className="get-started-btn-big" onClick={onGetStarted}>Get Started</button>
      </section>
      <section className="welcome-illustration-col">
        <img src="/welcome-illustration.svg" alt="Promote Illustration" className="welcome-illustration-img-big" />
      </section>
    </main>
  </div>
);

export default WelcomePage;
