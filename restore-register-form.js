// restore-register-form.js
// This script restores the register form functionality in AuthSwitcher.js

const fs = require('fs');
const path = require('path');

const authSwitcherPath = path.join(__dirname, 'frontend', 'src', 'AuthSwitcher.js');

// Check if the file exists
if (!fs.existsSync(authSwitcherPath)) {
  console.error(`❌ Error: File not found at ${authSwitcherPath}`);
  process.exit(1);
}

// Read the current file
console.log(`Reading current AuthSwitcher.js...`);
const currentFile = fs.readFileSync(authSwitcherPath, 'utf8');

// Create the updated file content with register form
const updatedContent = `import React, { useState } from 'react';
import './App.css';
import LoginForm from './LoginForm';
import AdminLoginForm from './AdminLoginForm';
import RegisterForm from './RegisterForm';

function AuthSwitcher() {
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login', 'admin-login', 'register'

  const toggleAdminLogin = () => {
    setShowAdminLogin(!showAdminLogin);
    setAuthMode(showAdminLogin ? 'login' : 'admin-login');
  };

  const toggleRegister = () => {
    setAuthMode(authMode === 'register' ? 'login' : 'register');
  };

  return (
    <div className="auth-switcher">
      {authMode === 'login' && (
        <div>
          <LoginForm onLogin={(userData) => {
            // Handle regular user login
            // Pass data to parent or use context
            console.log('Regular user logged in:', userData);
          }} />
          <div className="auth-links">
            <button onClick={toggleAdminLogin} className="link-button">
              Admin Login
            </button>
            <button onClick={toggleRegister} className="link-button">
              Register New Account
            </button>
          </div>
        </div>
      )}

      {authMode === 'admin-login' && (
        <div>
          <AdminLoginForm onLogin={(userData) => {
            // Handle admin login
            // Pass data to parent or use context
            console.log('Admin logged in:', userData);
          }} />
          <div className="auth-links">
            <button onClick={toggleAdminLogin} className="link-button">
              Regular User Login
            </button>
          </div>
        </div>
      )}

      {authMode === 'register' && (
        <div>
          <RegisterForm registerUser={(userData) => {
            // Handle registration
            console.log('User registered:', userData);
          }} />
          <div className="auth-links">
            <button onClick={toggleRegister} className="link-button">
              Back to Login
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthSwitcher;
`;

// Write the updated content to a backup file first
const backupPath = path.join(__dirname, 'frontend', 'src', 'AuthSwitcher.js.backup');
fs.writeFileSync(backupPath, currentFile);
console.log(`✅ Backed up current file to ${backupPath}`);

// Write the updated content to the original file
fs.writeFileSync(authSwitcherPath, updatedContent);
console.log(`✅ Successfully restored register form functionality in AuthSwitcher.js`);

console.log(`\nImportant: Make sure your LoginForm.js and RegisterForm.js files exist!`);
console.log(`If they were deleted, you'll need to restore or recreate them.`);
