import { API_ENDPOINTS } from "../config";

export const isAdminUser = user => user?.role === "admin" || user?.isAdmin === true;

export const isAdminDashboardPath = (pathname = "/") =>
  ["/admin-dashboard", "/admin-login"].includes(pathname.replace(/\/$/, ""));

export const shouldShowAdminDashboard = (user, pathname) =>
  isAdminUser(user) && isAdminDashboardPath(pathname);

// The backend's reviewed UID policy is authoritative, including when the owner
// has no legacy Firebase admin claim. Display/profile fields cannot grant access.
export async function getVerifiedSessionUser(firebaseUser, token, request = fetch) {
  const base = {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    name: firebaseUser.displayName,
    role: "user",
    isAdmin: false,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await request(API_ENDPOINTS.VERIFY_TOKEN, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return base;
    const result = await response.json();
    if (result.valid !== true || result.user?.uid !== firebaseUser.uid) return base;
    const admin = result.user.role === "admin" && result.user.isAdmin === true;
    return {
      ...base,
      name: result.user.name || base.name,
      role: admin ? "admin" : "user",
      isAdmin: admin,
    };
  } catch {
    // Keep ordinary workspace restoration available; admin entry fails closed.
    return base;
  } finally {
    clearTimeout(timeout);
  }
}
