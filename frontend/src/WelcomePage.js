
import React from 'react';
import { Link } from 'react-router-dom';
import './WelcomePage.css';

const testimonials = [
  {
    quote: "Auto-Promote helped me reach 10x more viewers in my first week!",
    name: "Lebo M.",
    avatar: "https://randomuser.me/api/portraits/women/65.jpg"
  },
  {
    quote: "I love the analytics and the fact that it's all free.",
    name: "Sam K.",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg"
  },
  {
    quote: "The rewards and badges keep me motivated to create more!",
    name: "Zanele T.",
    avatar: "https://randomuser.me/api/portraits/women/44.jpg"
  }
];

const WelcomePage = ({ onGetStarted }) => (
  <div className="welcome-container gradient-bg fade-in">
    <header className="welcome-header">
      <div className="logo-row">
        <img src="/logo192.png" alt="Auto-Promote Logo" className="welcome-logo" />
        <span className="welcome-title">Auto-Promote</span>
      </div>
      <nav className="welcome-nav">
        <Link to="/" className="nav-link">Home</Link>
        <a href="#faqs" className="nav-link">FAQs</a>
        <a href="#earnings" className="nav-link">Earnings</a>
        <a href="#promote" className="nav-link">Promote</a>
        <a href="#analytics" className="nav-link">Analytics</a>
        <button className="sign-in-btn" onClick={onGetStarted}>Sign in</button>
      </nav>
    </header>
    <main className="welcome-main">
      <section className="welcome-hero">
        <h1 className="hero-title">Promote Your Content For Free,<br />Earn Revenue On Autopilot!</h1>
        <p className="hero-desc">Reach millions, monetize instantly—Auto-Promote handles the rest. No cost, just clicks all dash.</p>
        <button className="get-started-btn animated-bounce" onClick={onGetStarted}>Get Started</button>
        <div className="welcome-features">
          <div className="feature-item feature-boost">
            <span role="img" aria-label="boost">🚀</span>
            <span>Free Multi-Platform Boosting</span>
          </div>
          <div className="feature-item feature-money">
            <span role="img" aria-label="money">💸</span>
            <span>Automated Monetisation</span>
          </div>
          <div className="feature-item feature-analytics">
            <span role="img" aria-label="analytics">📊</span>
            <span>Analytics & Growth Tools</span>
          </div>
        </div>
      </section>
      <section className="welcome-illustration">
        <img src="/welcome-illustration.svg" alt="Promote Illustration" className="welcome-illustration-img" />
      </section>
    </main>
    <section className="testimonials-section fade-in">
      <h2>What Our Creators Say</h2>
      <div className="testimonials-list">
        {testimonials.map((t, i) => (
          <div className="testimonial-card" key={i}>
            <img src={t.avatar} alt={t.name} className="testimonial-avatar" />
            <blockquote>“{t.quote}”</blockquote>
            <span className="testimonial-name">{t.name}</span>
          </div>
        ))}
      </div>
    </section>
    <footer className="welcome-footer">
      <span>Trusted by creators worldwide &bull; &copy; {new Date().getFullYear()} Auto-Promote</span>
    </footer>
  </div>
);

export default WelcomePage;
