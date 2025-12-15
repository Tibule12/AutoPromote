const express = require("express");
const admin = require("firebase-admin");
const router = express.Router();
const { sendVerificationEmail, sendPasswordResetEmail } = require("./services/emailService");

// Middleware to verify Firebase token
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    res.status(401).json({ error: "Invalid token" });
  }
};

// Register endpoint
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role = "user" } = req.body;

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Set custom claims for role
    await admin.auth().setCustomUserClaims(userRecord.uid, { role });

    // Store additional user data in Firestore
    const userDocRef = admin.firestore().collection("users").doc(userRecord.uid);
    const userSnap = await userDocRef.get();
    const currentData = userSnap.exists ? userSnap.data() : {};
    // Only set role/isAdmin to 'user'/false if not already admin
    const docRole = currentData.role === "admin" ? "admin" : role;
    const docIsAdmin = currentData.role === "admin" ? true : false;
    await userDocRef.set({
      name,
      email,
      role: docRole,
      isAdmin: docIsAdmin,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Generate email verification link
    try {
      const verifyLink = await admin.auth().generateEmailVerificationLink(email, {
        url: process.env.VERIFY_REDIRECT_URL || "https://example.com/verified",
      });
      await sendVerificationEmail({ email, link: verifyLink });
    } catch (e) {
      console.log("⚠️ Could not send verification email:", e.message);
    }
    res.status(201).json({
      message: "User registered. Verification email sent.",
      requiresEmailVerification: true,
    });
  } catch (error) {
    console.error("Registration error:", error);
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
    global.__resendLimiter = global.__resendLimiter || new Map();
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
    const link = await admin.auth().generateEmailVerificationLink(email, {
      url: process.env.VERIFY_REDIRECT_URL || "https://example.com/verified",
    });
    await sendVerificationEmail({ email, link });
    return res.json({
      message: "Verification email sent",
      remaining: Math.max(0, LIMIT - entry.count),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
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

// Request password reset
router.post("/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = await admin
      .auth()
      .getUserByEmail(email)
      .catch(() => null);
    if (!user)
      return res.status(200).json({ message: "If the email exists, a reset link will be sent." }); // do not leak existence
    const redirectUrl =
      process.env.PASSWORD_RESET_REDIRECT_URL || "https://example.com/reset-complete";
    const link = await admin.auth().generatePasswordResetLink(email, { url: redirectUrl });
    const resp = await sendPasswordResetEmail({ email, link });
    const diagnostics = {};
    // Detect obvious placeholder configuration so user knows why mail might not arrive
    if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith("SG.xxxx"))
      diagnostics.placeholderApiKey = true;
    if ((process.env.EMAIL_FROM || "").includes("yourdomain.com"))
      diagnostics.placeholderFrom = true;
    if ((process.env.PASSWORD_RESET_REDIRECT_URL || "").includes("yourapp.com"))
      diagnostics.placeholderRedirect = true;
    diagnostics.provider = process.env.EMAIL_PROVIDER || "console";
    diagnostics.mode = process.env.EMAIL_SENDER_MODE || "unknown";
    diagnostics.delivery =
      resp && resp.provider ? resp.provider : resp.disabled ? "disabled" : "unknown";
    // Optionally surface the raw link in non-production for manual testing
    if (process.env.NODE_ENV !== "production" || process.env.EXPOSE_RESET_LINK === "true")
      diagnostics.resetLink = link;
    return res.json({ message: "Password reset email requested", diagnostics });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Complete password reset (admin override path)
router.post("/reset-password", async (req, res) => {
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
      decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log("Token verified for uid=%s", decodedToken.uid);
    } else if (email && password) {
      console.log("Using email/password authentication...");
      // This is a more risky approach as we're handling credentials directly
      // Sign in with email and password using admin SDK
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        // We can't verify the password directly with Admin SDK
        // Creating a custom token for the user
        const customToken = await admin.auth().createCustomToken(userRecord.uid);

        // Instead of directly using this as decoded token, we should provide
        // the custom token to the client and have them exchange it for an ID token
        decodedToken = {
          uid: userRecord.uid,
          email: userRecord.email,
          name: userRecord.displayName || email.split("@")[0],
        };
        console.log("Email/password auth successful for uid=%s", decodedToken.uid);
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
    let role = "user";
    let isAdmin = false;
    let fromCollection = "users";

    // Check admins collection first for admin logins
    try {
      console.log("Checking admins collection for user: uid=%s", decodedToken.uid);
      const adminDoc = await admin.firestore().collection("admins").doc(decodedToken.uid).get();
      if (adminDoc.exists) {
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
          // Always use Firestore values for role and isAdmin if present
          if (userData.role) role = userData.role;
          if (typeof userData.isAdmin !== "undefined") isAdmin = userData.isAdmin;
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

    // Email verification handling (ENFORCED by default now)
    // Policy:
    //  - If user email not verified => block login with 403
    //  - Allow temporary override ONLY if ALLOW_UNVERIFIED_LOGIN=true (for staging/testing)
    //  - Resend endpoint available at /api/auth/resend-verification
    let emailVerified = true;
    let authUser = null;
    try {
      authUser = await admin.auth().getUser(decodedToken.uid);
      emailVerified = !!authUser.emailVerified;
    } catch (_) {
      emailVerified = false;
    }

    // Verification enforcement policy (adjusted):
    //  - Default: DO NOT block login for unverified users (previous behavior enforced by default)
    //  - To enforce blocking, set ENFORCE_VERIFICATION_ON_LOGIN=true
    //  - Deprecated override ALLOW_UNVERIFIED_LOGIN remains for backward compat (will log warning)
    const enforceLoginVerification = process.env.ENFORCE_VERIFICATION_ON_LOGIN === "true";
    const allowUnverifiedLegacy = process.env.ALLOW_UNVERIFIED_LOGIN === "true";
    if (allowUnverifiedLegacy && enforceLoginVerification) {
      console.warn(
        "[auth] Both ENFORCE_VERIFICATION_ON_LOGIN and ALLOW_UNVERIFIED_LOGIN set. ALLOW_UNVERIFIED_LOGIN wins (allowing unverified)."
      );
    }
    const allowUnverified = !enforceLoginVerification || allowUnverifiedLegacy; // default allow unless enforcement explicitly on

    // Grandfather policy: only relevant if enforcement is ON
    // Allow existing (older) accounts to login unverified if created before cutoff
    // Configure with ISO8601 datetime string e.g. 2025-02-20T00:00:00Z
    const grandfatherCutoffRaw = process.env.EMAIL_VERIFICATION_GRANDFATHER_BEFORE;
    let isGrandfathered = false;
    let grandfatherCutoff = null;
    if (grandfatherCutoffRaw) {
      const parsed = Date.parse(grandfatherCutoffRaw);
      if (!isNaN(parsed)) {
        grandfatherCutoff = new Date(parsed);
        try {
          // Prefer Auth user creation time (metadata) fallback to Firestore createdAt
          const creationTime = authUser?.metadata?.creationTime
            ? Date.parse(authUser.metadata.creationTime)
            : null;
          let firestoreCreated = null;
          if (userData && userData.createdAt && userData.createdAt.toDate) {
            try {
              firestoreCreated = userData.createdAt.toDate().getTime();
            } catch (_) {}
          }
          const createdMs = creationTime || firestoreCreated;
          if (createdMs && createdMs < grandfatherCutoff.getTime()) {
            isGrandfathered = true;
            console.log(
              "[auth] Grandfather exemption applied for user",
              decodedToken.uid,
              "created",
              new Date(createdMs).toISOString(),
              "cutoff",
              grandfatherCutoff.toISOString()
            );
          }
        } catch (_) {
          /* swallow */
        }
      }
    }

    if (enforceLoginVerification && !emailVerified && !allowUnverified && !isGrandfathered) {
      return res.status(403).json({
        error: "email_not_verified",
        message:
          "Please verify your email before logging in. Check your inbox or request a new link.",
        requiresEmailVerification: true,
        grandfathered: false,
        grandfatherPolicyCutoff: grandfatherCutoff ? grandfatherCutoff.toISOString() : null,
      });
    }

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
        grandfathered: isGrandfathered,
        grandfatherPolicyCutoff: grandfatherCutoff ? grandfatherCutoff.toISOString() : null,
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
    const { idToken, email } = req.body || {};

    if (!idToken) {
      console.log("No idToken provided in admin login request");
      return res.status(401).json({ error: "No ID token provided" });
    }
    console.log("Verifying Firebase ID token for admin login... (truncated token)");
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("Admin token verified for uid=%s", decodedToken.uid);

    // Variables to store user data
    let userData = null;
    let role = "user";
    let isAdmin = false;
    let fromCollection = null;
    const adminStatusSource = "unknown";

    // For admin login, check admin claims in token first, then try admins collection
    try {
      console.log(
        "Checking admin claims in token: admin=%s role=%s",
        decodedToken.admin,
        decodedToken.role
      );
      console.log("Admin email present in token=%s", !!decodedToken.email);

      // Check if user has admin claims in the token
      if (decodedToken.admin === true || decodedToken.role === "admin") {
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
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Check if user has admin claims in token
    if (decodedToken.admin === true || decodedToken.role === "admin") {
      console.log("Token verification: User has admin claims");

      // Try to get admin data from Firestore
      try {
        const adminDoc = await admin.firestore().collection("admins").doc(decodedToken.uid).get();
        if (adminDoc.exists) {
          const adminData = adminDoc.data();
          return res.json({
            valid: true,
            user: {
              uid: decodedToken.uid,
              email: decodedToken.email,
              name: adminData.name || decodedToken.name,
              role: "admin",
              isAdmin: true,
              fromCollection: "admins",
            },
          });
        }
      } catch (firestoreError) {
        console.log(
          "Firestore error in token verification, using token claims:",
          firestoreError.message
        );
      }

      // Fall back to token claims
      return res.json({
        valid: true,
        user: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email.split("@")[0],
          role: "admin",
          isAdmin: true,
          fromCollection: "token_claims",
        },
      });
    }

    // For regular users, try Firestore first
    try {
      const userDoc = await admin.firestore().collection("users").doc(decodedToken.uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        return res.json({
          valid: true,
          user: {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: userData.name || decodedToken.name,
            role: userData.role || "user",
            isAdmin: userData.isAdmin === true || userData.role === "admin",
            fromCollection: "users",
          },
        });
      }
    } catch (firestoreError) {
      console.log("Firestore error for regular user, using token claims:", firestoreError.message);
    }

    // Fall back to token claims for regular users
    res.json({
      valid: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split("@")[0],
        role: "user",
        isAdmin: false,
        fromCollection: "token_claims",
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
