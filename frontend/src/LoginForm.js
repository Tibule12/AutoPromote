import React, { useState, useCallback } from "react";
import "./Auth.css";

const LoginForm = ({ onLogin, onClose }) => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError("");
  }, [error]);

  const handleSubmit = async (event) => {
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

  const requestReset = async (event) => {
    event.preventDefault();
    setResetMsg("");

    const email = resetEmail || formData.email;
    if (!email) {
      setResetMsg("Enter email first");
      return;
    }

    try {
      const response = await fetch((process.env.REACT_APP_API_BASE || "") + "/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setResetMsg(data.message || "If the email exists, a reset link has been sent.");
      } else {
        setResetMsg(data.error || "Request failed");
      }
    } catch (resetError) {
      setResetMsg(resetError.message);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-title">Welcome Back</h2>
        {error && <div className="error-message">{error}</div>}

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

        <div className="form-group terms-row">
          <input
            id="agreeTerms"
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <label htmlFor="agreeTerms" className="form-label">
            I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
          </label>
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

        <div className="form-group" style={{ marginTop: 8 }}>
          <small>
            <a href="#" onClick={(event) => { event.preventDefault(); setResetRequested((prev) => !prev); }}>
              {resetRequested ? "Hide password reset" : "Forgot password?"}
            </a>
          </small>
        </div>

        {resetRequested && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="email"
              placeholder="Email for reset"
              className="form-input"
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
            />
            <button type="button" className="auth-button" style={{ marginTop: 8 }} onClick={requestReset}>
              Send Reset Email
            </button>
            {resetMsg && <div style={{ marginTop: 6, fontSize: 12, color: "#1976d2" }}>{resetMsg}</div>}
          </div>
        )}

        <button type="submit" disabled={isLoading || !agreed} className="auth-button">
          {isLoading ? (
            <>
              <span className="loading-spinner" />
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </button>

        <a href="#" onClick={(event) => { event.preventDefault(); if (onClose) onClose(); }} className="auth-link">
          Don't have an account? Create one
        </a>
      </form>
    </div>
  );
};

export default LoginForm;
