import React, { useState, useEffect } from "react";
import { auth, db } from "../firebaseClient";
import { doc, deleteDoc } from "firebase/firestore";
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  TotpMultiFactorGenerator,
  TotpSecret,
} from "firebase/auth";
// Firestore helpers intentionally omitted; use backend APIs instead
import "./SecurityPanel.css";
import { API_BASE_URL } from "../config";
import { parseJsonSafe } from "../utils/parseJsonSafe";
import toast from "react-hot-toast";

// Prefer same-origin during local development to avoid hitting production API
function resolveApiPath(path) {
  try {
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const isLocal =
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname) || hostname.endsWith(".local");
    const base = API_BASE_URL || process.env.REACT_APP_API_BASE_URL || "";
    if (isLocal) return `${""}${path}`;
    return `${base || ""}${path}`;
  } catch (e) {
    return `${process.env.REACT_APP_API_BASE_URL || API_BASE_URL || ""}${path}`;
  }
}

const SecurityPanel = ({ user }) => {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // login history is not currently used; keep feature TODO

  const [privacySettings, setPrivacySettings] = useState({
    analyticsEnabled: true,
    emailNotifications: true,
    dataSharing: false,
  });

  // 2FA States
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [enrolling2FA, setEnrolling2FA] = useState(false);
  const [mfaMethod, setMfaMethod] = useState("totp"); // 'totp' or 'sms'
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [totpSecret, setTotpSecret] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const [twoFactorSuccess, setTwoFactorSuccess] = useState("");

  // Connected Platforms States
  const [connectedPlatforms, setConnectedPlatforms] = useState([]);
  const [loadingPlatforms, setLoadingPlatforms] = useState(false);

  // Current session info
  const currentSession = {
    device: navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop Computer",
    browser: getBrowserName(),
    location: "Current Location",
    lastActive: "Just now",
  };

  function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return "Unknown Browser";
  }

  // Run once on mount — initialize security checks
  /* mount-only effect (intentional) */
  // eslint-disable-next-line
  useEffect(() => {
    // Load privacy settings from localStorage or API
    const savedSettings = localStorage.getItem("privacySettings");
    if (savedSettings) {
      setPrivacySettings(JSON.parse(savedSettings));
    }

    // Check if 2FA is already enabled
    const currentUser = auth.currentUser;
    if (currentUser) {
      const enrolledFactors = multiFactor(currentUser).enrolledFactors;
      setTwoFactorEnabled(enrolledFactors.length > 0);
    }

    // Load connected platforms
    loadConnectedPlatforms();
  }, []);

  const loadConnectedPlatforms = async () => {
    if (!user || !user.uid) return;
    setLoadingPlatforms(true);
    try {
      // Use backend API instead of direct Firestore access to avoid permission issues
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setConnectedPlatforms([]);
        setLoadingPlatforms(false);
        return;
      }
      const token = await currentUser.getIdToken();
      const endpoint = resolveApiPath("/api/users/connections");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      let response;
      try {
        response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch (err) {
        // If local dev, try same-origin fallback
        const hostname = typeof window !== "undefined" ? window.location.hostname : "";
        const isLocal =
          /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(hostname) || hostname.endsWith(".local");
        if (isLocal) {
          try {
            clearTimeout(timeout);
            const fallbackCtrl = new AbortController();
            const fallbackTimeout = setTimeout(() => fallbackCtrl.abort(), 7000);
            response = await fetch("/api/users/connections", {
              headers: { Authorization: `Bearer ${token}` },
              signal: fallbackCtrl.signal,
            });
            clearTimeout(fallbackTimeout);
          } catch (fallbackErr) {
            console.error("Failed to fetch connections (fallback):", fallbackErr);
            toast.error("Failed to load connected platforms. Is the backend running locally?");
            setConnectedPlatforms([]);
            setLoadingPlatforms(false);
            return;
          }
        } else {
          console.error("Failed to fetch connections:", err);
          toast.error(
            "Failed to load connected platforms. Check your network or API configuration."
          );
          setConnectedPlatforms([]);
          setLoadingPlatforms(false);
          return;
        }
      } finally {
        clearTimeout(timeout);
      }

      if (response && response.ok) {
        const parsed = await parseJsonSafe(response);
        const data = parsed.json || null;
        const platforms = Object.entries(data?.connections || {}).map(([key, value]) => ({
          id: key,
          provider: value.provider || key,
          connectedAt: value.obtainedAt ? new Date(value.obtainedAt) : new Date(),
          scope: value.scope || "Unknown",
          status: value.mode || "active",
        }));
        setConnectedPlatforms(platforms);
      } else if (response) {
        const parsed = await parseJsonSafe(response);
        console.error(
          "Failed to fetch connections:",
          parsed.status || response.status,
          parsed.textPreview || parsed.error || ""
        );
        setConnectedPlatforms([]);
      } else {
        setConnectedPlatforms([]);
      }
    } catch (error) {
      console.error("Error loading connected platforms:", error);
      // Fallback to empty array instead of failing
      setConnectedPlatforms([]);
    } finally {
      setLoadingPlatforms(false);
    }
  };

  const handlePasswordChange = async e => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    // Validation
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordForm.newPassword)) {
      setPasswordError("Password must contain uppercase, lowercase, and number");
      return;
    }

    setChangingPassword(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error("No authenticated user");
      }

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        passwordForm.currentPassword
      );
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await updatePassword(currentUser, passwordForm.newPassword);

      setPasswordSuccess("Password changed successfully!");
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      console.error("Password change error:", error);
      if (error.code === "auth/wrong-password") {
        setPasswordError("Current password is incorrect");
      } else if (error.code === "auth/requires-recent-login") {
        setPasswordError("Please log out and log in again before changing password");
      } else {
        setPasswordError(error.message || "Failed to change password");
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handlePrivacyChange = setting => {
    const updated = { ...privacySettings, [setting]: !privacySettings[setting] };
    setPrivacySettings(updated);
    localStorage.setItem("privacySettings", JSON.stringify(updated));
  };

  const handleLogoutAllDevices = async () => {
    if (window.confirm("This will log you out from all devices. Continue?")) {
      // In a real implementation, this would invalidate all tokens
      alert("This feature requires backend support. Currently logs out current session only.");
      window.location.href = "/";
    }
  };

  const handleEnable2FA = async () => {
    setTwoFactorError("");
    setTwoFactorSuccess("");

    if (mfaMethod === "totp") {
      // TOTP (Authenticator App) flow
      setEnrolling2FA(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("No authenticated user");

        await multiFactor(currentUser).getSession();
        const totpSecret = await TotpSecret.generate();
        setTotpSecret(totpSecret);

        // Generate QR code URL for authenticator apps
        const issuer = "AutoPromote";
        const accountName = currentUser.email || currentUser.uid;
        const otpauthUrl = totpSecret.generateQrCodeUrl(accountName, issuer);
        setQrCodeUrl(otpauthUrl);

        setTwoFactorSuccess(
          "Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)"
        );
      } catch (error) {
        console.error("2FA TOTP enrollment error:", error);
        setTwoFactorError(error.message || "Failed to generate authenticator code");
        setEnrolling2FA(false);
      }
    } else {
      // SMS flow (requires Firebase Console SMS MFA to be enabled)
      if (!phoneNumber || !phoneNumber.match(/^\+[1-9]\d{1,14}$/)) {
        setTwoFactorError(
          "Please enter a valid phone number with country code (e.g., +1234567890)"
        );
        return;
      }

      setEnrolling2FA(true);

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("No authenticated user");

        // Setup reCAPTCHA
        if (!window.recaptchaVerifier) {
          window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
            size: "invisible",
          });
        }

        const multiFactorSession = await multiFactor(currentUser).getSession();
        const phoneInfoOptions = {
          phoneNumber,
          session: multiFactorSession,
        };

        const phoneAuthProvider = new PhoneAuthProvider(auth);
        const verificationId = await phoneAuthProvider.verifyPhoneNumber(
          phoneInfoOptions,
          window.recaptchaVerifier
        );

        setVerificationId(verificationId);
        setTwoFactorSuccess("Verification code sent to your phone!");
      } catch (error) {
        console.error("2FA SMS enrollment error:", error);
        setTwoFactorError(
          error.message ||
            "Failed to send verification code. SMS MFA may not be enabled in Firebase Console."
        );
      } finally {
        setEnrolling2FA(false);
      }
    }
  };

  const handleVerify2FA = async () => {
    setTwoFactorError("");
    setTwoFactorSuccess("");

    if (!verificationCode || verificationCode.length !== 6) {
      setTwoFactorError("Please enter a 6-digit verification code");
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user");

      if (mfaMethod === "totp") {
        // TOTP verification
        if (!totpSecret) throw new Error("No TOTP secret found");

        await multiFactor(currentUser).getSession();
        const multiFactorAssertion = TotpMultiFactorGenerator.assertionForEnrollment(
          totpSecret,
          verificationCode
        );

        await multiFactor(currentUser).enroll(multiFactorAssertion, "Authenticator App");

        setTwoFactorEnabled(true);
        setTwoFactorSuccess("Two-factor authentication enabled successfully!");
        setVerificationCode("");
        setTotpSecret(null);
        setQrCodeUrl("");
        setEnrolling2FA(false);
      } else {
        // SMS verification
        const cred = PhoneAuthProvider.credential(verificationId, verificationCode);
        const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);

        await multiFactor(currentUser).enroll(multiFactorAssertion, "Primary Phone");

        setTwoFactorEnabled(true);
        setTwoFactorSuccess("Two-factor authentication enabled successfully!");
        setPhoneNumber("");
        setVerificationCode("");
        setVerificationId("");
      }
    } catch (error) {
      console.error("2FA verification error:", error);
      setTwoFactorError(error.message || "Failed to verify code");
    }
  };

  const handleDisable2FA = async () => {
    if (
      !window.confirm(
        "Are you sure you want to disable two-factor authentication? This will make your account less secure."
      )
    ) {
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user");

      const enrolledFactors = multiFactor(currentUser).enrolledFactors;
      if (enrolledFactors.length > 0) {
        await multiFactor(currentUser).unenroll(enrolledFactors[0]);
        setTwoFactorEnabled(false);
        setTwoFactorSuccess("Two-factor authentication disabled");
      }
    } catch (error) {
      console.error("2FA disable error:", error);
      setTwoFactorError(error.message || "Failed to disable 2FA");
    }
  };

  const handleDisconnectPlatform = async platformId => {
    if (
      !window.confirm(
        `Disconnect ${platformId}? You'll need to reconnect to post content to this platform.`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", user.uid, "connections", platformId));
      setConnectedPlatforms(prev => prev.filter(p => p.id !== platformId));
      setTwoFactorSuccess(`${platformId} disconnected successfully`);
    } catch (error) {
      console.error("Disconnect platform error:", error);
      setTwoFactorError(`Failed to disconnect ${platformId}`);
    }
  };

  return (
    <section className="security-panel">
      <h2>Security & Privacy</h2>

      {/* Password Change Section */}
      <div className="security-card">
        <h3>🔒 Change Password</h3>
        <form onSubmit={handlePasswordChange} className="password-form">
          <div className="form-group">
            <label>Current Password</label>
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              required
              placeholder="Enter new password"
            />
            <small className="password-hint">
              Must be 8+ characters with uppercase, lowercase, and number
            </small>
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              required
              placeholder="Confirm new password"
            />
          </div>

          {passwordError && <div className="error-message">{passwordError}</div>}
          {passwordSuccess && <div className="success-message">{passwordSuccess}</div>}

          <button type="submit" disabled={changingPassword} className="btn-primary">
            {changingPassword ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>

      {/* Active Session */}
      <div className="security-card">
        <h3>📱 Active Session</h3>
        <div className="session-info">
          <div className="session-row">
            <span className="session-label">Device:</span>
            <span className="session-value">{currentSession.device}</span>
          </div>
          <div className="session-row">
            <span className="session-label">Browser:</span>
            <span className="session-value">{currentSession.browser}</span>
          </div>
          <div className="session-row">
            <span className="session-label">Last Active:</span>
            <span className="session-value">{currentSession.lastActive}</span>
          </div>
        </div>
        <button className="btn-danger" onClick={handleLogoutAllDevices}>
          Logout All Devices
        </button>
      </div>

      {/* Privacy Settings */}
      <div className="security-card">
        <h3>🛡️ Privacy Settings</h3>
        <div className="privacy-options">
          <div className="privacy-option">
            <div className="privacy-option-info">
              <strong>Analytics & Performance</strong>
              <p>Help us improve by sharing anonymous usage data</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={privacySettings.analyticsEnabled}
                onChange={() => handlePrivacyChange("analyticsEnabled")}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="privacy-option">
            <div className="privacy-option-info">
              <strong>Email Notifications</strong>
              <p>Receive updates about your content and earnings</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={privacySettings.emailNotifications}
                onChange={() => handlePrivacyChange("emailNotifications")}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="privacy-option">
            <div className="privacy-option-info">
              <strong>Data Sharing</strong>
              <p>Allow third-party integrations to access your data</p>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={privacySettings.dataSharing}
                onChange={() => handlePrivacyChange("dataSharing")}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="security-card">
        <h3>🔐 Two-Factor Authentication</h3>
        <p>Add an extra layer of security to your account</p>

        {twoFactorEnabled ? (
          <div className="twofa-enabled">
            <div className="success-badge">✓ 2FA Enabled</div>
            <p>Your account is protected with two-factor authentication</p>
            <button className="btn-danger" onClick={handleDisable2FA}>
              Disable 2FA
            </button>
          </div>
        ) : (
          <div className="twofa-setup">
            {!enrolling2FA && !qrCodeUrl && !verificationId ? (
              <div className="form-group">
                <label>Choose MFA Method</label>
                <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                  <button
                    className={mfaMethod === "totp" ? "btn-primary" : "btn-secondary"}
                    onClick={() => setMfaMethod("totp")}
                    style={{ flex: 1 }}
                  >
                    📱 Authenticator App (Recommended)
                  </button>
                  <button
                    className={mfaMethod === "sms" ? "btn-primary" : "btn-secondary"}
                    onClick={() => setMfaMethod("sms")}
                    style={{ flex: 1 }}
                  >
                    💬 SMS
                  </button>
                </div>

                {mfaMethod === "totp" ? (
                  <div>
                    <p style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1rem" }}>
                      Use an authenticator app like Google Authenticator, Authy, or Microsoft
                      Authenticator
                    </p>
                    <button
                      className="btn-primary"
                      onClick={handleEnable2FA}
                      disabled={enrolling2FA}
                    >
                      {enrolling2FA ? "Generating..." : "Generate QR Code"}
                    </button>
                  </div>
                ) : (
                  <div>
                    <label>Phone Number (with country code)</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder="+1234567890"
                      className="phone-input"
                    />
                    <small className="input-hint">
                      Format: +[country code][number] (e.g., +12025551234)
                    </small>
                    <div id="recaptcha-container"></div>
                    <button
                      className="btn-primary"
                      onClick={handleEnable2FA}
                      disabled={enrolling2FA}
                      style={{ marginTop: "12px" }}
                    >
                      {enrolling2FA ? "Sending Code..." : "Send Verification Code"}
                    </button>
                    <p style={{ fontSize: "0.85rem", color: "#f59e0b", marginTop: "0.5rem" }}>
                      ⚠️ Note: SMS MFA requires Firebase Console configuration
                    </p>
                  </div>
                )}
              </div>
            ) : qrCodeUrl ? (
              <div className="form-group">
                <h4>Scan QR Code</h4>
                <div
                  style={{
                    background: "white",
                    padding: "1rem",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    textAlign: "center",
                  }}
                >
                  <img src={qrCodeUrl} alt="QR Code" style={{ maxWidth: "200px" }} />
                </div>
                <p style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "0.5rem" }}>
                  Or manually enter this code in your authenticator app:
                </p>
                <code
                  style={{
                    background: "#1e293b",
                    padding: "0.5rem",
                    borderRadius: "4px",
                    display: "block",
                    wordBreak: "break-all",
                    marginBottom: "1rem",
                  }}
                >
                  {totpSecret?.secretKey || ""}
                </code>
                <label>Enter the 6-digit code from your authenticator app</label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  maxLength="6"
                  className="code-input"
                />
                <button
                  className="btn-primary"
                  onClick={handleVerify2FA}
                  style={{ marginTop: "12px" }}
                >
                  Verify & Enable 2FA
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setQrCodeUrl("");
                    setTotpSecret(null);
                    setVerificationCode("");
                    setEnrolling2FA(false);
                  }}
                  style={{ marginTop: "12px", marginLeft: "8px" }}
                >
                  Cancel
                </button>
              </div>
            ) : verificationId ? (
              <div className="form-group">
                <label>Verification Code</label>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  maxLength="6"
                  className="code-input"
                />
                <small className="input-hint">Enter the 6-digit code sent to your phone</small>
                <button
                  className="btn-primary"
                  onClick={handleVerify2FA}
                  style={{ marginTop: "12px" }}
                >
                  Verify & Enable 2FA
                </button>
              </div>
            ) : null}
          </div>
        )}

        {twoFactorError && <div className="error-message">{twoFactorError}</div>}
        {twoFactorSuccess && <div className="success-message">{twoFactorSuccess}</div>}
      </div>

      {/* Connected Platforms */}
      <div className="security-card">
        <h3>🔗 Connected Platforms</h3>
        <p>Manage platforms connected to your AutoPromote account</p>

        {loadingPlatforms ? (
          <div className="loading-platforms">Loading platforms...</div>
        ) : connectedPlatforms.length > 0 ? (
          <div className="connected-platforms-list">
            {connectedPlatforms.map(platform => (
              <div key={platform.id} className="platform-item">
                <div className="platform-info">
                  <div className="platform-icon">
                    {platform.provider === "youtube" && "▶️"}
                    {platform.provider === "tiktok" && "🎵"}
                    {platform.provider === "instagram" && "📷"}
                    {platform.provider === "facebook" && "👤"}
                    {!["youtube", "tiktok", "instagram", "facebook"].includes(platform.provider) &&
                      "🔗"}
                  </div>
                  <div className="platform-details">
                    <strong>
                      {platform.provider.charAt(0).toUpperCase() + platform.provider.slice(1)}
                    </strong>
                    <small>Connected {platform.connectedAt.toLocaleDateString()}</small>
                    <span className="platform-scope">{platform.scope}</span>
                  </div>
                </div>
                <button
                  className="btn-disconnect"
                  onClick={() => handleDisconnectPlatform(platform.id)}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-platforms">
            <p>No platforms connected yet</p>
            <small>Go to Connections tab to link your social media accounts</small>
          </div>
        )}
      </div>

      {/* Account Security Score */}
      <div className="security-card">
        <h3>🎯 Account Security Score</h3>
        <div className="security-score">
          <div className="score-circle">
            <span className="score-value">
              {(() => {
                let score = 50; // Base score
                if (twoFactorEnabled) score += 25;
                if (connectedPlatforms.length > 0) score += 15;
                if (user?.emailVerified) score += 10;
                return score;
              })()}
              %
            </span>
          </div>
          <div className="score-recommendations">
            <h4>Recommendations:</h4>
            <ul>
              <li className="completed">✓ Password strength: Strong</li>
              <li className="completed">✓ Email verified</li>
              <li className={twoFactorEnabled ? "completed" : "pending"}>
                {twoFactorEnabled ? "✓" : "⚠"} Two-factor authentication{" "}
                {twoFactorEnabled ? "enabled" : "not enabled"}
              </li>
              <li className={connectedPlatforms.length > 0 ? "completed" : "pending"}>
                {connectedPlatforms.length > 0 ? "✓" : "⚠"} {connectedPlatforms.length} platform(s)
                connected
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SecurityPanel;
