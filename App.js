// Front-end entry point
import React, { useState } from 'react';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  // Mock functions for user authentication
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
  };

  // Mock function for content upload
  const handleUploadContent = (contentData) => {
    setContent([...content, contentData]);
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
        
        {user && (
          <div>
            <ContentUploadForm onUpload={handleUploadContent} />
            <ContentList content={content} />
          </div>
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

// Mock Login Form Component
const LoginForm = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Mock login logic
    onLogin({ name: 'John Doe', email });
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

// Mock Register Form Component
const RegisterForm = ({ onRegister }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Mock registration logic
    onRegister({ name, email });
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

// Mock Content Upload Form Component
const ContentUploadForm = ({ onUpload }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('video');
  const [url, setUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Mock upload logic
    onUpload({ title, type, url });
    setTitle('');
    setUrl('');
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
      <button type="submit">Upload</button>
    </form>
  );
};

// Content List Component
const ContentList = ({ content }) => {
  return (
    <div>
      <h2>Your Content</h2>
      {content.length === 0 ? (
        <p>No content uploaded yet.</p>
      ) : (
        <ul>
          {content.map((item, index) => (
            <li key={index}>
              <h3>{item.title}</h3>
              <p>Type: {item.type}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer">View Content</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default App;
