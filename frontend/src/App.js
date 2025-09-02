import React, { useState, useEffect } from 'react';
import './App.css';
import { createClient } from '@supabase/supabase-js';

// Use your actual Supabase credentials from .env
const supabaseUrl = 'https://ktmmwvxbhzujphxvycvt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bW13dnhiaHp1anBoeHZ5Y3Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NTE0MTIsImV4cCI6MjA3MjAyNzQxMn0.xqPnkrXlNv05zJ_BmyY4vXch2DveAgmDfrQ1foYdVLI';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
      setIsAdmin(user.role === 'admin');
      fetchUserContent();
      if (user.role === 'admin') {
        fetchAnalytics();
      }
    } else {
      localStorage.removeItem('user');
    }
    // eslint-disable-next-line
  }, [user]);

  const fetchUserContent = async () => {
    try {
      const res = await fetch('https://autopromote.onrender.com/api/content/my-content', {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
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
      const res = await fetch('https://autopromote.onrender.com/api/admin/analytics/overview', {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      if (res.status === 401) {
        handleLogout();
        return;
      }
      if (!res.ok) {
        console.error('Failed to fetch analytics: HTTP', res.status);
        return;
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const loginUser = async (email, password) => {
    try {
      const res = await fetch('https://autopromote.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        handleLogin({ ...data.user, token: data.token });
      } else {
        alert('Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login error');
    }
  };

  const handleLogin = (userData) => {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    setUser(userData);
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
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
  };

  // Supabase-powered upload
  const handleUploadContent = async (contentData) => {
    try {
      let url = '';
      if (contentData.type === 'article') {
        url = contentData.articleText || '';
      } else {
        // Upload file to Supabase Storage
        const file = contentData.file;
        const filePath = `${Date.now()}_${file.name}`;
        let { error } = await supabase.storage
          .from('content-files') // Make sure this bucket exists!
          .upload(filePath, file);

        if (error) {
          alert('File upload failed: ' + error.message);
          return;
        }

        // Get public URL
        const { data: publicUrlData } = supabase
          .storage
          .from('content-files')
          .getPublicUrl(filePath);

        url = publicUrlData.publicUrl;
      }

      const payload = {
        title: contentData.title,
        type: contentData.type,
        url,
        description: contentData.description || '',
      };

      const res = await fetch('https://autopromote.onrender.com/api/content/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
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

// ...LoginForm, RegisterForm, ContentUploadForm, ContentList, AdminDashboard remain unchanged...

export default App;