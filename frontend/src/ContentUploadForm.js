import React, { useState } from 'react';
import './ContentUploadForm.css';

function ContentUploadForm({ onUpload }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('article');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [articleText, setArticleText] = useState('');
  const [platform, setPlatform] = useState('youtube');
  const [revenue, setRevenue] = useState('');
  const [views, setViews] = useState('');
  const [engagement, setEngagement] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsUploading(true);

    try {
      if (type === 'article' && !articleText.trim()) {
        throw new Error('Please enter article text.');
      }
      
      if (type !== 'article' && !file) {
        throw new Error('Please select a file to upload.');
      }

      const contentData = {
        title,
        type,
        description,
        platform,
        revenue: parseFloat(revenue) || 0,
        views: parseInt(views) || 0,
        engagement: parseFloat(engagement) || 0,
        conversionRate: parseFloat(conversionRate) || 0,
        ...(type === 'article' ? { articleText } : { file })
      };

      await onUpload(contentData);

      // Clear form on successful upload
      setTitle('');
      setDescription('');
      setFile(null);
      setArticleText('');
      setPlatform('youtube');
      setRevenue('');
      setViews('');
      setEngagement('');
      setConversionRate('');
      
    } catch (err) {
      setError(err.message || 'Failed to upload content. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="content-upload-container">
      <form onSubmit={handleSubmit} className="content-upload-form">
        <h3>Upload Content</h3>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}


        <div className="form-group">
          <label>Title</label>
          <input
            type="text"
            placeholder="Enter content title"
            value={title}
            required
            onChange={e => setTitle(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Content Type</label>
          <select 
            value={type} 
            onChange={e => setType(e.target.value)}
            className="form-select"
          >
            <option value="article">Article</option>
            <option value="video">Video</option>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
          </select>
        </div>

        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            placeholder="Enter content description"
            value={description}
            required
            onChange={e => setDescription(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Platform</label>
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="form-select"
            required
          >
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="twitter">Twitter</option>
            <option value="facebook">Facebook</option>
            <option value="linkedin">LinkedIn</option>
            <option value="pinterest">Pinterest</option>
          </select>
        </div>

        <div className="form-group">
          <label>Revenue</label>
          <input
            type="number"
            placeholder="Enter revenue (e.g. 1000)"
            value={revenue}
            required
            min="0"
            step="any"
            onChange={e => setRevenue(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Views</label>
          <input
            type="number"
            placeholder="Enter views (e.g. 5000)"
            value={views}
            required
            min="0"
            step="1"
            onChange={e => setViews(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Engagement</label>
          <input
            type="number"
            placeholder="Enter engagement (e.g. 200)"
            value={engagement}
            required
            min="0"
            step="any"
            onChange={e => setEngagement(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>Conversion Rate</label>
          <input
            type="number"
            placeholder="Enter conversion rate (e.g. 0.05)"
            value={conversionRate}
            required
            min="0"
            step="any"
            onChange={e => setConversionRate(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label>{type === 'article' ? 'Content' : 'File'}</label>
          {type === 'article' ? (
            <textarea
              placeholder="Enter your article text"
              value={articleText}
              onChange={e => setArticleText(e.target.value)}
              rows={6}
              required
              className="form-textarea"
            />
          ) : (
            <div className="file-upload">
              <input
                type="file"
                accept={type === 'video' ? 'video/*' : type === 'image' ? 'image/*' : type === 'audio' ? 'audio/*' : '*'}
                onChange={e => setFile(e.target.files[0])}
                required
                className="form-file-input"
              />
              {file && (
                <div className="file-info">
                  Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              )}
            </div>
          )}
        </div>

        <button 
          type="submit" 
          disabled={isUploading}
          className="submit-button"
        >
          {isUploading ? (
            <>
              <span className="loading-spinner"></span>
              Uploading...
            </>
          ) : (
            'Upload Content'
          )}
        </button>
      </form>
    </div>
  );
}

export default ContentUploadForm;