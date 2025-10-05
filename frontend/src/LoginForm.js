import React, { useState, useCallback } from 'react';
import './Auth.css';

const LoginForm = ({ onLogin, loginUser }) => {
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
      
      // Use the loginUser function passed from App.js
      await loginUser(email, password);
      
    } catch (error) {
      console.error('Login error:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message
      });

      let errorMessage = 'Login failed. ';
      if (error.code) {
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
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const [resetRequested,setResetRequested] = useState(false);
  const [resetEmail,setResetEmail] = useState('');
  const [resetMsg,setResetMsg] = useState('');
  const requestReset = async (e) => {
    e.preventDefault(); setResetMsg('');
    const email = resetEmail || formData.email; if(!email) { setResetMsg('Enter email first'); return; }
    try {
      const res = await fetch((process.env.REACT_APP_API_BASE||'') + '/api/auth/request-password-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
      const data = await res.json().catch(()=>({}));
      if(res.ok) setResetMsg(data.message || 'If the email exists, a reset link has been sent.'); else setResetMsg(data.error || 'Request failed');
    } catch(err){ setResetMsg(err.message); }
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

        <div className="form-group" style={{marginTop:8}}>
          <small>
            <a href="#" onClick={(e)=>{ e.preventDefault(); setResetRequested(r=>!r); }}>
              {resetRequested ? 'Hide password reset' : 'Forgot password?'}
            </a>
          </small>
        </div>
        {resetRequested && (
          <div style={{marginBottom:12}}>
            <input type="email" placeholder="Email for reset" className="form-input" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} />
            <button type="button" className="auth-button" style={{marginTop:8}} onClick={requestReset}>Send Reset Email</button>
            {resetMsg && <div style={{marginTop:6, fontSize:12, color:'#1976d2'}}>{resetMsg}</div>}
          </div>
        )}

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
