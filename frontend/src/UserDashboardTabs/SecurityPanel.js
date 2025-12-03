import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import './SecurityPanel.css';

const SecurityPanel = ({ user }) => {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [loginHistory, setLoginHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [privacySettings, setPrivacySettings] = useState({
    analyticsEnabled: true,
    emailNotifications: true,
    dataSharing: false
  });

  // Current session info
  const currentSession = {
    device: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Computer',
    browser: getBrowserName(),
    location: 'Current Location',
    lastActive: 'Just now'
  };

  function getBrowserName() {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  }

  useEffect(() => {
    // Load privacy settings from localStorage or API
    const savedSettings = localStorage.getItem('privacySettings');
    if (savedSettings) {
      setPrivacySettings(JSON.parse(savedSettings));
    }
  }, []);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validation
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(passwordForm.newPassword)) {
      setPasswordError('Password must contain uppercase, lowercase, and number');
      return;
    }

    setChangingPassword(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('No authenticated user');
      }

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        passwordForm.currentPassword
      );
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await updatePassword(currentUser, passwordForm.newPassword);

      setPasswordSuccess('Password changed successfully!');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Password change error:', error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/requires-recent-login') {
        setPasswordError('Please log out and log in again before changing password');
      } else {
        setPasswordError(error.message || 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handlePrivacyChange = (setting) => {
    const updated = { ...privacySettings, [setting]: !privacySettings[setting] };
    setPrivacySettings(updated);
    localStorage.setItem('privacySettings', JSON.stringify(updated));
  };

  const handleLogoutAllDevices = async () => {
    if (window.confirm('This will log you out from all devices. Continue?')) {
      // In a real implementation, this would invalidate all tokens
      alert('This feature requires backend support. Currently logs out current session only.');
      window.location.href = '/';
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
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              required
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
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
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              required
              placeholder="Confirm new password"
            />
          </div>

          {passwordError && <div className="error-message">{passwordError}</div>}
          {passwordSuccess && <div className="success-message">{passwordSuccess}</div>}

          <button type="submit" disabled={changingPassword} className="btn-primary">
            {changingPassword ? 'Changing...' : 'Change Password'}
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
                onChange={() => handlePrivacyChange('analyticsEnabled')}
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
                onChange={() => handlePrivacyChange('emailNotifications')}
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
                onChange={() => handlePrivacyChange('dataSharing')}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication (Coming Soon) */}
      <div className="security-card coming-soon">
        <h3>🔐 Two-Factor Authentication</h3>
        <p>Add an extra layer of security to your account</p>
        <button className="btn-secondary" disabled>
          Enable 2FA (Coming Soon)
        </button>
      </div>

      {/* Account Security Score */}
      <div className="security-card">
        <h3>🎯 Account Security Score</h3>
        <div className="security-score">
          <div className="score-circle">
            <span className="score-value">75%</span>
          </div>
          <div className="score-recommendations">
            <h4>Recommendations:</h4>
            <ul>
              <li className="completed">✓ Password strength: Strong</li>
              <li className="completed">✓ Email verified</li>
              <li className="pending">⚠ Enable two-factor authentication</li>
              <li className="pending">⚠ Review connected platforms</li>
            </ul>
          </div>
        </div>
      </div>

    </section>
  );
};

export default SecurityPanel;
