// Trigger CI/CD: minor change for deployment
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import { auth, db, storage } from './firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut, signInWithCustomToken } from 'firebase/auth';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit as fslimit,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { API_ENDPOINTS } from './config';
import LoginForm from './LoginForm';
import AdminLoginForm from './AdminLoginForm';
import RegisterForm from './RegisterForm';
import ContentUploadForm from './ContentUploadForm';
import ContentList from './ContentList';
import AdminDashboard from './AdminDashboard';
import EnvTest from './components/EnvTest';
import EnvChecker from './components/EnvChecker';
import DatabaseSync from './components/DatabaseSync';
import IntegrationTester from './components/IntegrationTester';
import WelcomePage from './WelcomePage';
import UserDashboard from './UserDashboard_full';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [profileStats, setProfileStats] = useState({ views: 0, revenue: 0, ctr: 0, chart: [] });
  const [badges, setBadges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [userDefaults, setUserDefaults] = useState({ timezone: 'UTC', schedulingDefaults: {}, defaultPlatforms: [], defaultFrequency: 'once' });
  const [mySchedules, setMySchedules] = useState([]);
  // Fetch user profile, stats, badges, notifications from Firestore
  useEffect(() => {
    const fetchUserDashboardData = async () => {
      if (!user || !user.uid) {
        setUserLoaded(false);
        return;
      }
      try {
        // Profile stats
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        let stats = { views: 0, revenue: 0, ctr: 0, chart: [] };
        if (userSnap.exists()) {
          const data = userSnap.data();
          stats.views = data.views || 0;
          stats.revenue = data.revenue || 0;
          // Merge Firestore user fields into user state
          setUser(prev => (prev ? { ...prev, ...data } : { ...data, uid: user.uid }));
        }
        // Fetch analytics for chart and CTR
        const analyticsQuery = query(
          collection(db, 'analytics'),
          where('userId', '==', user.uid),
          orderBy('timestamp', 'desc'),
          fslimit(30)
        );
        const analyticsSnap = await getDocs(analyticsQuery);
        let chart = [];
        let totalViews = 0;
        let totalClicks = 0;
        analyticsSnap.forEach((docSnap) => {
          const d = docSnap.data();
          chart.push({
            date: d.timestamp?.toDate ? d.timestamp.toDate().toLocaleDateString() : '',
            views: d.views || 0,
            clicks: d.clicks || 0
          });
          totalViews += d.views || 0;
          totalClicks += d.clicks || 0;
        });
        stats.chart = chart.reverse();
        stats.ctr = totalViews ? ((totalClicks / totalViews) * 100).toFixed(2) : 0;
        setProfileStats(stats);

        // Fetch badges from subcollection (best-effort)
        try {
          const badgesSnap = await getDocs(collection(db, 'users', user.uid, 'badges'));
          const badgeList = badgesSnap.docs.map((d) => d.data());
          setBadges(badgeList);
        } catch {}

        // Fetch user defaults and notifications from backend APIs
        try {
          const token = await auth.currentUser.getIdToken(true);
          const meRes = await fetch(API_ENDPOINTS.USERS_ME, { headers: { Authorization: `Bearer ${token}` } });
          if (meRes.ok) {
            const meData = await meRes.json();
            const u = meData && meData.user ? meData.user : meData;
            const sched = u.schedulingDefaults || {};
            setUserDefaults({
              timezone: u.timezone || 'UTC',
              schedulingDefaults: sched,
              defaultPlatforms: sched.platforms || u.defaultPlatforms || [],
              defaultFrequency: sched.frequency || u.defaultFrequency || 'once'
            });
          }
          const notifRes = await fetch(API_ENDPOINTS.USERS_NOTIFICATIONS, { headers: { Authorization: `Bearer ${token}` } });
          if (notifRes.ok) {
            const { notifications } = await notifRes.json();
            setNotifications((notifications || []).map(n => n.message || ''));
          }
        } catch {}
      } catch (e) {
        setProfileStats({ views: 0, revenue: 0, ctr: 0, chart: [] });
        setBadges([]);
        setNotifications([]);
      } finally {
        setUserLoaded(true);
      }
    };
    fetchUserDashboardData();
  }, [user]);

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
  const handleContentUpload = async ({ file, platforms, title, description, type, schedule }) => {
    try {
      if (!file) return;
      // Upload file to Firebase Storage (modular API)
      const path = `uploads/${user.uid}/${file.name}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      // Build schedule_hint using defaults
      const schedule_hint = {
        ...schedule,
        frequency: schedule?.frequency || userDefaults.defaultFrequency || 'once',
        timezone: userDefaults.timezone || 'UTC'
      };
      const token = await auth.currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.CONTENT_UPLOAD, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          title: title || file.name,
          type: type || 'video',
          url,
          description: description || '',
          target_platforms: platforms && platforms.length ? platforms : (userDefaults.defaultPlatforms || ['youtube','tiktok','instagram']),
          schedule_hint
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Upload failed');
      }
      await fetchUserContent(token);
      alert('Content uploaded! We\'ll generate a landing page and smart link shortly.');
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
}

export default App;