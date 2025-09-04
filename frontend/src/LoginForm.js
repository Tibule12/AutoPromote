import React, { useState, useCallback } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebaseClient';
import './Auth.css';

const LoginForm = ({ onLogin }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
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

      console.log('Attempting login with:', email);

      // Sign in with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user } = userCredential;

      console.log('Firebase auth successful, getting ID token...');

      // Get the ID token
      const idToken = await user.getIdToken(true);  // Force refresh the token

      // Get user claims to determine role
      const idTokenResult = await user.getIdTokenResult(true);
      const isAdmin = idTokenResult.claims.admin === true || idTokenResult.claims.role === 'admin';

      console.log('User claims:', {
        admin: idTokenResult.claims.admin,
        role: idTokenResult.claims.role,
        isAdmin
      });

      // Prepare user data for the app
      const userData = {
        email: user.email,
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0],
        role: isAdmin ? 'admin' : 'user',
        isAdmin,
        token: idToken
      };

      console.log('Login successful:', userData);

      // Pass user info to parent component
      onLogin(userData);

    } catch (error) {
      console.error('Login error:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message
      });

      let errorMessage = 'Login failed. ';
      switch (error.code) {
        case 'auth/invalid-credential':
          errorMessage += 'Invalid email or password.';
          break;
        case 'auth/user-not-found':
          errorMessage += 'No account exists with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage += 'Incorrect password.';
          break;
        case 'auth/invalid-api-key':
          errorMessage += 'Invalid Firebase configuration. Please check the setup.';
          break;
        case 'auth/network-request-failed':
          errorMessage += 'Network error. Please check your connection.';
          break;
        case 'auth/too-many-requests':
          errorMessage += 'Too many failed login attempts. Please try again later.';
          break;
        default:
          errorMessage += error.message;
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-title">Welcome Back</h2>
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

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

        <button
          type="submit"
          disabled={isLoading}
          className="auth-button"
        >
          {isLoading ? (
            <>
              <span className="loading-spinner"></span>
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>

        <a href="#" onClick={() => window.location.reload()} className="auth-link">
          Don't have an account? Create one
        </a>
      </form>
    </div>
  );
};

export default LoginForm;
