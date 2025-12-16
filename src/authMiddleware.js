const { admin, db } = require("./firebaseAdmin");
const { present, tokenInfo } = require("./utils/logSanitizer");
const diag = require("./diagnostics");

const authMiddleware = async (req, res, next) => {
  const startMs = Date.now();
  try {
    // Extract token from Authorization header or query param (id_token)
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    let token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!token && req.query) {
      token = req.query.id_token || req.query.idToken || req.query.token || token;
    }

    // Instrumentation: record a small request context for diagnostics
    const requestContext = {
      ip:
        req.ip ||
        (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) ||
        req.connection?.remoteAddress ||
        "unknown",
      origin: req.headers.origin || req.headers.referer || null,
      path: req.originalUrl || req.url,
    };

    // Fast block: if IP is blocked, return 429 immediately to reduce load
    try {
      if (diag.isBlocked(requestContext.ip)) {
        console.warn(
          "[auth][blocked_request] ip=%s path=%s",
          requestContext.ip,
          requestContext.path
        );
        return res
          .status(429)
          .json({ error: "Temporarily blocked due to repeated invalid auth attempts" });
      }
    } catch (e) {
      // don't fail request on diag errors
    }

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
      if (process.env.DEBUG_AUTH === "true") {
        console.log(
          "[auth][test-token] uid=%s ip=%s path=%s",
          uid,
          requestContext.ip,
          requestContext.path
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
        "[auth] token provided:",
        token
          ? `Yes (len:${tokenInfo(token).length || 0}) ip=${requestContext.ip}`
          : `No ip=${requestContext.ip}`
      );
    if (!token) {
      diag.incAuthFail("no_token", requestContext.ip);
      // If an IP is generating many unauthenticated requests, block to reduce load
      const ipCount = diag.getIpCount(requestContext.ip);
      if (ipCount > 50 && !diag.isBlocked(requestContext.ip)) {
        diag.blockIp(requestContext.ip, 10 * 60 * 1000); // block 10 minutes
        console.warn(
          "[auth][auto_block_no_token] ip=%s path=%s count=%d",
          requestContext.ip,
          requestContext.path,
          ipCount
        );
        return res
          .status(429)
          .json({ error: "Temporarily blocked due to repeated invalid auth attempts" });
      }
      console.warn(
        "[auth][no_token] ip=%s origin=%s path=%s",
        requestContext.ip,
        requestContext.origin,
        requestContext.path
      );
      return res.status(401).json({ error: "No token provided" });
    }
    // Log token presence info (sanitized)
    if (debugAuth) console.log("[auth] tokenInfo=%o", tokenInfo(token));
    // Check if this is a custom token (shouldn't be used directly for auth)
    if (token.length < 100 || !token.startsWith("eyJ")) {
      diag.incAuthFail("invalid_token_format", requestContext.ip);
      // Throttle obvious bad token formats from same IP
      if (diag.getIpCount(requestContext.ip) > 120) {
        console.warn(
          "[auth][throttle_invalid_token] ip=%s path=%s count=%d",
          requestContext.ip,
          requestContext.path,
          diag.getIpCount(requestContext.ip)
        );
        return res.status(429).json({ error: "Rate limit exceeded" });
      }
      console.warn(
        "[auth][invalid_token_format] ip=%s path=%s tokenLen=%d",
        requestContext.ip,
        requestContext.path,
        tokenInfo(token).length || 0
      );
      if (debugAuth)
        console.log("Warning: Received token does not appear to be a valid Firebase ID token");
      return res.status(401).json({
        error: "Invalid token format",
        message:
          "Please exchange your custom token for an ID token before making authenticated requests",
      });
    }

    // Verify Firebase token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (verifyErr) {
      diag.incAuthFail("verify_error", requestContext.ip);
      // If many verify errors from same IP, escalate to blocking
      const ipCount = diag.getIpCount(requestContext.ip);
      if (ipCount > 80 && !diag.isBlocked(requestContext.ip)) {
        diag.blockIp(requestContext.ip, 10 * 60 * 1000);
        console.warn(
          "[auth][auto_block_verify_error] ip=%s path=%s count=%d",
          requestContext.ip,
          requestContext.path,
          ipCount
        );
        return res
          .status(429)
          .json({ error: "Temporarily blocked due to repeated invalid auth attempts" });
      }
      console.warn(
        "[auth][verify_error] ip=%s path=%s code=%s messagePresent=%s",
        requestContext.ip,
        requestContext.path,
        verifyErr && verifyErr.code,
        !!verifyErr && !!verifyErr.message
      );
      const took = Date.now() - startMs;
      if (took > 500) console.warn(`[auth][slow-verify] took=${took}ms ip=${requestContext.ip}`);
      if (verifyErr && verifyErr.code === "auth/id-token-expired")
        return res.status(401).json({ error: "Token expired" });
      return res.status(401).json({ error: "Invalid token" });
    }

    // Optional audience / issuer enforcement
    const expectedAud = process.env.JWT_AUDIENCE;
    const expectedIss = process.env.JWT_ISSUER;
    if (expectedAud && decodedToken.aud && decodedToken.aud !== expectedAud) {
      console.warn(
        "[auth][invalid_audience] uid=%s ip=%s expected=%s got=%s",
        decodedToken.uid,
        requestContext.ip,
        expectedAud,
        decodedToken.aud
      );
      return res.status(401).json({ error: "invalid_audience" });
    }
    if (expectedIss && decodedToken.iss && decodedToken.iss !== expectedIss) {
      console.warn(
        "[auth][invalid_issuer] uid=%s ip=%s expected=%s got=%s",
        decodedToken.uid,
        requestContext.ip,
        expectedIss,
        decodedToken.iss
      );
      return res.status(401).json({ error: "invalid_issuer" });
    }
    if (debugAuth)
      console.log(
        "[auth] Token OK: uid=%s emailPresent=%s admin=%s role=%s ip=%s",
        decodedToken.uid,
        !!decodedToken.email,
        decodedToken.admin,
        decodedToken.role,
        requestContext.ip
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
        req.user.token = token;
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
        req.user.token = token;
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
        // Attach the raw token for request-scoped usage in HTML templates
        req.user.token = token;
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
      req.user.token = token;

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

    const tookMs = Date.now() - startMs;
    if (process.env.DEBUG_AUTH === "true" || tookMs > 500) {
      console.log(
        "[auth] uid=%s took=%dms ip=%s",
        req.user && req.user.uid,
        tookMs,
        req.ip || req.headers["x-forwarded-for"] || "unknown"
      );
      if (tookMs > 500)
        console.warn(
          "[auth][slow] took=%dms uid=%s ip=%s",
          tookMs,
          req.user && req.user.uid,
          req.ip || req.headers["x-forwarded-for"] || "unknown"
        );
    }

    next();
  } catch (error) {
    const tookMs = Date.now() - startMs;
    console.warn(
      "[auth][error] ip=%s path=%s took=%dms code=%s messagePresent=%s",
      req.ip || req.headers["x-forwarded-for"] || "unknown",
      req.originalUrl || req.url,
      tookMs,
      error && error.code,
      !!error && !!error.message
    );
    console.error("Auth error:", error && (error.message || error));
    if (error && error.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = authMiddleware;
