import React, { useState, useCallback } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import AuthAside from './AuthAside';
import { auth } from './firebaseClient';
import { API_ENDPOINTS } from './config';
import './Auth.css';

const AdminLoginForm = ({ onLogin }) => {
  const [formData, setFormData] = useState({ email: 'admin@autopromote.com', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const { email, password } = formData;
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user } = userCredential;
      const idToken = await user.getIdToken(true);

      try {
        const response = await fetch(API_ENDPOINTS.ADMIN_LOGIN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': window.location.origin
          },
          body: JSON.stringify({
            idToken,
            email,
            isAdminLogin: true
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Admin authentication failed');
        }

        const data = await response.json();
        if (!data.user.isAdmin && data.user.role !== 'admin') {
          throw new Error('Not authorized as admin');
        }

        onLogin({
          email: data.user.email,
          uid: data.user.uid,
          role: 'admin',
          isAdmin: true,
          name: data.user.name,
          token: data.token,
          fromCollection: data.user.fromCollection || 'admins'
        });
      } catch (fetchError) {
        throw new Error(`Failed to connect to server: ${fetchError.message}`);
      }
    } catch (submitError) {
      let errorMessage = 'Admin login failed. ';

      if (submitError.message && submitError.message.includes('Failed to connect to server')) {
        errorMessage += 'Cannot connect to the server. Please ensure the backend server is running on port 5000.';
      } else {
        switch (submitError.code) {
          case 'auth/invalid-credential':
            errorMessage += 'Invalid admin email or password.';
            break;
          case 'auth/user-not-found':
            errorMessage += 'No admin account exists with this email.';
            break;
          case 'auth/wrong-password':
            errorMessage += 'Incorrect admin password.';
            break;
          case 'auth/invalid-api-key':
            errorMessage += 'Invalid Firebase configuration. Please check the setup.';
            break;
          case 'auth/network-request-failed':
            errorMessage += 'Network error. Please check your connection.';
            break;
          default:
            errorMessage += submitError.message || 'Unknown error occurred.';
        }
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-content">
          <form onSubmit={handleSubmit} className="auth-form">
            <h2 className="auth-title">Admin Login</h2>
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter admin email"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Admin Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
                placeholder="Enter admin password"
                className="form-input"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="auth-button"
              style={{ backgroundColor: '#d32f2f' }}
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Signing in as Admin...
                </>
              ) : (
                'Sign In as Admin'
              )}
            </button>

            <div className="admin-login-help" style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
              <p>Default admin credentials:</p>
              <p>Email: admin@autopromote.com</p>
              <p>Password: AdminPassword123!</p>
            </div>

            <a href="#" onClick={() => window.location.reload()} className="auth-link">
              Go to user login
            </a>
          </form>
        </div>
        <AuthAside variant="admin" />
      </div>
    </div>
  );
};

export default AdminLoginForm;
