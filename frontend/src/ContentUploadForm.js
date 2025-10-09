import React, { useState } from 'react';
import './ContentUploadForm.css';
import { storage } from './firebaseClient';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

function ContentUploadForm({ onUpload }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('article');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [articleText, setArticleText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // Preview handler
  const handlePreview = async (e) => {
    e.preventDefault();
    setError('');
    setIsPreviewing(true);
    setPreviews([]);
    try {
      let url = '';
      if (type !== 'article' && file) {
        // Simulate upload to get preview URL (skip actual upload for preview)
        url = `preview://${file.name}`;
      }
      const contentData = {
        title,
        type,
        description,
        ...(type === 'article' ? { articleText } : { url }),
        isDryRun: true
      };
      // Call backend preview (reuse onUpload with dry run)
      const result = await onUpload(contentData);
      if (result && result.previews) {
        setPreviews(result.previews);
      } else if (result && result.content_preview) {
        setPreviews([result.content_preview]);
      } else {
        setError('No preview data returned.');
      }
    } catch (err) {
      setError(err.message || 'Failed to generate preview.');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsUploading(true);

    console.log('[Upload] Starting upload process');
    try {
      console.log('[Upload] Content type:', type);
      if (type === 'article' && !articleText.trim()) {
        console.error('[Upload] No article text provided');
        throw new Error('Please enter article text.');
      }
      if (type !== 'article' && !file) {
        console.error('[Upload] No file selected');
        throw new Error('Please select a file to upload.');
      }

      let url = '';
      if (type !== 'article' && file) {
        console.log('[Upload] File selected:', file);
        // Upload file to Firebase Storage
        const filePath = `uploads/${type}s/${Date.now()}_${file.name}`;
        console.log('[Upload] Firebase Storage filePath:', filePath);
        const storageRef = ref(storage, filePath);
        console.log('[Upload] Storage ref created:', storageRef);
        try {
          const uploadResult = await uploadBytes(storageRef, file);
          console.log('[Upload] uploadBytes result:', uploadResult);
          url = await getDownloadURL(storageRef);
          console.log('[Upload] File available at URL:', url);
        } catch (uploadErr) {
          console.error('[Upload] Error uploading to Firebase Storage:', uploadErr);
          throw uploadErr;
        }
      }

      const contentData = {
        title,
        type,
        description,
        ...(type === 'article' ? { articleText } : { url }),
        isDryRun: false // Always real upload unless previewing
      };
      console.log('[Upload] Content data to send:', contentData);

      await onUpload(contentData);
      console.log('[Upload] onUpload callback completed');

      // Clear form on successful upload
      setTitle('');
      setDescription('');
      setFile(null);
      setArticleText('');
      console.log('[Upload] Form cleared after successful upload');
    } catch (err) {
      console.error('[Upload] Upload error:', err);
      setError(err.message || 'Failed to upload content. Please try again.');
    } finally {
      setIsUploading(false);
      console.log('[Upload] Upload process finished');
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
        <div style={{display:'flex', gap:'.5rem', marginTop:'.5rem'}}>
          <button 
            type="button"
            disabled={isUploading || isPreviewing}
            className="preview-button"
            onClick={handlePreview}
          >
            {isPreviewing ? (
              <><span className="loading-spinner"></span> Generating Preview...</>
            ) : (
              'Preview Content'
            )}
          </button>
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
        </div>
      </form>
      {/* Render previews if available */}
      {previews && previews.length > 0 && (
        <div className="content-preview-section">
          <h4>Platform Previews</h4>
          <div className="preview-cards" style={{display:'flex',gap:'1rem',flexWrap:'wrap'}}>
            {previews.map((p, idx) => (
              <div key={idx} className="preview-card" style={{border:'1px solid #ccc',borderRadius:8,padding:'1rem',minWidth:220,maxWidth:320,background:'#f9fafb'}}>
                <h5>{p.platform ? p.platform.charAt(0).toUpperCase()+p.platform.slice(1) : 'Preview'}</h5>
                <img src={p.thumbnail || '/default-thumb.png'} alt="Preview Thumbnail" style={{width:'100%',height:120,objectFit:'cover',borderRadius:6}} />
                <div><strong>Title:</strong> {p.title}</div>
                <div><strong>Description:</strong> {p.description}</div>
                {p.caption && <div><strong>Caption:</strong> {p.caption}</div>}
                {Array.isArray(p.hashtags) && p.hashtags.length > 0 && (
                  <div><strong>Hashtags:</strong> {p.hashtags.map(h=>`#${h}`).join(' ')}</div>
                )}
                {p.sound && <div><strong>Sound:</strong> {p.sound}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
  </div>
  );
}

export default ContentUploadForm;