import React from "react";
import "./Page.css";

const CookiesPolicy = () => (
  <div className="ap-page-container">
    <h1>Cookie Policy</h1>
    <p>Last updated: January 11, 2026</p>

    <div className="ap-content-section">
      <h2>1. What Are Cookies?</h2>
      <p>
        Cookies are small text files that are stored on your computer or mobile device when you
        visit a website. They allow the website to recognize your device and remember whether you
        have visited the site before.
      </p>

      <h2>2. How We Use Cookies</h2>
      <p>We use cookies to:</p>
      <ul>
        <li>
          <strong>Essential Cookies:</strong> Enable core functionality such as security, network
          management, and accessibility. You may disable these by changing your browser settings,
          but this may affect how the website functions.
        </li>
        <li>
          <strong>Performance Cookies:</strong> Collect information about how you use our website,
          such as which pages you visit most often. This data helps us optimize the site and is
          aggregated and anonymous.
        </li>
        <li>
          <strong>Functionality Cookies:</strong> Allow the site to remember choices you make (such
          as your username or language) and provide enhanced features.
        </li>
        <li>
          <strong>Targeting/Advertising Cookies:</strong> Track your browsing habits to enable us to
          show advertising which is more likely to be of interest to you.
        </li>
      </ul>

      <h2>3. Third-Party Cookies</h2>
      <p>
        In addition to our own cookies, we may also use various third-parties cookies to report
        usage statistics of the Service, deliver advertisements on and through the Service, and so
        on. These third-party services may set their own cookies to identify your device.
      </p>

      <h2>4. Managing Cookies</h2>
      <p>
        Most web browsers allow you to control cookies through their settings preferences. However,
        allow us to remind you that if you reject cookies, your ability to use some features or
        areas of our website may be limited.
      </p>

      <h2>5. Contact Us</h2>
      <p>
        If you have any questions about our use of cookies, please email us at{" "}
        <a href="mailto:thulani@autopromote.org">thulani@autopromote.org</a>.
      </p>
    </div>
  </div>
);

export default CookiesPolicy;
