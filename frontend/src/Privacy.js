import React from "react";
import "./Page.css";

const Privacy = () => (
  <div className="ap-page-container">
    <h1>Privacy Policy for AutoPromote</h1>
    <p>Effective date: December 10, 2025 (Last Updated: November 15, 2025)</p>

    <p>
      Note: This is a draft policy for transparency and platform review. It does not constitute
      legal advice. For compliance matters, contact us at thulani@autopromote.org.
    </p>

    <div className="ap-content-section">
      <h2>1. Introduction</h2>
      <p>
        Welcome to AutoPromote (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). We are
        committed to protecting your privacy. This Privacy Policy explains how we collect, use,
        disclose, and safeguard your information when you use our application and services. Please
        read this policy carefully. If you do not agree, do not use the Service.
      </p>

      <h2>2. Data Controller &amp; Contact</h2>
      <p>
        The data controller for AutoPromote is AutoPromote. For privacy inquiries or to exercise
        your rights, contact: thulani@autopromote.org.
      </p>

      <h2>3. What We Collect</h2>
      <p>We collect the following categories of information:</p>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, profile details you provide.
        </li>
        <li>
          <strong>User Content:</strong> content you create, schedule, or upload through the Service
          (e.g., posts, captions, media).
        </li>
        <li>
          <strong>Authentication &amp; Usage:</strong> login tokens, IP address, device and browser
          metadata, and usage logs.
        </li>
        <li>
          <strong>Payment Data:</strong> billing identifiers and transaction records required to
          process payments (we do not store full card numbers; payments are processed by PayPal).
        </li>
        <li>
          <strong>Social Network Data:</strong> information you choose to share from connected
          social accounts (profile, public posting permissions) when you link third-party platforms.
        </li>
      </ul>

      <h2>4. How We Use Your Information</h2>
      <p>We use personal data to operate and improve the Service, including to:</p>
      <ul>
        <li>Create and manage your account and provide core features.</li>
        <li>Post or schedule content on third-party platforms where you grant permission.</li>
        <li>Process payments and refunds through third-party payment processors.</li>
        <li>Communicate about your account, updates, or security issues.</li>
        <li>Analyze and improve functionality, detect fraud, and enforce policies.</li>
      </ul>

      <h2>5. Third-Party Processors</h2>
      <p>We use third-party service providers to operate the Service. Key processors include:</p>
      <ul>
        <li>Firebase / Google: authentication, database, storage.</li>
        <li>Resend or SendGrid: transactional email delivery.</li>
        <li>PayPal: payment processing.</li>
        <li>Analytics providers: usage analytics and performance monitoring.</li>
      </ul>
      <p>
        We share the minimum data necessary with these processors and require them to protect
        personal data under contract.
      </p>

      <h2>6. Your Rights</h2>
      <p>
        Depending on your jurisdiction, you may have rights to access, correct, delete, or export
        your personal data, and to object to certain processing. To exercise your rights, contact us
        at thulani@autopromote.org. We will respond within a reasonable timeframe as required by
        applicable law.
      </p>

      <h2>7. Retention</h2>
      <p>
        We retain personal data as long as necessary to provide the Service and for legitimate
        business or legal purposes (for example, to comply with legal obligations or resolve
        disputes). For account deletion requests we generally remove account data within 30&ndash;90
        days, but some backups or aggregated analytics may be retained longer in anonymized form.
      </p>

      <h2>8. Cookies &amp; Tracking</h2>
      <p>
        We use cookies and similar technologies for authentication, security, and analytics. You can
        control cookies through your browser settings; disabling cookies may limit features.
      </p>

      <h2>9. Security</h2>
      <p>
        We use commercially reasonable technical and administrative measures (such as TLS in transit
        and least-privilege for service accounts) to protect personal data. No system is perfect
        &mdash; if you suspect a security issue, contact thulani@autopromote.org.
      </p>

      <h2>10. Changes to this Policy</h2>
      <p>
        We may update this Privacy Policy. We will post the new effective date at the top of this
        page. Material changes will be highlighted or emailed to users where required.
      </p>

      <h2>11. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us at:
        thulani@autopromote.org.
      </p>
    </div>
  </div>
);

export default Privacy;
