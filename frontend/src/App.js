// Trigger CI/CD: minor change for deployment
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './App.css';
import { auth, db } from './firebaseClient';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
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
import UserDashboard from './UserDashboard';

function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [content, setContent] = useState([]);
  const [showLogin, setShowLogin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [profileStats, setProfileStats] = useState({ views: 0, revenue: 0, ctr: 0, chart: [] });
  const [badges, setBadges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  // Fetch user profile, stats, badges, notifications from Firestore
  useEffect(() => {
    const fetchUserDashboardData = async () => {
      if (!user || !user.uid) return;
      try {
        // Profile stats
        const userDoc = await db.collection('users').doc(user.uid).get();
        let stats = { views: 0, revenue: 0, ctr: 0, chart: [] };
        if (userDoc.exists) {
          const data = userDoc.data();
          stats.views = data.views || 0;
          stats.revenue = data.revenue || 0;
        }
        // Fetch analytics for chart and CTR
        const analyticsSnap = await db.collection('analytics')
          .where('userId', '==', user.uid)
          .orderBy('timestamp', 'desc')
          .limit(30)
          .get();
        let chart = [];
        let totalViews = 0;
        let totalClicks = 0;
        analyticsSnap.forEach(doc => {
          const d = doc.data();
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

        // Fetch badges from subcollection
        const badgesSnap = await db.collection('users').doc(user.uid).collection('badges').get();
        const badgeList = badgesSnap.docs.map(doc => doc.data());
        setBadges(badgeList);

        // Fetch notifications from subcollection
        const notifSnap = await db.collection('users').doc(user.uid).collection('notifications').orderBy('timestamp', 'desc').limit(10).get();
        const notifList = notifSnap.docs.map(doc => doc.data().message || '');
        setNotifications(notifList);
      } catch (e) {
        setProfileStats({ views: 0, revenue: 0, ctr: 0, chart: [] });
        setBadges([]);
        setNotifications([]);
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
    } catch (error) {}
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
          // Sign in with custom token
          const customUserCredential = await auth.signInWithCustomToken(data.customToken);
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

  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const handleLogout = async () => {
    try {
      console.log('handleLogout called');
      await auth.signOut();
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
  const handleContentUpload = async ({ file, platforms }) => {
    try {
      if (!file) return;
      // Upload file to Firebase Storage
      const storageRef = db.app.storage().ref();
      const userFolder = storageRef.child(`uploads/${user.uid}`);
      const fileRef = userFolder.child(file.name);
      await fileRef.put(file);
      const url = await fileRef.getDownloadURL();
      // Save content to Firestore
      await db.collection('content').add({
        userId: user.uid,
        url,
        platforms,
        createdAt: new Date(),
        status: 'pending',
      });
      fetchUserContent();
      alert('Content uploaded and promoted successfully!');
    } catch (error) {
      alert('Error uploading content: ' + error.message);
    }
  };
  return (
    <div className="App">
      <h2 style={{color: 'red', textAlign: 'center'}}>Test Render: If you see this, React is working!</h2>
      <EnvTest />
      <EnvChecker />
      <DatabaseSync />

      <Routes>
        <Route path="/admin-dashboard" element={<AdminDashboard analytics={analytics} user={user} />} />
        <Route path="/integration-test" element={<IntegrationTester />} />
        <Route path="/" element={
          <>
            {showLogin && <LoginForm onLogin={handleLogin} loginUser={loginUser} />}
            {showAdminLogin && <AdminLoginForm onLogin={handleLogin} />}
            {showRegister && <RegisterForm registerUser={registerUser} />}
            {user && !(isAdmin || user.role === 'admin' || user.isAdmin === true) && (
              <UserDashboard
                user={user}
                content={content}
                stats={profileStats}
                badges={badges}
                notifications={notifications}
                onUpload={handleContentUpload}
                onPromoteToggle={() => {}}
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