import React, { useState, useEffect } from 'react';
import './App.css';
import { auth, db, storage } from './firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import LoginForm from './LoginForm';
import AdminLoginForm from './AdminLoginForm';
import RegisterForm from './RegisterForm';
import ContentUploadForm from './ContentUploadForm';
import ContentList from './ContentList';
import AdminDashboard from './AdminDashboard';
import EnvTest from './components/EnvTest';
import EnvChecker from './components/EnvChecker';

function App() {
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

  // Authentication listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        // User is signed out of Firebase
        handleLogout();
        return;
      }

      try {
        // Get a fresh token
        const token = await firebaseUser.getIdToken(true);
        
        // Get the latest claims
        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const hasAdminClaim = idTokenResult.claims.admin === true || idTokenResult.claims.role === 'admin';
        
        // Check for stored user data
        const storedUser = localStorage.getItem('user');
        const userData = storedUser ? JSON.parse(storedUser) : null;
        
        if (userData && userData.email === firebaseUser.email) {
          // Update the token and admin status in the stored data
          userData.token = token;
          userData.isAdmin = hasAdminClaim;
          userData.role = hasAdminClaim ? 'admin' : userData.role;
          
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
          setIsAdmin(hasAdminClaim || userData.role === 'admin');
          
          console.log('Updated user state with new token and claims:', {
            email: userData.email,
            role: userData.role,
            isAdmin: hasAdminClaim
          });
        }

        console.log('Firebase auth state changed:', firebaseUser.email, 'Admin:', hasAdminClaim);
      } catch (error) {
        console.error('Error refreshing token:', error);
        handleLogout();
      }
    });

    // Check if we need to show admin login form based on URL
    if (window.location.pathname === '/admin-login') {
      setShowAdminLogin(true);
      setShowLogin(false);
      setShowRegister(false);
    }

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && user.token) {
      setIsAdmin(user.role === 'admin');
      if (user.role === 'admin') {
        fetchAnalytics();
      } else {
        fetchUserContent();
      }
    }
    // eslint-disable-next-line
  }, [user]);

  const fetchUserContent = async () => {
    try {
      if (!user || !user.token) {
        console.log('No user or token available');
        return;
      }

      console.log('Fetching user content with fresh token');

      // Get a fresh token
      const currentUser = auth.currentUser;
      const freshToken = currentUser ? await currentUser.getIdToken(true) : user.token;

      // Try local API first, then remote as fallback
      let res = null;
      let error = null;

      try {
        res = await fetch('http://localhost:5000/api/content/my-content', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${freshToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': 'http://localhost:3000'
          },
          mode: 'cors'
        });
        console.log('Local content fetch response status:', res.status);
      } catch (localError) {
        console.warn('Local content fetch API failed, trying remote:', localError);
        error = localError;
      }

      // If local fails or returns non-2xx, try remote
      if (!res || !res.ok) {
        try {
          res = await fetch('https://autopromote.onrender.com/api/content/my-content', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${freshToken}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Origin': 'http://localhost:3000'
            },
            mode: 'cors'
          });
          console.log('Remote content fetch response status:', res.status);
        } catch (remoteError) {
          console.error('Remote content fetch API also failed:', remoteError);
          error = error || remoteError;
        }
      }

      if (!res || !res.ok) {
        if (res && res.status === 401) {
          console.error('Content fetch authentication failed:', await res.text());
          // Don't immediately log out - user might still be valid but token expired
          alert('Authentication failed. Please try logging in again.');
          return;
        }

        console.error('Failed to fetch content:', res ? res.status : 'No response');
        return;
      }

      const data = await res.json();
      console.log('User content fetched successfully, items:', data.content?.length || 0);
      setContent(data.content || []);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    }
  };

  const fetchAnalytics = async () => {
    if (!user || !user.token) {
      console.log('No user or token available for analytics');
      return;
    }
    
    // Check admin status again to be sure
    const isAdminUser = user.role === 'admin' || user.isAdmin === true;
    if (!isAdminUser) {
      console.error('Non-admin user attempting to fetch analytics');
      return;
    }
    
    try {
      console.log('Fetching admin analytics with token');
      
      // Try both endpoints - first the local one, then the remote one if needed
      let res = null;
      let error = null;
      
      try {
        res = await fetch('http://localhost:5000/api/admin/analytics/overview', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        console.log('Local analytics API response status:', res.status);
      } catch (localError) {
        console.warn('Local analytics API failed, trying remote:', localError);
        error = localError;
      }
      
      // If local fails or returns non-2xx, try remote
      if (!res || !res.ok) {
        try {
          res = await fetch('https://autopromote.onrender.com/api/admin/analytics/overview', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${user.token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          });
          console.log('Remote analytics API response status:', res.status);
        } catch (remoteError) {
          console.error('Remote analytics API also failed:', remoteError);
          error = error || remoteError;
        }
      }
      
      if (!res || !res.ok) {
        if (res && res.status === 401) {
          console.error('Admin authentication failed:', await res.text());
          // Don't log out - user might still be valid but not admin
          setIsAdmin(false);
          return;
        }
        
        console.error('Failed to fetch analytics:', res ? res.status : 'No response');
        return;
      }
      
      const data = await res.json();
      console.log('Analytics data received:', Object.keys(data).length, 'fields');
      setAnalytics(data);
    } catch (error) {
      console.error('Error in fetchAnalytics:', error);
    }
  };

  const loginUser = async (email, password) => {
    try {
      // Sign in with Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user: firebaseUser } = userCredential;

      // Get the ID token
      const idToken = await firebaseUser.getIdToken();
      console.log('Firebase ID token length:', idToken.length);

      // Verify token with our backend
      const res = await fetch('https://autopromote.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'http://localhost:3000'
        },
        body: JSON.stringify({ idToken }),
      });

      if (res.ok) {
        const data = await res.json();
        // Use the idToken directly instead of the one from the server
        // This ensures we're using the full Firebase ID token
        handleLogin({
          ...data.user,
          token: idToken // Use the original Firebase token
        });
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert(error.message || 'Login failed');
    }
  };

  const registerUser = async (name, email, password) => {
    try {
      const res = await fetch('https://autopromote.onrender.com/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        handleRegister({ ...data.user, token: data.token });
      } else {
        alert('Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration error');
    }
  };

  const handleLogin = async (userData) => {
    try {
      // Clear any existing data
      localStorage.clear();
      
      // Ensure we have a token
      if (!userData.token) {
        console.error('No token provided in user data');
        return;
      }
      
      // Log token info for debugging
      console.log('Token received, length:', userData.token.length);
      
      // Check for admin status from various sources
      const isAdminRole = userData.role === 'admin';
      const hasAdminClaim = userData.isAdmin === true;
      const isAdminUser = isAdminRole || hasAdminClaim;
      
      // Log the authentication data
      console.log('Logging in user:', {
        email: userData.email,
        role: userData.role,
        isAdmin: isAdminUser,
        hasToken: Boolean(userData.token),
        tokenLength: userData.token.length
      });
      
      // Update the user data with definitive admin status
      const updatedUserData = {
        ...userData,
        role: isAdminUser ? 'admin' : userData.role,
        isAdmin: isAdminUser
      };
      
      // Store the complete user data
      localStorage.setItem('user', JSON.stringify(updatedUserData));
      
      // Update the state
      setUser(updatedUserData);
      setIsAdmin(isAdminUser);
      setShowLogin(false);
      
      console.log('Login successful:', updatedUserData.role, 'IsAdmin:', isAdminUser);
      
      // Fetch data based on user role
      if (isAdminUser) {
        await fetchAnalytics();
      } else {
        await fetchUserContent();
      }
    } catch (error) {
      console.error('Error during login:', error);
      handleLogout();
    }
  };

  const handleRegister = (userData) => {
    setUser(userData);
    setShowRegister(false);
  };

  const handleLogout = async () => {
    try {
      // Sign out from Firebase
      await auth.signOut();
      
      // Clear local state
      setUser(null);
      setContent([]);
      setAnalytics(null);
      setIsAdmin(false);
      
      // Clear local storage
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Firebase Storage upload with improved token handling
  const handleUploadContent = async (contentData) => {
    let retryCount = 0;
    const maxRetries = 2;

    const upload = async () => {
      try {
        let url = '';
        if (contentData.type === 'article') {
          url = contentData.articleText || '';
        } else {
          const file = contentData.file;
          if (!file) {
            alert('No file selected!');
            return;
          }

          console.log('Uploading file:', file);

          if (file.size > 50 * 1024 * 1024) {
            alert('File is too large. Max 50MB allowed.');
            return;
          }

          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error('No authenticated user found');
          }

          const filePath = `content/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, filePath);

          console.log('Starting file upload to:', filePath);

          const uploadResult = await uploadBytes(storageRef, file);
          console.log('Upload completed:', uploadResult);

          url = await getDownloadURL(storageRef);
          console.log('Download URL obtained:', url);

          if (!url) {
            alert('Could not get download URL for uploaded file.');
            return;
          }
        }

        const payload = {
          title: contentData.title,
          type: contentData.type,
          url,
          description: contentData.description || '',
        };

        // Ensure we have a fresh token for API call
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          throw new Error('User not authenticated for API call');
        }

        console.log('Getting fresh token for API call...');
        const freshToken = await firebaseUser.getIdToken(true);
        console.log('Fresh token obtained, length:', freshToken.length);

        console.log('Uploading content with fresh token');

        let res = null;
        let error = null;

        // Try local endpoint first
        try {
          console.log('Attempting local upload...');
          res = await fetch('http://localhost:5000/api/content/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${freshToken}`,
              'Accept': 'application/json',
              'Origin': 'http://localhost:3000'
            },
            body: JSON.stringify(payload),
          });
          console.log('Local content upload response status:', res.status);

          // If local returns 401, try to get a completely fresh token
          if (res.status === 401) {
            console.log('Local auth failed, getting completely fresh token...');
            const completelyFreshToken = await firebaseUser.getIdToken(true);
            console.log('Completely fresh token obtained');

            res = await fetch('http://localhost:5000/api/content/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${completelyFreshToken}`,
                'Accept': 'application/json',
                'Origin': 'http://localhost:3000'
              },
              body: JSON.stringify(payload),
            });
            console.log('Retry local content upload response status:', res.status);
          }
        } catch (localError) {
          console.warn('Local content upload API failed, trying remote:', localError);
          error = localError;
        }

        // If local fails or returns non-2xx, try remote
        if (!res || !res.ok) {
          try {
            console.log('Attempting remote upload...');
            // Get another fresh token for remote call
            const remoteFreshToken = await firebaseUser.getIdToken(true);
            res = await fetch('https://autopromote.onrender.com/api/content/upload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${remoteFreshToken}`,
                'Accept': 'application/json',
                'Origin': 'http://localhost:3000'
              },
              body: JSON.stringify(payload),
            });
            console.log('Remote content upload response status:', res.status);
          } catch (remoteError) {
            console.error('Remote content upload API also failed:', remoteError);
            error = error || remoteError;
          }
        }

        if (!res || !res.ok) {
          if (res && res.status === 401) {
            console.error('Content upload authentication failed:', await res.text());
            alert('Authentication failed. Please try logging in again.');
            return;
          }

          console.error('Failed to upload content:', res ? res.status : 'No response');
          const errorText = res ? await res.text() : 'Network error';
          console.error('Error details:', errorText);
          alert(`Failed to upload content: ${errorText}`);
          return;
        }

        const result = await res.json();
        console.log('Content uploaded successfully:', result);
        alert('Content uploaded successfully!');

        // Refresh content list
        fetchUserContent();
      } catch (error) {
        console.error('Error uploading content:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying upload (${retryCount}/${maxRetries})...`);
          await upload();
        } else {
          alert('Error uploading content: ' + error.message);
        }
      }
    };

    await upload();
  };

  return (
    <div className="App">
      <EnvTest />
      <EnvChecker />
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
              <button onClick={() => { setShowLogin(true); setShowRegister(false); setShowAdminLogin(false); }}>Login</button>
              <button onClick={() => { setShowRegister(true); setShowLogin(false); setShowAdminLogin(false); }}>Register</button>
            </div>
          )}
        </nav>
      </header>

      <main>
        {showLogin && (
          <div>
            <LoginForm onLogin={handleLogin} loginUser={loginUser} />
          </div>
        )}
        
        {/* Admin login form is only rendered when showAdminLogin is true */}
        {showAdminLogin && (
          <div>
            <AdminLoginForm onLogin={handleLogin} />
            <div style={{ textAlign: 'center', margin: '15px 0' }}>
              <button 
                onClick={() => { setShowLogin(true); setShowRegister(false); setShowAdminLogin(false); }}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: '#1976d2', 
                  textDecoration: 'underline',
                  cursor: 'pointer' 
                }}
              >
                Back to Login
              </button>
            </div>
          </div>
        )}
        
        {showRegister && <RegisterForm registerUser={registerUser} />}

        {user && (
          <>
            {isAdmin || user.role === 'admin' || user.isAdmin === true ? (
              <AdminDashboard analytics={analytics} user={user} />
            ) : (
              <div>
                <ContentUploadForm onUpload={handleUploadContent} />
                <ContentList content={content} />
              </div>
            )}
          </>
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

// ...LoginForm, RegisterForm, ContentUploadForm, ContentList, AdminDashboard remain unchanged...

export default App;