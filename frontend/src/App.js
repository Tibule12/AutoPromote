// Trigger CI/CD: minor change for deployment
/* eslint-disable no-console, no-unused-vars */
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import { auth, db, storage } from './firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { API_ENDPOINTS, API_BASE_URL, PUBLIC_SITE_URL } from './config';
import { parseJsonSafe } from './utils/parseJsonSafe';
import ChatWidget from './ChatWidget';
import { Sentry } from './sentryClient';
import TestSentryButton from './components/TestSentryButton';

function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [content, setContent] = useState([]);
  const [mySchedules, setMySchedules] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [userDefaults, setUserDefaults] = useState({
    timezone: 'UTC',
    defaultPlatforms: [],
    defaultFrequency: 'once'
  });
  // Feature flag: when true (default unless REACT_APP_DISABLE_IMMEDIATE_POSTS is 'false'),
  // disable direct client-side platform posts and rely on backend queued tasks.
  const DISABLE_IMMEDIATE_POSTS = (process.env.REACT_APP_DISABLE_IMMEDIATE_POSTS === undefined) || process.env.REACT_APP_DISABLE_IMMEDIATE_POSTS !== 'false';
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [termsRequired, setTermsRequired] = useState(false);
  const [requiredTermsVersion, setRequiredTermsVersion] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null); // { userData, token }
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
        setContent([]); // Clear content on logout
        try { if (Sentry && typeof Sentry.setUser === 'function') Sentry.setUser(null); } catch (_) {}
        return;
      }
      try {
        const token = await firebaseUser.getIdToken(true);
        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const hasAdminClaim = idTokenResult.claims.admin === true || idTokenResult.claims.role === 'admin';
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          // Keep tokens in memory via Firebase auth.currentUser.getIdToken()
          isAdmin: hasAdminClaim,
          role: hasAdminClaim ? 'admin' : 'user',
        };
        // Before allowing the app to enter the dashboard, ensure terms are accepted.
        const ok = await ensureTermsAccepted(token, userData, 'authState');
        if (!ok) {
          // Block login UI transition until the user accepts. Keep user null for now.
          return;
        }
        // Proceed to set user and prefetch content once terms are satisfied.
        setUser({ ...userData, token }); // keep token in memory in React state only
        try { if (Sentry && typeof Sentry.setUser === 'function') Sentry.setUser({ id: userData.uid, username: userData.email, email: userData.email }); } catch(_) {}
        setIsAdmin(hasAdminClaim);
        const safeUserForStorage = { ...userData };
        localStorage.setItem('user', JSON.stringify(safeUserForStorage));
        // User signed in (UID suppressed in logs)
        await fetchUserContent(token);
      } catch (error) {
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
        setContent([]);
      }
    });
    if (window.location.pathname === '/admin-login') {
      setShowAdminLogin(true);
      setShowLogin(false);
      setShowRegister(false);
    }
    return () => unsubscribe();
  }, []);

  const fetchUserContent = async (providedToken = null) => {
    try {
      let token = providedToken;
      if (!token) {
        const currentUser = auth.currentUser;
        if (currentUser) {
          token = await currentUser.getIdToken(true);
        } else if (user && user.token) {
          token = user.token;
        } else {
          return;
        }
      }
      const res = await fetch(API_ENDPOINTS.MY_CONTENT, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        mode: 'cors'
      });
      if (!res.ok) {
        // Try to read response body for error details
        let body = null;
        try { const parsed = await parseJsonSafe(res); body = parsed.json || null; } catch (_) { body = null; }
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchUserContent(freshToken);
        }
        if (res.status === 403 && body && body.error === 'terms_not_accepted') {
          // Show a full-screen modal rather than an in-dashboard banner
          setTermsRequired(true);
          setRequiredTermsVersion(body.requiredVersion || null);
          setShowTermsModal(true);
          return;
        }
        return;
      }
      const parsed = await parseJsonSafe(res);
      const data = parsed.json || null;
      setContent((data && data.content) || []);
      // After content, also fetch schedules (reuse token)
      await fetchMySchedules(token);
    } catch (error) {}
  };

  const fetchMySchedules = async (providedToken = null) => {
    try {
      let token = providedToken;
      if (!token) {
        const currentUser = auth.currentUser;
        if (currentUser) token = await currentUser.getIdToken(true);
        else if (user && user.token) token = user.token; else return;
      }
      const res = await fetch(API_ENDPOINTS.MY_SCHEDULES, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const parsed = await parseJsonSafe(res);
        const data = parsed.json || null;
        setMySchedules(Array.isArray(data?.schedules) ? data.schedules : []);
      }
    } catch (_) {}
  };

  // Expose a refresh handler to child components that perform schedule actions
  const refreshSchedules = async () => {
    await fetchMySchedules();
  };

  const fetchAnalytics = async (providedToken = null) => {
    let token = providedToken;
    if (!token) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        token = await currentUser.getIdToken(true);
      } else if (user && user.token) {
        token = user.token;
      } else {
        return;
      }
    }
    if (!user || !user.role) {
      setIsAdmin(false);
      return;
    }
    const isAdminUser = user.role === 'admin' || user.isAdmin === true;
    if (!isAdminUser) {
      return;
    }
    try {
      const res = await fetch(API_ENDPOINTS.ADMIN_ANALYTICS, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      const parsed = await parseJsonSafe(res);
      if (!parsed.ok) {
        const body = parsed.json || null;
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchAnalytics(freshToken);
        }
        if (res.status === 403 && body && body.error === 'terms_not_accepted') {
          setTermsRequired(true);
          setRequiredTermsVersion(body.requiredVersion || null);
          return;
        }
        setIsAdmin(false);
        return;
      } else {
        const data = parsed.json;
        setAnalytics(data);
      }
    } catch (error) {}
  };

  const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user: firebaseUser } = userCredential;
      const idToken = await firebaseUser.getIdToken();
      // Performing login against configured endpoint
      const res = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        const parsed = await parseJsonSafe(res);
        const data = parsed.json || null;
        // If backend returns a custom token, exchange it for an ID token
        if (data.customToken) {
          // Sign in with custom token (modular API)
          const customUserCredential = await signInWithCustomToken(auth, data.customToken);
          const customIdToken = await customUserCredential.user.getIdToken();
          // If user agreed at login screen, proactively accept terms on server before proceeding
          try {
            if (localStorage.getItem('tosAgreed') === 'true') {
              const url = `${API_BASE_URL}/api/users/me/accept-terms`;
              await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${customIdToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({}) }).catch(()=>{});
              localStorage.removeItem('tosAgreed');
            }
          } catch(_) {}
          // Before proceeding, ensure ToS accepted (pre-dashboard)
          const userData = { ...data.user, token: customIdToken };
          const ok = await ensureTermsAccepted(customIdToken, userData, 'login');
          if (ok) handleLogin(userData);
        } else {
          // If user agreed at login screen, proactively accept terms on server before proceeding
          try {
            if (localStorage.getItem('tosAgreed') === 'true') {
              const url = `${API_BASE_URL}/api/users/me/accept-terms`;
              await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({}) }).catch(()=>{});
              localStorage.removeItem('tosAgreed');
            }
          } catch(_) {}
          const userData = { ...data.user, token: idToken };
          const ok = await ensureTermsAccepted(idToken, userData, 'login');
          if (ok) handleLogin(userData);
        }
      } else {
        const parsedErr = await parseJsonSafe(res);
        const errorBody = parsedErr.json || null;
        throw new Error(errorBody?.message || 'Login failed');
      }
    } catch (error) {
      alert(error.message || 'Login failed');
    }
  };

  // Ensure terms are accepted; if not, show modal and defer login
  const ensureTermsAccepted = async (token, userData, source) => {
    try {
      const res = await fetch(API_ENDPOINTS.MY_CONTENT, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (res.ok) return true; // already accepted
      let body = null; try { const parsed = await parseJsonSafe(res); body = parsed.json || null; } catch(_) {}
      if (res.status === 403 && body && body.error === 'terms_not_accepted') {
        setRequiredTermsVersion(body.requiredVersion || null);
        setTermsRequired(true);
        setPendingLogin({ userData, token });
        setShowTermsModal(true);
        return false;
      }
      return true; // treat other failures as non-blocking for login
    } catch (_) {
      return true;
    }
  };

  const registerUser = async (name, email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;
      await updateProfile(firebaseUser, { displayName: name });
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(API_ENDPOINTS.REGISTER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ name, email, uid: firebaseUser.uid, idToken }),
      });
      if (res.ok) {
        const parsed = await parseJsonSafe(res);
        const data = parsed.json || null;
        handleRegister({ ...data.user, token: idToken, uid: firebaseUser.uid });
        alert('Registration successful! You are now logged in.');
      } else {
        handleRegister({ uid: firebaseUser.uid, email, name, token: idToken, role: 'user' });
        alert('Registration partially successful. Some features may be limited.');
      }
    } catch (error) {
      alert('Registration failed: ' + (error.message || 'Unknown error'));
    }
  };

  const handleLogin = async (userData) => {
    try {
      localStorage.clear();
      if (!userData || !userData.role) {
        setShowLogin(true);
        setUser(null);
        setIsAdmin(false);
        return;
      }
      if (!userData.token) {
        return;
      }
      const forceAdmin = userData.role === 'admin' || userData.isAdmin === true;
      // Always preserve admin status, never downgrade
        const updatedUserData = { ...userData, role: forceAdmin ? 'admin' : userData.role, isAdmin: forceAdmin };
        // Persist only non-sensitive metadata. Remove token before storing.
        const { token: _token, ...safeUpdated } = updatedUserData;
        localStorage.setItem('user', JSON.stringify(safeUpdated));
      setUser(prev => {
        if (prev && (prev.role === 'admin' || prev.isAdmin === true)) {
          return { ...prev, ...updatedUserData, role: 'admin', isAdmin: true };
        }
        return updatedUserData;
      });
      setIsAdmin(forceAdmin);
      setShowLogin(false);
      // ...existing code... (Firestore update logic removed)
      if (forceAdmin) {
        await fetchAnalytics();
        navigate('/admin-dashboard');
      } else {
        await fetchUserContent();
        navigate('/');
      }
    } catch (error) {
      handleLogout();
    }
  };

  const handleRegister = (userData) => {
    setUser(userData);
    setShowRegister(false);
  };

  // Save user defaults (timezone, default platforms, frequency)
  const saveUserDefaults = async ({ timezone, defaultPlatforms, defaultFrequency }) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.USERS_ME, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ timezone, defaultPlatforms, defaultFrequency })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to save defaults');
      }
      const data = await res.json();
      const u = data && data.user ? data.user : {};
      const sched = u.schedulingDefaults || {};
      setUserDefaults({
        timezone: u.timezone || timezone || 'UTC',
        schedulingDefaults: sched,
        defaultPlatforms: sched.platforms || defaultPlatforms || [],
        defaultFrequency: sched.frequency || defaultFrequency || 'once'
      });
      return true;
    } catch (e) {
      alert(e.message || 'Could not save settings');
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      // User logged out
      await signOut(auth);
      setUser(null);
      setContent([]);
      setIsAdmin(false);
      setShowLogin(false);
      setShowRegister(false);
      setShowAdminLogin(false);
      localStorage.clear();
      setJustLoggedOut(true);
      setTermsRequired(false);
      setRequiredTermsVersion(null);
    } catch (error) { console.error('Logout error:', error); }
  };

  // Accept Terms action: posts acceptance and continues pending login if any
  const acceptTerms = async () => {
    try {
      // Prefer the token from a pending login (pre-dashboard), else current user
      let token = pendingLogin?.token || null;
      if (!token) {
        const currentUser = auth.currentUser;
        if (!currentUser) return;
        token = await currentUser.getIdToken(true);
      }
      const url = `${API_BASE_URL}/api/users/me/accept-terms`;
      const payload = requiredTermsVersion ? { acceptedTermsVersion: requiredTermsVersion } : {};
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(()=>({}));
      if (!res.ok) {
        alert('Failed to accept terms: ' + (body.error || res.status));
        return;
      }
      setTermsRequired(false);
      setRequiredTermsVersion(null);
      setShowTermsModal(false);
      if (pendingLogin && pendingLogin.userData) {
        // Complete the deferred login now that terms are accepted
        const u = pendingLogin.userData;
        setPendingLogin(null);
        handleLogin(u);
      } else {
        await fetchUserContent();
        if (isAdmin) await fetchAnalytics();
      }
    } catch (e) {
      alert('Could not accept terms. Please try again.');
    }
  };

  // Redirect after logout
  React.useEffect(() => {
    if (justLoggedOut && !user) {
      navigate('/');
      setJustLoggedOut(false);
    }
  }, [justLoggedOut, user, navigate]);

  // Content upload handler (with file and platforms)
  const handleContentUpload = async (params) => {
    try {
      // Destructure all possible fields from params
      const { file, platforms, title, description, type, schedule, isDryRun, trimStart, trimEnd, template, rotate, flipH, flipV } = params;
      const token = await auth.currentUser.getIdToken(true);
      let finalUrl = '';
      // If this is a preview/dry-run, do NOT upload the file to storage.
      // Use a `preview://` URL so preview pipelines and workers treat it as a local preview token.
      if (isDryRun && file) {
        finalUrl = `preview://${file.name}`;
      } else if (!isDryRun && !file && params.url) {
        // If the caller already uploaded the file (some upload forms do client-side storage
        // upload) prefer the provided `url` instead of re-uploading.
        finalUrl = params.url;
      } else {
        // Only upload file for real submissions (not dry-run)
        if ((type === 'video' || type === 'image' || type === 'audio') && file) {
          const filePath = `uploads/${type}s/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, filePath);
          await uploadBytes(storageRef, file);
          finalUrl = await getDownloadURL(storageRef);
        }
      }
      const schedule_hint = {
        ...schedule,
        frequency: schedule?.frequency || userDefaults.defaultFrequency || 'once',
        timezone: userDefaults.timezone || 'UTC'
      };
      // Defensive: ensure non-empty URL for real uploads (avoid sending empty "url" to server)
      if (!isDryRun && (!finalUrl || String(finalUrl).trim() === '')) {
        alert('Upload failed: missing file URL. Please retry the upload.');
        return { ok: false, error: 'missing_url' };
      }
      const payload = {
        title: title || (file ? file.name : ''),
        type: type || 'video',
        url: finalUrl,
        description: description || '',
        target_platforms: platforms && platforms.length ? platforms : (userDefaults.defaultPlatforms || ['youtube','tiktok','instagram']),
        platform_options: params.platformOptions || params.platform_options || {},
        schedule_hint,
        meta: {
          ...(params.meta || {}),
          ...(typeof trimStart !== 'undefined' ? { trimStart } : {}),
          ...(typeof trimEnd !== 'undefined' ? { trimEnd } : {}),
          ...(typeof rotate !== 'undefined' ? { rotate } : {}),
          ...(typeof flipH !== 'undefined' ? { flipH } : {}),
          ...(typeof flipV !== 'undefined' ? { flipV } : {}),
          ...(template ? { template } : {})
        }
      };
      const res = await fetch(API_ENDPOINTS.CONTENT_UPLOAD, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      // Read response body safely so we can show any server-side validation error
      let result = null;
      try {
        result = await res.json();
      } catch (e) {
        // If response is not JSON, try to read as text
        try { const txt = await res.text(); result = { text: txt }; } catch (_) { result = null; }
      }
      if (!res.ok) {
        const serverErr = (result && (result.error || result.message || result.text)) || `HTTP ${res.status}`;
        throw new Error(serverErr || 'Upload/preview failed');
      }
      if (isDryRun) {
        return result;
      }

      // If server marked the content as pending approval, do not attempt any immediate posts.
      if (result && result.content && result.content.status === 'pending_approval') {
        await fetchUserContent(token);
        alert('Content uploaded and queued for promotion. It will be published to selected platforms after approval.');
        return result;
      }
        try {
          const chosen = Array.isArray(platforms) ? platforms : [];
          // Require explicit user request to perform immediate platform posts.
          const shouldImmediatePost = params?.immediate_post === true && !DISABLE_IMMEDIATE_POSTS;
          const postYouTube = async () => {
            if (!shouldImmediatePost) { console.log('[Upload] Immediate YouTube post not requested or disabled'); return; }
            if (!chosen.includes('youtube')) return;
          try {
            // Ensure contentId and fileUrl are sent as required by backend
            // Try all possible keys for contentId from upload response
            // Backend returns { contentId: '...' } on successful upload
            // Try to extract contentId from backend response structure
            let contentId = result?.contentId || result?.promotion_schedule?.contentId;
            // Fallback: try to get from Firestore content list if available
            if (!contentId && Array.isArray(content)) {
              // Try to find a matching content item with the same url
              const match = content.find(c => c.url === payload.url);
              if (match && match.id) contentId = match.id;
              else {
                const last = content[content.length - 1];
                if (last && last.id) contentId = last.id;
              }
            }
            console.log('YouTube upload: contentId', contentId, 'fileUrl', payload.url, 'result', result);
            const fileUrl = payload.url;
            if (!contentId || !fileUrl) {
              console.warn('Missing contentId or fileUrl for YouTube upload');
              return;
            }
            const r = await fetch(API_ENDPOINTS.YOUTUBE_UPLOAD, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ contentId, videoUrl: payload.url, title: title || (file ? file.name : ''), description: description || '', shortsMode: payload.platform_options?.youtube?.shortsMode })
            });
            if (!r.ok) console.warn('YouTube upload failed');
          } catch (_) {}
        };
        const getFacebookStatus = async () => {
          const s = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' } });
          if (!s.ok) return null;
          return s.json();
        };
        const postFacebook = async () => {
          if (!chosen.includes('facebook')) return;
          try {
            const st = await getFacebookStatus();
            const pageId = st?.pages?.[0]?.id;
            if (!pageId) return;
            const body = { pageId, content: { type: type || 'video', url: payload.url, title: title || (file ? file.name : ''), description: description || '' } };
            const r = await fetch(API_ENDPOINTS.FACEBOOK_UPLOAD, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify(body)
            });
            if (!r.ok) console.warn('Facebook upload failed');
          } catch (_) {}
        };
        const postInstagram = async () => {
          if (!chosen.includes('instagram')) return;
          try {
            const st = await getFacebookStatus();
            const pageId = st?.pages?.[0]?.id;
            if (!pageId) return;
            const mediaType = (type || 'video').toLowerCase();
            const r = await fetch(API_ENDPOINTS.INSTAGRAM_UPLOAD, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ pageId, mediaUrl: payload.url, caption: `${title || ''}\n${description || ''}`.trim(), mediaType })
            });
            if (!r.ok) console.warn('Instagram upload failed');
          } catch (_) {}
        };
        // Only run immediate posts when explicitly requested by the user (params.immediate_post)
        if (params?.immediate_post === true && !DISABLE_IMMEDIATE_POSTS) {
          await postYouTube();
          await postFacebook();
          await postInstagram();
        } else {
          console.log('[Upload] Immediate platform posts not requested or disabled; posts will be processed by backend queued tasks');
        }
      } catch (e) {
        console.warn('Auto-post skipped or partial:', e?.message);
      }
      await fetchUserContent(token);
      alert('Content uploaded and queued for promotion. It will be published to selected platforms after approval.');
    } catch (error) {
      alert('Error uploading content: ' + error.message);
    }
  };

  return (
    <div>
      {showTermsModal && (
        <div style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:10000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#fff',borderRadius:16,boxShadow:'0 12px 36px rgba(0,0,0,0.2)',padding:'24px 22px',maxWidth:560,width:'90%'}}>
            <h3 style={{marginTop:0,marginBottom:8}}>Accept Terms of Service</h3>
            <p style={{marginTop:0,color:'#444'}}>Please accept the latest Terms of Service{requiredTermsVersion ? ` (${requiredTermsVersion})` : ''} to continue.</p>
            <div style={{display:'flex',gap:12,marginTop:16,alignItems:'center'}}>
              <button onClick={acceptTerms} style={{ background: '#111827', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, cursor: 'pointer' }}>
                Accept and Continue
              </button>
              <a href={`${PUBLIC_SITE_URL}/terms`} target="_blank" rel="noreferrer">View Terms</a>
            </div>
          </div>
        </div>
      )}
      {/* If no user, show welcome/login page */}
      {!user ? (
        <>
          {!showLogin && !showRegister && (() => {
            try {
              const WelcomePage = require('./WelcomePage').default;
              return <WelcomePage onGetStarted={() => setShowRegister(true)} onSignIn={() => setShowLogin(true)} />;
            } catch (e) {
              return <div style={{color:'red'}}>Welcome page not found.</div>;
            }
          })()}
          {/* Show login modal if requested */}
          {showLogin && (() => {
            try {
              const LoginForm = require('./LoginForm').default;
              return (
                <div className="modal-overlay" style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',zIndex:9999,overflowY:'auto'}}>
                  <div style={{minHeight:'100%',display:'flex',justifyContent:'center',alignItems:'flex-start',padding:'3rem 1.25rem'}}>
                    <LoginForm onLogin={loginUser} onClose={() => setShowLogin(false)} />
                  </div>
                </div>
              );
            } catch (e) {
              return <div style={{color:'red'}}>Login form not found.</div>;
            }
          })()}
          {/* Show register modal if requested */}
          {showRegister && (() => {
            try {
              const RegisterForm = require('./RegisterForm').default;
              return (
                <div className="modal-overlay" style={{position:'fixed',top:0,left:0,width:'100vw',height:'100vh',background:'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',zIndex:9999,overflowY:'auto'}}>
                  <div style={{minHeight:'100%',display:'flex',justifyContent:'center',alignItems:'flex-start',padding:'3rem 1.25rem'}}>
                    <RegisterForm onRegister={registerUser} onClose={() => setShowRegister(false)} />
                  </div>
                </div>
              );
            } catch (e) {
              return <div style={{color:'red'}}>Register form not found.</div>;
            }
          })()}
        </>
      ) : (user && (user.role === 'admin' || user.isAdmin === true)) ? (
        // Render admin dashboard for admin users
        (() => {
          try {
            const AdminDashboard = require('./AdminDashboard').default;
            return <AdminDashboard analytics={analytics} user={user} onLogout={handleLogout} />;
          } catch (e) {
            return <div style={{color:'red'}}>Admin dashboard not found.</div>;
          }
        })()
      ) : (
        // Render full user dashboard for normal users
        (() => {
          try {
            const UserDashboard = require('./UserDashboard_full').default;
            return <UserDashboard user={user} content={content} userDefaults={userDefaults} onSaveDefaults={saveUserDefaults} onLogout={handleLogout} onUpload={handleContentUpload} mySchedules={mySchedules} onSchedulesChanged={refreshSchedules} />;
          } catch (e) {
            return <div style={{color:'red'}}>User dashboard not found.</div>;
          }
        })()
      )}
      {/* AI Chat Widget - only show when user is logged in */}
      {user && <ChatWidget />}
      {/* Optional: show Sentry test UI in non-prod or when explicitly enabled */}
      {(process.env.REACT_APP_SHOW_SENTRY_TEST_BUTTON === '1' || process.env.NODE_ENV !== 'production') && (
        <div style={{ position: 'fixed', bottom: 10, right: 10, zIndex: 9999 }}>
          <TestSentryButton />
        </div>
      )}
    </div>
  );
}

export default App;