/* eslint-disable no-console */
import React, { useState, useRef, useEffect } from 'react';
import './ContentUploadForm.css';
import { storage, auth } from './firebaseClient';
import { API_ENDPOINTS } from './config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import SpotifyTrackSearch from './components/SpotifyTrackSearch';
import ImageCropper from './components/ImageCropper';
import AudioWaveformTrimmer from './components/AudioWaveformTrimmer';
import EmojiPicker from './components/EmojiPicker';
import FilterEffects from './components/FilterEffects';
import HashtagSuggestions from './components/HashtagSuggestions';
import DraftManager from './components/DraftManager';
import ProgressIndicator from './components/ProgressIndicator';
import BestTimeToPost from './components/BestTimeToPost';

// Security: Comprehensive sanitization to prevent XSS attacks
// Uses direct string replacement - no DOM manipulation
const sanitizeInput = (input) => {
  if (!input) return '';
  
  // Convert to string and escape all HTML special characters using direct replacement
  let escaped = String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // Additional protection: block dangerous patterns
  escaped = escaped
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/file:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  return escaped;
};

// Security: Sanitize CSS values to prevent CSS injection
// Only allows specific CSS filter functions with numeric values
const sanitizeCSS = (css) => {
  if (!css) return '';
  
  const str = String(css).trim();
  
  // Block any CSS that could be dangerous
  if (/url\s*\(/i.test(str) || /expression\s*\(/i.test(str) || /@import/i.test(str)) {
    return '';
  }
  
  // Whitelist: only allow safe CSS filter functions
  const allowedFunctions = ['blur', 'brightness', 'contrast', 'grayscale', 'hue-rotate', 'invert', 'opacity', 'saturate', 'sepia'];
  
  // Split by spaces and validate each filter function
  const parts = str.split(/\s+/);
  const safeParts = [];
  
  for (const part of parts) {
    // Check if part matches: functionName(number + optional unit)
    // Use more restrictive regex that requires closing parenthesis
    const match = part.match(/^([a-z-]+)\(([\d.]+)(px|deg|%)?\)$/i);
    if (match && allowedFunctions.includes(match[1].toLowerCase())) {
      safeParts.push(part);
    }
  }
  
  return safeParts.join(' ');
};

// Security: Escape HTML to prevent XSS attacks
const escapeHtml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

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
  const [overlayText, setOverlayText] = useState('');
  const [overlayPosition, setOverlayPosition] = useState('bottom');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTarget, setEmojiTarget] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [hashtags, setHashtags] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [textStyles, setTextStyles] = useState({ fontSize: 16, color: '#ffffff', fontWeight: 'bold', shadow: true });
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState([]);
  const [qualityScore, setQualityScore] = useState(null);
  const [qualityFeedback, setQualityFeedback] = useState([]);
  const [enhancedSuggestions, setEnhancedSuggestions] = useState(null);
  const titleInputRef = useRef(null);
  const descInputRef = useRef(null);

  useEffect(()=>{
    // Cleanup URL.createObjectURL to prevent mem leaks
    return () => {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch (e) {}
      }
    };
  }, [previewUrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isUploading) {
        e.preventDefault();
        handleSubmit(e);
      }
      // Ctrl/Cmd + P to preview
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !isPreviewing) {
        e.preventDefault();
        handlePreview(e);
      }
      // Ctrl/Cmd + S to save draft
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const draft = getCurrentDraft();
        if (draft.title) {
          const saved = JSON.parse(localStorage.getItem('contentDrafts') || '[]');
          const newDraft = { ...draft, id: Date.now(), savedAt: new Date().toISOString() };
          localStorage.setItem('contentDrafts', JSON.stringify([newDraft, ...saved].slice(0, 10)));
          alert('✅ Draft saved!');
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isUploading, isPreviewing, title, description]);

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
  // Content Quality Check handler
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
      // Add overlay metadata if provided
      if (overlayText) {
        contentData.meta.overlay = { text: overlayText, position: overlayPosition };
      }
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
    setShowProgress(true);
    setUploadProgress(0);
    setUploadStatus('Preparing upload...');

    console.log('[Upload] Starting upload process');
    try {
      console.log('[Upload] Content type:', type);
      if (!file) {
        console.error('[Upload] No file selected');
        throw new Error('Please select a file to upload.');
      }

      let url = '';
      console.log('[Upload] File selected:', file);
      setUploadProgress(10);
      setUploadStatus('Uploading to cloud...');
      
      // Upload file to Firebase Storage
      const filePath = `uploads/${type}s/${Date.now()}_${file.name}`;
      console.log('[Upload] Firebase Storage filePath:', filePath);
      const storageRef = ref(storage, filePath);
      console.log('[Upload] Storage ref created:', storageRef);
      try {
        setUploadProgress(30);
        const uploadResult = await uploadBytes(storageRef, file);
        console.log('[Upload] uploadBytes result:', uploadResult);
        setUploadProgress(60);
        setUploadStatus('Processing file...');
        url = await getDownloadURL(storageRef);
        console.log('[Upload] File available at URL:', url);
        setUploadProgress(80);
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
      // Add overlay metadata to submit payload
      if (overlayText) contentData.meta.overlay = { text: overlayText, position: overlayPosition };
      console.log('[Upload] Content data to send:', contentData);

      setUploadStatus('Publishing to platforms...');
      setUploadProgress(90);
      await onUpload(contentData);
      console.log('[Upload] onUpload callback completed');

      setUploadProgress(100);
      setUploadStatus('✓ Upload complete!');
      
      // Clear form on successful upload
      setTimeout(() => {
        setTitle('');
        setDescription('');
        setFile(null);
        setHashtags([]);
        setOverlayText('');
        setShowProgress(false);
        console.log('[Upload] Form cleared after successful upload');
      }, 1500);
    } catch (err) {
      console.error('[Upload] Upload error:', err);
      setError(err.message || 'Failed to upload content. Please try again.');
      setShowProgress(false);
    } finally {
      setIsUploading(false);
      console.log('[Upload] Upload process finished');
    }
  };

  const handleEmojiSelect = (emoji) => {
    if (emojiTarget === 'title') {
      setTitle(prev => prev + emoji);
    } else if (emojiTarget === 'description') {
      setDescription(prev => prev + emoji);
    } else if (emojiTarget === 'overlay') {
      setOverlayText(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  };

  const openEmojiPicker = (target) => {
    setEmojiTarget(target);
    setShowEmojiPicker(true);
  };

  const handleAddHashtag = (tag) => {
    if (!hashtags.includes(tag)) {
      setHashtags([...hashtags, tag]);
      setDescription(prev => prev + (prev ? ' ' : '') + '#' + tag);
    }
  };

  const removeHashtag = (tag) => {
    setHashtags(hashtags.filter(t => t !== tag));
    setDescription(prev => prev.replace(new RegExp('#' + tag + '\\s?', 'g'), '').trim());
  };

  const handleLoadDraft = (draft) => {
    setTitle(draft.title || '');
    setDescription(draft.description || '');
    setType(draft.type || 'video');
    setOverlayText(draft.overlayText || '');
    if (draft.hashtags) setHashtags(draft.hashtags);
    if (draft.selectedPlatforms) setSelectedPlatforms(draft.selectedPlatforms);
  };

  const getCurrentDraft = () => ({
    title,
    description,
    type,
    overlayText,
    hashtags,
    selectedPlatforms: selectedPlatformsVal
  });

  const handleFileChange = (selected) => {
    setFile(selected);
    setRotate(0);
    setFlipH(false);
    setFlipV(false);
    setTrimStart(0);
    setTrimEnd(0);
    setDuration(0);
    setSelectedFilter(null);
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

  const handleDrop = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]) {
      handleFileChange(ev.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  const [isDropActive, setIsDropActive] = useState(false);
  const handleDragEnter = (ev) => { ev.preventDefault(); ev.stopPropagation(); setIsDropActive(true); };
  const handleDragLeave = (ev) => { ev.preventDefault(); ev.stopPropagation(); setIsDropActive(false); };

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

  // Return a lightweight icon (SVG) for a given platform name
  const getPlatformIcon = (platform) => {
    switch(platform) {
      case 'youtube':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="5" width="18" height="14" rx="4" fill="#FF0000"/><path d="M10 9l6 3-6 3V9z" fill="#fff"/></svg>
        );
      case 'tiktok':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v10.5C11.33 12.5 10.5 12 9.5 12 7 12 5 14 5 16.5S7 21 9.5 21 14 19 14 16.5V7h3V4h-5z" fill="#000"/><path d="M18 2v6h-2V3.9c0 .1-2 .1-2 0V4l-2-.5" fill="#25F4EE"/></svg>
        );
      case 'instagram':
        return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="5" fill="#E1306C" /><circle cx="12" cy="12" r="4" fill="#fff" /></svg>);
      case 'facebook':
        return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#1877F2"/><path d="M14 7h-2c-.8 0-1 .4-1 1v2H14l-.5 2H11v6H9v-6H7v-2h2V8.5C9 6.6 10 5 12 5h2v2z" fill="#fff"/></svg>);
      case 'twitter':
        return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M23 3.5s-1 1.2-2 1.7c0 0-1.4-1-2 .4 0 0-.8 2 1 2.8 0 0-2.2-.2-3 1 0 0-1 1.8 1 3 0 0-3.4 0-4 1 0 0-1.2 2.4 2 3.2 0 0-4 .6-6-.5 0 0 .2 5 6.5 4.5 0 0 7 0 9-7 0 0 1.7-3.8-1.5-6.2z" fill="#1DA1F2"/></svg>);
      case 'linkedin':
        return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" fill="#0A66C2"/><path d="M8 10H6v8h2v-8zM7 8a1 1 0 110-2 1 1 0 010 2zM18 16c0-3-2-3.5-2-3.5s0 1 0 3.5h2zM12 9H10v9h2v-4c0-1.6 2-1.7 2 0v4h2v-5c0-3-2-3.8-4-3.8z" fill="#fff"/></svg>);
      case 'discord':
        return (<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#495B8C" d="M19 2A2 2 0 0121 4v13a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2h14z"/></svg>);
      case 'reddit':
        return (<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="11" r="8" fill="#FF4500"/></svg>);
      case 'telegram':
        return (<svg width="20" height="20" viewBox="0 0 24 24"><path d="M21 3L3 10l5 2 2 5 8-14z" fill="#37AEE2"/></svg>);
      case 'pinterest':
        return (<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#E60023" d="M12 2C6.5 2 2 6.5 2 12c0 3.8 2.4 7.1 5.9 8.4-.1-.7-.1-1.9 0-2.7.1-.6.6-3.8.6-3.8s-.2-.4-.2-1.1c0-1 .6-1.8 1.3-1.8.6 0 .9.4.9.9 0 .6-.4 1.5-.6 2.4-.2.7.4 1.3 1.1 1.3 1.3 0 2.5-1.3 3-2.1.8-1.2 1.2-2.7 1.2-4.1C17.1 5.3 14.1 3 10.4 3 7 3 4.2 5 4.2 8.1c0 1.6.7 2.7.7 2.7l-.2 1.1c0 .2-.2.6-.4.7C4 14 3.7 13.7 3.7 13.4 3.7 10 5 6.4 9.4 6.4c2.6 0 4.1 1.7 4.1 4 0 3.1-1.6 4.5-2.9 4.5-.9 0-1.4-.6-1 3.5 0 1.1-.1 1.9-.2 2.7 1.9.5 3.8-.2 4.8-1.9 1.5-2.5 1.8-6 1-8.4C18.6 6 17 3 13 3s-8 3-8 9c0 4.8 3.4 7.6 7 7.6 1.5 0 2.8-.1 4-.4.3-.8.5-1.8.5-2.9C17.9 15.1 16.6 14 16.6 14c-.8.9-1.8 1.4-2.9 1.4-1.6 0-2.6-1.4-2.6-3.2 0-1.5.9-2.4 1.9-2.4 1 0 1.8.7 1.8 1.7 0 1.1-.7 2.2-1.6 2.2-.4 0-.7-.2-.7-.6 0-.4.1-.9.3-1.2.3-.4 1.2-1.6 1.2-2.9 0-1.3-.9-2.6-3.1-2.6-3 0-5.1 3-5.1 6 0 1.5.3 2.6 1 3.5 1.1 1.5 3 1.2 3.8.6 1.4-1.1 2.2-4.3 2.2-6.6C18 6.8 15 4 12 4z"/></svg>);
      case 'spotify':
        return (<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1DB954"/></svg>);
      case 'snapchat':
        return (<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#FFFC00" d="M12 2s3.08.42 4 1.5C19 6.5 20 8 18 10s-6 4-6 4-3-1-6-4c-2-2 0-3.5 2-6.5C8.92 2.43 12 2 12 2z"/></svg>);
      default:
        return (<div style={{width:20,height:20,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:4,background:'#eee'}}>{platform.charAt(0).toUpperCase()}</div>);
    }
  };

  return (
    <div className="content-upload-container">
      <form onSubmit={handleSubmit} className="content-upload-form">
        <h3>✨ Create Content</h3>
        
        <DraftManager 
          onLoadDraft={handleLoadDraft}
          currentDraft={getCurrentDraft()}
        />
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
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
        <div className="content-upload-grid">
          <div className="left-column">
            <div className="form-group">
              <label htmlFor="content-file-input">File</label>
              <div className={`file-upload drop-zone ${isDropActive ? 'dragging' : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave}>
                <input
                  type="file"
                  id="content-file-input"
                  accept={type === 'video' ? 'video/*' : (type === 'audio' ? 'audio/*' : 'image/*')}
                  onChange={e => handleFileChange(e.target.files[0])}
                  required
                  className="form-file-input"
                />
                <div className="drop-help">Drop files here or click to browse</div>
                {file && (
                  <div className="file-info">
                    Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
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
                      style={{filter: selectedFilter?.css ? sanitizeCSS(selectedFilter.css) : ''}}
                      onLoadedMetadata={(ev) => {
                        const dur = ev.target.duration || 0;
                        setDuration(dur);
                        setTrimEnd(dur);
                      }}
                    />
                  ) : type === 'audio' ? (
                    <div style={{width:'100%'}}>
                      <audio src={previewUrl} controls style={{width:'100%', filter: selectedFilter?.css ? sanitizeCSS(selectedFilter.css) : ''}} onLoadedMetadata={(ev)=>{const dur=ev.target.duration||0; setDuration(dur); setTrimEnd(dur);}} />
                      <div style={{marginTop:8}}>
                        <AudioWaveformTrimmer file={file} trimStart={trimStart} trimEnd={trimEnd} onChange={({trimStart: s, trimEnd: e})=>{ if (typeof s !== 'undefined') setTrimStart(s); if (typeof e !== 'undefined') setTrimEnd(e); }} />
                      </div>
                    </div>
                  ) : (
                    <img
                      className="preview-image"
                      src={previewUrl}
                      alt="Content preview"
                      style={{
                        transform: `rotate(${rotate}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                        filter: selectedFilter?.css ? sanitizeCSS(selectedFilter.css) : ''
                      }}
                    />
                  )}
                </div>
                {overlayText && (
                  <div className={`preview-overlay ${overlayPosition}`}>
                    <div 
                      className="overlay-text"
                      style={{
                        fontSize: `${textStyles.fontSize}px`,
                        color: textStyles.color,
                        fontWeight: textStyles.fontWeight,
                        textShadow: textStyles.shadow ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none'
                      }}
                    >
                      {/* Security: Text content is safely rendered as text node, not HTML */}
                      {overlayText}
                    </div>
                  </div>
                )}
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
          </div>
          <div className="right-column">
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
            <BestTimeToPost selectedPlatforms={selectedPlatformsVal} />
            
            <div className="form-group">
              <label>🎯 Target Platforms</label>
              <div className="platform-grid">
                {['youtube','tiktok','instagram','facebook','twitter','linkedin','reddit','discord','telegram','pinterest','spotify','snapchat'].map((p) => (
                  <div key={p} role="button" tabIndex={0} aria-pressed={selectedPlatformsVal.includes(p)} aria-label={p.charAt(0).toUpperCase()+p.slice(1)} onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); togglePlatform(p); } }} className={`platform-tile ${selectedPlatformsVal.includes(p) ? 'selected' : ''}`} onClick={()=>togglePlatform(p)}>
                    <input type="checkbox" className="sr-only" aria-hidden="true" checked={selectedPlatformsVal.includes(p)} readOnly />
                    <div className="platform-icon" aria-hidden="true">{getPlatformIcon(p)}</div>
                    <div className="platform-name">{p.charAt(0).toUpperCase()+p.slice(1)}</div>
                  </div>
                ))}
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
          </div>
        </div>
        <div className="form-group full-width">
          <label htmlFor="content-title">Title</label>
          <div className="input-with-emoji">
            <input
              id="content-title"
              ref={titleInputRef}
              type="text"
              placeholder="✨ Enter catchy title..."
              value={title}
              required
              onChange={e => {
                // Security: Use centralized sanitization function
                setTitle(sanitizeInput(e.target.value));
              }}
              className="form-input"
              maxLength={100}
            />
            <button 
              type="button" 
              className="emoji-btn"
              onClick={() => openEmojiPicker('title')}
            >
              😊
            </button>
          </div>
          <div className="char-count">{title.length}/100</div>
        </div>
        
        <div className="form-group full-width">
          <label htmlFor="content-description">Description</label>
          <div className="input-with-emoji">
            <textarea
              id="content-description"
              ref={descInputRef}
              placeholder="📝 Describe your content..."
              value={description}
              required
              onChange={e => {
                // Security: Use centralized sanitization function
                setDescription(sanitizeInput(e.target.value));
              }}
              className="form-textarea"
              rows={4}
              maxLength={500}
            />
            <button 
              type="button" 
              className="emoji-btn"
              onClick={() => openEmojiPicker('description')}
            >
              😊
            </button>
          </div>
          <div className="char-count">{description.length}/500</div>
        </div>
        
        {hashtags.length > 0 && (
          <div className="selected-hashtags">
            {hashtags.map((tag, idx) => (
              <span key={idx} className="hashtag-badge">
                #{tag}
                <button 
                  type="button" 
                  onClick={() => removeHashtag(tag)}
                  className="remove-hashtag"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        
        <HashtagSuggestions
          contentType={type}
          title={title}
          description={description}
          onAddHashtag={handleAddHashtag}
        />
        <div className="form-group">
          <label>🎨 Text Overlay (optional)</label>
          <div className="input-with-emoji">
            <input 
              placeholder="Add overlay text..." 
              value={overlayText} 
              onChange={(e)=>{
                // Security: Use centralized sanitization function
                setOverlayText(sanitizeInput(e.target.value));
              }} 
              className="form-input" 
            />
            <button 
              type="button" 
              className="emoji-btn"
              onClick={() => openEmojiPicker('overlay')}
            >
              😊
            </button>
          </div>
          <div className="overlay-controls">
            <select aria-label="Overlay position" value={overlayPosition} onChange={(e)=>setOverlayPosition(e.target.value)} className="form-select-small">
              <option value="top">⬆️ Top</option>
              <option value="center">⏺️ Center</option>
              <option value="bottom">⬇️ Bottom</option>
            </select>
            <input 
              type="color" 
              value={textStyles.color} 
              onChange={(e)=>setTextStyles({...textStyles, color: e.target.value})} 
              className="color-picker"
              title="Text color"
            />
            <select 
              value={textStyles.fontSize} 
              onChange={(e)=>setTextStyles({...textStyles, fontSize: parseInt(e.target.value)})} 
              className="form-select-small"
            >
              <option value={12}>Small</option>
              <option value={16}>Medium</option>
              <option value={24}>Large</option>
              <option value={32}>XL</option>
            </select>
          </div>
        </div>
        
        {file && type === 'image' && previewUrl && (
          <FilterEffects
            imageUrl={previewUrl}
            onApplyFilter={(filter) => setSelectedFilter(filter)}
          />
        )}
        
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
        
        <div style={{display:'flex', gap:'.5rem', marginTop:'.5rem', flexWrap: 'wrap'}}>
          <button 
            type="button"
            disabled={isUploading || isPreviewing}
            className="preview-button"
            onClick={handlePreview}
            title="Preview (Ctrl+P)"
            aria-label="Preview Content"
          >
            {isPreviewing ? (
              <><span className="loading-spinner"></span> Generating Preview...</>
            ) : (
              <>⚡ Preview</>
            )}
          </button>
          <button 
            type="button"
            disabled={isUploading}
            className="quality-check-button"
            onClick={handleQualityCheck}
            title="Check content quality"
          >
            ✨ Quality Check
          </button>
          <button 
            type="submit" 
            disabled={isUploading}
            className="submit-button"
            title="Upload (Ctrl+Enter)"
            aria-label="Upload Content"
            onClick={(e) => { e.preventDefault(); handleSubmit(e); }}
          >
            {isUploading ? (
              <>
                <span className="loading-spinner"></span>
                Uploading...
              </>
            ) : (
              <>🚀 Upload</>
            )}
          </button>
        </div>
        
        <div className="keyboard-shortcuts">
          <span>⌨️ Shortcuts:</span>
          <span className="shortcut-item">Ctrl+Enter = Upload</span>
          <span className="shortcut-item">Ctrl+P = Preview</span>
          <span className="shortcut-item">Ctrl+S = Save Draft</span>
        </div>
        {showCropper && previewUrl && (
          <ImageCropper imageUrl={previewUrl} onChangeCrop={(rect)=>{ setCropMeta(rect); setShowCropper(false); }} onClose={()=>setShowCropper(false)} />
        )}
        
        {showEmojiPicker && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmojiPicker(false)}
          />
        )}
        
        {showProgress && (
          <ProgressIndicator
            progress={uploadProgress}
            status={uploadStatus}
            fileName={file?.name}
          />
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