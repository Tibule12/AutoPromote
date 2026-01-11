import React from "react";
import "./Page.css";

const Accessibility = () => (
  <div className="ap-page-container">
    <header className="ap-page-header">
      <h1>Accessibility Statement</h1>
      <p className="ap-page-subtitle">AutoPromote is allowed for everyone.</p>
    </header>

    <div className="ap-content-section">
      <p>
        AutoPromote is committed to ensuring digital accessibility for people with disabilities. We
        are continually improving the user experience for everyone and applying the relevant
        accessibility standards.
      </p>

      <h2>Measures to Support Accessibility</h2>
      <p>AutoPromote takes the following measures to ensure accessibility:</p>
      <ul className="ap-list">
        <li>Include accessibility as part of our mission statement.</li>
        <li>Integrate accessibility into our procurement practices.</li>
        <li>Assign clear accessibility targets and responsibilities.</li>
        <li>Employ formal accessibility quality assurance methods.</li>
      </ul>

      <h2>Conformance Status</h2>
      <p>
        The Web Content Accessibility Guidelines (WCAG) defines requirements for designers and
        developers to improve accessibility for people with disabilities. It defines three levels of
        conformance: Level A, Level AA, and Level AAA. AutoPromote is partially conformant with WCAG
        2.1 level AA. Partially conformant means that some parts of the content do not fully conform
        to the accessibility standard.
      </p>

      <h2>Feedback</h2>
      <p>
        We welcome your feedback on the accessibility of AutoPromote. Please let us know if you
        encounter accessibility barriers on AutoPromote:
      </p>
      <p>
        E-mail: <a href="mailto:accessibility@autopromote.com">accessibility@autopromote.com</a>
      </p>
    </div>
  </div>
);

export default Accessibility;
