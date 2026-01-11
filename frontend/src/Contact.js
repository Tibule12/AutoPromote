import React from "react";
import "./Page.css";

const Contact = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Contact Us</h1>
      <p className="ap-page-subtitle">We&apos;re here to help.</p>
    </header>

    <div className="ap-content-section" style={{ display: "grid", gap: "2rem" }}>
      <div>
        <h2>Get in Touch</h2>
        <p>
          Whether you have a question about features, pricing, or need technical support, our team
          is ready to answer all your questions.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "1.5rem",
        }}
      >
        <div className="ap-card">
          <h3>📧 Support</h3>
          <p>For technical issues and general inquiries:</p>
          <a href="mailto:support@autopromote.com" className="ap-link-button">
            support@autopromote.com
          </a>
        </div>

        <div className="ap-card">
          <h3>💼 Sales & Partnerships</h3>
          <p>For enterprise plans and partner opportunities:</p>
          <a href="mailto:sales@autopromote.com" className="ap-link-button">
            sales@autopromote.com
          </a>
        </div>

        <div className="ap-card">
          <h3>📢 Press</h3>
          <p>For media inquiries and brand assets:</p>
          <a href="mailto:press@autopromote.com" className="ap-link-button">
            press@autopromote.com
          </a>
        </div>
      </div>

      <div className="ap-contact-form-section">
        <h2>Send us a message</h2>
        <p>You can also reach us directly through our social channels.</p>
        <ul className="ap-list">
          <li>
            <strong>Twitter (X):</strong>{" "}
            <a href="https://twitter.com/AutoPromote" target="_blank" rel="noopener noreferrer">
              @AutoPromote
            </a>
          </li>
          <li>
            <strong>LinkedIn:</strong>{" "}
            <a
              href="https://linkedin.com/company/autopromote"
              target="_blank"
              rel="noopener noreferrer"
            >
              AutoPromote Inc.
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
);

export default Contact;
