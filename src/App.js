import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ContentManager from './components/ContentManager';
import Analytics from './components/Analytics';

function App() {
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState('login');
  const [token, setToken] = useState(localStorage.getItem('token'));

  const fetchUserProfile = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setCurrentView('dashboard');
      } else {
        localStorage.removeItem('token');
        setToken(null);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  }, [token]);

  useEffect(() => {
    // Check if user is logged in
    if (token) {
      fetchUserProfile();
    }
  }, [token, fetchUserProfile]);

  const handleLogin = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setCurrentView('login');
  };

  const renderView = () => {
    switch (currentView) {
      case 'login':
        return <Login onLogin={handleLogin} onSwitchToRegister={() => setCurrentView('register')} />;
      case 'register':
        return <Register onRegister={handleLogin} onSwitchToLogin={() => setCurrentView('login')} />;
      case 'dashboard':
        return <Dashboard user={user} onLogout={handleLogout} onNavigate={setCurrentView} />;
      case 'content':
        return <ContentManager user={user} token={token} onBack={() => setCurrentView('dashboard')} />;
      case 'analytics':
        return <Analytics user={user} token={token} onBack={() => setCurrentView('dashboard')} />;
      default:
        return <Login onLogin={handleLogin} onSwitchToRegister={() => setCurrentView('register')} />;
    }
  };

  return (
    <div className="App">
      {renderView()}
    </div>
  );
}

export default App;
