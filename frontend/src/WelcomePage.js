





import React from 'react';
import './WelcomePage.css';

const WelcomePage = ({ onGetStarted, onSignIn }) => (
  <div className="new-welcome-root">
    <div className="new-welcome-bg-gradient" />
    <div className="new-welcome-content">
      <div className="new-welcome-logo-row">
  <img src="/image.png" alt="AutoPromote Logo" className="new-welcome-logo" />
        <h1 className="new-welcome-title">AutoPromote</h1>
      </div>
      <h2 className="new-welcome-headline">Promote. Monetize. Grow.</h2>
      <p className="new-welcome-tagline">
        <span style={{fontWeight:600, color:'#6c4cf7'}}>Your AI-powered platform for creators and businesses.</span><br />
        Automate your success, reach new audiences, and boost your revenue.
      </p>
      <div className="new-welcome-btn-row">
        <button className="new-welcome-btn primary" onClick={onGetStarted}>Get Started</button>
        <button className="new-welcome-btn" onClick={onSignIn}>Login</button>
      </div>
      <div className="new-welcome-features">
        <div className="feature-card">
          <span className="feature-icon" style={{color:'#6c4cf7'}}>🚀</span>
          <span>Instant Promotion</span>
        </div>
        <div className="feature-card">
          <span className="feature-icon" style={{color:'#6c4cf7'}}>💸</span>
          <span>Monetize Content</span>
        </div>
        <div className="feature-card">
          <span className="feature-icon" style={{color:'#6c4cf7'}}>📊</span>
          <span>Smart Analytics</span>
        </div>
      </div>
      <div className="new-welcome-footer">
        <span style={{fontSize:'0.95rem', color:'#888'}}>© {new Date().getFullYear()} AutoPromote. All rights reserved.</span>
      </div>
    </div>
  </div>
);

export default WelcomePage;
