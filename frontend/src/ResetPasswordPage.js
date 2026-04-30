import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Auth.css";
import { API_ENDPOINTS } from "./config";

function getResetToken(location) {
  try {
    const fromLocation = new URLSearchParams(location.search).get("token");
    if (fromLocation) return fromLocation;

    const hash = window.location.hash || "";
    if (hash.includes("?")) {
      const hashQuery = hash.slice(hash.indexOf("?"));
      const fromHash = new URLSearchParams(hashQuery).get("token");
      if (fromHash) return fromHash;
    }

    const currentUrl = new URL(window.location.href);
    return currentUrl.searchParams.get("token") || "";
  } catch (_) {
    return "";
  }
}

const ResetPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => getResetToken(location));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("This reset link is invalid or incomplete.");
      return;
    }
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(API_ENDPOINTS.RESET_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error || "Unable to reset password.");
      } else {
        setMessage(payload.message || "Password has been reset successfully.");
        setPassword("");
        setConfirmPassword("");
        window.setTimeout(() => navigate("/"), 1600);
      }
    } catch (submitError) {
      setError(submitError.message || "Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell auth-shell--dark">
      <div className="auth-shell__inner">
        <section className="auth-panel-copy">
          <div className="auth-eyebrow">Reset Password</div>
          <h1>Set a fresh password and jump straight back into shipping.</h1>
          <p>
            This recovery link is designed for a quick turnaround. Once your password is updated,
            the token is cleared and can&apos;t be reused.
          </p>
          <div className="auth-meta">
            <div className="auth-meta-card">
              <strong>15-minute security window</strong>
              <span>Expired or reused links are rejected automatically.</span>
            </div>
            <div className="auth-meta-card">
              <strong>Firebase login stays intact</strong>
              <span>
                Your existing AutoPromote sign-in still runs through the same auth system.
              </span>
            </div>
          </div>
        </section>

        <div className="auth-container">
          <form onSubmit={handleSubmit} className="auth-form auth-form--dark">
            <h2 className="auth-title">Choose a new password</h2>
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <div className="form-group">
              <label className="form-label" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                className="form-input"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                className="form-input"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
                required
              />
            </div>

            <button type="submit" className="auth-button" disabled={isSubmitting || !token}>
              {isSubmitting ? "Resetting password..." : "Reset password"}
            </button>

            {!token && (
              <div className="helper-message helper-message--dark">
                Reset token missing. Request a fresh link from the forgot password page.
              </div>
            )}

            <div className="helper-message helper-message--dark">
              Need a new email?{" "}
              <Link className="auth-link auth-link--muted" to="/forgot-password">
                Request another reset link
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
