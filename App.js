import React, { useState, useEffect } from 'react';
import './App.css';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken } from 'firebase/auth';
import { app } from './firebaseConfig';

// Import all required components
import ContentUploadForm from './ContentUploadForm';
import ContentList from './ContentList';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import AdminDashboard from './AdminDashboard';

// Import API configuration
import { API_BASE_URL, apiUrl } from './config/apiConfig';

const auth = getAuth(app);
const storage = getStorage(app);
const STORAGE_PATH = 'uploads';

function App() {
  const [user, setUser] = useState(null);
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [termsRequired, setTermsRequired] = useState(false);
  const [requiredTermsVersion, setRequiredTermsVersion] = useState(null);

  useEffect(() => {
    if (user) {
      // Only set isAdmin true if backend says admin, never downgrade
      setIsAdmin(user.role === 'admin' || user.isAdmin === true);
      fetchUserProfile();
      fetchUserContent();
      if (user.role === 'admin' || user.isAdmin === true) {
        fetchAnalytics();
      }
    }
    // eslint-disable-next-line
  }, [user]);

  // Fetch user profile from backend (mirrors Firestore state)
  const fetchUserProfile = async () => {
    try {
      if (!auth.currentUser) return;
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch(apiUrl('/api/users/profile'), {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
  };

  const fetchUserContent = async () => {
    try {
      if (!auth.currentUser) return;
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch(apiUrl('/api/content/my-content'), {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        try {
          const body = await res.json();
          // If terms not accepted, surface a UI to accept and then retry
          if (res.status === 403 && body?.error === 'terms_not_accepted') {
            setTermsRequired(true);
            setRequiredTermsVersion(body.requiredVersion || null);
            return;
          }
        } catch (_) {
          /* ignore parse errors */
        }
        console.error('Failed to fetch content: HTTP', res.status);
        return;
      }
      const data = await res.json();
      setContent(data.content || []);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      if (!auth.currentUser) return;
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch(apiUrl('/api/admin/analytics/overview'), {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        try {
          const body = await res.json();
          if (res.status === 403 && body?.error === 'terms_not_accepted') {
            setTermsRequired(true);
            setRequiredTermsVersion(body.requiredVersion || null);
            return;
          }
        } catch (_) {}
        console.error('Failed to fetch analytics: HTTP', res.status);
        return;
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  // Updated loginUser function
  const loginUser = async (email, password) => {
    try {
      // Try direct Firebase Auth first
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        const idToken = await user.getIdToken();

        // Send the ID token to the backend
        const res = await fetch(apiUrl('/api/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, email }),
        });

        if (res.ok) {
          const data = await res.json();
          // Always preserve admin status from backend
          setUser({ ...data.user, token: idToken });
          setShowLogin(false);
          return;
        }
      } catch (firebaseError) {
        // If Firebase Auth fails, try backend authentication
      }

      // Try backend authentication
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();

        // If backend returns a custom token, exchange it for an ID token
        if (data.token && !data.token.startsWith('eyJ')) {
          try {
            const userCredential = await signInWithCustomToken(auth, data.token);
            const user = userCredential.user;
            const idToken = await user.getIdToken();
            setUser({ ...data.user, token: idToken });
          } catch (tokenExchangeError) {
            console.error('Failed to exchange custom token:', tokenExchangeError);
            alert('Login failed: Could not exchange custom token for ID token.');
            return;
          }
        } else {
          // If backend returns an ID token, use it
          setUser({ ...data.user, token: data.token });
        }

        setShowLogin(false);
      } else {
        const errorData = await res.json();
        alert('Login failed: ' + (errorData.error || 'Invalid credentials'));
      }
    } catch (error) {
      alert('Login error: ' + (error.message || 'Connection error'));
    }
  };

  const handleLogin = (userData) => {
    // Never downgrade admin to user
    setUser(prev => {
      if (prev && (prev.role === 'admin' || prev.isAdmin === true)) {
        return { ...prev, ...userData, role: 'admin', isAdmin: true };
      }
      return userData;
    });
    setShowLogin(false);
  };

  const handleRegister = (userData) => {
    setUser(userData);
    setShowRegister(false);
  };

  const handleLogout = () => {
    setUser(null);
    setContent([]);
    setAnalytics(null);
    setIsAdmin(false);
    setTermsRequired(false);
    setRequiredTermsVersion(null);
  };

  // Accept Terms helper: posts to /api/users/me/accept-terms and retries fetches
  const acceptTerms = async () => {
    try {
      if (!auth.currentUser) return;
      const idToken = await auth.currentUser.getIdToken(true);
      const payload = requiredTermsVersion ? { acceptedTermsVersion: requiredTermsVersion } : {};
      const res = await fetch(apiUrl('/api/users/me/accept-terms'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(()=>({}));
        alert('Failed to accept terms: ' + (body.error || res.status));
        return;
      }
      // Hide banner and retry data fetches
      setTermsRequired(false);
      setRequiredTermsVersion(null);
      await fetchUserContent();
      if (isAdmin) await fetchAnalytics();
    } catch (e) {
      console.error('acceptTerms error:', e);
      alert('Could not record terms acceptance. Please try again.');
    }
  };

  // Firebase-powered upload
  const handleUploadContent = async (contentData) => {
    try {

      let url;
      if (contentData.type === 'article') {
        url = contentData.articleText || undefined;
      } else {
        // Upload file to Firebase Storage
        const file = contentData.file;
        if (!file) {
          alert('No file selected!');
          return;
        }
        const filePath = `${STORAGE_PATH}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, file);
        url = await getDownloadURL(storageRef);
        if (!url) {
          alert('Could not get public URL for uploaded file.');
          return;
        }
      }

      // Only include url if valid
      const payload = {
        title: contentData.title,
        type: contentData.type,
        description: contentData.description || '',
        ...(url ? { url } : {})
      };

      if (!auth.currentUser) return;
      const idToken = await auth.currentUser.getIdToken(true);
      const res = await fetch(apiUrl('/api/content/upload'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        fetchUserContent();
      } else {
        const error = await res.json();
        console.error('Failed to upload content', error);
        alert(error.error || 'Failed to upload content');
      }
    } catch (error) {
      console.error('Error uploading content:', error);
      alert('Error uploading content: ' + error.message);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>AutoPromote</h1>
        <nav>
          {user ? (
            <div>
              <span>Welcome, {user.name}!</span>
              <button onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <div>
              <button onClick={() => { setShowLogin(true); setShowRegister(false); }}>Login</button>
              <button onClick={() => { setShowRegister(true); setShowLogin(false); }}>Register</button>
            </div>
          )}
        </nav>
      </header>

      <main>
        {user && termsRequired && (
          <div style={{
            background: '#fff3cd',
            color: '#856404',
            border: '1px solid #ffeeba',
            borderRadius: 8,
            padding: 16,
            marginBottom: 16
          }}>
            <strong>Action required:</strong> Please accept the latest Terms of Service{requiredTermsVersion ? ` (${requiredTermsVersion})` : ''} to continue.
            <div style={{ marginTop: 12 }}>
              <button onClick={acceptTerms} style={{
                background: '#856404', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer'
              }}>Accept Terms</button>
              <a href={apiUrl('/terms')} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>View Terms</a>
            </div>
          </div>
        )}
        {showLogin && <LoginForm onLogin={handleLogin} loginUser={loginUser} />}
        {showRegister && <RegisterForm onRegister={handleRegister} />}

        {user && !isAdmin && (
          <div>
            <ContentUploadForm onUpload={handleUploadContent} />
            <ContentList content={content} />
          </div>
        )}

        {user && isAdmin && (
          <AdminDashboard analytics={analytics} user={user} />
        )}

        {!user && !showLogin && !showRegister && (
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
      </main>
   </div>
  );
}

export default App;