// Trigger CI/CD: minor change for deployment
/* eslint-disable no-console, no-unused-vars */
import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import DojoPage from "./DojoPage";
import "./App.css";
import { auth, db, storage } from "./firebaseClient";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut,
  signInWithCustomToken,
  getMultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { API_ENDPOINTS, API_BASE_URL, PUBLIC_SITE_URL } from "./config";
import { parseJsonSafe } from "./utils/parseJsonSafe";
import ChatWidget from "./ChatWidget";
import PayPalSubscriptionPanel from "./components/PayPalSubscriptionPanel";
import { Sentry } from "./sentryClient";
import TestSentryButton from "./components/TestSentryButton";
import Footer from "./components/Footer";

// Static Pages
import About from "./About";
import Blog from "./Blog";
import Careers from "./Careers";
import Contact from "./Contact";
import Cookies from "./Cookies";
import Docs from "./Docs";
import Pricing from "./Pricing";
import Support from "./Support";
import Accessibility from "./Accessibility";
import Features from "./Features";
import Integrations from "./Integrations";
import Metrics from "./Metrics";
import Changelog from "./Changelog";
import CommunityPage from "./CommunityPage";
import HelpCenter from "./HelpCenter";
import ApiDocs from "./ApiDocs";
import Partners from "./Partners";
import Security from "./Security";
import Terms from "./Terms";
import Privacy from "./Privacy";
import LiveLanding from "./LiveLanding";
import LiveWatch from "./LiveWatch";
import StreamerDashboard from "./StreamerDashboard";
import EngagementMarketplace from "./EngagementMarketplace";

import WelcomePage from "./WelcomePage";
import LoginForm from "./LoginForm";
import RegisterForm from "./RegisterForm";
import AdminDashboard from "./AdminDashboard";
import UserDashboard from "./UserDashboard_full";

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
    timezone: "UTC",
    defaultPlatforms: [],
    defaultFrequency: "once",
  });

  // MFA State
  const [mfaResolver, setMfaResolver] = useState(null);
  const [verificationId, setVerificationId] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaError, setMfaError] = useState("");
  // Feature flag: when true (default unless REACT_APP_DISABLE_IMMEDIATE_POSTS is 'false'),
  // disable direct client-side platform posts and rely on backend queued tasks.
  const DISABLE_IMMEDIATE_POSTS =
    process.env.REACT_APP_DISABLE_IMMEDIATE_POSTS === undefined ||
    process.env.REACT_APP_DISABLE_IMMEDIATE_POSTS !== "false";
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [termsRequired, setTermsRequired] = useState(false);
  const [requiredTermsVersion, setRequiredTermsVersion] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState(null); // { userData, token }
  const navigate = useNavigate();
  const [routePathState, setRoutePathState] = useState(
    typeof window !== "undefined"
      ? window.location.hash
        ? window.location.hash.replace(/^#/, "")
        : window.location.pathname
      : "/"
  );

  // E2E test auth bypass: when true, skip firebase auth and set test user
  const E2E_AUTH_BYPASS = process.env.REACT_APP_E2E_AUTH_BYPASS === "true";
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (!firebaseUser) {
        // If E2E bypass is active, do not clear localStorage or reset user
        if (typeof window !== "undefined" && window.__E2E_BYPASS === true) {
          return; // keep the E2E bypass user
        }
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
        setContent([]); // Clear content on logout
        try {
          if (Sentry && typeof Sentry.setUser === "function") Sentry.setUser(null);
        } catch (_) {}
        return;
      }
      try {
        const token = await firebaseUser.getIdToken(true);
        const idTokenResult = await firebaseUser.getIdTokenResult(true);
        const hasAdminClaim =
          idTokenResult.claims.admin === true || idTokenResult.claims.role === "admin";
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          // Keep tokens in memory via Firebase auth.currentUser.getIdToken()
          isAdmin: hasAdminClaim,
          role: hasAdminClaim ? "admin" : "user",
        };
        // Before allowing the app to enter the dashboard, ensure terms are accepted.
        const ok = await ensureTermsAccepted(token, userData, "authState");
        if (!ok) {
          // Block login UI transition until the user accepts. Keep user null for now.
          return;
        }
        // Proceed to set user and prefetch content once terms are satisfied.
        setUser({ ...userData, token }); // keep token in memory in React state only
        try {
          if (Sentry && typeof Sentry.setUser === "function")
            Sentry.setUser({ id: userData.uid, username: userData.email, email: userData.email });
        } catch (_) {}
        setIsAdmin(hasAdminClaim);
        const safeUserForStorage = { ...userData };
        localStorage.setItem("user", JSON.stringify(safeUserForStorage));
        // User signed in (UID suppressed in logs)
        await fetchUserContent(token);
      } catch (error) {
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
        setContent([]);
      }
    });
    if (window.location.pathname === "/admin-login") {
      setShowAdminLogin(true);
      setShowLogin(false);
      setShowRegister(false);
    }
    return () => {
      try {
        if (unsubscribe && typeof unsubscribe === "function") unsubscribe();
      } catch (_) {}
    };
  }, []);

  // If E2E bypass is enabled, set a pre-authorized test user and fetch content
  // Run when E2E_AUTH_BYPASS toggles; fetchUserContent intentionally omitted from deps
  // eslint-disable-next-line
  useEffect(() => {
    if (!E2E_AUTH_BYPASS) return;
    const setTestUser = async () => {
      try {
        const testToken = "e2e-test-token";
        const testUser = {
          uid: "e2e-user",
          email: "e2e@local",
          name: "E2E User",
          role: "user",
          token: testToken,
        };
        setUser(testUser);
        await fetchUserContent(testToken);
      } catch (_) {}
    };
    setTestUser();
  }, [E2E_AUTH_BYPASS]);

  // Runtime E2E bypass via window.__E2E_BYPASS = true set by tests.
  // Run on mount for E2E bypass checks; fetchUserContent intentionally omitted from deps
  // eslint-disable-next-line
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && window.__E2E_BYPASS === true) {
        (async () => {
          try {
            const testToken = window.__E2E_TEST_TOKEN || "e2e-test-token";
            // Prefer an existing user object in localStorage (tests may set an admin user there).
            let testUser = null;
            try {
              const raw = localStorage.getItem("user");
              if (raw) {
                testUser = JSON.parse(raw);
                testUser.token = testToken;
              }
            } catch (_) {
              /* ignore parse errors */
            }
            if (!testUser) {
              testUser = {
                uid: "e2e-user",
                email: "e2e@local",
                name: "E2E User",
                role: "user",
                token: testToken,
              };
            }
            setUser(testUser);
            if (testUser.role === "admin" || testUser.isAdmin === true) setIsAdmin(true);
            await fetchUserContent(testToken);
          } catch (_) {}
        })();
      }
    } catch (_) {}
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
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        mode: "cors",
      });
      if (!res.ok) {
        // Try to read response body for error details
        let body = null;
        try {
          const parsed = await parseJsonSafe(res);
          body = parsed.json || null;
        } catch (_) {
          body = null;
        }
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchUserContent(freshToken);
        }
        if (res.status === 403 && body && body.error === "terms_not_accepted") {
          // Show a full-screen modal rather than an in-dashboard banner
          setTermsRequired(true);
          setRequiredTermsVersion(body.requiredVersion || null);
          setShowTermsModal(true);
          return;
        }
        if (res.status === 403) {
          // Quietly suppress generic 403s during background fetch to avoid console noise
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
        else if (user && user.token) token = user.token;
        else return;
      }
      const res = await fetch(API_ENDPOINTS.MY_SCHEDULES, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
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
    const isAdminUser = user.role === "admin" || user.isAdmin === true;
    if (!isAdminUser) {
      return;
    }
    try {
      const res = await fetch(API_ENDPOINTS.ADMIN_ANALYTICS, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      const parsed = await parseJsonSafe(res);
      if (!parsed.ok) {
        const body = parsed.json || null;
        if (res.status === 401 && auth.currentUser) {
          const freshToken = await auth.currentUser.getIdToken(true);
          return fetchAnalytics(freshToken);
        }
        if (res.status === 403 && body && body.error === "terms_not_accepted") {
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

  const processLoginSuccess = async userCredential => {
    const { user: firebaseUser } = userCredential;
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch(API_ENDPOINTS.LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (res.ok) {
      const parsed = await parseJsonSafe(res);
      const data = parsed.json || null;
      if (data.customToken) {
        const customUserCredential = await signInWithCustomToken(auth, data.customToken);
        const customIdToken = await customUserCredential.user.getIdToken();
        try {
          if (localStorage.getItem("tosAgreed") === "true") {
            const url = `${API_BASE_URL}/api/users/me/accept-terms`;
            await fetch(url, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${customIdToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({}),
            }).catch(() => {});
            localStorage.removeItem("tosAgreed");
          }
        } catch (_) {}
        const userData = { ...data.user, token: customIdToken };
        const ok = await ensureTermsAccepted(customIdToken, userData, "login");
        if (ok) handleLogin(userData);
      } else {
        try {
          if (localStorage.getItem("tosAgreed") === "true") {
            const url = `${API_BASE_URL}/api/users/me/accept-terms`;
            await fetch(url, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({}),
            }).catch(() => {});
            localStorage.removeItem("tosAgreed");
          }
        } catch (_) {}
        const userData = { ...data.user, token: idToken };
        const ok = await ensureTermsAccepted(idToken, userData, "login");
        if (ok) handleLogin(userData);
      }
    } else {
      const parsedErr = await parseJsonSafe(res);
      const errorBody = parsedErr.json || null;
      throw new Error(errorBody?.message || "Login failed");
    }
  };

  const sendMfaCode = async () => {
    if (!mfaResolver) return;
    setMfaError("");
    const hints = mfaResolver.hints;
    const phoneInfoOptions = {
      multiFactorHint: hints[0],
      session: mfaResolver.session,
    };
    const phoneAuthProvider = new PhoneAuthProvider(auth);
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "mfa-recaptcha-container", {
        size: "invisible",
      });
    }
    try {
      const vId = await phoneAuthProvider.verifyPhoneNumber(
        phoneInfoOptions,
        window.recaptchaVerifier
      );
      setVerificationId(vId);
    } catch (e) {
      setMfaError(e.message);
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    }
  };

  const cancelMfa = () => {
    setShowMfaModal(false);
    setMfaResolver(null);
    setVerificationId(null);
    setMfaCode("");
    setMfaError("");
    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (e) {
        // ignore
      }
      window.recaptchaVerifier = null;
    }
  };

  const verifyMfaCode = async () => {
    setMfaError("");
    try {
      const cred = PhoneAuthProvider.credential(verificationId, mfaCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(cred);
      const userCredential = await mfaResolver.resolveSignIn(multiFactorAssertion);
      await processLoginSuccess(userCredential);
      setShowMfaModal(false);
      setMfaResolver(null);
      setVerificationId(null);
      setMfaCode("");
    } catch (e) {
      setMfaError(e.message);
    }
  };

  const loginUser = async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await processLoginSuccess(userCredential);
    } catch (error) {
      if (error.code === "auth/multi-factor-auth-required") {
        const resolver = getMultiFactorResolver(auth, error);
        setMfaResolver(resolver);
        setShowMfaModal(true);
        return;
      }
      alert(error.message || "Login failed");
    }
  };

  // Ensure terms are accepted; if not, show modal and defer login
  const ensureTermsAccepted = async (token, userData, source) => {
    try {
      const res = await fetch(API_ENDPOINTS.MY_CONTENT, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) return true; // already accepted
      let body = null;
      try {
        const parsed = await parseJsonSafe(res);
        body = parsed.json || null;
      } catch (_) {}
      if (res.status === 403 && body && body.error === "terms_not_accepted") {
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

      // Backend handles email verification

      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(API_ENDPOINTS.REGISTER, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ name, email, uid: firebaseUser.uid, idToken }),
      });

      // Sign out immediately so they have to login after verification
      await signOut(auth);

      if (res.ok) {
        // Success - RegisterForm will show message and switch to login
        return;
      } else {
        throw new Error("Registration failed on server.");
      }
    } catch (error) {
      await signOut(auth); // Ensure signed out on error
      alert("Registration failed: " + (error.message || "Unknown error"));
      throw error;
    }
  };

  const handleLogin = async userData => {
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
      const forceAdmin = userData.role === "admin" || userData.isAdmin === true;
      // Always preserve admin status, never downgrade
      const updatedUserData = {
        ...userData,
        role: forceAdmin ? "admin" : userData.role,
        isAdmin: forceAdmin,
      };
      // Persist only non-sensitive metadata. Remove token before storing.
      const { token: _token, ...safeUpdated } = updatedUserData;
      localStorage.setItem("user", JSON.stringify(safeUpdated));
      setUser(prev => {
        if (prev && (prev.role === "admin" || prev.isAdmin === true)) {
          return { ...prev, ...updatedUserData, role: "admin", isAdmin: true };
        }
        return updatedUserData;
      });
      setIsAdmin(forceAdmin);
      setShowLogin(false);
      // ...existing code... (Firestore update logic removed)
      if (forceAdmin) {
        await fetchAnalytics();
        navigate("/admin-dashboard");
      } else {
        await fetchUserContent();
        navigate("/");
      }
    } catch (error) {
      handleLogout();
    }
  };

  const handleRegister = userData => {
    setUser(userData);
    setShowRegister(false);
  };

  // Save user defaults (timezone, default platforms, frequency, paypalEmail)
  const saveUserDefaults = async ({
    timezone,
    defaultPlatforms,
    defaultFrequency,
    paypalEmail,
  }) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");
      const token = await currentUser.getIdToken(true);
      const res = await fetch(API_ENDPOINTS.USERS_ME, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ timezone, defaultPlatforms, defaultFrequency, paypalEmail }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to save defaults");
      }
      const data = await res.json();
      const u = data && data.user ? data.user : {};
      const sched = u.schedulingDefaults || {};
      setUserDefaults({
        timezone: u.timezone || timezone || "UTC",
        schedulingDefaults: sched,
        defaultPlatforms: sched.platforms || defaultPlatforms || [],
        defaultFrequency: sched.frequency || defaultFrequency || "once",
      });
      return true;
    } catch (e) {
      alert(e.message || "Could not save settings");
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
    } catch (error) {
      console.error("Logout error:", error);
    }
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
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert("Failed to accept terms: " + (body.error || res.status));
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
      alert("Could not accept terms. Please try again.");
    }
  };

  // Redirect after logout
  React.useEffect(() => {
    if (justLoggedOut && !user) {
      navigate("/");
      setJustLoggedOut(false);
    }
  }, [justLoggedOut, user, navigate]);

  // Content upload handler (with file and platforms)
  const handleContentUpload = async params => {
    console.log("[E2E] handleContentUpload called with params:", {
      isDryRun: params.isDryRun,
      platforms: params.platforms || params.target_platforms,
    });
    try {
      // Destructure all possible fields from params
      const {
        file,
        platforms,
        title,
        description,
        type,
        schedule,
        isDryRun,
        trimStart,
        trimEnd,
        template,
        rotate,
        flipH,
        flipV,
      } = params;
      // Use Firebase auth token when available; fall back to app user token or runtime E2E test token
      let token = null;
      try {
        const current = auth && auth.currentUser;
        if (current) token = await current.getIdToken(true);
      } catch (_) {
        token = null;
      }
      if (!token && user && user.token) token = user.token;
      if (
        !token &&
        typeof window !== "undefined" &&
        window.__E2E_BYPASS === true &&
        window.__E2E_TEST_TOKEN
      )
        token = window.__E2E_TEST_TOKEN;
      if (!token) {
        throw new Error("Authentication token missing for content upload request");
      }
      let finalUrl = "";
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
        if ((type === "video" || type === "image" || type === "audio") && file) {
          if (file.size < 100) {
            throw new Error("File too small. Please check the file.");
          }
          const filePath = `uploads/${type}s/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, filePath);
          const uploadResult = await uploadBytes(storageRef, file);

          if (uploadResult.metadata.size < 100) {
            throw new Error(
              `Upload failed: File corrupted (size: ${uploadResult.metadata.size} bytes).`
            );
          }

          finalUrl = await getDownloadURL(storageRef);
        }
      }
      const schedule_hint = {
        ...schedule,
        frequency: schedule?.frequency || userDefaults.defaultFrequency || "once",
        timezone: userDefaults.timezone || "UTC",
      };
      // Defensive: ensure non-empty URL for real uploads (avoid sending empty "url" to server)
      if (!isDryRun && (!finalUrl || String(finalUrl).trim() === "")) {
        alert("Upload failed: missing file URL. Please retry the upload.");
        return { ok: false, error: "missing_url" };
      }
      // Extract monetization settings from platform options for Revenue Engine
      const pOps = params.platformOptions || params.platform_options || {};
      const tiktokOps = pOps.tiktok || {};
      const youtubeOps = pOps.youtube || {};
      const instaOps = pOps.instagram || {};

      const monetization_settings = {
        niche: tiktokOps.niche || "general",
        is_sponsored: !!(
          tiktokOps.commercialContent ||
          youtubeOps.paidPromotion ||
          instaOps.isPaidPartnership
        ),
        brand_name: tiktokOps.brandName || instaOps.sponsorUser || "",
        product_link: tiktokOps.product_link || "",
        commercial_rights: !!tiktokOps.commercialContent,
      };

      const payload = {
        isDryRun: !!isDryRun,
        title: title || (file ? file.name : ""),
        type: type || "video",
        url: finalUrl,
        description: description || "",
        monetization_settings,
        // Pass through Viral/Bounty/Quality fields from ContentUploadForm
        bounty: params.bounty,
        viral_boost: params.viral_boost,
        quality_enhanced: params.quality_enhanced,
        enhance_quality: params.quality_enhanced, // alias for backend
        custom_hashtags: params.custom_hashtags,
        growth_guarantee: params.growth_guarantee,

        target_platforms:
          platforms && platforms.length
            ? platforms
            : userDefaults.defaultPlatforms || ["youtube", "tiktok", "instagram"],
        platform_options: pOps,
        schedule_hint,
        meta: {
          ...(params.meta || {}),
          ...(typeof trimStart !== "undefined" ? { trimStart } : {}),
          ...(typeof trimEnd !== "undefined" ? { trimEnd } : {}),
          ...(typeof rotate !== "undefined" ? { rotate } : {}),
          ...(typeof flipH !== "undefined" ? { flipH } : {}),
          ...(typeof flipV !== "undefined" ? { flipV } : {}),
          ...(template ? { template } : {}),
        },
      };
      console.log(
        "[E2E] handleContentUpload: calling API",
        API_ENDPOINTS.CONTENT_UPLOAD,
        "payload:",
        payload,
        "token?",
        Boolean(token)
      );
      const res = await fetch(API_ENDPOINTS.CONTENT_UPLOAD, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      // Read response body safely so we can show any server-side validation error
      let result = null;
      try {
        result = await res.json();
      } catch (e) {
        // If response is not JSON, try to read as text
        try {
          const txt = await res.text();
          result = { text: txt };
        } catch (_) {
          result = null;
        }
      }
      if (!res.ok) {
        const serverErr =
          (result && (result.error || result.message || result.text)) || `HTTP ${res.status}`;
        throw new Error(serverErr || "Upload/preview failed");
      }
      if (isDryRun) {
        return result;
      }

      // If server marked the content as pending approval, do not attempt any immediate posts.
      if (result && result.content && result.content.status === "pending_approval") {
        await fetchUserContent(token);
        alert(
          "Content uploaded and queued for promotion. It will be published to selected platforms after approval."
        );
        return result;
      }
      try {
        const chosen = Array.isArray(platforms) ? platforms : [];
        // Require explicit user request to perform immediate platform posts.
        const shouldImmediatePost = params?.immediate_post === true && !DISABLE_IMMEDIATE_POSTS;
        const postYouTube = async () => {
          if (!shouldImmediatePost) {
            console.log("[Upload] Immediate YouTube post not requested or disabled");
            return;
          }
          if (!chosen.includes("youtube")) return;
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
            console.log(
              "YouTube upload: contentId",
              contentId,
              "fileUrl",
              payload.url,
              "result",
              result
            );
            const fileUrl = payload.url;
            if (!contentId || !fileUrl) {
              console.warn("Missing contentId or fileUrl for YouTube upload");
              return;
            }
            const r = await fetch(API_ENDPOINTS.YOUTUBE_UPLOAD, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                contentId,
                videoUrl: payload.url,
                title: title || (file ? file.name : ""),
                description: description || "",
                shortsMode: payload.platform_options?.youtube?.shortsMode,
              }),
            });
            if (!r.ok) console.warn("YouTube upload failed");
          } catch (_) {}
        };
        const getFacebookStatus = async () => {
          const s = await fetch(API_ENDPOINTS.FACEBOOK_STATUS, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          });
          if (!s.ok) return null;
          return s.json();
        };
        const postFacebook = async () => {
          if (!chosen.includes("facebook")) return;
          try {
            const st = await getFacebookStatus();
            const pageId = st?.pages?.[0]?.id;
            if (!pageId) return;
            const body = {
              pageId,
              content: {
                type: type || "video",
                url: payload.url,
                title: title || (file ? file.name : ""),
                description: description || "",
              },
            };
            const r = await fetch(API_ENDPOINTS.FACEBOOK_UPLOAD, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(body),
            });
            if (!r.ok) console.warn("Facebook upload failed");
          } catch (_) {}
        };
        const postInstagram = async () => {
          if (!chosen.includes("instagram")) return;
          try {
            const st = await getFacebookStatus();
            const pageId = st?.pages?.[0]?.id;
            if (!pageId) return;
            const mediaType = (type || "video").toLowerCase();
            const r = await fetch(API_ENDPOINTS.INSTAGRAM_UPLOAD, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                pageId,
                mediaUrl: payload.url,
                caption: `${title || ""}\n${description || ""}`.trim(),
                mediaType,
              }),
            });
            if (!r.ok) console.warn("Instagram upload failed");
          } catch (_) {}
        };
        // Only run immediate posts when explicitly requested by the user (params.immediate_post)
        if (params?.immediate_post === true && !DISABLE_IMMEDIATE_POSTS) {
          await postYouTube();
          await postFacebook();
          await postInstagram();
        } else {
          console.log(
            "[Upload] Immediate platform posts not requested or disabled; posts will be processed by backend queued tasks"
          );
        }
      } catch (e) {
        console.warn("Auto-post skipped or partial:", e?.message);
      }
      await fetchUserContent(token);
      alert(
        "Content uploaded and queued for promotion. It will be published to selected platforms after approval."
      );
      return result;
    } catch (error) {
      console.error("handleContentUpload error:", error);
      alert("Error uploading content: " + error.message);
      throw error;
    }
  };

  // If the URL includes a direct pricing route, render pricing panel
  useEffect(() => {
    const onHashChange = () =>
      setRoutePathState(
        window.location.hash ? window.location.hash.replace(/^#/, "") : window.location.pathname
      );
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
    };
  }, []);

  // No manual hash/routing logic needed with react-router-dom
  // Existing logic for routes replaced by <Routes> block below

  return (
    <div className="App">
      <Routes>
        {/* Static Content Pages */}
        <Route path="/about" element={<About />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/cookies" element={<Cookies />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/support" element={<Support />} />
        <Route path="/accessibility" element={<Accessibility />} />

        {/* GAMIFICATION / DOJO */}
        <Route path="/dojo/trend-analyzer" element={<DojoPage />} />

        <Route path="/features" element={<Features />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/changelog" element={<Changelog />} />
        <Route path="/community" element={<CommunityPage />} />
        <Route path="/help" element={<HelpCenter />} />
        <Route path="/api-docs" element={<ApiDocs />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/security" element={<Security />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Live Streaming Pages */}
        <Route path="/live" element={<LiveLanding />} />
        <Route path="/live/watch" element={<LiveWatch />} />
        <Route path="/streamer" element={<StreamerDashboard />} />
        <Route path="/marketplace" element={<EngagementMarketplace />} />

        {/* Main Application Logic (Welcome / Auth / Dashboard) */}
        <Route
          path="*"
          element={
            <>
              {/* Terms Modal */}
              {showTermsModal && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100vw",
                    height: "100vh",
                    background: "rgba(0,0,0,0.5)",
                    zIndex: 10000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 16,
                      boxShadow: "0 12px 36px rgba(0,0,0,0.2)",
                      padding: "24px 22px",
                      maxWidth: 560,
                      width: "90%",
                    }}
                  >
                    <h3 style={{ marginTop: 0, marginBottom: 8 }}>Accept Terms of Service</h3>
                    <p style={{ marginTop: 0, color: "#444" }}>
                      Please accept the latest Terms of Service
                      {requiredTermsVersion ? ` (${requiredTermsVersion})` : ""} to continue.
                    </p>
                    <div style={{ display: "flex", gap: 12, marginTop: 16, alignItems: "center" }}>
                      <button
                        onClick={acceptTerms}
                        style={{
                          background: "#111827",
                          color: "#fff",
                          border: "none",
                          padding: "10px 16px",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        Accept and Continue
                      </button>
                      <a href={`${PUBLIC_SITE_URL}/terms`} target="_blank" rel="noreferrer">
                        View Terms
                      </a>
                    </div>
                  </div>
                </div>
              )}
              {/* If no user, show welcome/login page */}
              {!user ? (
                <>
                  {!showLogin && !showRegister && (
                    <WelcomePage
                      onGetStarted={() => setShowRegister(true)}
                      onSignIn={() => setShowLogin(true)}
                    />
                  )}
                  {/* Show login modal if requested */}
                  {showLogin && (
                    <div
                      className="modal-overlay"
                      style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        zIndex: 9999,
                        overflowY: "auto",
                      }}
                    >
                      <div
                        style={{
                          minHeight: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "flex-start",
                          padding: "3rem 1.25rem",
                        }}
                      >
                        <LoginForm onLogin={loginUser} onClose={() => setShowLogin(false)} />
                      </div>
                    </div>
                  )}
                  {/* Show register modal if requested */}
                  {showRegister && (
                    <div
                      className="modal-overlay"
                      style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100vw",
                        height: "100vh",
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        zIndex: 9999,
                        overflowY: "auto",
                      }}
                    >
                      <div
                        style={{
                          minHeight: "100%",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "flex-start",
                          padding: "3rem 1.25rem",
                        }}
                      >
                        <RegisterForm
                          onRegister={registerUser}
                          onClose={() => setShowRegister(false)}
                          onLogin={() => {
                            setShowRegister(false);
                            setShowLogin(true);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : user && (user.role === "admin" || user.isAdmin === true) ? (
                // Render admin dashboard for admin users
                <AdminDashboard analytics={analytics} user={user} onLogout={handleLogout} />
              ) : (
                // Render full user dashboard for normal users
                <UserDashboard
                  user={user}
                  content={content}
                  userDefaults={userDefaults}
                  onSaveDefaults={saveUserDefaults}
                  onLogout={handleLogout}
                  onUpload={handleContentUpload}
                  mySchedules={mySchedules}
                  onSchedulesChanged={refreshSchedules}
                />
              )}
              {/* MFA Modal */}
              {showMfaModal && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    backgroundColor: "rgba(0,0,0,0.5)",
                    zIndex: 10000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      background: "white",
                      padding: "20px",
                      borderRadius: "8px",
                      maxWidth: "400px",
                      width: "90%",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
                    }}
                  >
                    <h3 style={{ marginTop: 0 }}>Two-Factor Authentication</h3>
                    <p>Please verify your identity to continue.</p>
                    {mfaError && (
                      <div style={{ color: "red", marginBottom: "10px" }}>{mfaError}</div>
                    )}

                    {!verificationId ? (
                      <div>
                        <p>
                          A verification code will be sent to your phone
                          {mfaResolver?.hints?.[0]?.phoneNumber
                            ? ` ending in ${mfaResolver.hints[0].phoneNumber.slice(-4)}`
                            : ""}
                          .
                        </p>
                        <div id="mfa-recaptcha-container"></div>
                        <div
                          style={{
                            marginTop: "20px",
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <button
                            onClick={cancelMfa}
                            style={{ padding: "8px 16px", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={sendMfaCode}
                            style={{
                              padding: "8px 16px",
                              background: "#007bff",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            Send Code
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p>Enter the 6-digit code sent to your phone.</p>
                        <input
                          type="text"
                          value={mfaCode}
                          onChange={e => setMfaCode(e.target.value)}
                          placeholder="123456"
                          style={{
                            width: "100%",
                            padding: "8px",
                            margin: "10px 0",
                            boxSizing: "border-box",
                            fontSize: "16px",
                          }}
                        />
                        <div
                          style={{
                            marginTop: "20px",
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <button
                            onClick={cancelMfa}
                            style={{ padding: "8px 16px", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={verifyMfaCode}
                            style={{
                              padding: "8px 16px",
                              background: "#007bff",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            Verify & Sign In
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          }
        />
      </Routes>

      {/* AI Chat Widget - only show when user is logged in */}
      {user && <ChatWidget />}
      {/* Optional: show Sentry test UI in non-prod or when explicitly enabled */}
      {(process.env.REACT_APP_SHOW_SENTRY_TEST_BUTTON === "1" ||
        process.env.NODE_ENV !== "production") && (
        <div style={{ position: "fixed", bottom: 10, right: 10, zIndex: 9999 }}>
          <TestSentryButton />
        </div>
      )}
      {/* Global Footer */}
      <Footer />
    </div>
  );
}

export default App;
