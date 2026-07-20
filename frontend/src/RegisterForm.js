import React, { useState, useCallback } from "react";
import "./Auth.css";
import { PUBLIC_SITE_URL } from "./config";

const registerHighlights = [
  "Create, edit, and package creator-ready content in one stack.",
  "Turn one workflow into clips, thumbnails, and platform-specific outputs.",
  "Build a sharper publishing system from day one.",
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
      <div className="auth-container auth-container--verification">
        <section className="verification-card" aria-live="polite">
          <div className="verification-card__icon">✉</div>
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
    <div className="auth-container">
      <div className="auth-stage">
        <section className="auth-stage__panel auth-stage__panel--brand auth-stage__panel--warm">
          <div className="auth-stage__badge">Create Your Stack</div>
          <h1 className="auth-stage__title">Start building a sharper creator system.</h1>
          <p className="auth-stage__copy">
            Open your AutoPromote account and move from scattered tools to a single command center
            for creation, packaging, and publishing.
          </p>
          <div className="auth-stage__highlights">
            {registerHighlights.map(item => (
              <div key={item} className="auth-stage__highlight">
                <span className="auth-stage__highlight-mark">+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="auth-form auth-form--modal">
          <div className="auth-form__header">
            <div className="auth-form__eyebrow">Create Account</div>
            <h2 className="auth-title auth-title--left">Launch Your Account</h2>
            <p className="auth-subtitle">
              Set up your profile and get into the platform with a cleaner first impression.
            </p>
          </div>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}

          <div className="auth-form__fields">
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
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

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
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

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                className="form-input"
                value={formData.password}
                onChange={handleChange}
                placeholder="Create a password"
                required
                autoComplete="new-password"
              />
              <p className="password-requirements">Password must be at least 6 characters long</p>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input
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
            Your account becomes the home base for your content lab, packaging tools, and publishing
            flow.
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
                if (onClose) onClose();
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
