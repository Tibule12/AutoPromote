import React, { useState, useCallback } from "react";
import "./Auth.css";
import { PUBLIC_SITE_URL } from "./config";

const registerHighlights = [
  { index: "01", label: "Create", copy: "Open every production tool from one workspace." },
  { index: "02", label: "Publish", copy: "Prepare each channel without rebuilding the post." },
  { index: "03", label: "Measure", copy: "Keep the queue and performance in view." },
];

const RegisterForm = ({ onRegister, onClose, onLogin, onResendVerification }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [verificationState, setVerificationState] = useState(null);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  const handleChange = useCallback(
    event => {
      const { name, value } = event.target;
      setFormData(prev => ({ ...prev, [name]: value }));
      if (error) setError("");
      if (success) setSuccess("");
    },
    [error, success]
  );

  const handleSubmit = async event => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsLoading(true);

    const { name, email, password, confirmPassword } = formData;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      setIsLoading(false);
      return;
    }

    try {
      const result = await onRegister(name, email, password);
      setVerificationState({
        email,
        sent: result?.verificationEmailSent === true,
      });
      setFormData({ name: "", email: "", password: "", confirmPassword: "" });
    } catch (submitError) {
      console.error("Registration error:", submitError);
      let message = "Registration failed. ";

      if (submitError.code) {
        switch (submitError.code) {
          case "auth/email-already-in-use":
            message += "This email is already registered.";
            break;
          case "auth/invalid-email":
            message += "Invalid email address.";
            break;
          case "auth/operation-not-allowed":
            message += "Email/password accounts are not enabled. Please contact support.";
            break;
          case "auth/weak-password":
            message += "Please choose a stronger password (at least 6 characters).";
            break;
          default:
            message += submitError.message;
        }
      } else {
        message += submitError.message || "Unknown error occurred.";
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!verificationState?.email || !onResendVerification) return;
    setIsResending(true);
    setResendMessage("");
    try {
      await onResendVerification(verificationState.email);
      setVerificationState(current => ({ ...current, sent: true }));
      setResendMessage("A fresh verification email was sent. Check Inbox and Spam.");
    } catch (resendError) {
      setResendMessage(resendError.message || "We could not resend the email yet.");
    } finally {
      setIsResending(false);
    }
  };

  if (verificationState) {
    return (
      <div className="auth-container auth-container--register auth-container--verification">
        <section className="verification-card" aria-live="polite">
          <div className="auth-brand-lockup auth-brand-lockup--verification">
            <span className="auth-brand-lockup__mark" aria-hidden="true">
              ▶
            </span>
            <span>
              <strong>AutoPromote</strong>
              <small>Creator OS</small>
            </span>
          </div>
          <div className="verification-card__icon" aria-hidden="true">
            ✉
          </div>
          <div className="auth-form__eyebrow">One quick step</div>
          <h2>Verify your email</h2>
          <p>
            We created your AutoPromote account for <strong>{verificationState.email}</strong>.
          </p>
          <p>
            {verificationState.sent
              ? "Open the verification email, tap the link, then come back and sign in. Check Spam or Promotions too."
              : "We could not confirm email delivery. Tap resend below before trying to sign in."}
          </p>
          {resendMessage && <div className="helper-message">{resendMessage}</div>}
          <button
            type="button"
            className="auth-button"
            onClick={handleResend}
            disabled={isResending}
          >
            {isResending ? "Sending..." : "Resend verification email"}
          </button>
          <button
            type="button"
            className="auth-link auth-link--inline"
            onClick={() => (onLogin ? onLogin() : onClose())}
          >
            I verified — go to sign in
          </button>
          <p className="verification-card__note">
            AutoPromote will not open the dashboard until the email is verified.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-container auth-container--register">
      <div className="auth-stage">
        <section className="auth-stage__panel auth-stage__panel--brand">
          <div className="auth-brand-lockup">
            <span className="auth-brand-lockup__mark" aria-hidden="true">
              ▶
            </span>
            <span>
              <strong>AutoPromote</strong>
              <small>Creator OS</small>
            </span>
          </div>
          <div className="auth-stage__badge">
            <i aria-hidden="true" />
            Free creator workspace
          </div>
          <h1 className="auth-stage__title">Your content operation starts here.</h1>
          <p className="auth-stage__copy">
            Create the account once. Your editing tools, publishing flow, and performance workspace
            stay together from there.
          </p>
          <div className="auth-stage__highlights">
            {registerHighlights.map(item => (
              <div key={item.index} className="auth-stage__highlight">
                <span className="auth-stage__highlight-mark">{item.index}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.copy}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="auth-register-preview" aria-hidden="true">
            <div className="auth-register-preview__topline">
              <span>Workspace setup</span>
              <small>Ready in 2 steps</small>
            </div>
            <div className="auth-register-preview__flow">
              <span className="is-complete">1</span>
              <i />
              <span>2</span>
              <div>
                <strong>Create account</strong>
                <strong>Verify email</strong>
              </div>
            </div>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="auth-form auth-form--modal">
          <div className="auth-form__header">
            <div className="auth-form__topline">
              <div className="auth-form__eyebrow">Create Account</div>
              <span className="auth-form__secure">
                <i aria-hidden="true" />
                Secure signup
              </span>
            </div>
            <h2 className="auth-title auth-title--left">Create your workspace</h2>
            <p className="auth-subtitle">Four details. Then verify your email and you’re in.</p>
          </div>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="auth-form__fields">
            <div className="form-group">
              <label className="form-label" htmlFor="register-name">
                Full Name
              </label>
              <div className="auth-input-shell">
                <span aria-hidden="true">◇</span>
                <input
                  id="register-name"
                  type="text"
                  name="name"
                  className="form-input"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="register-email">
                Email
              </label>
              <div className="auth-input-shell">
                <span aria-hidden="true">@</span>
                <input
                  id="register-email"
                  type="email"
                  name="email"
                  className="form-input"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Enter your email"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-register-password-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="register-password">
                  Password
                </label>
                <div className="auth-input-shell">
                  <span aria-hidden="true">◆</span>
                  <input
                    id="register-password"
                    type="password"
                    name="password"
                    className="form-input"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Create a password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="register-confirm-password">
                  Confirm Password
                </label>
                <div className="auth-input-shell">
                  <span aria-hidden="true">✓</span>
                  <input
                    id="register-confirm-password"
                    type="password"
                    name="confirmPassword"
                    className="form-input"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Confirm your password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="password-requirements">Use at least 6 characters.</p>

          <button type="submit" disabled={isLoading} className="auth-button">
            {isLoading ? (
              <>
                <span className="loading-spinner" />
                Creating your account...
              </>
            ) : (
              "Create AutoPromote Account"
            )}
          </button>

          <div className="auth-form__note">
            <span aria-hidden="true">✓</span>
            <span>Firebase authentication protects your account and workspace access.</span>
          </div>

          <div className="auth-action-row">
            <button
              type="button"
              className="auth-home-button"
              onClick={() => {
                window.location.href =
                  typeof PUBLIC_SITE_URL !== "undefined" ? PUBLIC_SITE_URL : "/";
              }}
            >
              Back Home
            </button>

            <button
              type="button"
              onClick={() => {
                if (onLogin) onLogin();
                else if (onClose) onClose();
              }}
              className="auth-link auth-link--inline"
            >
              Already have an account? Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterForm;
