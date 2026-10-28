import { getAuth } from "firebase/auth";
import { API_BASE_URL } from "../config";
import { canUseLocalTestAuth } from "./localTestAuth";

export const isLocalTestAuthEndpoint = () =>
  typeof window !== "undefined" && canUseLocalTestAuth(API_BASE_URL, window.location);

export const isRuntimeE2EEnabled = () => {
  if (typeof window === "undefined" || window.__E2E_BYPASS !== true) return false;
  return isLocalTestAuthEndpoint();
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
  // is accepted only by the non-production API auth middleware. Both the page
  // and API must use loopback hosts before any synthetic token is returned.
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
