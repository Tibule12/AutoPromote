// Trigger CI/CD: minor change for deployment
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import { auth, db, storage } from './firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, signInWithCustomToken } from 'firebase/auth';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
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
          token,
          isAdmin: hasAdminClaim,
          role: hasAdminClaim ? 'admin' : 'user',
        };
        setUser(userData);
        setIsAdmin(hasAdminClaim);
        localStorage.setItem('user', JSON.stringify(userData));
        // Debug log for current UID
        console.log("Current UID:", firebaseUser.uid);
      } catch (error) {
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
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
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchUserContent(freshToken);
        }
        return;
      }
      const data = await res.json();
      setContent(data.content || []);
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
        const data = await res.json();
        setMySchedules(Array.isArray(data.schedules) ? data.schedules : []);
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
      if (!res.ok) {
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchAnalytics(freshToken);
        }
        setIsAdmin(false);
        return;
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {}
  };

  const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const { user: firebaseUser } = userCredential;
      const idToken = await firebaseUser.getIdToken();
      console.log('LOGIN API ENDPOINT:', API_ENDPOINTS.LOGIN);
      const res = await fetch(API_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        const data = await res.json();
        // If backend returns a custom token, exchange it for an ID token
        if (data.customToken) {
          // Sign in with custom token (modular API)
          const customUserCredential = await signInWithCustomToken(auth, data.customToken);
          const customIdToken = await customUserCredential.user.getIdToken();
          handleLogin({ ...data.user, token: customIdToken });
        } else {
          handleLogin({ ...data.user, token: idToken });
        }
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Login failed');
      }
    } catch (error) {
      alert(error.message || 'Login failed');
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
        const data = await res.json();
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
      const updatedUserData = { ...userData, role: forceAdmin ? 'admin' : userData.role, isAdmin: forceAdmin };
      localStorage.setItem('user', JSON.stringify(updatedUserData));
      setUser(updatedUserData);
      setIsAdmin(forceAdmin);
      setShowLogin(false);
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

  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const handleLogout = async () => {
    try {
      console.log('handleLogout called');
      await signOut(auth);
      setUser(null);
      setContent([]);
      setIsAdmin(false);
      setShowLogin(false);
      setShowRegister(false);
      setShowAdminLogin(false);
      localStorage.clear();
      setJustLoggedOut(true);
    } catch (error) { console.error('Logout error:', error); }
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
      const { file, platforms, title, description, type, schedule, articleText, isDryRun } = params;
      const token = await auth.currentUser.getIdToken(true);
      let url = '';
      if (type !== 'article' && file) {
        url = isDryRun ? `preview://${file.name}` : undefined;
      }
      const schedule_hint = {
        ...schedule,
        frequency: schedule?.frequency || userDefaults.defaultFrequency || 'once',
        timezone: userDefaults.timezone || 'UTC'
      };
      const payload = {
        title: title || (file ? file.name : ''),
        type: type || 'video',
        url: url || undefined,
        description: description || '',
        target_platforms: platforms && platforms.length ? platforms : (userDefaults.defaultPlatforms || ['youtube','tiktok','instagram']),
        schedule_hint,
        isDryRun: !!isDryRun
      };
      if (type === 'article' && articleText) {
        payload.articleText = articleText;
      }
      if (!isDryRun && type !== 'article' && file) {
        const path = `uploads/${user.uid}/${file.name}`;
        const fileRef = storageRef(storage, path);
        await uploadBytes(fileRef, file);
        payload.url = await getDownloadURL(fileRef);
      }
      const res = await fetch(API_ENDPOINTS.CONTENT_UPLOAD, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.message || 'Upload/preview failed');
      }
      if (isDryRun) {
        return result;
      }
      try {
        const chosen = Array.isArray(platforms) ? platforms : [];
        const postYouTube = async () => {
          if (!chosen.includes('youtube')) return;
          try {
            const r = await fetch(API_ENDPOINTS.YOUTUBE_UPLOAD, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
              body: JSON.stringify({ title: title || (file ? file.name : ''), description: description || '', videoUrl: payload.url })
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
        await postYouTube();
        await postFacebook();
        await postInstagram();
      } catch (e) {
        console.warn('Auto-post skipped or partial:', e?.message);
      }
      await fetchUserContent(token);
      alert('Content uploaded! Posting to connected platforms has been triggered.');
    } catch (error) {
      alert('Error uploading content: ' + error.message);
    }
  };
  return (
    <div className="App">
      <h2 style={{color: 'red', textAlign: 'center'}}>Test Render: If you see this, React is working!</h2>
      <EnvTest />
      <EnvChecker />
  {user && userLoaded && <DatabaseSync user={user} />}

      <Routes>
  <Route path="/admin-dashboard" element={<AdminDashboard analytics={analytics} user={user} onLogout={handleLogout} />} />
        <Route path="/integration-test" element={<IntegrationTester />} />
        <Route path="/" element={
          <>
            {showLogin && <LoginForm onLogin={handleLogin} loginUser={loginUser} />}
            {showAdminLogin && <AdminLoginForm onLogin={handleLogin} />}
            {showRegister && <RegisterForm registerUser={registerUser} />}
            {userLoaded && user && !(isAdmin || user.role === 'admin' || user.isAdmin === true) && (
              <UserDashboard
                user={user}
                content={content}
                stats={profileStats}
                badges={badges}
                notifications={notifications}
                userDefaults={userDefaults}
                onSaveDefaults={saveUserDefaults}
                mySchedules={mySchedules}
                onUpload={handleContentUpload}
                onPromoteToggle={() => {}}
                onSchedulesChanged={refreshSchedules}
                onLogout={handleLogout}
              />
            )}
            {!user && !showLogin && !showRegister && !showAdminLogin && (
                <WelcomePage 
                  onGetStarted={() => setShowRegister(true)} 
                  onSignIn={() => setShowLogin(true)} 
                />
            )}
          </>
        } />
      </Routes>
    </div>
  );
// End of App function

export default App;