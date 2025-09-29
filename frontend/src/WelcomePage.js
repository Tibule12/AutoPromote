


import React from 'react';
import './WelcomePage.css';

const FeatureIcon = ({ type }) => {
  if (type === 'boost') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 2L16.5 10H25L18 15L20.5 23L14 18L7.5 23L10 15L3 10H11.5L14 2Z" fill="#6c4cf7"/></svg>
    );
  }
  if (type === 'money') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="14" r="12" stroke="#6c4cf7" strokeWidth="2.5"/><text x="50%" y="56%" textAnchor="middle" fontSize="16" fill="#6c4cf7" fontWeight="bold" dy=".3em">$</text></svg>
    );
  }
  if (type === 'analytics') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="16" width="4" height="8" rx="2" fill="#6c4cf7"/><rect x="12" y="10" width="4" height="14" rx="2" fill="#6c4cf7"/><rect x="20" y="6" width="4" height="18" rx="2" fill="#6c4cf7"/></svg>
    );
  }
  return null;
};

const WelcomePage = ({ onGetStarted, onSignIn }) => (
  <div className="welcome-root fade-in">
    <header className="welcome-header-row">
      <div className="welcome-logo-title">
        <span className="welcome-title-text">Auto-Promote</span>
      </div>
      <button className="sign-in-btn-outline" onClick={onSignIn}>Sign in</button>
    </header>
    <main className="welcome-main-row">
      <section className="welcome-hero-col">
        <h1 className="hero-headline-big">Promote Your Content For Free,<br />Earn Revenue On Autopilot!</h1>
        <p className="hero-desc-purple">Reach millions, monetize instantly—Auto-Promote handles the rest. No cost, just clicks all dash.</p>
        <div className="welcome-features-icons-row">
          <div className="feature-icon-col" tabIndex={0} title="Free Multi-Platform Boosting">
            <FeatureIcon type="boost" />
            <span>Free Multi-Platform Boosting</span>
          </div>
          <div className="feature-icon-col" tabIndex={0} title="Automated Monetisation">
            <FeatureIcon type="money" />
            <span>Automated Monetisation</span>
          </div>
          <div className="feature-icon-col" tabIndex={0} title="Analytics & Growth Tools">
            <FeatureIcon type="analytics" />
            <span>Analytics & Growth Tools</span>
          </div>
        </div>
        <button className="get-started-btn-big" onClick={onGetStarted}>Get Started</button>
      </section>
      <section className="welcome-illustration-col">
        <img src="/welcome-illustration.svg" alt="Promote Illustration" className="welcome-illustration-img-big fade-in" />
      </section>
    </main>
  </div>
);

export default WelcomePage;
