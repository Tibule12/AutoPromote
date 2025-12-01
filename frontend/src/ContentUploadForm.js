import React, { useState, useRef, useEffect } from 'react';
import './ContentUploadForm.css';
import { storage, auth } from './firebaseClient';
import { API_ENDPOINTS } from './config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import SpotifyTrackSearch from './components/SpotifyTrackSearch';
import ImageCropper from './components/ImageCropper';
import AudioWaveformTrimmer from './components/AudioWaveformTrimmer';

function ContentUploadForm({ onUpload, platformMetadata: extPlatformMetadata, platformOptions: extPlatformOptions, setPlatformOption: extSetPlatformOption, selectedPlatforms: extSelectedPlatforms, setSelectedPlatforms: extSetSelectedPlatforms, spotifySelectedTracks: extSpotifySelectedTracks, setSpotifySelectedTracks: extSetSpotifySelectedTracks }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('video');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [rotate, setRotate] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [template, setTemplate] = useState('none');
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const [showCropper, setShowCropper] = useState(false);
  const [cropMeta, setCropMeta] = useState(null);
  const [spotifyTracks, setSpotifyTracks] = useState(extSpotifySelectedTracks || []);

  useEffect(()=>{
    // Cleanup URL.createObjectURL to prevent mem leaks
    return () => {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) {}
      }
    };
  }, [previewUrl]);

  // Sync pinterest boards from parent-controlled metadata
  useEffect(()=>{
    if (extPlatformMetadata && Array.isArray(extPlatformMetadata.pinterest?.boards)) {
      setPinterestBoards(extPlatformMetadata.pinterest.boards);
    } else {
      setPinterestBoards([]);
    }
  }, [extPlatformMetadata]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [spotifyPlaylistId, setSpotifyPlaylistId] = useState('');
  const [spotifyPlaylistName, setSpotifyPlaylistName] = useState('');
  // Sync spotify playlists from parent-controlled metadata
  useEffect(()=>{
    if (extPlatformMetadata && Array.isArray(extPlatformMetadata.spotify?.playlists)) {
      setSpotifyPlaylists(extPlatformMetadata.spotify.playlists);
    } else {
      setSpotifyPlaylists([]);
    }
  }, [extPlatformMetadata]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [qualityScore, setQualityScore] = useState(null);
  const [qualityFeedback, setQualityFeedback] = useState([]);
  // Content Quality Check handler
  const [enhancedSuggestions, setEnhancedSuggestions] = useState(null);
  const [pinterestBoard, setPinterestBoard] = useState(extPlatformOptions?.pinterest?.boardId || '');
  const [pinterestNote, setPinterestNote] = useState(extPlatformOptions?.pinterest?.note || '');
  const [pinterestBoards, setPinterestBoards] = useState([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState(extSelectedPlatforms || []);
  const selectedPlatformsVal = Array.isArray(extSelectedPlatforms) ? extSelectedPlatforms : selectedPlatforms;
  useEffect(()=>{
    if (Array.isArray(extSelectedPlatforms)) setSelectedPlatforms(extSelectedPlatforms || []);
  }, [extSelectedPlatforms]);
  const [discordChannelId, setDiscordChannelId] = useState(extPlatformOptions?.discord?.channelId || '');
  const [telegramChatId, setTelegramChatId] = useState(extPlatformOptions?.telegram?.chatId || '');
  const [redditSubreddit, setRedditSubreddit] = useState(extPlatformOptions?.reddit?.subreddit || '');
  const [linkedinCompanyId, setLinkedinCompanyId] = useState(extPlatformOptions?.linkedin?.companyId || '');
  const [twitterMessage, setTwitterMessage] = useState(extPlatformOptions?.twitter?.message || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  useEffect(()=>{
    if (!extPlatformOptions) return;
    setDiscordChannelId(extPlatformOptions?.discord?.channelId || '');
    setTelegramChatId(extPlatformOptions?.telegram?.chatId || '');
    setRedditSubreddit(extPlatformOptions?.reddit?.subreddit || '');
    setLinkedinCompanyId(extPlatformOptions?.linkedin?.companyId || '');
    setTwitterMessage(extPlatformOptions?.twitter?.message || '');
    setPinterestBoard(extPlatformOptions?.pinterest?.boardId || '');
    setPinterestNote(extPlatformOptions?.pinterest?.note || '');
    setSpotifyPlaylistId(extPlatformOptions?.spotify?.playlistId || '');
    setSpotifyPlaylistName(extPlatformOptions?.spotify?.name || '');
  }, [extPlatformOptions]);
  const handleQualityCheck = async (e) => {
    e.preventDefault();
    setQualityScore(null);
    setQualityFeedback([]);
    setEnhancedSuggestions(null);
    setError('');
    try {
      const response = await fetch('/api/content/quality-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          type,
          url: file ? `preview://${file.name}` : ''
        })
      });
      const result = await response.json();
      if (response.ok) {
        setQualityScore(result.quality_score);
        setQualityFeedback(result.quality_feedback);
        if (result.enhanced && (result.quality_score < 70)) {
          setEnhancedSuggestions(result.enhanced);
        }
      } else {
        setError(result.error || 'Quality check failed.');
      }
    } catch (err) {
      setError(err.message || 'Quality check failed.');
    }
  };
  // Preview handler
  const handlePreview = async (e) => {
    e.preventDefault();
    setError('');
    setIsPreviewing(true);
    setPreviews([]);
    // If a local file is selected, generate a local preview to show immediately
    if (file) {
      try {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      } catch (err) {
        console.error('[Preview] failed to generate local preview URL', err);
      }
    }
    try {
      let url = '';
      if (file) {
        // Simulate upload to get preview URL (skip actual upload for preview)
        url = `preview://${file.name}`;
      }
      const contentData = {
        title,
        type,
        description,
        url,
        platforms: selectedPlatformsVal,
        isDryRun: true,
        meta: {
          trimStart: (type === 'video' || type === 'audio') ? trimStart : undefined,
          trimEnd: (type === 'video' || type === 'audio') ? trimEnd : undefined,
          rotate: type === 'image' ? rotate : undefined,
          flipH: type === 'image' ? flipH : undefined,
          flipV: type === 'image' ? flipV : undefined,
          duration: duration || undefined,
          crop: cropMeta || undefined,
          template: template !== 'none' ? template : undefined
        }
      };
      // include platform options for preview (e.g., pinterest / spotify)
      // Include platform options for preview
      contentData.platform_options = {
        pinterest: pinterestBoard || pinterestNote ? { boardId: pinterestBoard || undefined, note: pinterestNote || undefined } : undefined,
        spotify: (spotifyTracks && spotifyTracks.length) || spotifyPlaylistId || spotifyPlaylistName ? { trackUris: spotifyTracks && spotifyTracks.length ? spotifyTracks.map(t=>t.uri) : undefined, playlistId: spotifyPlaylistId || undefined, name: spotifyPlaylistName || undefined } : undefined
      };
      if (selectedPlatformsVal.includes('discord')) contentData.platform_options.discord = { channelId: discordChannelId || undefined };
      if (selectedPlatformsVal.includes('telegram')) contentData.platform_options.telegram = { chatId: telegramChatId || undefined };
      if (selectedPlatformsVal.includes('reddit')) contentData.platform_options.reddit = { subreddit: redditSubreddit || undefined };
      if (selectedPlatformsVal.includes('linkedin')) contentData.platform_options.linkedin = { companyId: linkedinCompanyId || undefined };
      if (selectedPlatformsVal.includes('twitter')) contentData.platform_options.twitter = { message: twitterMessage || undefined };
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
      if (!file) {
        console.error('[Upload] No file selected');
        throw new Error('Please select a file to upload.');
      }

      let url = '';
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

      const finalTitle = title || file.name;
      // Basic platform-required validation
      const missing = [];
      if (selectedPlatformsVal.includes('discord') && !discordChannelId) missing.push('Discord Channel ID');
      if (selectedPlatformsVal.includes('telegram') && !telegramChatId) missing.push('Telegram Chat ID');
      if (selectedPlatformsVal.includes('reddit') && !redditSubreddit) missing.push('Reddit subreddit');
      if (selectedPlatformsVal.includes('linkedin') && !linkedinCompanyId) missing.push('LinkedIn company id');
      if (selectedPlatformsVal.includes('spotify') && !(spotifyTracks && spotifyTracks.length) && !spotifyPlaylistId && !spotifyPlaylistName) missing.push('Spotify playlist or track');
      if (missing.length) throw new Error('Missing: ' + missing.join(', '));

      const contentData = {
        title: finalTitle,
        type,
        description,
        url,
        platforms: selectedPlatformsVal,
        template: template !== 'none' ? template : undefined,
        meta: {
          trimStart: (type === 'video' || type === 'audio') ? trimStart : undefined,
          trimEnd: (type === 'video' || type === 'audio') ? trimEnd : undefined,
          rotate: type === 'image' ? rotate : undefined,
          flipH: type === 'image' ? flipH : undefined,
          flipV: type === 'image' ? flipV : undefined,
          duration: duration || undefined,
          crop: cropMeta || undefined,
          template: template !== 'none' ? template : undefined
        },
        platform_options: {
          pinterest: pinterestBoard || pinterestNote ? { boardId: pinterestBoard || undefined, note: pinterestNote || undefined } : undefined,
          spotify: (spotifyTracks && spotifyTracks.length) || spotifyPlaylistId || spotifyPlaylistName ? { trackUris: spotifyTracks && spotifyTracks.length ? spotifyTracks.map(t=>t.uri) : undefined, playlistId: spotifyPlaylistId || undefined, name: spotifyPlaylistName || undefined } : undefined,
          discord: selectedPlatformsVal.includes('discord') ? { channelId: discordChannelId || undefined } : undefined,
          telegram: selectedPlatformsVal.includes('telegram') ? { chatId: telegramChatId || undefined } : undefined,
          reddit: selectedPlatformsVal.includes('reddit') ? { subreddit: redditSubreddit || undefined } : undefined,
          linkedin: selectedPlatformsVal.includes('linkedin') ? { companyId: linkedinCompanyId || undefined } : undefined,
          twitter: selectedPlatformsVal.includes('twitter') ? { message: twitterMessage || undefined } : undefined
        }
      };
      console.log('[Upload] Content data to send:', contentData);

      await onUpload(contentData);
      console.log('[Upload] onUpload callback completed');

      // Clear form on successful upload
      setTitle('');
      setDescription('');
      setFile(null);
      console.log('[Upload] Form cleared after successful upload');
    } catch (err) {
      console.error('[Upload] Upload error:', err);
      setError(err.message || 'Failed to upload content. Please try again.');
    } finally {
      setIsUploading(false);
      console.log('[Upload] Upload process finished');
    }
  };

  const handleFileChange = (selected) => {
    setFile(selected);
    setRotate(0);
    setFlipH(false);
    setFlipV(false);
    setTrimStart(0);
    setTrimEnd(0);
    setDuration(0);
    if (selected) {
      try {
        const url = URL.createObjectURL(selected);
        setPreviewUrl(url);
      } catch (err) {
        console.error('[Preview] Error creating local preview:', err);
      }
    } else {
      setPreviewUrl('');
    }
  };

  const applyTemplate = (t) => {
    if (!t || t === 'none') return;
    // Lightweight template suggestions; these only change metadata
    const suggestions = {
      tiktok: { title: 'New TikTok Clip', description: 'Short entertaining content optimized for vertical feed #trending', hashtags: ['trending', 'viral'] },
      'instagram-story': { title: 'Story Post', description: 'Share your moment - portrait format', hashtags: ['story', 'moments'] },
      'facebook-feed': { title: 'Facebook Post', description: 'Great content for your feed', hashtags: ['social', 'promotion'] },
      youtube: { title: 'YouTube Video', description: 'Full resolution horizontal video', hashtags: ['youtube', 'video'] },
      thumbnail: { title: 'Thumbnail', description: 'Custom thumbnail for your link', hashtags: ['thumbnail'] }
    };
    const s = suggestions[t];
    if (s) {
      if (!title) setTitle(s.title);
      if (!description) setDescription(s.description);
    }
  };

  const togglePlatform = (platform) => {
    const cur = Array.isArray(extSelectedPlatforms) ? extSelectedPlatforms : selectedPlatforms;
    const updated = cur.includes(platform) ? cur.filter(p => p !== platform) : [...cur, platform];
    if (typeof extSetSelectedPlatforms === 'function') {
      extSetSelectedPlatforms(updated);
    } else {
      setSelectedPlatforms(updated);
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
            <option value="video">Video</option>
            <option value="image">Image</option>
            <option value="audio">Audio</option>
          </select>
        </div>
        <div className="form-group">
          <label>Templates</label>
          <select value={template} onChange={e => setTemplate(e.target.value)} className="form-select">
            <option value="none">No Template</option>
            <option value="tiktok">TikTok (9:16)</option>
            <option value="instagram-story">Instagram Story (9:16)</option>
            <option value="facebook-feed">Facebook Feed (4:5)</option>
            <option value="youtube">YouTube (16:9)</option>
            <option value="thumbnail">Platform Thumbnail</option>
          </select>
          {template !== 'none' && (
            <div className="template-hint">Template <strong>{template}</strong> will prefill recommended aspect ratio and tags</div>
          )}
          {template !== 'none' && (
            <button type="button" onClick={()=>applyTemplate(template)} className="apply-template-btn">Apply Template</button>
          )}
        </div>
        <div className="form-group">
          <label>Target Platforms</label>
          <div className="platform-toggles">
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('youtube')} onChange={()=>togglePlatform('youtube')} /> YouTube</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('tiktok')} onChange={()=>togglePlatform('tiktok')} /> TikTok</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('instagram')} onChange={()=>togglePlatform('instagram')} /> Instagram</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('facebook')} onChange={()=>togglePlatform('facebook')} /> Facebook</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('twitter')} onChange={()=>togglePlatform('twitter')} /> Twitter</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('linkedin')} onChange={()=>togglePlatform('linkedin')} /> LinkedIn</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('reddit')} onChange={()=>togglePlatform('reddit')} /> Reddit</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('discord')} onChange={()=>togglePlatform('discord')} /> Discord</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('telegram')} onChange={()=>togglePlatform('telegram')} /> Telegram</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('pinterest')} onChange={()=>togglePlatform('pinterest')} /> Pinterest</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('spotify')} onChange={()=>togglePlatform('spotify')} /> Spotify</label>
            <label><input type="checkbox" checked={selectedPlatformsVal.includes('snapchat')} onChange={()=>togglePlatform('snapchat')} /> Snapchat</label>
          </div>
        </div>
        <div className="form-group">
          <label>Advanced/Per-platform options</label>
          <div style={{display:'grid', gap:8}}>
            {selectedPlatformsVal.includes('discord') && <input placeholder="Discord channel ID" value={discordChannelId} onChange={(e)=>{ setDiscordChannelId(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('discord','channelId', e.target.value); }} />}
            {selectedPlatformsVal.includes('telegram') && <input placeholder="Telegram chat ID" value={telegramChatId} onChange={(e)=>{ setTelegramChatId(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('telegram','chatId', e.target.value); }} />}
            {selectedPlatformsVal.includes('reddit') && <input placeholder="Reddit subreddit" value={redditSubreddit} onChange={(e)=>{ setRedditSubreddit(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('reddit','subreddit', e.target.value); }} />}
            {selectedPlatformsVal.includes('linkedin') && <input placeholder="LinkedIn organization/company ID" value={linkedinCompanyId} onChange={(e)=>{ setLinkedinCompanyId(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('linkedin','companyId', e.target.value); }} />}
            {selectedPlatformsVal.includes('twitter') && <input placeholder="Twitter message (optional)" value={twitterMessage} onChange={(e)=>{ setTwitterMessage(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('twitter','message', e.target.value); }} />}
          </div>
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
          <label>File</label>
          <div className="file-upload">
            <input
              type="file"
              accept={type === 'video' ? 'video/*' : (type === 'audio' ? 'audio/*' : 'image/*')}
              onChange={e => handleFileChange(e.target.files[0])}
              required
              className="form-file-input"
            />
            {file && (
              <div className="file-info">
                Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>
        </div>
        {/* Pinterest options (board selection + note) */}
        <div className="form-group">
          <label>Pinterest Options (optional)</label>
          <div style={{display:'grid', gap:'.5rem'}}>
            {pinterestBoards && pinterestBoards.length > 0 ? (
              <select value={pinterestBoard} onChange={(e)=>{ setPinterestBoard(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('pinterest','boardId', e.target.value); }} style={{padding:'.5rem', borderRadius:8}}>
                <option value="">Select a board</option>
                {pinterestBoards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            ) : (
              <input placeholder="Pinterest board id (or leave blank)" value={pinterestBoard} onChange={(e)=>{ setPinterestBoard(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('pinterest','boardId', e.target.value); }} style={{padding:'.5rem', borderRadius:8}} />
            )}
            <input placeholder="Pin note (optional)" value={pinterestNote} onChange={(e)=>{ setPinterestNote(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('pinterest','note', e.target.value); }} style={{padding:'.5rem', borderRadius:8}} />
          </div>
        </div>
        {/* Spotify track selection */}
        <div className="form-group">
          <label>Spotify Tracks to Add (optional)</label>
          <SpotifyTrackSearch selectedTracks={Array.isArray(extSpotifySelectedTracks) ? extSpotifySelectedTracks : spotifyTracks} onChangeTracks={(list)=>{ if (typeof extSetSpotifySelectedTracks === 'function') extSetSpotifySelectedTracks(list); else setSpotifyTracks(list); }} />
        </div>
        <div className="form-group">
          <label>Spotify Playlist (optional)</label>
          <div style={{display:'grid', gap:8}}>
            {spotifyPlaylists && spotifyPlaylists.length > 0 ? (
              <select value={spotifyPlaylistId} onChange={(e)=>{ setSpotifyPlaylistId(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('spotify','playlistId', e.target.value); }} style={{padding:'.5rem', borderRadius:8}}>
                <option value="">Select existing playlist</option>
                {spotifyPlaylists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input placeholder="Existing playlist id (optional)" value={spotifyPlaylistId} onChange={(e)=>{ setSpotifyPlaylistId(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('spotify','playlistId', e.target.value); }} style={{padding:'.5rem', borderRadius:8}} />
            )}
            <input placeholder="Or create new playlist name (optional)" value={spotifyPlaylistName} onChange={(e)=>{ setSpotifyPlaylistName(e.target.value); if (typeof extSetPlatformOption === 'function') extSetPlatformOption('spotify','name', e.target.value); }} style={{padding:'.5rem', borderRadius:8}} />
          </div>
        </div>
        {/* Live local file preview and basic editing controls */}
        {file && (
          <div className="form-group preview-area">
            <label>Live Preview</label>
            <div className="preview-wrapper">
              {type === 'video' ? (
                <video
                  ref={videoRef}
                  src={previewUrl}
                  controls
                  className="preview-video"
                  onLoadedMetadata={(ev) => {
                    const dur = ev.target.duration || 0;
                    setDuration(dur);
                    setTrimEnd(dur);
                  }}
                />
              ) : type === 'audio' ? (
                <div style={{width:'100%'}}>
                  <audio src={previewUrl} controls style={{width:'100%'}} onLoadedMetadata={(ev)=>{const dur=ev.target.duration||0; setDuration(dur); setTrimEnd(dur);}} />
                  <div style={{marginTop:8}}>
                    <AudioWaveformTrimmer file={file} trimStart={trimStart} trimEnd={trimEnd} onChange={({trimStart: s, trimEnd: e})=>{ if (typeof s !== 'undefined') setTrimStart(s); if (typeof e !== 'undefined') setTrimEnd(e); }} />
                  </div>
                </div>
              ) : (
                <img
                  className="preview-image"
                  src={previewUrl}
                  alt="Local preview"
                  style={{transform: `rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`}}
                />
              )}
            </div>
            <div className="preview-controls">
              {type === 'video' ? (
                <div className="video-controls">
                  <label>Trim Start: <input type="number" min={0} max={duration} step="0.1" value={trimStart} onChange={e=>setTrimStart(parseFloat(e.target.value) || 0)} /> secs</label>
                  <label>Trim End: <input type="number" min={0} max={duration} step="0.1" value={trimEnd} onChange={e=>setTrimEnd(parseFloat(e.target.value) || duration)} /> secs</label>
                  <div className="range-row">
                    <input type="range" min="0" max={duration} step="0.05" value={trimStart} onChange={e=>setTrimStart(parseFloat(e.target.value))} />
                    <input type="range" min="0" max={duration} step="0.05" value={trimEnd} onChange={e=>setTrimEnd(parseFloat(e.target.value))} />
                  </div>
                </div>
              ) : (
                <div className="image-controls">
                  <button type="button" onClick={()=>setRotate((rotate+90)%360)} className="control-btn">Rotate 90°</button>
                  <button type="button" onClick={()=>setFlipH(!flipH)} className="control-btn">Flip H</button>
                  <button type="button" onClick={()=>setFlipV(!flipV)} className="control-btn">Flip V</button>
                  <button type="button" onClick={()=>setShowCropper(true)} className="control-btn">Crop</button>
                </div>
              )}
            </div>
          </div>
        )}
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
            type="button"
            disabled={isUploading}
            className="quality-check-button"
            onClick={handleQualityCheck}
          >
            Check Quality
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
        {showCropper && previewUrl && (
          <ImageCropper imageUrl={previewUrl} onChangeCrop={(rect)=>{ setCropMeta(rect); setShowCropper(false); }} onClose={()=>setShowCropper(false)} />
        )}
      {/* Render quality check results */}
      {qualityScore !== null && (
        <div className="quality-check-results" style={{marginTop:'1rem',padding:'1rem',border:'1px solid #e0e0e0',borderRadius:8,background:'#f8f8fa'}}>
          <strong>Quality Score:</strong> {qualityScore} / 100<br/>
          {qualityFeedback.length > 0 && (
            <div style={{marginTop:'0.5rem'}}>
              <strong>Feedback:</strong>
              <ul>
                {qualityFeedback.map((fb,idx)=>(<li key={idx}>{fb}</li>))}
              </ul>
            </div>
          )}
          {/* Show enhancement suggestions if available and score is low */}
          {enhancedSuggestions && (
            <div style={{marginTop:'1rem',background:'#fffbe6',padding:'1rem',borderRadius:6,border:'1px solid #ffe58f'}}>
              <strong>Suggested Improvements:</strong>
              <div><b>Title:</b> {enhancedSuggestions.title}</div>
              <div><b>Description:</b> {enhancedSuggestions.description}</div>
              <button type="button" style={{marginTop:'0.5rem'}} className="apply-enhancements-btn" onClick={() => {
                setTitle(enhancedSuggestions.title);
                setDescription(enhancedSuggestions.description);
                setEnhancedSuggestions(null);
              }}>Apply Suggestions</button>
            </div>
          )}
        </div>
      )}
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