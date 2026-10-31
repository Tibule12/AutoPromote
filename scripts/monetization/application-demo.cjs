// Owns fresh isolated emulators and the actual App build. No Firebase CLI login.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, fork } = require("node:child_process");
const { once } = require("node:events");
const root = path.resolve(__dirname, "../..");
const project = "demo-autopromote-credits";
async function port() {
  const server = net.createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function main() {
  const localMediaLimits = {
    maxSourceSeconds: Number(process.env.CREDITS_DEMO_SOURCE_SECONDS || 30),
    maxExecutionSeconds: Number(process.env.CREDITS_DEMO_EXECUTION_SECONDS || 120),
  };
  const localTestCredits=Number(process.env.CREDITS_DEMO_TEST_CREDITS || 15);
  if (!Number.isInteger(localTestCredits)||localTestCredits<1||localTestCredits>200)
    throw Error('Fresh local demo allowance must be 1–200 symbolic test credits.');
  if (!Number.isInteger(localMediaLimits.maxSourceSeconds) || localMediaLimits.maxSourceSeconds < 1 || localMediaLimits.maxSourceSeconds > 120 ||
      !Number.isInteger(localMediaLimits.maxExecutionSeconds) || localMediaLimits.maxExecutionSeconds < 1 || localMediaLimits.maxExecutionSeconds > 900)
    throw Error('Local demo media limits must be bounded whole seconds (source <= 120, execution <= 900).');
  const reuse =
    process.argv[2] === "--reuse-build"
      ? JSON.parse(fs.readFileSync(path.join(process.argv[3], "config.json")))
      : null;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-application-demo-"));
  fs.chmodSync(directory, 0o700);
  const [firestorePort, authPort, storagePort, apiPort] = reuse
    ? [
        Number(reuse.env.FIRESTORE_EMULATOR_HOST.split(":")[1]),
        Number(reuse.env.FIREBASE_AUTH_EMULATOR_HOST.split(":")[1]),
        Number(new URL(reuse.storageOrigin).port),
        Number(new URL(reuse.origin).port),
      ]
    : await Promise.all([port(), port(), port(), port()]);
  const origin = `http://127.0.0.1:${apiPort}`;
  const java = process.env.CREDITS_JAVA_BIN || "java";
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      [
        "HOME",
        "PATH",
        "LANG",
        "LC_ALL",
        "TMPDIR",
        "NODE_PATH",
        "CREDITS_JAVA_BIN",
        "CREDITS_FIRESTORE_JAR",
        "CREDITS_PYTHON_BIN",
        "CREDITS_DEMO_EXECUTION_SECONDS",
        "K_SERVICE",
        "FUNCTION_TARGET",
        "RENDER_SERVICE_ID",
        "RENDER_EXTERNAL_HOSTNAME",
        "RENDER",
      ].includes(key)
    )
  );
  const env = {
    ...inherited,
    PATH: `${path.dirname(java)}:${process.env.PATH}`,
    NODE_ENV: "test",
    NODE_PATH: path.resolve(path.dirname(require.resolve("firebase-admin")), "../.."),
    GCLOUD_PROJECT: project,
    GOOGLE_CLOUD_PROJECT: project,
    FIREBASE_STORAGE_BUCKET: project,
    UNIFIED_CREDITS_SANDBOX: "true",
    UNIFIED_CREDITS_PROJECT_ID: project,
    UNIFIED_CREDITS_APPLICATION: "true",
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${storagePort}`,
    STORAGE_EMULATOR_HOST: `http://127.0.0.1:${storagePort}`,
    FIREBASE_CLI_DISABLE_USAGE: "true",
    CHOKIDAR_USEPOLLING: "true",
    CI_ROUTE_IMPORTS: "1",
    ENABLE_BACKGROUND_JOBS: "false",
    NO_VIRAL_OPTIMIZATION: "true",
    OPENAI_LOGGING_ENABLED: "1",
    LOCAL_EDITING_CREDIT_BYPASS: "false",
  };
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "FIREBASE_CONFIG"])
    delete env[key];
  Object.assign(process.env, env);
  require("../../src/services/unifiedCredits/runtime").assertSandbox(env);
  const log = fs.openSync(path.join(directory, "emulators.log"), "a", 0o600);
  const firestore = spawn(
    java,
    [
      "-jar",
      process.env.CREDITS_FIRESTORE_JAR ||
        path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"),
      "--host",
      "127.0.0.1",
      "--port",
      String(firestorePort),
      "--project_id",
      project,
      "--rules",
      path.join(root, "firestore.rules"),
    ],
    { env, cwd: directory, stdio: ["ignore", log, log] }
  );
  const { AuthEmulator } = require("firebase-tools/lib/emulator/auth");
  const { StorageEmulator } = require("firebase-tools/lib/emulator/storage");
  class OwnedStorage extends StorageEmulator {
    getPersistenceTmpDir() {
      return path.join(directory, "storage");
    }
  }
  const auth = new AuthEmulator({
    projectId: project,
    host: "127.0.0.1",
    port: authPort,
    singleProjectMode: 2,
  });
  const storage = new OwnedStorage({
    projectId: project,
    host: "127.0.0.1",
    port: storagePort,
    auto_download: false,
    rules: {
      name: path.join(root, "storage.rules"),
      content: fs.readFileSync(path.join(root, "storage.rules"), "utf8"),
    },
  });
  let worker, api;
  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    api?.kill("SIGTERM");
    const configFile = path.join(directory, "config.json");
    if (fs.existsSync(`${configFile}.api-pid`)) {
      const pid = Number(fs.readFileSync(`${configFile}.api-pid`, "utf8"));
      try {
        const args = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
        if (
          args.includes(configFile) &&
          args.some(value => value.endsWith("/application-host.cjs"))
        )
          process.kill(pid, "SIGTERM");
      } catch {
        /* The owned API is already stopped. */
      }
    }
    await worker?.stop();
    await storage.stop();
    await auth.stop();
    firestore.kill("SIGTERM");
    fs.closeSync(log);
  }
  process.once("SIGINT", () => void stop().then(() => process.exit(0)));
  process.once("SIGTERM", () => void stop().then(() => process.exit(0)));
  try {
    for (let i = 0; i < 150; i++) {
      try {
        if ((await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/`)).ok) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const { EmulatorRegistry } = require("firebase-tools/lib/emulator/registry");
    EmulatorRegistry.set("firestore", {
      getInfo: () => ({ name: "firestore", host: "127.0.0.1", port: firestorePort }),
    });
    await EmulatorRegistry.start(auth);
    await EmulatorRegistry.start(storage);
    const admin = require("firebase-admin");
    admin.initializeApp({
      projectId: project,
      credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) },
    });
    const { createSandboxDatabase } = require("../../src/services/unifiedCredits/runtime");
    const db = createSandboxDatabase();
    const cohort = ["demo-pilot-alice", "demo-pilot-empty"];
    const password = `Demo-${crypto.randomBytes(12).toString("hex")}!`;
    for (const uid of cohort) {
      await admin.auth().createUser({
        uid,
        email: `${uid}@example.test`,
        password,
        emailVerified: true,
        displayName: "Local Pilot",
      });
      await db
        .collection("users")
        .doc(uid)
        .create({
          email: `${uid}@example.test`,
          name: "Local Pilot",
          role: "user",
          subscriptionTier: "free",
          credits: 20,
          emailVerified: true,
          canUpload: true,
          uploadDisabled: false,
          termsAcceptedAt: new Date(),
          kycStatus: "verified",
        });
    }
    worker = await require("./local-worker-provider.cjs").createLocalWorkerProvider({
      directory: path.join(directory, "worker"),
      python:
        process.env.CREDITS_PYTHON_BIN || path.resolve(root, "../AutoPromote/.venv/bin/python"),
      env,
      apiOrigin: origin,
    });
    env.MEDIA_WORKER_URL = env.LOCAL_MEDIA_WORKER_URL = worker.origin;
    const policy = {
      ...JSON.parse(
        fs.readFileSync(path.join(root, "config/unified-credits.sandbox.example.json"))
      ),
      ...JSON.parse(fs.readFileSync(path.join(root, "config/unified-credits.pilot.draft.json"))),
      version: "actual-ui-local-test-v1",
      spendScope: "actual-ui-local-test",
      monthlyCredits: { free: localTestCredits, premium: 150, pro: 500, enterprise: 2000 },
    };
    // Symbolic test prices only; not a recommendation from local CPU measurements.
    for (const item of Object.values(policy.operations)) {
      item.baseMicros = 0;
      item.microsPerUnit = item.unit === "seconds" ? 10 : 1000;
      if (item.unit === 'seconds') item.maxUnits=Math.max(item.maxUnits,localMediaLimits.maxExecutionSeconds);
    }
    const build = reuse?.build || path.join(directory, "build");
    const buildEnv = {
      ...env,
      NODE_ENV: "production",
      BUILD_PATH: build,
      GENERATE_SOURCEMAP: "false",
      CI: "false",
      REACT_APP_API_URL: origin,
      REACT_APP_API_BASE_URL: origin,
      REACT_APP_CREDITS_PILOT: "true",
      REACT_APP_FIREBASE_API_KEY: "demo-api-key",
      REACT_APP_FIREBASE_AUTH_DOMAIN: "127.0.0.1",
      REACT_APP_FIREBASE_PROJECT_ID: project,
      REACT_APP_FIREBASE_STORAGE_BUCKET: project,
      REACT_APP_FIREBASE_MESSAGING_SENDER_ID: "123456789",
      REACT_APP_FIREBASE_APP_ID: "demo-app",
      REACT_APP_CREDITS_AUTH_EMULATOR: `http://127.0.0.1:${authPort}`,
      REACT_APP_CREDITS_FIRESTORE_EMULATOR: `http://127.0.0.1:${firestorePort}`,
      REACT_APP_CREDITS_STORAGE_EMULATOR: `http://127.0.0.1:${storagePort}`,
      REACT_APP_WELCOME_STUDIO_PREVIEW: "true",
    };
    const config = {
      env,
      localMediaLimits,
      cohort,
      origin,
      storageOrigin: `http://127.0.0.1:${storagePort}`,
      build,
      policy,
      sourceSecret: crypto.randomBytes(32).toString("hex"),
      worker: { origin: worker.origin, token: worker.token, publicKey: worker.publicKey },
    };
    const configFile = path.join(directory, "config.json");
    fs.writeFileSync(path.join(directory, "build-env.json"), JSON.stringify(buildEnv), {
      mode: 0o600,
    });
    fs.writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
    const publicInfo = {
      origin,
      directory,
      email: `${cohort[0]}@example.test`,
      password,
      authOrigin: buildEnv.REACT_APP_CREDITS_AUTH_EMULATOR,
    };
    fs.writeFileSync(path.join(directory, "browser-private.json"), JSON.stringify(publicInfo), {
      mode: 0o600,
    });
    console.log(`Private demo directory: ${directory}`);
    const buildLog = fs.openSync(path.join(directory, "build.log"), "a", 0o600);
    const builder = reuse
      ? null
      : spawn(process.execPath, [require.resolve("react-scripts/scripts/build", { paths: [path.join(root, "frontend")] })], {
          env: buildEnv,
          cwd: path.join(root, "frontend"),
          stdio: ["ignore", buildLog, buildLog],
        });
    const [exit] = builder ? await once(builder, "exit") : [0];
    fs.closeSync(buildLog);
    if (exit !== 0)
      throw new Error(`Frontend build failed; inspect private ${directory}/build.log`);
    function startApi() {
      const apiLog = fs.openSync(path.join(directory, "api.log"), "a", 0o600);
      api = fork(path.join(__dirname, "application-host.cjs"), [configFile], {
        env,
        cwd: root,
        stdio: ["ignore", apiLog, apiLog, "ipc"],
      });
      fs.closeSync(apiLog);
      return new Promise((resolve, reject) => {
        api.once("message", resolve);
        api.once("exit", code => reject(new Error(`API exited ${code}; inspect private api.log`)));
      });
    }
    await startApi();
    console.log(`Actual application demo ready: ${origin}`);
    fs.writeFileSync(path.join(directory, "ready.json"), JSON.stringify({ origin }), {
      mode: 0o600,
    });
    process.on("message", async message => {
      if (message === "restart-api") {
        api.kill("SIGTERM");
        await once(api, "exit");
        await startApi();
        process.send?.({ restarted: true });
      }
    });
    await new Promise(resolve => process.once("SIGUSR2", resolve));
  } finally {
    await stop();
  }
}
main().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
