// Real App/Auth/Firestore with controlled external provider boundaries. No cloud records or messages.
const fs = require("node:fs"),
  path = require("node:path"),
  net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
let providerMessages = 0;
const providerDeliveries = [];
const root = path.resolve(__dirname, ".."),
  directory = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "autopromote-community-browser-")
  ),
  project = "demo-autopromote-credits";
if (require(path.join(root, "src/utils/authAuthority")).isHostedRuntime())
  throw new Error("Community browser QA is local only");
console.log("Private isolated browser evidence: " + directory);
require("node:child_process").execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=purple:s=320x180:d=1",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-y",
  path.join(directory, "source.mp4"),
]);
process.umask(0o077);
async function freePort() {
  const s = net.createServer().listen(0, "127.0.0.1");
  await once(s, "listening");
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}
async function main() {
  const portFile = path.join(directory, "browser-ports.json");
  const [apiPort, authPort, firestorePort] = fs.existsSync(portFile)
    ? JSON.parse(fs.readFileSync(portFile, "utf8"))
    : await Promise.all([freePort(), freePort(), freePort()]);
  fs.writeFileSync(portFile, JSON.stringify([apiPort, authPort, firestorePort]));
  const origin = `http://127.0.0.1:${apiPort}`;
  Object.assign(process.env, {
    NODE_ENV: "test",
    GCLOUD_PROJECT: project,
    GOOGLE_CLOUD_PROJECT: project,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    ENABLE_BACKGROUND_JOBS: "false",
    REDIS_DISABLED: "true",
    CI_ROUTE_IMPORTS: "1",
    NO_VIRAL_OPTIMIZATION: "true",
    OPENAI_LOGGING_ENABLED: "1",
    FRONTEND_URL: origin,
    VERIFY_REDIRECT_URL: `${origin}/#/`,
    EMAIL_SENDER_MODE: "disabled",
  });
  Object.assign(process.env, {
    DISCORD_CLIENT_ID: "423456789012345678",
    DISCORD_CLIENT_SECRET: "fixture-client-secret",
    DISCORD_REDIRECT_URI: "https://api.autopromote.org/api/discord/auth/callback",
    TELEGRAM_BOT_TOKEN: "123456789:local-fixture-token",
    TELEGRAM_BOT_USERNAME: "TestAutoPromoteBot",
    TELEGRAM_WEBHOOK_SECRET: "local-fixture-secret",
    DASHBOARD_URL: origin,
    GENERIC_TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex"),
  });
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "FIREBASE_CONFIG"])
    delete process.env[key];
  const java = spawn(
    process.env.SECURITY_JAVA_BIN || "java",
    [
      "-jar",
      path.join(process.env.HOME, ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"),
      "--host",
      "127.0.0.1",
      "--port",
      String(firestorePort),
      "--project_id",
      project,
      "--rules",
      path.join(root, "firestore.rules"),
    ],
    {
      cwd: directory,
      stdio: [
        "ignore",
        fs.openSync(path.join(directory, "browser-firestore.log"), "w", 0o600),
        "ignore",
      ],
    }
  );
  const { AuthEmulator } = require("firebase-tools/lib/emulator/auth");
  const emulator = new AuthEmulator({
    projectId: project,
    host: "127.0.0.1",
    port: authPort,
    singleProjectMode: 2,
  });
  let browser, server, db, admin, observedPage;
  const observations = [];
  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}`)).ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 200));
    }
    const { EmulatorRegistry } = require("firebase-tools/lib/emulator/registry");
    await EmulatorRegistry.start(emulator);
    admin = require("firebase-admin");
    admin.initializeApp({
      projectId: project,
      credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) },
    });
    const realAdmin = admin;
    const { Firestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
    db = new Firestore({
      projectId: project,
      host: process.env.FIRESTORE_EMULATOR_HOST,
      ssl: false,
    });
    admin = {
      storage: () => ({
        bucket: () => ({
          name: project,
          file: () => ({
            getMetadata: async () => {
              throw new Error("No Storage object in this read-only fixture");
            },
          }),
        }),
      }),
      auth: () => realAdmin.auth(),
      firestore: Object.assign(() => db, { FieldValue, Timestamp }),
      apps: realAdmin.apps,
      app: () => realAdmin.app(),
    };
    require.cache[require.resolve("firebase-admin")].exports = admin;
    const cache = (name, exports) => {
      const file = require.resolve(path.join(root, name));
      require.cache[file] = { id: file, filename: file, loaded: true, exports };
    };
    cache("src/firebaseAdmin.js", { db, admin, auth: admin.auth() });
    const email = async () => ({ ok: true, provider: "isolated-email-capture" });
    cache("src/services/emailService.js", {
      sendVerificationEmail: email,
      sendPasswordResetEmail: email,
    });
    const realFetch = global.fetch;
    const hook = {
      type: 1,
      id: "123456789012345678",
      channel_id: "223456789012345678",
      guild_id: "323456789012345678",
      application_id: null,
      token: "fixture-only-webhook-token",
      name: "Creator announcements",
    };
    const mediaUrl = "https://storage.googleapis.com/demo-autopromote-credits/community-source.mp4";
    const media = fs.readFileSync(path.join(directory, "source.mp4"));
    const response = (data, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
    });
    const fakeBot = async (url, options = {}) => {
      url = String(url);
      if (url.startsWith("https://api.telegram.org/")) {
        const method = url.split("/").at(-1),
          body = JSON.parse(options.body || "{}");
        if (method === "getMe")
          return response({
            ok: true,
            result: { id: 123456789, username: "TestAutoPromoteBot", is_bot: true },
          });
        if (method === "getChat")
          return response({
            ok: true,
            result: { id: -1007654321, title: "Creator subscribers", type: "channel" },
          });
        if (method === "getChatMember")
          return response({
            ok: true,
            result: { status: "administrator", can_post_messages: true },
          });
        if (method.startsWith("send")) {
          providerMessages++;
          providerDeliveries.push({ platform: "telegram", body });
          return response({
            ok: true,
            result: {
              message_id: 77,
              chat: { id: Number(body.chat_id) },
              video: { file_id: "fixture-video" },
            },
          });
        }
      }
      if (url === "https://discord.com/api/oauth2/token")
        return response({
          access_token: "fixture-access",
          scope: "identify webhook.incoming",
          webhook: hook,
        });
      if (url === "https://discord.com/api/v10/oauth2/@me")
        return response({
          application: { id: process.env.DISCORD_CLIENT_ID },
          scopes: ["identify", "webhook.incoming"],
          expires: new Date(Date.now() + 3600000).toISOString(),
          user: { id: "501000000000000000", username: "Creator" },
        });
      if (url.startsWith("https://discord.com/api/v10/webhooks/")) {
        if (options.method !== "POST") return response(hook);
        providerDeliveries.push({
          platform: "discord",
          multipart: Buffer.isBuffer(options.body),
          bytes: options.body.length,
        });
        return response({
          id: "623456789012345678",
          channel_id: hook.channel_id,
          attachments: [{ id: "fixture-file", size: media.length }],
        });
      }
      if (url === mediaUrl)
        return {
          ok: true,
          headers: new Map([
            ["content-type", "video/mp4"],
            ["content-length", String(media.length)],
          ]),
          body: (async function* () {
            yield media;
          })(),
        };
      throw new Error("External provider request blocked by isolated fixture");
    };
    global.fetch = (url, options) =>
      /^http:\/\/(127\.0\.0\.1|localhost):/.test(String(url))
        ? realFetch(url, options)
        : fakeBot(url, options);
    const fetchFile = require.resolve("node-fetch");
    require(fetchFile);
    require.cache[fetchFile].exports = global.fetch;
    const express = require("express"),
      rateLimit = require("express-rate-limit"),
      app = express();
    app.use(rateLimit({ windowMs: 60000, max: 2000, legacyHeaders: false, standardHeaders: true }));
    app.use(express.json());
    app.use("/api/auth", require(path.join(root, "src/authRoutes")));
    app.use("/api/users", require(path.join(root, "src/userRoutes")));
    app.use("/api/content", require(path.join(root, "src/contentRoutes")));
    app.use("/api/telegram", require(path.join(root, "src/routes/telegramRoutes")));
    app.use("/api/platform", require(path.join(root, "src/routes/platformConnectionsRoutes")));
    app.use(
      "/api/publishing-destinations",
      require(path.join(root, "src/routes/communityPublishingRoutes"))
    );
    app.use("/api", require(path.join(root, "src/routes/platformRoutes")));
    app.use("/api", (_req, res) =>
      res.status(404).json({ error: "Outside isolated onboarding test" })
    );
    const build = path.join(directory, "build");
    app.use(express.static(build));
    app.get("/{*path}", (_req, res) => res.sendFile(path.join(build, "index.html")));
    server = app.listen(apiPort, "127.0.0.1");
    await once(server, "listening");
    const env = {
      ...process.env,
      NODE_ENV: "production",
      BUILD_PATH: build,
      GENERATE_SOURCEMAP: "false",
      CI: "false",
      REACT_APP_API_URL: origin,
      REACT_APP_SITE_URL: origin,
      REACT_APP_FIREBASE_API_KEY: "demo-api-key",
      REACT_APP_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
      REACT_APP_FIREBASE_PROJECT_ID: project,
      REACT_APP_FIREBASE_STORAGE_BUCKET: project,
      REACT_APP_FIREBASE_MESSAGING_SENDER_ID: "123456789",
      REACT_APP_FIREBASE_APP_ID: "1:123456789:web:demo",
      REACT_APP_FIREBASE_MEASUREMENT_ID: "",
      REACT_APP_CREDITS_PILOT: "false",
      REACT_APP_LOCAL_EMULATORS: "true",
      REACT_APP_CREDITS_AUTH_EMULATOR: `http://127.0.0.1:${authPort}`,
      REACT_APP_CREDITS_FIRESTORE_EMULATOR: `http://127.0.0.1:${firestorePort}`,
      REACT_APP_CREDITS_STORAGE_EMULATOR: origin,
      REACT_APP_E2E_AUTH_BYPASS: "false",
      REACT_APP_WELCOME_STUDIO_PREVIEW: "false",
    };
    {
      console.log("Building the actual App into private scratch directory");
      const buildLog = fs.openSync(path.join(directory, "build.log"), "w", 0o600);
      const builder = spawn("npm", ["run", "build"], {
        cwd: path.join(root, "frontend"),
        env,
        stdio: ["ignore", buildLog, buildLog],
      });
      const [code] = await once(builder, "exit");
      fs.closeSync(buildLog);
      assert.equal(code, 0, "Actual App build failed; inspect private build.log");
    }
    console.log("Build passed; starting isolated real Auth browser flow");
    const { chromium } = require("playwright");
    browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const external = [];
    context.setDefaultTimeout(30000);
    await context.route("**/*", route => {
      const u = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost", "::1"].includes(u.hostname) ||
        ["data:", "blob:"].includes(u.protocol)
      )
        return route.continue();
      external.push(u.origin);
      return route.abort();
    });
    context.on("page", p => p.on("pageerror", e => console.log("Popup page error:", e.message)));
    context.on("response", async r => {
      if (r.url().includes("/api/telegram/") || r.url().includes("/api/platform/status")) {
        const summary = { path: new URL(r.url()).pathname, status: r.status() };
        try {
          const body = await r.json();
          summary.connected = body.connected;
          summary.oauthProduct = body.oauthProduct;
          summary.rawTelegram = body.raw?.telegram;
          summary.error = body.error;
        } catch {}
        observations.push(summary);
      }
    });
    const page = await context.newPage();
    observedPage = page;
    page.on("pageerror", e => console.log("Browser page error:", e.message));
    await page.goto(origin);
    await page
      .getByRole("button", { name: /get started|create.*account|start creating/i })
      .first()
      .click();
    const emailAddress = "verification-flow@example.test",
      password = "Isolated-test-password!24";
    await page.getByPlaceholder("Enter your full name").fill("Verification Test");
    await page.getByPlaceholder("Enter your email").fill(emailAddress);
    await page.getByPlaceholder("Create a password").fill(password);
    await page.getByPlaceholder("Confirm your password").fill(password);
    const registration = page.waitForResponse(
      r => r.url().endsWith("/api/auth/register") && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: /create autopromote account/i }).click();
    assert.equal((await registration).status(), 201);
    await page.getByRole("heading", { name: "Verify your email", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /I verified|go to sign in/i }).count(), 0);
    await page.screenshot({ path: path.join(directory, "verification-locked-desktop.png") });
    await page.reload();
    await page.getByRole("heading", { name: "Verify your email", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(directory, "verification-locked-mobile.png") });
    const signIn = await fetch(
      `http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddress, password, returnSecureToken: true }),
      }
    );
    const identity = await signIn.json();
    assert.ok(identity.idToken);
    for (const endpoint of ["/api/users/profile", "/api/auth/verify"]) {
      const response = await fetch(origin + endpoint, {
        headers: { Authorization: `Bearer ${identity.idToken}` },
      });
      assert.equal(response.status, 403);
    }
    const before = await db.collection("users").doc(identity.localId).get();
    const snapshot = before.data();
    const codes = await (
      await fetch(`http://127.0.0.1:${authPort}/emulator/v1/projects/${project}/oobCodes`)
    ).json();
    const receipt = codes.oobCodes
      .filter(c => c.email === emailAddress && c.requestType === "VERIFY_EMAIL")
      .at(-1);
    assert.ok(receipt, "No genuine emulator verification action generated");
    const emailPage = await context.newPage();
    await emailPage.goto(receipt.oobLink);
    await emailPage.waitForURL(origin + "/**");
    await page.bringToFront();
    await page
      .getByRole("button", { name: "Queue", exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page
      .getByRole("heading", { name: "Verify your email", exact: true })
      .waitFor({ state: "hidden" });
    await page.screenshot({ path: path.join(directory, "verification-auto-session.png") });
    await page.reload();
    await page
      .getByRole("button", { name: "Queue", exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page.setViewportSize({ width: 1280, height: 900 });
    await db.doc("users/" + identity.localId + "/connections/telegram").set({
      connected: true,
      profile: { id: 987654321, username: "FixtureTelegram" },
      meta: { chatId: 987654321 },
    });
    await db.collection("content").doc("community-source").set({
      user_id: identity.localId,
      title: "Community release",
      description: "A new creator movie",
      url: mediaUrl,
      type: "video",
      source: "studio",
      status: "ready",
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    require(path.join(root, "src/utils/simpleCache")).setCache(
      "platform_connections_status_" + identity.localId,
      null,
      0
    );
    await context.route("https://storage.googleapis.com/**", route =>
      route.fulfill({ status: 200, contentType: "video/mp4", body: media })
    );
    await context.route("https://discord.com/oauth2/authorize**", route => {
      const u = new URL(route.request().url());
      assert.equal(u.searchParams.get("scope"), "identify webhook.incoming");
      return route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><h1>Isolated Discord consent</h1><a href="${origin}/api/discord/auth/callback?state=${encodeURIComponent(u.searchParams.get("state"))}&code=fixture-code">Authorise channel</a>`,
      });
    });
    await context.route(/^https:\/\/autopromote\.org\/\?oauth=discord/, route =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<h1>Isolated callback return</h1>",
      })
    );
    await page.reload();
    await page.getByRole("button", { name: "Connections", exact: true }).first().click();
    const telegramCard = page
      .locator(".connection-platform-card")
      .filter({ has: page.locator("strong").filter({ hasText: /^Telegram$/ }) });
    await telegramCard.getByRole("button", { name: "Manage", exact: true }).click();
    await telegramCard
      .getByRole("textbox", { name: "Telegram channel or group" })
      .fill("@CreatorChannel");
    await telegramCard.getByRole("button", { name: "Verify destination", exact: true }).click();
    await telegramCard.getByText(/Creator subscribers/).waitFor();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Connect Discord", exact: true }).click();
    const popup = await popupPromise;
    await popup.getByRole("link", { name: "Authorise channel", exact: true }).click();
    await popup.waitForURL("https://autopromote.org/?oauth=discord&status=success", {
      waitUntil: "commit",
    });
    await popup.close();
    await page.reload();
    await page.getByRole("button", { name: "Publisher", exact: true }).first().click();
    await page.getByRole("button", { name: /Community release/ }).click();
    await page.getByRole("button", { name: /Choose destinations/ }).click();
    await page.getByRole("checkbox", { name: /Telegram/ }).check();
    await page.getByRole("checkbox", { name: /Discord/ }).check();
    await page.getByRole("button", { name: /Customize destinations/ }).click();
    for (const [name, platform, label] of [
      ["Telegram", "telegram", "Creator subscribers"],
      ["Discord", "discord", "Creator announcements"],
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      const select = page.getByRole("combobox", { name: platform + " publishing destination" });
      await select.locator("option").filter({ hasText: label }).waitFor({ state: "attached" });
      await select.selectOption({
        label: await select.locator("option").filter({ hasText: label }).textContent(),
      });
    }
    await page.screenshot({
      path: path.join(directory, "publisher-community-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: /Continue to Delivery/ }).click();
    await page.getByRole("radio", { name: /^Schedule/ }).check();
    await page.getByLabel("Date", { exact: true }).fill("2030-11-04");
    await page.getByLabel("Time", { exact: true }).fill("16:00");
    await page.getByRole("button", { name: /Review release/ }).click();
    await page.screenshot({
      path: path.join(directory, "publisher-community-review.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: /Schedule 2 posts/ }).click();
    // The normal free-plan limit must still reject two simultaneous destinations.
    await page
      .getByText(/publish to 1 platform at a time/)
      .first()
      .waitFor();
    for (const name of ["Telegram", "Discord"]) {
      await page.getByRole("button", { name: "Change destinations", exact: true }).click();
      for (const platformName of ["Telegram", "Discord"]) {
        await page
          .getByRole("checkbox", { name: new RegExp(platformName) })
          .setChecked(platformName === name);
      }
      await page.getByRole("button", { name: /Customize destinations/ }).click();
      await page.getByRole("button", { name: /Continue to Delivery/ }).click();
      await page.getByRole("button", { name: /Review release/ }).click();
      await page.getByRole("button", { name: /Schedule 1 posts/ }).click();
      await page
        .getByText(/scheduled from your existing media/)
        .first()
        .waitFor();
    }
    const schedules = await db
      .collection("promotion_schedules")
      .where("contentId", "==", "community-source")
      .get();
    assert.equal(schedules.size, 2);
    const promotion = require(path.join(root, "src/promotionService"));
    for (const schedule of schedules.docs) {
      // Advance only these fresh emulator fixtures to their due state.
      await schedule.ref.update({ startTime: new Date(Date.now() - 1000).toISOString() });
    }
    assert.equal(await promotion.processDueSchedules(), 2);
    const worker = require(path.join(root, "src/services/promotionTaskQueue"));
    for (let i = 0; i < 2; i++) {
      const result = await worker.processNextPlatformTask();
      assert.equal(result?.outcome?.success, true, JSON.stringify(result));
    }
    assert.equal(providerDeliveries.length, 2);
    assert.equal(
      providerDeliveries.find(d => d.platform === "telegram").body.chat_id,
      "-1007654321"
    );
    assert(providerDeliveries.find(d => d.platform === "discord").multipart);
    assert.equal(await worker.processNextPlatformTask(), null);
    for (const schedule of schedules.docs) {
      const row = (await schedule.ref.get()).data();
      assert.equal(row.status, "completed");
      assert(row.publicationOutcome?.messageId);
    }
    await page.getByRole("button", { name: "Queue", exact: true }).first().click();
    await page.getByRole("combobox", { name: "Queue period" }).selectOption("all");
    await page.getByText("Community release", { exact: true }).first().waitFor();
    await page.getByText("Published", { exact: true }).first().waitFor();
    assert.equal(
      await page.locator(".schedule-kpis article").nth(1).locator("strong").innerText(),
      "2"
    );
    await page.screenshot({ path: path.join(directory, "queue-community.png"), fullPage: true });
    fs.writeFileSync(
      path.join(directory, "community-browser-summary.json"),
      JSON.stringify(
        {
          actualApp: true,
          authEmulator: true,
          firestoreEmulator: true,
          providerBoundary:
            "controlled Discord consent/API and Telegram API fixtures; no live posts",
          telegramChannelVerifiedInUI: true,
          discordWebhookConsent: true,
          actualPublisherReviewAndSchedule: true,
          schedules: schedules.docs.map(d => ({
            id: d.id,
            platform: d.data().platform,
            destinationId: d.data().platformSpecificSettings?.destinationId,
          })),
          queueWorkerSucceeded: true,
          queueHistoryVisible: true,
          freePlanMultiDestinationRejectionPreserved: true,
          singleDestinationReleases: 2,
          providerDeliveries: providerDeliveries.map(d => ({
            platform: d.platform,
            multipart: d.multipart || false,
          })),
          duplicateWorkerSend: false,
          productionTraffic: false,
        },
        null,
        2
      )
    );
    const after = (await db.collection("users").doc(identity.localId).get()).data();
    for (const key of ["credits", "subscriptionTier", "subscriptionStatus", "role", "isAdmin"])
      assert.deepEqual(after[key], snapshot[key]);
    assert.equal((await admin.auth().getUser(identity.localId)).emailVerified, true);
    fs.writeFileSync(
      path.join(directory, "browser-summary.json"),
      JSON.stringify(
        {
          project,
          productionTraffic: false,
          externalRequestsBlocked: [...new Set(external)],
          actualAppBuild: true,
          registration201: true,
          reloadRemainsLockedBeforeVerification: true,
          unverifiedBackend403: true,
          emailActionAppliedThroughEmulatorLink: true,
          automaticSessionAfterReturn: true,
          verifiedSessionSurvivesReload: true,
          manualVerifiedButtonAbsent: true,
          storedFinancialAndAuthorityFieldsUnchanged: true,
          viewportScreenshots: ["1280x900", "390x844"],
        },
        null,
        2
      ) + "\n"
    );
    console.log(
      "PASS: real App sign-in, destination verification, Discord consent, two Publisher schedules and Queue provider receipts"
    );
  } catch (error) {
    console.log("Browser observations", JSON.stringify(observations));
    if (observedPage) {
      await observedPage
        .screenshot({ path: path.join(directory, "browser-failure.png") })
        .catch(() => {});
      fs.writeFileSync(
        path.join(directory, "browser-failure.html"),
        await observedPage.content().catch(() => "")
      );
    }
    throw error;
  } finally {
    await browser?.close();
    if (server) await new Promise(r => server.close(r));
    await db?.terminate();
    if (admin?.apps.length) await admin.app().delete();
    try {
      await emulator.stop();
    } catch (_) {}
    java.kill("SIGTERM");
  }
}
main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e.stack);
    process.exit(1);
  });
