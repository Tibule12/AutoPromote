

import React from 'react';
import './WelcomePage.css';

const WelcomePage = ({ onGetStarted }) => (
  <div className="welcome-container">
    <header className="welcome-header">
      <div className="logo-row">
        <img src="/logo192.png" alt="Auto-Promote Logo" className="welcome-logo" />
        <span className="welcome-title">Auto-Promote</span>
      </div>
      <nav className="welcome-nav">
        <a href="#dashboard">Dashboard</a>
        <a href="#faqs">FAQs</a>
        <a href="#earnings">Earnings</a>
        <a href="#promote">Promote</a>
        <a href="#analytics">Analytics</a>
        <button className="sign-in-btn" onClick={onGetStarted}>Sign in</button>
      </nav>
    </header>
    <main className="welcome-main">
      <section className="welcome-hero">
        <h1>Promote Your Content For Free, <br />Earn Revenue On Autopilot!</h1>
        <p>Reach millions, monetize instantly—Auto-Promote handles the rest. No cost, just clicks all dash.</p>
        <button className="get-started-btn" onClick={onGetStarted}>Get Started</button>
        <div className="welcome-features">
          <div className="feature-item">
            <span role="img" aria-label="boost">🚀</span>
            <span>Free Multi-Platform Boosting</span>
          </div>
          <div className="feature-item">
            <span role="img" aria-label="money">💸</span>
            <span>Automated Monetisation</span>
          </div>
          <div className="feature-item">
            <span role="img" aria-label="analytics">📊</span>
            <span>Analytics & Growth Tools</span>
          </div>
        </div>
      </section>
      <section className="welcome-illustration">
        <img src="/welcome-illustration.svg" alt="Promote Illustration" className="welcome-illustration-img" />
      </section>
    </main>
  </div>
);

export default WelcomePage;
