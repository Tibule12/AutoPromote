// ClipStudioPanel.js
// AI Clip Generation Studio (Opus Clip style)
// Analyze videos and generate viral short clips

import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseClient';
import { API_BASE_URL } from '../config';
import toast from 'react-hot-toast';
import './ClipStudioPanel.css';

const ClipStudioPanel = ({ content = [] }) => {
  const [analyses, setAnalyses] = useState([]);
  const [selectedContent, setSelectedContent] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [selectedClips, setSelectedClips] = useState([]);
  const [generatedClips, setGeneratedClips] = useState([]);
  const [previewClip, setPreviewClip] = useState(null);
  const [exportOptions, setExportOptions] = useState({
    aspectRatio: '9:16',
    addCaptions: true,
    addBranding: false
  });

  // Filter for videos only
  const videoContent = content.filter(c => c.type === 'video');

  useEffect(() => {
    loadGeneratedClips();
  }, []);

  const loadGeneratedClips = async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;

      const response = await fetch(`${API_BASE_URL}/api/clips/user`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => ({ ok: false, status: 500 }));

      if (response.ok) {
        const data = await response.json();
        setGeneratedClips(data.clips || []);
      } else {
        // Endpoint not ready or error - silently ignore
        setGeneratedClips([]);
      }
    } catch (error) {
      // Silently handle - clips feature may not be deployed yet
      setGeneratedClips([]);
    }
  };

  const analyzeVideo = async (contentItem) => {
    if (!contentItem.url) {
      toast.error('Video URL not available');
      return;
    }

    setAnalyzing(true);
    setSelectedContent(contentItem);
    
    const toastId = toast.loading('Analyzing video... This may take a few minutes');

    try {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`${API_BASE_URL}/api/clips/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contentId: contentItem.id,
          videoUrl: contentItem.url
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }

      const result = await response.json();
      toast.success(`Found ${result.clipsGenerated} potential clips!`, { id: toastId });
      
      // Load analysis details
      await loadAnalysis(result.analysisId);

    } catch (error) {
      console.error('Analysis error:', error);
      toast.error(error.message, { id: toastId });
    } finally {
      setAnalyzing(false);
    }
  };

  const loadAnalysis = async (analysisId) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`${API_BASE_URL}/api/clips/analysis/${analysisId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentAnalysis(data.analysis);
      }
    } catch (error) {
      console.error('Failed to load analysis:', error);
    }
  };

  const generateClip = async (clip) => {
    const toastId = toast.loading('Generating clip...');

    try {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`${API_BASE_URL}/api/clips/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          analysisId: currentAnalysis.id,
          clipId: clip.id,
          options: exportOptions
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Generation failed');
      }

      const result = await response.json();
      toast.success('Clip generated successfully!', { id: toastId });
      
      // Reload clips list
      await loadGeneratedClips();

    } catch (error) {
      console.error('Generation error:', error);
      toast.error(error.message, { id: toastId });
    }
  };

  const exportClip = async (clipId, platforms) => {
    const toastId = toast.loading('Scheduling export...');

    try {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`${API_BASE_URL}/api/clips/${clipId}/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          platforms,
          scheduledTime: new Date(Date.now() + 3600000).toISOString()
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      toast.success('Clip scheduled for export!', { id: toastId });

    } catch (error) {
      console.error('Export error:', error);
      toast.error(error.message, { id: toastId });
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="clip-studio-panel">
      <div className="clip-studio-header">
        <h2>🎬 AI Clip Studio</h2>
        <p>Generate viral short clips from your long-form videos</p>
      </div>

      {!currentAnalysis ? (
        <>
          {/* Video Selection */}
          <div className="video-selection-section">
            <h3>Select a Video to Analyze</h3>
            
            {videoContent.length === 0 ? (
              <div className="empty-state">
                <p>📹 No videos uploaded yet</p>
                <p className="empty-hint">Upload a long-form video to get started with AI clip generation</p>
              </div>
            ) : (
              <div className="video-grid">
                {videoContent.map(video => (
                  <div key={video.id} className="video-card">
                    {video.url && (
                      <video 
                        src={video.url} 
                        className="video-thumbnail"
                        muted
                        onClick={(e) => e.target.paused ? e.target.play() : e.target.pause()}
                      />
                    )}
                    <div className="video-card-info">
                      <h4>{video.title || 'Untitled Video'}</h4>
                      {video.duration && (
                        <span className="duration-badge">{formatDuration(video.duration)}</span>
                      )}
                      <p className="video-description">
                        {video.description ? video.description.substring(0, 100) : 'No description'}
                      </p>
                      
                      {video.clipAnalysis?.analyzed ? (
                        <div className="analysis-status">
                          <span className="analyzed-badge">✓ Analyzed</span>
                          <button 
                            className="btn-secondary btn-sm"
                            onClick={() => loadAnalysis(video.clipAnalysis.analysisId)}
                          >
                            View {video.clipAnalysis.clipsGenerated} Clips
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn-primary"
                          onClick={() => analyzeVideo(video)}
                          disabled={analyzing}
                        >
                          {analyzing ? 'Analyzing...' : 'Generate Clips'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Previously Generated Clips */}
          {generatedClips.length > 0 && (
            <div className="generated-clips-section">
              <h3>📂 Your Generated Clips ({generatedClips.length})</h3>
              <div className="clips-grid">
                {generatedClips.map(clip => (
                  <div key={clip.id} className="generated-clip-card">
                    <video 
                      src={clip.url} 
                      className="clip-preview"
                      controls
                    />
                    <div className="clip-info">
                      <div className="clip-score">
                        <span className="score-badge">⚡ {clip.viralScore}</span>
                      </div>
                      <p className="clip-caption">{clip.caption}</p>
                      <p className="clip-meta">
                        {formatDuration(clip.duration)} • {clip.reason}
                      </p>
                      <div className="clip-platforms">
                        {clip.platforms?.map(p => (
                          <span key={p} className="platform-tag">{p}</span>
                        ))}
                      </div>
                      <button 
                        className="btn-primary btn-sm"
                        onClick={() => exportClip(clip.id, clip.platforms || ['tiktok'])}
                      >
                        Export to Platforms
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Analysis Results */}
          <div className="analysis-results">
            <div className="results-header">
              <button 
                className="btn-back"
                onClick={() => setCurrentAnalysis(null)}
              >
                ← Back to Videos
              </button>
              <div className="results-summary">
                <h3>Analysis Complete</h3>
                <p>Found {currentAnalysis.topClips?.length || 0} potential viral clips</p>
                <div className="analysis-stats">
                  <span>Duration: {formatDuration(currentAnalysis.duration)}</span>
                  <span>Scenes: {currentAnalysis.scenesDetected}</span>
                  {currentAnalysis.transcriptLength > 0 && (
                    <span>Transcript: {currentAnalysis.transcriptLength} segments</span>
                  )}
                </div>
              </div>
            </div>

            {/* Export Options */}
            <div className="export-options">
              <h4>Export Settings</h4>
              <div className="options-grid">
                <label>
                  <input 
                    type="checkbox"
                    checked={exportOptions.addCaptions}
                    onChange={(e) => setExportOptions({...exportOptions, addCaptions: e.target.checked})}
                  />
                  Add Captions
                </label>
                <label>
                  <input 
                    type="checkbox"
                    checked={exportOptions.addBranding}
                    onChange={(e) => setExportOptions({...exportOptions, addBranding: e.target.checked})}
                  />
                  Add Branding
                </label>
                <label>
                  Aspect Ratio:
                  <select 
                    value={exportOptions.aspectRatio}
                    onChange={(e) => setExportOptions({...exportOptions, aspectRatio: e.target.value})}
                  >
                    <option value="9:16">9:16 (Vertical - TikTok/Reels)</option>
                    <option value="16:9">16:9 (Horizontal - YouTube)</option>
                    <option value="1:1">1:1 (Square - Instagram)</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Clip Suggestions */}
            <div className="clip-suggestions">
              <h4>Suggested Clips (sorted by viral potential)</h4>
              <div className="clips-list">
                {currentAnalysis.topClips?.map((clip, index) => (
                  <div key={clip.id || index} className="clip-suggestion">
                    <div className="clip-rank">#{index + 1}</div>
                    <div className="clip-timeline">
                      <div className="timeline-bar">
                        <div 
                          className="timeline-segment"
                          style={{
                            left: `${(clip.start / currentAnalysis.duration) * 100}%`,
                            width: `${((clip.end - clip.start) / currentAnalysis.duration) * 100}%`
                          }}
                        />
                      </div>
                      <div className="timeline-labels">
                        <span>{formatTimestamp(clip.start)}</span>
                        <span>{formatTimestamp(clip.end)}</span>
                      </div>
                    </div>
                    <div className="clip-details">
                      <div className="clip-score-large">
                        <span className="score-number">{clip.score}</span>
                        <span className="score-label">Viral Score</span>
                      </div>
                      <div className="clip-content">
                        <p className="clip-reason">
                          <strong>Why this clip:</strong> {clip.reason}
                        </p>
                        {clip.text && (
                          <p className="clip-transcript">"{clip.text.substring(0, 150)}..."</p>
                        )}
                        <div className="clip-meta-info">
                          <span>Duration: {formatDuration(clip.end - clip.start)}</span>
                          {clip.platforms && (
                            <span>Best for: {clip.platforms.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="clip-actions">
                      <button 
                        className="btn-primary"
                        onClick={() => generateClip(clip)}
                      >
                        Generate Clip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClipStudioPanel;
