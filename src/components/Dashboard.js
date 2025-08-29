import React from 'react';

const Dashboard = ({ user, onLogout, onNavigate }) => {
  return (
    <div className="dashboard">
      <header className="App-header">
        <h1>AutoPromote Dashboard</h1>
        <nav>
          <span>Welcome, {user?.name} ({user?.role})</span>
          <button onClick={onLogout}>Logout</button>
        </nav>
      </header>

      <main>
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <h2>Content Management</h2>
            <p>Upload and manage your content for promotion</p>
            <button onClick={() => onNavigate('content')}>
              Manage Content
            </button>
          </div>

          <div className="dashboard-card">
            <h2>Analytics</h2>
            <p>View performance metrics and insights</p>
            <button onClick={() => onNavigate('analytics')}>
              View Analytics
            </button>
          </div>

          {user?.role === 'admin' && (
            <div className="dashboard-card">
              <h2>Admin Panel</h2>
              <p>Manage users and platform settings</p>
              <button onClick={() => onNavigate('admin')}>
                Admin Dashboard
              </button>
            </div>
          )}

          <div className="dashboard-card">
            <h2>Profile Settings</h2>
            <p>Update your account information</p>
            <button onClick={() => onNavigate('profile')}>
              Edit Profile
            </button>
          </div>
        </div>

        <div className="quick-stats">
          <h3>Quick Stats</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-number">0</span>
              <span className="stat-label">Content Items</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">0</span>
              <span className="stat-label">Total Views</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">$0</span>
              <span className="stat-label">Revenue</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">0%</span>
              <span className="stat-label">Engagement</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
