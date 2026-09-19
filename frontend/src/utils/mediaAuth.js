import { getAuth } from "firebase/auth";

export const isRuntimeE2EEnabled = () => {
  if (typeof window === "undefined" || window.__E2E_BYPASS !== true) return false;
  const hostname = String(window.location?.hostname || "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
};

export const getRuntimeE2EToken = () => {
  if (
    isRuntimeE2EEnabled() &&
    typeof window.__E2E_TEST_TOKEN === "string" &&
    window.__E2E_TEST_TOKEN.trim()
  ) {
    return window.__E2E_TEST_TOKEN.trim();
  }
  return null;
};

export const getMediaAuthToken = async (forceRefresh = false) => {
  // A runtime browser-test session must remain deterministic even if Firebase
  // restores an unrelated cached user in the persistent QA profile. This token
  // is accepted only by the non-production API auth middleware and only on a
  // local hostname, so it cannot replace a real user's token in production.
  const runtimeToken = getRuntimeE2EToken();
  if (runtimeToken) return runtimeToken;
  try {
    const user = getAuth()?.currentUser;
    if (user?.getIdToken) return await user.getIdToken(forceRefresh);
  } catch (_error) {
    // The explicit browser-test token below is the only supported fallback.
  }
  return null;
};
