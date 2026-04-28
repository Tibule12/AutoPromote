import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { API_BASE_URL } from "../config"; // Adjust path as needed

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const hasAdmin =
            idTokenResult.claims.admin === true || idTokenResult.claims.role === "admin";

          const baseUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            isAdmin: hasAdmin,
            role: hasAdmin ? "admin" : "user",
            token,
          };

          // Fetch profile (plan, credits)
          try {
            const profileResponse = await fetch(`${API_BASE_URL}/api/users/profile`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (profileResponse.ok) {
              const contentType = profileResponse.headers.get("content-type") || "";
              if (contentType.includes("application/json")) {
                const profileData = await profileResponse.json();
                if (profileData.success) {
                  setUser({ ...baseUser, ...profileData });
                  setProfile(profileData);
                } else {
                  setUser(baseUser);
                  setProfile(null);
                }
              } else {
                // Backend returned HTML (likely index/fallback); avoid JSON parse crash
                setUser(baseUser);
                setProfile(null);
              }
            } else {
              setUser(baseUser);
              setProfile(null);
            }
          } catch (profileError) {
            console.warn("Profile fetch failed:", profileError);
            setUser(baseUser);
            setProfile(null);
          }
        } catch {
          setUser(null);
          setProfile(null);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getToken = useCallback(async (forceRefresh = false) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    const token = await currentUser.getIdToken(forceRefresh);
    setUser(prev => (prev ? { ...prev, token } : prev));
    return token;
  }, []);

  const refreshProfile = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    const token = await currentUser.getIdToken(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await response.json();
          if (data.success) {
            setProfile(data);
            setUser(prev => prev ? { ...prev, ...data } : null);
          }
        }
      }
    } catch (error) {
      console.warn("Profile refresh failed:", error);
    }
  }, []);

  const value = { 
    user, 
    profile, 
    setUser, 
    loading, 
    getToken, 
    refreshProfile 
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export default AuthContext;
