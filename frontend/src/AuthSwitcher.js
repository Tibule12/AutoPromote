import React, { useState } from 'react';
import './App.css';
import AdminLoginForm from './AdminLoginForm';

function AuthSwitcher() {
  const [authMode, setAuthMode] = useState('admin-login');
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [adminData, setAdminData] = useState(null);

  const handleAdminLogin = (userData) => {
    console.log('Admin logged in:', userData);
    setAdminLoggedIn(true);
    setAdminData(userData);
  };

  return (
    <div className="auth-switcher">
      {!adminLoggedIn ? (
        <div>
          <AdminLoginForm onLogin={handleAdminLogin} />
        </div>
      ) : (
        <div className="admin-success">
          <h2>Admin Login Successful</h2>
          <p>Welcome, {adminData.name || adminData.email}!</p>
          <p>You are now logged in as an administrator.</p>
          <p>Role: {adminData.role}</p>
          <p>User ID: {adminData.uid}</p>
          <button 
            onClick={() => window.location.href = '/admin-dashboard'} 
            className="auth-button"
            style={{ backgroundColor: '#2e7d32' }}
          >
            Go to Admin Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

export default AuthSwitcher;
