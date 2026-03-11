import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth } from "../firebaseClient";
import { onAuthStateChanged } from "firebase/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const hasAdmin =
            idTokenResult.claims.admin === true || idTokenResult.claims.role === "admin";
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            isAdmin: hasAdmin,
            role: hasAdmin ? "admin" : "user",
            token,
          });
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
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

  const value = { user, setUser, loading, getToken };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export default AuthContext;
