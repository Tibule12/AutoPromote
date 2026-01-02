import React, { useState } from "react";

const NewsletterSubscribe = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);

  const submit = async e => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("Please enter a valid email address.");
      return;
    }
    // Try posting to /api/newsletter if present, otherwise fallback to mailto
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus("Subscribed — thank you!");
        setEmail("");
        return;
      }
    } catch (_) {}
    // Fallback: open mail client
    window.location.href = `mailto:thulani@autopromote.org?subject=Subscribe&body=Please%20subscribe%20${encodeURIComponent(
      email
    )}`;
    setStatus("Opened mail client as a fallback.");
  };

  return (
    <form className="ap-newsletter-form" onSubmit={submit} aria-label="Subscribe to newsletter">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
      />
      <button type="submit">Subscribe</button>
      {status && <div className="ap-newsletter-status">{status}</div>}
    </form>
  );
};

export default NewsletterSubscribe;
