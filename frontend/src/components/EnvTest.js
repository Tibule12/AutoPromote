import { useEffect } from "react";

const EnvTest = () => {
  // Run once on mount — environment diagnostics only
  /* mount-only effect (intentional) */

  useEffect(() => {
    // Avoid printing secrets in the console; only indicate presence
    const apiKeyPresent = !!process.env.REACT_APP_FIREBASE_API_KEY;
    const authDomainPresent = !!process.env.REACT_APP_FIREBASE_AUTH_DOMAIN;
    console.debug("Firebase API Key present:", apiKeyPresent);
    console.debug("Firebase Auth Domain present:", authDomainPresent);
  }, []);

  return null;
};

export default EnvTest;
