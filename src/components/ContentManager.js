import React, { useState, useEffect, useCallback } from 'react';

const ContentManager = ({ user, token, onBack }) => {
  const [content, setContent] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    type: 'video',
    url: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchContent = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:5000/api/content', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setContent(data);
      }
    } catch (error) {
      console.error('Error fetching content:', error);
    }
  }, [token]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('http://localhost:5000/api/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess('Content uploaded successfully!');
        setFormData({ title: '', type: 'video', url: '' });
        fetchContent(); // Refresh content list
      } else {
        setError(data.message || 'Failed to upload content');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content-manager">
      <header className="App-header">
        <h1>Content Management</h1>
        <nav>
          <button onClick={onBack}>Back to Dashboard</button>
        </nav>
      </header>

      <main>
        <div className="content-section">
          <h2>Upload New Content</h2>
          {error && <div className="error-message">{error}</div>}
          {success && <div className="success-message">{success}</div>}
          
          <form onSubmit={handleSubmit} className="content-form">
            <div className="form-group">
              <label htmlFor="title">Title</label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="type">Content Type</label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                required
              >
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="image">Image</option>
                <option value="article">Article</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="url">URL</label>
              <input
                type="url"
                id="url"
                name="url"
                value={formData.url}
                onChange={handleChange}
                placeholder="https://example.com/content"
                required
              />
            </div>
            
            <button type="submit" disabled={loading}>
              {loading ? 'Uploading...' : 'Upload Content'}
            </button>
            </form>
        </div>

        <div className="content-list">
          <h2>Your Content</h2>
          {content.length === 0 ? (
            <p>No content uploaded yet.</p>
          ) : (
            <div className="content-grid">
              {content.map((item) => (
                <div key={item._id} className="content-card">
                  <h3>{item.title}</h3>
                  <p><strong>Type:</strong> {item.type}</p>
                  <p><strong>URL:</strong> 
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      View Content
                    </a>
                  </p>
                  <p><strong>Uploaded:</strong> {new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ContentManager;
