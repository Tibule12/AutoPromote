import React, { useState, useCallback } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebaseClient';
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
      
      console.log('Attempting admin login with:', email);
      
      // Sign in with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user } = userCredential;

      console.log('Firebase admin auth successful, getting ID token...');
      
      // Get the ID token
      const idToken = await user.getIdToken(true);  // Force refresh the token to ensure it's up-to-date

      // Verify token and get user data from our backend - use admin-specific endpoint
      const apiUrl = 'http://localhost:5000'; // Updated port to 5000
      console.log('Using API URL for admin login:', apiUrl);
      
      try {
        const response = await fetch(`${apiUrl}/api/auth/admin-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': window.location.origin
          },
          body: JSON.stringify({ 
            idToken,
            email: email,
            isAdminLogin: true
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Admin login server response:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(errorData.error || 'Admin authentication failed');
        }

        const data = await response.json();
        
        // Verify this is actually an admin user
        if (!data.user.isAdmin && data.user.role !== 'admin') {
          throw new Error('Not authorized as admin');
        }
        
        // Pass user info to parent component
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
        console.error('API fetch error:', fetchError);
        throw new Error(`Failed to connect to server: ${fetchError.message}`);
      }
    } catch (error) {
      console.error('Admin login error:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        fullError: JSON.stringify(error, null, 2)
      });
      
      let errorMessage = 'Admin login failed. ';
      
      if (error.message && error.message.includes('Failed to connect to server')) {
        errorMessage += 'Cannot connect to the server. Please ensure the backend server is running on port 5000.';
      } else {
        switch (error.code) {
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
            errorMessage += `${error.message}`;
        }
      }
      
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form onSubmit={handleSubmit} className="auth-form">
        <h2 className="auth-title">Admin Login</h2>
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
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
          style={{ backgroundColor: '#d32f2f' }} // Different color for admin login
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
  );
};

export default AdminLoginForm;
