import React, { useState, useCallback } from "react";
import "./Auth.css";
import { PUBLIC_SITE_URL } from "./config";

const loginHighlights = [
  "Jump back into your publishing command center.",
  "Manage content, clips, thumbnails, and distribution from one place.",
  "Keep your workflow moving with a faster creator-grade dashboard.",
];

const LoginForm = ({ onLogin, onClose }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const handleChange = useCallback(
    event => {
      const { name, value } = event.target;
      setFormData(prev => ({ ...prev, [name]: value }));
      if (error) setError("");
    },
    [error]
  );

  const handleSubmit = async event => {
    event.preventDefault();
    setError("");

    if (!agreed) {
      setError("Please agree to the Terms of Service and Privacy Policy before continuing.");
      return;
    }

    setIsLoading(true);

    try {
      const { email, password } = formData;
      try {
        localStorage.setItem("tosAgreed", "true");
      } catch (_) {
        // ignore storage failures (private mode, quota, etc.)
      }
      await onLogin(email, password);
    } catch (submitError) {
      console.error("Login error:", submitError);
      console.error("Error details:", {
        code: submitError.code,
        message: submitError.message,
      });

      let message = "Login failed. ";
      if (submitError.code) {
        switch (submitError.code) {
          case "auth/invalid-credential":
            message += "Invalid email or password.";
            break;
          case "auth/user-not-found":
            message += "No account exists with this email.";
            break;
          case "auth/wrong-password":
            message += "Incorrect password.";
            break;
          case "auth/invalid-api-key":
            message += "Invalid Firebase configuration. Please check the setup.";
            break;
          case "auth/network-request-failed":
            message += "Network error. Please check your connection.";
            break;
          case "auth/too-many-requests":
            message += "Too many failed login attempts. Please try again later.";
            break;
          default:
            message += submitError.message;
        }
      } else {
        message += submitError.message || "Unknown error occurred";
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-stage">
        <section className="auth-stage__panel auth-stage__panel--brand">
          <div className="auth-stage__badge">AutoPromote Access</div>
          <h1 className="auth-stage__title">Welcome back to your growth engine.</h1>
          <p className="auth-stage__copy">
            Sign in to keep building campaigns, packaging content, and pushing your creator stack
            forward without losing momentum.
          </p>
          <div className="auth-stage__highlights">
            {loginHighlights.map(item => (
              <div key={item} className="auth-stage__highlight">
                <span className="auth-stage__highlight-mark">+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="auth-form auth-form--modal">
          <div className="auth-form__header">
            <div className="auth-form__eyebrow">Sign In</div>
            <h2 className="auth-title auth-title--left">Welcome Back</h2>
            <p className="auth-subtitle">
              Step back into AutoPromote and pick up where you left off.
            </p>
          </div>
          {error && <div className="error-message">{error}</div>}

          <div className="auth-form__fields">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter your email"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="form-group auth-form__inline">
            <div className="terms-row terms-row--compact">
              <input
                id="agreeTerms"
                type="checkbox"
                checked={agreed}
                onChange={event => setAgreed(event.target.checked)}
              />
              <label htmlFor="agreeTerms" className="form-label">
                I agree to the{" "}
                <a href={`${PUBLIC_SITE_URL}/terms`} target="_blank" rel="noreferrer">
                  Terms
                </a>{" "}
                and{" "}
                <a href={`${PUBLIC_SITE_URL}/privacy`} target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                .
              </label>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                const email = encodeURIComponent(formData.email || "");
                window.location.hash = email
                  ? `#/forgot-password?email=${email}`
                  : "#/forgot-password";
              }}
              className="link-like"
            >
              Forgot password?
            </button>
          </div>

          <button type="submit" disabled={isLoading || !agreed} className="auth-button">
            {isLoading ? (
              <>
                <span className="loading-spinner" />
                Signing in...
              </>
            ) : (
              "Enter AutoPromote"
            )}
          </button>

          <div className="auth-form__note">
            Secure access to your creator workflows, publishing tools, and growth systems.
          </div>

          <div className="auth-action-row">
            <button
              type="button"
              className="auth-home-button"
              onClick={() => {
                window.location.href = PUBLIC_SITE_URL || "/";
              }}
            >
              Back Home
            </button>

            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
              }}
              className="auth-link auth-link--inline"
            >
              Don&apos;t have an account? Create one
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
