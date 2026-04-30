import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Auth.css";
import { API_ENDPOINTS } from "./config";

function getInitialEmail(search) {
  try {
    const fromSearch = new URLSearchParams(search).get("email");
    if (fromSearch) return fromSearch;
    const hash = window.location.hash || "";
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?")) : "";
    return new URLSearchParams(query).get("email") || "";
  } catch (_) {
    return "";
  }
}

const ForgotPasswordPage = () => {
  const location = useLocation();
  const [email, setEmail] = useState(() => getInitialEmail(location.search));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Enter the email address tied to your AutoPromote account.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(API_ENDPOINTS.FORGOT_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || "Unable to send reset email right now.");
      } else {
        setMessage(
          payload.message || "If an account exists, a password reset email has been sent."
        );
      }
    } catch (submitError) {
      setError(submitError.message || "Unable to send reset email right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell auth-shell--dark">
      <div className="auth-shell__inner">
        <section className="auth-panel-copy">
          <div className="auth-eyebrow">Account Recovery</div>
          <h1>Get back into AutoPromote without breaking your flow.</h1>
          <p>
            Enter your account email and we&apos;ll send you a secure reset link. The link expires
            in 15 minutes, and we never reveal whether an email is registered.
          </p>
          <div className="auth-meta">
            <div className="auth-meta-card">
              <strong>Fast and secure</strong>
              <span>Short-lived reset links keep the recovery flow locked down.</span>
            </div>
            <div className="auth-meta-card">
              <strong>Same AutoPromote style</strong>
              <span>
                Your recovery flow stays inside the product experience instead of feeling bolted on.
              </span>
            </div>
          </div>
        </section>

        <div className="auth-container">
          <form onSubmit={handleSubmit} className="auth-form auth-form--dark">
            <h2 className="auth-title">Forgot your password?</h2>
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="forgot-email">
                Email address
              </label>
              <input
                id="forgot-email"
                type="email"
                className="form-input"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="creator@autopromote.org"
                autoComplete="email"
                required
              />
            </div>

            <button type="submit" className="auth-button" disabled={isSubmitting}>
              {isSubmitting ? "Sending reset link..." : "Send reset email"}
            </button>

            <div className="helper-message helper-message--dark">
              Need to sign in instead?{" "}
              <Link className="auth-link auth-link--muted" to="/">
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
