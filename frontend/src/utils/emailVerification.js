import { reload, sendEmailVerification } from "firebase/auth";
import { API_ENDPOINTS, PUBLIC_SITE_URL } from "../config";

export function verificationError(error) {
  const limited = ["auth/too-many-requests", "too_many_requests"].includes(error?.code);
  return Object.assign(
    new Error(
      limited
        ? "Verification email is temporarily limited. Please wait, then try again. Check Inbox and Spam for an earlier email."
        : "We could not send the verification email yet. Please try again shortly."
    ),
    {
      code: limited ? "auth/too-many-requests" : "verification_delivery_unavailable",
      retryAfterSeconds: Math.max(
        30,
        Math.min(3600, Number(error?.retryAfterSeconds) || (limited ? 120 : 30))
      ),
    }
  );
}

export async function sendFirebaseVerification(user) {
  const url = new URL(PUBLIC_SITE_URL || window.location.origin);
  if (url.hostname === "www.autopromote.org") url.hostname = "autopromote.org";
  url.pathname = "/";
  url.search = "";
  url.hash = "/";
  try {
    try {
      await sendEmailVerification(user, { url: url.href });
    } catch (error) {
      if (error.code !== "auth/unauthorized-continue-uri") throw error;
      await sendEmailVerification(user);
    }
    return { sent: true, provider: "firebase" };
  } catch (error) {
    throw verificationError(error);
  }
}

export async function resendAccountVerification(email, currentUser) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) throw new Error("Enter the email address used to create the account.");
  let response;
  try {
    response = await fetch(API_ENDPOINTS.RESEND_VERIFICATION, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: normalized }),
    });
  } catch (_) {
    /* An authenticated owner can use Firebase if our service is unavailable. */
  }
  const body = response ? await response.json().catch(() => ({})) : {};
  if (response?.ok)
    return { sent: body.message !== "Already verified", provider: body.provider || "email" };
  if (response?.status === 429) {
    throw verificationError({
      code: "too_many_requests",
      retryAfterSeconds:
        Number(response.headers.get("Retry-After")) ||
        body.retryAfterSeconds ||
        Number(body.retryAfterMinutes) * 60,
    });
  }
  const ownsSession =
    currentUser &&
    !currentUser.emailVerified &&
    String(currentUser.email || "")
      .trim()
      .toLowerCase() === normalized;
  if (ownsSession && (!response || response.status >= 500)) {
    return sendFirebaseVerification(currentUser);
  }
  throw verificationError();
}

// No email is sent here. Only Firebase's reloaded account and a freshly issued
// token may trigger session restoration; local flags and UI clicks cannot.
export function watchEmailVerification(auth, onVerified) {
  const uid = auth.currentUser?.uid;
  let stopped = false;
  let checking = false;
  const check = async () => {
    if (stopped || checking || document.visibilityState === "hidden") return;
    const user = auth.currentUser;
    if (!uid || user?.uid !== uid) return;
    checking = true;
    try {
      await reload(user);
      if (stopped || auth.currentUser?.uid !== uid || !user.emailVerified) return;
      await user.getIdToken(true);
      if (stopped || auth.currentUser?.uid !== uid) return;
      await onVerified(user);
    } catch (_) {
      /* Keep the verification gate closed; retry on return or the next interval. */
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(check, 15000);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  check();
  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
  };
}
