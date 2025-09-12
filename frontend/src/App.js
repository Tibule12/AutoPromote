import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import { auth } from './firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { API_ENDPOINTS } from './config';
import LoginForm from './LoginForm';
import AdminLoginForm from './AdminLoginForm';
import RegisterForm from './RegisterForm';
import ContentUploadForm from './ContentUploadForm';
import ContentList from './ContentList';
import AdminDashboard from './AdminDashboard';
import EnvTest from './components/EnvTest';
import EnvChecker from './components/EnvChecker';
import DatabaseSync from './components/DatabaseSync';
import IntegrationTester from './components/IntegrationTester';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        handleLogout();
        return;
      }
      try {
        const token = await firebaseUser.getIdToken(true);
        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const hasAdminClaim = idTokenResult.claims.admin === true || idTokenResult.claims.role === 'admin';
        const storedUser = localStorage.getItem('user');
        const userData = storedUser ? JSON.parse(storedUser) : null;
        if (userData && userData.email === firebaseUser.email) {
          userData.token = token;
          userData.isAdmin = hasAdminClaim;
          userData.role = hasAdminClaim ? 'admin' : userData.role;
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
          setIsAdmin(hasAdminClaim || userData.role === 'admin');
        }
      } catch (error) {
        handleLogout();
      }
    });
    if (window.location.pathname === '/admin-login') {
      setShowAdminLogin(true);
      setShowLogin(false);
      setShowRegister(false);
    }
    return () => unsubscribe();
  }, []);

  const fetchUserContent = async (providedToken = null) => {
    try {
      let token = providedToken;
      if (!token) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          token = await currentUser.getIdToken(true);
        } else if (user && user.token) {
          token = user.token;
        } else {
          return;
        }
      }
      const res = await fetch(API_ENDPOINTS.MY_CONTENT, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      if (!res.ok) {
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchUserContent(freshToken);
        }
        return;
      }
      const data = await res.json();
      setContent(data.content || []);
    } catch (error) {}
  };

  const fetchAnalytics = async (providedToken = null) => {
    let token = providedToken;
    if (!token) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        token = await currentUser.getIdToken(true);
      } else if (user && user.token) {
        token = user.token;
      } else {
        return;
      }
    }
    if (!user || !user.role) {
      setIsAdmin(false);
      return;
    }
    const isAdminUser = user.role === 'admin' || user.isAdmin === true;
    if (!isAdminUser) {
      return;
    }
    try {
      const res = await fetch(API_ENDPOINTS.ADMIN_ANALYTICS, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      if (!res.ok) {
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchAnalytics(freshToken);
        }
        setIsAdmin(false);
        return;
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {}
  };

  const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user: firebaseUser } = userCredential;
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        const data = await res.json();
        // If backend returns a custom token, exchange it for an ID token
        if (data.customToken) {
          // Sign in with custom token
          const customUserCredential = await auth.signInWithCustomToken(data.customToken);
          const customIdToken = await customUserCredential.user.getIdToken();
          handleLogin({ ...data.user, token: customIdToken });
        } else {
          handleLogin({ ...data.user, token: idToken });
        }
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Login failed');
      }
    } catch (error) {
      alert(error.message || 'Login failed');
    }
  };

  const registerUser = async (name, email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      await updateProfile(firebaseUser, { displayName: name });
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(API_ENDPOINTS.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ name, email, uid: firebaseUser.uid, idToken }),
      });
      if (res.ok) {
        const data = await res.json();
        handleRegister({ ...data.user, token: idToken, uid: firebaseUser.uid });
        alert('Registration successful! You are now logged in.');
      } else {
        handleRegister({ uid: firebaseUser.uid, email, name, token: idToken, role: 'user' });
        alert('Registration partially successful. Some features may be limited.');
      }
    } catch (error) {
      alert('Registration failed: ' + (error.message || 'Unknown error'));
    }
  };

  const handleLogin = async (userData) => {
    try {
      localStorage.clear();
      if (!userData || !userData.role) {
        setShowLogin(true);
        setUser(null);
        setIsAdmin(false);
        return;
      }
      if (!userData.token) {
        return;
      }
      const forceAdmin = userData.role === 'admin' || userData.isAdmin === true;
      const updatedUserData = { ...userData, role: forceAdmin ? 'admin' : userData.role, isAdmin: forceAdmin };
      localStorage.setItem('user', JSON.stringify(updatedUserData));
      setUser(updatedUserData);
      setIsAdmin(forceAdmin);
      setShowLogin(false);
      if (forceAdmin) {
        await fetchAnalytics();
        navigate('/admin-dashboard');
      } else {
        await fetchUserContent();
        navigate('/');
      }
    } catch (error) {
      handleLogout();
    }
  };

  const handleRegister = (userData) => {
    setUser(userData);
    setShowRegister(false);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      setContent([]);
      setIsAdmin(false);
      setShowLogin(false);
      setShowRegister(false);
      setShowAdminLogin(false);
      localStorage.clear();
      navigate('/');
    } catch (error) {}
  };

  return (
    <div className="App">
      <EnvTest />
      <EnvChecker />
      <DatabaseSync />
      <header className="App-header">
        <h1>AutoPromote</h1>
        <nav>
          {user ? (
            <div>
              <span>Welcome, {user.name}!</span>
              <button onClick={handleLogout}>Logout</button>
              {isAdmin && (
                <button onClick={() => navigate('/integration-test')} style={{ marginLeft: '10px' }}>
                  Run Tests
                </button>
              )}
            </div>
          ) : (
            <div>
              <button onClick={() => { setShowLogin(true); setShowRegister(false); setShowAdminLogin(false); }}>Login</button>
              <button onClick={() => { setShowRegister(true); setShowLogin(false); setShowAdminLogin(false); }}>Register</button>
            </div>
          )}
        </nav>
      </header>
      <Routes>
        <Route path="/admin-dashboard" element={<AdminDashboard analytics={analytics} user={user} />} />
        <Route path="/integration-test" element={<IntegrationTester />} />
        <Route path="/" element={
          <>
            {showLogin && <LoginForm onLogin={handleLogin} loginUser={loginUser} />}
            {showAdminLogin && <AdminLoginForm onLogin={handleLogin} />}
            {showRegister && <RegisterForm registerUser={registerUser} />}
            {user && !(isAdmin || user.role === 'admin' || user.isAdmin === true) && (
              <>
                <ContentUploadForm onUpload={() => {}} />
                <ContentList content={content} />
              </>
            )}
            {!user && !showLogin && !showRegister && !showAdminLogin && (
              <div className="WelcomeSection" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '60vh',
                background: 'linear-gradient(135deg, #1976d2 0%, #64b5f6 100%)',
                color: '#fff',
                borderRadius: '16px',
                boxShadow: '0 8px 32px rgba(25, 118, 210, 0.2)',
                padding: '48px 24px',
                margin: '32px auto',
                maxWidth: '500px',
              }}>
                <img src="https://cdn-icons-png.flaticon.com/512/3135/3135715.png" alt="AutoPromote Logo" style={{ width: 80, marginBottom: 24 }} />
                <h2 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: 16 }}>Welcome to AutoPromote</h2>
                <p style={{ fontSize: '1.2rem', marginBottom: 32, textAlign: 'center', maxWidth: 400 }}>
                  <span style={{ fontWeight: 500 }}>AI-powered platform</span> for content promotion and monetization.<br />
                  Grow your audience, boost your revenue, and automate your success.
                </p>
                <button 
                  onClick={() => setShowRegister(true)}
                  style={{
                    background: '#fff',
                    color: '#1976d2',
                    fontWeight: 600,
                    fontSize: '1.1rem',
                    padding: '12px 32px',
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseOver={e => e.target.style.background = '#e3f2fd'}
                  onMouseOut={e => e.target.style.background = '#fff'}
                >
                  Get Started
                </button>
              </div>
            )}
          </>
        } />
      </Routes>
    </div>
  );
}

export default App;