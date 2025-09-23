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
        ...(type === 'article' ? { articleText } : { url })
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