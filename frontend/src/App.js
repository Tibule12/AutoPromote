import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    if (user) {
      setIsAdmin(user.role === 'admin');
      fetchUserContent();
      if (user.role === 'admin') {
        fetchAnalytics();
      }
    }
  }, [user]);

  const fetchUserContent = async () => {
    try {
      const res = await fetch('/api/content/user', {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      const data = await res.json();
      setContent(data.content || []);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/admin/analytics/overview', {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    }
  };

  const handleLogin = (userData) => {
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
  };

  const handleUploadContent = async (contentData) => {
    try {
      const res = await fetch('/api/content/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(contentData),
      });
      if (res.ok) {
        fetchUserContent();
      } else {
        console.error('Failed to upload content');
      }
    } catch (error) {
      console.error('Error uploading content:', error);
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
        {showLogin && <LoginForm onLogin={handleLogin} />}
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
          <div>
            <h2>Welcome to AutoPromote</h2>
            <p>AI-powered platform for content promotion and monetization</p>
            <button onClick={() => setShowRegister(true)}>Get Started</button>
          </div>
        )}
      </main>
    </div>
  );
}

const LoginForm = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        onLogin(data);
      } else {
        alert('Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Login</h2>
      <div>
        <label>Email:</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label>Password:</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <button type="submit">Login</button>
    </form>
  );
};

const RegisterForm = ({ onRegister }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        onRegister(data);
      } else {
        alert('Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Register</h2>
      <div>
        <label>Name:</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label>Email:</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <label>Password:</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <button type="submit">Register</button>
    </form>
  );
};

const ContentUploadForm = ({ onUpload }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('video');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpload({ title, type, url, description });
    setTitle('');
    setUrl('');
    setDescription('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Upload Content</h2>
      <div>
        <label>Title:</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div>
        <label>Type:</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
          <option value="image">Image</option>
          <option value="article">Article</option>
        </select>
      </div>
      <div>
        <label>URL:</label>
        <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </div>
      <div>
        <label>Description:</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <button type="submit">Upload</button>
    </form>
  );
};

const ContentList = ({ content }) => {
  return (
    <div>
      <h2>Your Content</h2>
      {content.length === 0 ? (
        <p>No content uploaded yet.</p>
      ) : (
        <ul>
          {content.map((item) => (
            <li key={item.id}>
              <h3>{item.title}</h3>
              <p>Type: {item.type}</p>
              <p>Description: {item.description}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer">View Content</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const AdminDashboard = ({ analytics, user }) => {
  const [users, setUsers] = useState([]);
  const [allContent, setAllContent] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loadingContentIds, setLoadingContentIds] = useState(new Set());

  useEffect(() => {
    if (analytics && user) {
      fetchAllUsers();
      fetchAllContent();
    }
  }, [analytics, user]);

  const fetchAllUsers = async () => {
    try {
      const res = await fetch('/api/admin/analytics/users', {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchAllContent = async () => {
    try {
      const res = await fetch('/api/admin/analytics/content', {
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      const data = await res.json();
      setAllContent(data.content || []);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    }
  };

  const promoteContent = async (contentId) => {
    try {
      setLoadingContentIds(prev => new Set(prev).add(contentId));
      const res = await fetch(`/api/content/promote/${contentId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
        },
      });
      if (res.ok) {
        alert('Content promotion started!');
        await fetchAllContent();
      } else {
        alert('Failed to start promotion');
      }
    } catch (error) {
      console.error('Failed to promote content:', error);
      alert('Failed to start promotion');
    } finally {
      setLoadingContentIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(contentId);
        return newSet;
      });
    }
  };

  if (!analytics) {
    return <div className="Loading">Loading admin dashboard...</div>;
  }

  return (
    <div className="AdminDashboard">
      <h2>🚀 Admin Dashboard</h2>
      
      <div className="tab-navigation">
        <button 
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button 
          className={activeTab === 'content' ? 'active' : ''}
          onClick={() => setActiveTab('content')}
        >
          🎬 Content
        </button>
        <button 
          className={activeTab === 'revenue' ? 'active' : ''}
          onClick={() => setActiveTab('revenue')}
        >
          💰 Revenue
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-grid">
          <div className="stat-card">
            <h3>👥 Total Users</h3>
            <p className="stat-number">{analytics.totalUsers}</p>
            <p className="stat-change">+{analytics.newUsersToday} today</p>
          </div>
          <div className="stat-card">
            <h3>🎬 Total Content</h3>
            <p className="stat-number">{analytics.totalContent}</p>
            <p className="stat-change">+{analytics.newContentToday} today</p>
          </div>
          <div className="stat-card">
            <h3>👀 Total Views</h3>
            <p className="stat-number">{analytics.totalViews.toLocaleString()}</p>
            <p className="stat-change">+{analytics.viewsToday.toLocaleString()} today</p>
          </div>
          <div className="stat-card">
            <h3>💰 Total Revenue</h3>
            <p className="stat-number">${analytics.totalRevenue.toLocaleString()}</p>
            <p className="stat-change">+${analytics.revenueToday.toLocaleString()} today</p>
          </div>
          <div className="stat-card">
            <h3>📈 Engagement Rate</h3>
            <p className="stat-number">{analytics.engagementRate}%</p>
            <p className="stat-change">{analytics.engagementChange >= 0 ? '+' : ''}{analytics.engagementChange}% change</p>
          </div>
          <div className="stat-card">
            <h3>⚡ Active Promotions</h3>
            <p className="stat-number">{analytics.activePromotions}</p>
            <p className="stat-change">{analytics.promotionsCompleted} completed</p>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="users-section">
          <h3>👥 User Management</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Content</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`role-badge ${user.role}`}>
                        {user.role}
                      </span>
                    </td>
                    <td>{user.content_count}</td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'content' && (
        <div className="content-section">
          <h3>🎬 Content Management</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>User</th>
                  <th>Views</th>
                  <th>Revenue</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allContent.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span className={`content-type ${item.type}`}>
                        {item.type}
                      </span>
                    </td>
                    <td>{item.user_name}</td>
                    <td>{item.views.toLocaleString()}</td>
                    <td>${item.revenue.toLocaleString()}</td>
                    <td>
                      <span className={`status-badge ${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="promote-btn"
                        onClick={() => promoteContent(item.id)}
                        disabled={item.status === 'promoting' || loadingContentIds.has(item.id)}
                      >
                        {loadingContentIds.has(item.id) ? 'Promoting...' : (item.status === 'promoting' ? 'Promoting...' : '🚀 Promote')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="revenue-section">
          <h3>💰 Revenue Analytics</h3>
          <div className="revenue-stats">
            <div className="revenue-card">
              <h4>Total Revenue</h4>
              <p className="revenue-amount">${analytics.totalRevenue.toLocaleString()}</p>
            </div>
            <div className="revenue-card">
              <h4>Today's Revenue</h4>
              <p className="revenue-amount">${analytics.revenueToday.toLocaleString()}</p>
            </div>
            <div className="revenue-card">
              <h4>Average per Content</h4>
              <p className="revenue-amount">${analytics.avgRevenuePerContent.toLocaleString()}</p>
            </div>
            <div className="revenue-card">
              <h4>Projected Monthly</h4>
              <p className="revenue-amount">${analytics.projectedMonthlyRevenue.toLocaleString()}</p>
            </div>
          </div>
          
          <div className="revenue-breakdown">
            <h4>Revenue by Platform</h4>
            <div className="platform-revenue">
              {analytics.revenueByPlatform && Object.entries(analytics.revenueByPlatform).map(([platform, amount]) => (
                <div key={platform} className="platform-item">
                  <span className="platform-name">{platform}</span>
                  <span className="platform-amount">${amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
