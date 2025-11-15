import React, { useState, useCallback } from 'react';
import AuthAside from './AuthAside';
import './Auth.css';

const RegisterForm = ({ onRegister, onClose }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  }, [error, success]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    const { name, email, password, confirmPassword } = formData;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }

    try {
      // Use the onRegister function passed from App.js
      await onRegister(name, email, password);

      setSuccess('Registration successful! Please check your email to verify your account before logging in.');
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
      });
      // After short delay, show login (consumer can reload / parent will swap component)
      setTimeout(() => {
        try {
          if (typeof window !== 'undefined') window.location.href = '/';
        } catch (_) {}
      }, 4000);
    } catch (error) {
      console.error('Registration error:', error);
      let errorMessage = 'Registration failed. ';

      if (error.code) {
        switch (error.code) {
          case 'auth/email-already-in-use':
            errorMessage += 'This email is already registered.';
            break;
          case 'auth/invalid-email':
            errorMessage += 'Invalid email address.';
            break;
          case 'auth/operation-not-allowed':
            errorMessage += 'Email/password accounts are not enabled. Please contact support.';
            break;
          case 'auth/weak-password':
            errorMessage += 'Please choose a stronger password (at least 6 characters).';
            break;
          default:
            errorMessage += error.message;
        }
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
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
            <h2 className="auth-title">Create Account</h2>
            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

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
              <p className="password-requirements">
                Password must be at least 6 characters long
              </p>
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

            <button 
              type="submit" 
              disabled={isLoading}
              className="auth-button"
            >
              {isLoading ? (
                <>
                  <span className="loading-spinner"></span>
                  Creating your account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
            
            <a href="#" onClick={(e) => { e.preventDefault(); if (onClose) onClose(); }} className="auth-link">
              Already have an account? Sign in
            </a>
          </form>
        </div>
        <AuthAside />
      </div>
    </div>
  );
};

export default RegisterForm;
