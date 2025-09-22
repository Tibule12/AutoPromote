

import React from 'react';
import './WelcomePage.css';

const WelcomePage = ({ onGetStarted }) => (
  <div className="welcome-bg">
    <div className="test-banner">Test Render: If you see this, React is working!</div>
    <div className="main-header">
      <h1 className="main-title">AutoPromote</h1>
      <div className="main-header-btns">
        <button className="header-btn">Login</button>
        <button className="header-btn">Register</button>
      </div>
    </div>
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
        <h1 className="hero-headline">Promote Your Content<br />For Free,<br />Earn Revenue On Autopilot!</h1>
        <p className="hero-desc">Reach millions, monetize instantly—Auto-Promote handles the rest. No cost, just clicks all dash.</p>
        <button className="get-started-btn" onClick={onGetStarted}>Get Started</button>
        <div className="welcome-features-row">
          <div className="feature-card">
            <span className="feature-icon">🚀</span>
            <div>Free Multi-Platform</div>
          </div>
          <div className="feature-card">
            <span className="feature-icon">💸</span>
            <div>Automated Monetisation</div>
          </div>
          <div className="feature-card">
            <span className="feature-icon">📊</span>
            <div>Analytics & Growth</div>
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
