const { admin, db } = require("./firebaseAdmin");
const { present, tokenInfo } = require("./utils/logSanitizer");

const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    // Allow integration test bypass with test tokens of the form 'test-token-for-{uid}'
    if (typeof token === "string" && token.startsWith("test-token-for-")) {
      const uid = token.slice("test-token-for-".length);
      req.userId = uid;
      req.user = { uid, email: `${uid}@example.com`, test: true };
      if (uid.toLowerCase().includes("admin") || uid === "adminUser123" || uid === "adminUser") {
        req.user.isAdmin = true;
        req.user.role = "admin";
      } else {
        req.user.isAdmin = false;
        req.user.role = req.user.role || "user";
      }
      // NOTE: Do NOT auto-seed production data from middleware.
      // Deprecated behavior: previously this middleware auto-wrote a user's
      // `lastAcceptedTerms` in CI/test environments which weakened production
      // controls and caused false negatives/positives during static analysis.
      //
      // To seed `lastAcceptedTerms` for test tokens, run the explicit helper:
      // `node tools/smoke-tests/acceptTermsForUid.js --uid <uid>` (CI should run
      // deterministic seeding before E2E). This keeps runtime behavior unchanged
      // and avoids silent writes during request handling.
      if (process.env.DEBUG_AUTH === "true") {
        console.log(
          "[authMiddleware] test-token for uid=%s detected; skipping auto-seed. Use tools/smoke-tests/acceptTermsForUid.js to seed lastAcceptedTerms.",
          uid
        );
      }
      return next();
    }
    // If another upstream middleware already attached a user object, skip heavy work
    if (req.user && req.user.uid) {
      return next();
    }
    const debugAuth = process.env.DEBUG_AUTH === "true";
    if (debugAuth)
      console.log(
        "Auth middleware - token provided:",
        token ? `Yes (length: ${token.length})` : "No"
      );
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }
    // Log the first 10 chars of token for debugging
    if (debugAuth) console.log("Token preview: length=%s", tokenInfo(token).length || 0);
    // Check if this is a custom token (shouldn't be used directly for auth)
    if (token.length < 100 || !token.startsWith("eyJ")) {
      if (debugAuth)
        console.log("Warning: Received token does not appear to be a valid Firebase ID token");
      return res.status(401).json({
        error: "Invalid token format",
        message:
          "Please exchange your custom token for an ID token before making authenticated requests",
      });
    }
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    // Optional audience / issuer enforcement
    const expectedAud = process.env.JWT_AUDIENCE;
    const expectedIss = process.env.JWT_ISSUER;
    if (expectedAud && decodedToken.aud && decodedToken.aud !== expectedAud) {
      return res.status(401).json({ error: "invalid_audience" });
    }
    if (expectedIss && decodedToken.iss && decodedToken.iss !== expectedIss) {
      return res.status(401).json({ error: "invalid_issuer" });
    }
    if (debugAuth)
      console.log(
        "Token verification successful: uid=%s emailPresent=%s admin=%s role=%s",
        decodedToken.uid,
        !!decodedToken.email,
        decodedToken.admin,
        decodedToken.role
      );

    // Extract any custom claims (legacy allowances: admin or isAdmin)
    const isAdminFromClaims = decodedToken.admin === true || decodedToken.isAdmin === true;
    const roleFromClaims = isAdminFromClaims ? "admin" : decodedToken.role || "user";

    // Set the user ID on the request for later use
    req.userId = decodedToken.uid;

    // Attach Sentry user context for this request if Sentry is initialized
    try {
      if (global.__sentry && typeof global.__sentry.setUser === "function") {
        global.__sentry.setUser({
          id: decodedToken.uid,
          username: decodedToken.email,
          email: decodedToken.email,
        });
      }
    } catch (_) {
      /* ignore */
    }

    try {
      // Get user data from Firestore
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      // Check if user is an admin by checking the admins collection
      const adminDoc = await db.collection("admins").doc(decodedToken.uid).get();
      const isAdminInCollection = adminDoc.exists;

      // If admin is found in admins collection, treat as authoritative admin regardless of stale user doc
      if (isAdminInCollection) {
        if (debugAuth) console.log("User found in admins collection: uid=%s", decodedToken.uid);
        const adminData = adminDoc.data();
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          ...adminData,
          isAdmin: true,
          role: "admin",
          fromCollection: "admins",
        };
        if (debugAuth) console.log("Admin user data attached to request");
        return next();
      }

      if (!userData) {
        // Create a basic user document if it doesn't exist
        if (debugAuth) console.log("No user document found in Firestore, creating one...");
        const basicUserData = {
          email: decodedToken.email,
          name: decodedToken.name || decodedToken.email?.split("@")[0],
          role: roleFromClaims, // Use role from claims
          isAdmin: isAdminFromClaims,
          createdAt: new Date().toISOString(),
        };
        if (debugAuth)
          console.log(
            "Creating user with role=%s emailPresent=%s",
            basicUserData.role,
            !!basicUserData.email
          );
        await db.collection("users").doc(decodedToken.uid).set(basicUserData);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          ...basicUserData,
        };
        if (debugAuth)
          console.log(
            "New user document created and attached to request for uid=%s",
            decodedToken.uid
          );
      } else {
        // If user exists but role needs to be updated based on claims
        if (debugAuth)
          console.log(
            "User document found: uid=%s emailPresent=%s role=%s isAdmin=%s",
            decodedToken.uid,
            !!userData.email,
            userData.role,
            !!userData.isAdmin
          );

        if (isAdminFromClaims && userData.role !== "admin") {
          if (debugAuth)
            console.log(
              "Updating user to admin role for uid=%s based on token claims",
              decodedToken.uid
            );
          await db.collection("users").doc(decodedToken.uid).update({
            role: "admin",
            isAdmin: true,
            updatedAt: new Date().toISOString(),
          });
          userData.role = "admin";
          userData.isAdmin = true;
        } else if (!isAdminFromClaims && !isAdminInCollection && userData.role === "admin") {
          // Auto-demotion: user doc still thinks admin but claims / collections do not
          if (debugAuth)
            console.log(
              "Demoting user from admin -> user for uid=%s due to missing claims & collection membership",
              decodedToken.uid
            );
          await db.collection("users").doc(decodedToken.uid).update({
            role: "user",
            isAdmin: false,
            updatedAt: new Date().toISOString(),
          });
          userData.role = "user";
          userData.isAdmin = false;
        }

        // Attach full user data to request
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          ...userData,
        };
        // Normalize: ensure isAdmin reflects effective state (collection or claims)
        if (isAdminInCollection || isAdminFromClaims) {
          req.user.isAdmin = true;
          req.user.role = "admin";
        }
        if (debugAuth)
          console.log(
            "User data attached to request: uid=%s role=%s isAdmin=%s",
            req.user.uid,
            req.user.role,
            !!req.user.isAdmin
          );
      }
    } catch (firestoreError) {
      console.error(
        "Firestore error in auth middleware: code=%s messagePresent=%s",
        firestoreError.code,
        !!firestoreError.message
      );

      // Even if Firestore fails, still allow the request to proceed with basic user info
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: roleFromClaims,
        isAdmin: isAdminFromClaims,
      };

      console.log(
        "Proceeding with basic user info from token claims only for uid=%s",
        req.user.uid
      );
      console.log(
        "User from token claims: uid=%s role=%s isAdmin=%s",
        req.user.uid,
        req.user.role,
        !!req.user.isAdmin
      );
    }

    next();
  } catch (error) {
    console.error("Auth error:", error);
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = authMiddleware;
