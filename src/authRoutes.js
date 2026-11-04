const express = require("express");
const crypto = require("crypto");
const admin = require("firebase-admin");
const router = express.Router();
const { sendVerificationEmail, sendPasswordResetEmail } = require("./services/emailService");
const { strictLimiter } = require("./middleware/rateLimiter");
const rateLimitBasic = require("./middlewares/rateLimitBasic");
const authMiddleware = require("./authMiddleware");
const { hasAdminClaim, authorityFromVerifiedIdentity } = require("./utils/authAuthority");
const { generateVerificationLink, requireVerifiedEmail } = require("./utils/emailVerification");

const PASSWORD_RESET_WINDOW_MINUTES = 15;
const SAFE_PASSWORD_RESET_RESPONSE = "If an account exists, a password reset email has been sent.";
const usersCollection = () => admin.firestore().collection("users");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function buildResetTokenHash(rawToken) {
  return crypto
    .createHash("sha256")
    .update(String(rawToken || ""))
    .digest("hex");
}

function buildPasswordResetLink(rawToken) {
  const baseUrl = String(process.env.FRONTEND_URL || "https://autopromote.org").replace(/\/$/, "");
  return `${baseUrl}/#/reset-password?token=${encodeURIComponent(rawToken)}`;
}

function isValidPasswordResetExpiry(value) {
  if (!value) return false;
  if (typeof value.toMillis === "function") {
    return value.toMillis() > Date.now();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) && parsed > Date.now();
}

const passwordResetRequestLimiter = [
  strictLimiter,
  rateLimitBasic({
    windowMs: 15 * 60 * 1000,
    max: 5,
    key: req => `${req.ip}:${normalizeEmail(req.body && req.body.email) || "unknown"}`,
  }),
];

const passwordResetSubmitLimiter = [
  strictLimiter,
  rateLimitBasic({
    windowMs: 15 * 60 * 1000,
    max: 10,
    key: req => `${req.ip}:reset-password`,
  }),
];

// Middleware to verify Firebase token
const _verifyFirebaseToken = async (req, res, next) => {
  try {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ error: "Invalid token" });
  }
};

// Register endpoint
router.post("/register", async (req, res) => {
  let userRecord = null;
  try {
    const { name, email, password, idToken } = req.body;

    // If the frontend already created a Firebase Auth user (via client-side SDK),
    // it will send `idToken` so we can just update the existing user record.
    let uid;
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken, true);
        uid = decoded.uid;
      } catch (e) {
        return res.status(401).json({ error: "Invalid registration ID token" });
      }
    }

    if (uid) {
      userRecord = await admin
        .auth()
        .getUser(uid)
        .catch(() => null);
    }

    // If user doesn't exist yet, create one (fallback for non-Firebase client flows)
    if (!userRecord) {
      if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
      }
      try {
        userRecord = await admin.auth().createUser({
          email,
          password,
          displayName: name,
        });
      } catch (e) {
        // An email address and an arbitrary password do not prove account ownership.
        if (e.code === "auth/email-already-exists") {
          return res.status(409).json({ error: "Account already exists. Sign in to continue." });
        } else {
          throw e;
        }
      }
      uid = userRecord.uid;
    }

    // Identity email changes belong to the verified Firebase Auth flow.
    if (idToken && email && normalizeEmail(email) !== normalizeEmail(userRecord.email)) {
      return res
        .status(400)
        .json({ error: "Registration email must match the authenticated account" });
    }
    // A verified owner can update their display name without resetting account state.
    const updates = {};
    if (name && userRecord.displayName !== name) updates.displayName = name;
    if (Object.keys(updates).length) {
      userRecord = await admin.auth().updateUser(userRecord.uid, updates);
    }

    // Registration never grants, replaces or removes custom claims.
    const existingClaims = userRecord.customClaims || {};
    const finalRole = hasAdminClaim({ ...existingClaims, uid: userRecord.uid }) ? "admin" : "user";

    // Store additional user data in Firestore
    const userDocRef = admin.firestore().collection("users").doc(userRecord.uid);
    const userSnap = await userDocRef.get();
    await userDocRef.set(
      {
        name: name || userRecord.displayName || "",
        email: userRecord.email,
        ...(userSnap.exists
          ? {}
          : {
              role: finalRole,
              isAdmin: finalRole === "admin",
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            }),
      },
      { merge: true }
    );

    // Generate a branded verification email. Delivery is reported truthfully so
    // the client can fall back to Firebase's mail service when needed.
    let verificationEmailSent = false;
    let verificationProvider = null;
    let verificationErrorCode = null;
    try {
      const verifyLink = await generateVerificationLink(admin.auth(), userRecord.email);
      const delivery = await sendVerificationEmail({ email: userRecord.email, link: verifyLink });
      verificationProvider = delivery?.provider || null;
      verificationEmailSent = delivery?.ok === true && verificationProvider !== "console";
      if (!verificationEmailSent) {
        console.warn(
          "[auth] Verification provider did not confirm delivery; client fallback required"
        );
      }
    } catch (e) {
      verificationErrorCode = e.code || "verification_delivery_unavailable";
      console.warn("[auth] Verification delivery failed:", verificationErrorCode);
    }

    res.status(201).json({
      message: verificationEmailSent
        ? "User registered. Verification email sent."
        : "User registered. Verification email requires client fallback.",
      requiresEmailVerification: true,
      verificationEmailSent,
      verificationProvider,
      verificationErrorCode,
    });
  } catch (error) {
    console.error("Registration error:", error);

    // If the account was already created (or found), we still want the end-user to proceed.
    // This avoids the UX where Firebase Auth succeeds but the backend returns an error.
    if (userRecord && userRecord.uid) {
      return res.status(201).json({
        message: "User registered (partial). Some backend steps failed, but you can still log in.",
        warning: error.message,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// Trigger resend verification email
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email required" });
    // Basic in-memory rate limiting (per process). For production, move to Redis if scaled horizontally.
    const key = `rv_${email.toLowerCase()}`;
    const now = Date.now();
    if (!global.__resendLimiter) {
      global.__resendLimiter = new Map();
      // Periodic cleanup: evict entries older than 15 minutes every 5 minutes
      setInterval(
        () => {
          const cutoff = Date.now() - 15 * 60 * 1000;
          for (const [k, v] of global.__resendLimiter) {
            if (v.first < cutoff) global.__resendLimiter.delete(k);
          }
        },
        5 * 60 * 1000
      ).unref();
    }
    const entry = global.__resendLimiter.get(key) || { count: 0, first: now };
    if (now - entry.first > 15 * 60 * 1000) {
      // 15 min window
      entry.count = 0;
      entry.first = now;
    }
    entry.count++;
    global.__resendLimiter.set(key, entry);
    const LIMIT = parseInt(process.env.RESEND_VERIFICATION_LIMIT || "5", 10); // default 5 per 15m
    if (entry.count > LIMIT) {
      return res.status(429).json({
        error: "too_many_requests",
        retryAfterMinutes: Math.ceil((entry.first + 15 * 60 * 1000 - now) / 60000),
      });
    }
    const user = await admin
      .auth()
      .getUserByEmail(email)
      .catch(() => null);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.emailVerified) return res.json({ message: "Already verified" });
    const link = await generateVerificationLink(admin.auth(), user.email);
    const delivery = await sendVerificationEmail({ email, link });
    const externallyDelivered = delivery?.ok === true && delivery?.provider !== "console";
    if (!externallyDelivered) {
      return res.status(503).json({
        error: "verification_delivery_unavailable",
        message:
          "The email provider did not confirm delivery. Keep this page open and try again shortly.",
      });
    }
    return res.json({
      message: "Verification email sent",
      remaining: Math.max(0, LIMIT - entry.count),
      provider: delivery.provider,
    });
  } catch (e) {
    const limited = e.code === "auth/too-many-requests";
    if (limited) res.set("Retry-After", "120");
    console.warn("[auth] Verification resend failed:", e.code || "verification_delivery_unavailable");
    return res.status(limited ? 429 : 503).json({
      error: limited ? "too_many_requests" : "verification_delivery_unavailable",
      message: limited
        ? "Verification email is temporarily limited. Please wait before trying again."
        : "We could not send the verification email. Please try again shortly.",
      ...(limited ? { retryAfterSeconds: 120 } : {}),
    });
  }
});

// Email verification callback (optional passthrough if front-end not using Firebase client flow directly)
router.post("/verify-email", async (req, res) => {
  try {
    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ error: "uid required" });
    const user = await admin.auth().getUser(uid);
    if (user.emailVerified) return res.json({ verified: true });
    return res.json({ verified: false, message: "User must click Firebase email link directly" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

async function forgotPasswordHandler(req, res) {
  try {
    const email = normalizeEmail(req.body && req.body.email);
    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const user = await admin
      .auth()
      .getUserByEmail(email)
      .catch(() => null);

    if (user && user.uid) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = buildResetTokenHash(rawToken);
      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000)
      );
      const userRef = usersCollection().doc(user.uid);

      await userRef.set(
        {
          email,
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt,
          passwordResetRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      const link = buildPasswordResetLink(rawToken);
      const emailResponse = await sendPasswordResetEmail({ email, link });
      if (!emailResponse || emailResponse.ok === false) {
        await userRef.set(
          {
            passwordResetTokenHash: admin.firestore.FieldValue.delete(),
            passwordResetExpiresAt: admin.firestore.FieldValue.delete(),
          },
          { merge: true }
        );
        console.error(
          "[auth] password reset email failed for %s: %s",
          email,
          emailResponse && emailResponse.error ? emailResponse.error : "unknown email error"
        );
      }
    }

    return res.status(200).json({ message: SAFE_PASSWORD_RESET_RESPONSE });
  } catch (e) {
    console.error("[auth] forgot-password error:", e.message);
    return res.status(200).json({ message: SAFE_PASSWORD_RESET_RESPONSE });
  }
}

router.post("/forgot-password", ...passwordResetRequestLimiter, forgotPasswordHandler);
router.post("/request-password-reset", ...passwordResetRequestLimiter, forgotPasswordHandler);

router.post("/reset-password", ...passwordResetSubmitLimiter, async (req, res) => {
  try {
    const token = String((req.body && req.body.token) || "").trim();
    const password = String((req.body && req.body.password) || "").trim();

    if (!token || !password) {
      return res.status(400).json({ error: "token and password required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    const tokenHash = buildResetTokenHash(token);
    const matches = await usersCollection()
      .where("passwordResetTokenHash", "==", tokenHash)
      .limit(2)
      .get();

    if (matches.empty) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const userDoc = matches.docs[0];
    const userData = userDoc.data() || {};
    const storedHash = String(userData.passwordResetTokenHash || "");
    const tokenMatches =
      storedHash.length === tokenHash.length &&
      crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(tokenHash));

    if (!tokenMatches || !isValidPasswordResetExpiry(userData.passwordResetExpiresAt)) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Firebase Auth stores the password using its own secure hashing pipeline.
    await admin.auth().updateUser(userDoc.id, { password });
    await userDoc.ref.set(
      {
        passwordResetTokenHash: admin.firestore.FieldValue.delete(),
        passwordResetExpiresAt: admin.firestore.FieldValue.delete(),
        passwordResetRequestedAt: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.json({ message: "Password has been reset successfully." });
  } catch (e) {
    console.error("[auth] reset-password error:", e.message);
    return res.status(500).json({ error: "Unable to reset password" });
  }
});

// Admin-only override path for support operations.
const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};
router.post("/admin/reset-password", authMiddleware, adminOnly, async (req, res) => {
  try {
    const { uid, newPassword } = req.body || {};
    if (!uid || !newPassword)
      return res.status(400).json({ error: "uid and newPassword required" });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password too short" });
    await admin.auth().updateUser(uid, { password: newPassword });
    return res.json({ message: "Password updated" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    console.log(
      "Login request received; idTokenPresent=%s emailPresent=%s",
      !!(req.body && req.body.idToken),
      !!(req.body && req.body.email)
    );
    const { idToken, email, password } = req.body;

    // There are two authentication methods:
    // 1. Using idToken - preferred method when frontend uses Firebase Auth
    // 2. Using email/password - fallback method

    let decodedToken;

    if (idToken) {
      console.log("Verifying Firebase ID token...");
      // Verify the Firebase ID token
      decodedToken = await admin.auth().verifyIdToken(idToken, true);
      console.log("Token verified for uid=%s", decodedToken.uid);
    } else if (email && password) {
      console.log("Using email/password authentication...");
      // SECURITY: Verify password via Firebase Auth REST API (Admin SDK cannot verify passwords)
      const firebaseApiKey = process.env.FIREBASE_API_KEY || process.env.REACT_APP_FIREBASE_API_KEY;
      if (!firebaseApiKey) {
        console.error("FIREBASE_API_KEY env var not set — email/password login unavailable");
        return res
          .status(500)
          .json({ error: "Server misconfiguration: password login unavailable" });
      }
      try {
        const fetch = globalThis.fetch || require("node-fetch");
        const authResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseApiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, returnSecureToken: true }),
          }
        );
        const authJson = await authResp.json();
        if (!authResp.ok || authJson.error) {
          console.warn(
            "Email/password auth failed for email=%s code=%s",
            email,
            authJson.error?.message
          );
          return res.status(401).json({ error: "Invalid email or password" });
        }
        // Password verified — now verify the returned idToken with Admin SDK
        decodedToken = await admin.auth().verifyIdToken(authJson.idToken, true);
        console.log("Email/password auth verified for uid=%s", decodedToken.uid);
      } catch (error) {
        console.error("Email/password authentication failed:", error);
        return res.status(401).json({ error: "Invalid email or password" });
      }
    } else {
      console.log("No authentication credentials provided");
      return res.status(401).json({ error: "No authentication credentials provided" });
    }

    // Variables to store user data
    let userData = null;
    let role = authorityFromVerifiedIdentity(decodedToken).role;
    let isAdmin = hasAdminClaim(decodedToken);
    let fromCollection = "users";

    // Check admins collection first for admin logins
    try {
      console.log("Checking admins collection for user: uid=%s", decodedToken.uid);
      const adminDoc = await admin.firestore().collection("admins").doc(decodedToken.uid).get();
      if (adminDoc.exists && hasAdminClaim(decodedToken)) {
        userData = adminDoc.data();
        role = "admin";
        isAdmin = true;
        fromCollection = "admins";
        console.log(
          "User data from Firestore (admins): email=%s uid=%s",
          userData && userData.email,
          decodedToken.uid
        );
      } else {
        // If not found in admins, check users collection
        console.log(
          "Not found in admins, checking users collection for UID: uid=%s",
          decodedToken.uid
        );
        const userDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          console.log(
            "User data from Firestore (users): email=%s uid=%s",
            userData && userData.email,
            decodedToken.uid
          );
          // Profile fields are display data, never sources of authority or token claims.
        }
      }
    } catch (firestoreError) {
      console.log("Error fetching from Firestore: %s", firestoreError && firestoreError.message);
      // Continue with Auth data if Firestore fails
    }

    if (!userData) {
      console.log("No Firestore data, using claims from token for uid=%s", decodedToken.uid);
      // Use custom claims from the token if no Firestore data
      userData = {
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split("@")[0],
        role: decodedToken.admin ? "admin" : "user",
      };
      // Do NOT create a new Firestore user document on login
      // Only fetch existing data; registration is responsible for document creation
    }

    console.log("Sending response with user data:", {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
      isAdmin,
      fromCollection,
    });

    // Verification is mandatory. Legacy environment/grandfather switches must
    // never admit an unverified account or mint it a custom login token.
    const authUser = await admin.auth().getUser(decodedToken.uid);
    if (!authUser.emailVerified) {
      return res.status(403).json({
        error: "email_not_verified",
        message: "Please verify your email before signing in.",
        requiresEmailVerification: true,
      });
    }
    const emailVerified = true;

    // Create a custom token if we're using email/password login
    let tokenToReturn = idToken;
    let tokenType = "id_token";

    if (!idToken && email && password) {
      // Create a proper Firebase custom token
      tokenToReturn = await admin.auth().createCustomToken(decodedToken.uid, {
        role: role,
        isAdmin: isAdmin,
      });
      tokenType = "custom_token";
      console.log("Created custom token for email/password login, length:", tokenToReturn.length);
    }

    // Return proper token with the response
    const response = {
      message: "Login successful",
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: userData.name || decodedToken.name || decodedToken.email.split("@")[0],
        role: role,
        isAdmin: isAdmin,
        fromCollection: fromCollection,
        emailVerified: emailVerified,
        needsEmailVerification: !emailVerified,
        grandfathered: false,
        grandfatherPolicyCutoff: null,
      },
    };

    // Add instructions for custom token usage
    if (tokenType === "custom_token") {
      response.tokenInstructions = {
        type: "custom_token",
        message:
          "This is a Firebase custom token. You must exchange it for an ID token before using it for authenticated requests.",
        exchangeInstructions:
          "Use Firebase Auth SDK: firebase.auth().signInWithCustomToken(token).then(() => firebase.auth().currentUser.getIdToken())",
        note: "Do not send custom tokens directly in Authorization headers. Always exchange them for ID tokens first.",
      };
    }

    res.json(response);
  } catch (error) {
    console.error("Login error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
});

// Admin-specific login endpoint
router.post("/admin-login", async (req, res) => {
  try {
    console.log(
      "Admin login request received; idTokenPresent=%s emailPresent=%s",
      !!(req.body && req.body.idToken),
      !!(req.body && req.body.email)
    );
    const { idToken } = req.body || {};

    if (!idToken) {
      console.log("No idToken provided in admin login request");
      return res.status(401).json({ error: "No ID token provided" });
    }
    console.log("Verifying Firebase ID token for admin login... (truncated token)");
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);
    if (!requireVerifiedEmail(decodedToken, res)) return;
    console.log("Admin token verified for uid=%s", decodedToken.uid);

    // Variables to store user data
    let userData = null;
    let role = "user";
    let isAdmin = false;
    let fromCollection = null;
    let _adminStatusSource = "unknown";

    // For admin login, check admin claims in token first, then try admins collection
    try {
      console.log(
        "Checking admin claims in token: admin=%s role=%s",
        decodedToken.admin,
        decodedToken.role
      );
      console.log("Admin email present in token=%s", !!decodedToken.email);

      // Check if user has admin claims in the token
      if (hasAdminClaim(decodedToken)) {
        console.log("User has admin claims in token");

        // Try to get admin data from admins collection if it exists
        try {
          const adminDoc = await admin.firestore().collection("admins").doc(decodedToken.uid).get();

          if (adminDoc.exists) {
            console.log("User found in admins collection for uid=%s", decodedToken.uid);
            userData = adminDoc.data();
            fromCollection = "admins";

            // Update lastLogin in admin document
            await admin.firestore().collection("admins").doc(decodedToken.uid).update({
              lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            console.log(
              "Admin not in admins collection, using token claims for uid=%s",
              decodedToken.uid
            );
            // Create admin document if it doesn't exist
            userData = {
              email: decodedToken.email,
              name: decodedToken.name || decodedToken.email.split("@")[0],
              role: "admin",
              isAdmin: true,
            };
            fromCollection = "token_claims";

            // Try to create admin document (don't fail if Firestore is not available)
            try {
              await admin
                .firestore()
                .collection("admins")
                .doc(decodedToken.uid)
                .set({
                  email: decodedToken.email,
                  name: decodedToken.name || decodedToken.email.split("@")[0],
                  role: "admin",
                  isAdmin: true,
                  createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                });
              console.log("Created admin document in Firestore for uid=%s", decodedToken.uid);
            } catch (createError) {
              console.log(
                "Could not create admin document (Firestore may not be available): %s",
                createError.message
              );
            }
          }

          role = "admin";
          isAdmin = true;

          // Log the admin login to admin_logs collection for audit (optional)
          try {
            await admin
              .firestore()
              .collection("admin_logs")
              .add({
                action: "admin_login",
                adminId: decodedToken.uid,
                email: decodedToken.email,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                ipAddress: req.ip || "unknown",
              });
          } catch (logError) {
            console.log(
              "Could not log admin login (Firestore may not be available): %s",
              logError.message
            );
          }
        } catch (firestoreError) {
          console.log(
            "Error with Firestore, but proceeding with token claims:",
            firestoreError.message
          );
          // Use token claims as fallback
          userData = {
            email: decodedToken.email,
            name: decodedToken.name || decodedToken.email.split("@")[0],
            role: "admin",
            isAdmin: true,
          };
          role = "admin";
          isAdmin = true;
          fromCollection = "token_claims";
        }
      } else {
        // User does not have admin claims
        console.log("User does not have admin claims in token for uid=%s", decodedToken.uid);
        return res.status(403).json({ error: "Not authorized as admin" });
      }
    } catch (error) {
      console.log("Error during admin authentication:", error);
      return res.status(500).json({ error: "Admin authentication error" });
    }

    if (!userData) {
      console.log("No admin data found for this user");
      return res.status(403).json({ error: "Not authorized as admin" });
    }

    console.log("Sending admin login response with user data:", {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
      isAdmin,
      fromCollection,
    });

    res.json({
      message: "Admin login successful",
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: userData.name || decodedToken.name || decodedToken.email.split("@")[0],
        role: role,
        isAdmin: isAdmin,
        fromCollection: fromCollection,
      },
      token: idToken, // Return the original ID token that was verified
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(401).json({ error: "Admin authentication failed" });
  }
});

// Verify token endpoint
router.get("/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // Verify the Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token, true);
    if (!requireVerifiedEmail(decodedToken, res)) return;

    // Profiles provide display fields only. Verify authority independently for both
    // claim-based admins and legacy server-managed admins collection members.
    let profile = null;
    let adminExists = false;
    try {
      const [userDoc, adminDoc] = await Promise.all([
        admin.firestore().collection("users").doc(decodedToken.uid).get(),
        admin.firestore().collection("admins").doc(decodedToken.uid).get(),
      ]);
      adminExists = adminDoc.exists;
      profile = adminExists ? adminDoc.data() : userDoc.exists ? userDoc.data() : null;
    } catch (_) {
      // Database failure cannot promote a profile; verified claims still work.
    }
    return res.json({
      valid: true,
      user: {
        name: profile?.name || decodedToken.name || decodedToken.email?.split("@")[0] || "",
        ...authorityFromVerifiedIdentity(decodedToken, adminExists),
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
