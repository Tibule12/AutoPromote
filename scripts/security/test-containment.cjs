// Disposable local emulators only. Never import the application's Firebase Admin setup.
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { once } = require("events");
const { spawn } = require("child_process");
const { isHostedRuntime } = require("../../src/utils/authAuthority");
async function main() {
  if (isHostedRuntime()) throw new Error("Local containment test only");
  const root = path.resolve(__dirname, "../..");
  const probes = [];
  const ports = [];
  for (let i = 0; i < 5; i++) {
    const server = net.createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    ports.push(server.address().port);
    probes.push(server);
  }
  await Promise.all(probes.map(server => new Promise(resolve => server.close(resolve))));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-security-containment-"));
  try {
    fs.writeFileSync(
      path.join(scratch, "firestore.rules"),
      fs.readFileSync(path.join(root, "config/security/firestore.restrictive-fallback.rules"))
    );
    fs.writeFileSync(
      path.join(scratch, "storage.rules"),
      fs.readFileSync(path.join(root, "config/security/storage.restrictive-fallback.rules"))
    );
    fs.writeFileSync(
      path.join(scratch, "firebase.json"),
      JSON.stringify({
        firestore: { rules: "firestore.rules" },
        storage: { rules: "storage.rules" },
        emulators: {
          firestore: { host: "127.0.0.1", port: ports[0], websocketPort: ports[4] },
          storage: { host: "127.0.0.1", port: ports[1] },
          hub: { host: "127.0.0.1", port: ports[2] },
          logging: { host: "127.0.0.1", port: ports[3] },
          ui: { enabled: false },
          singleProjectMode: true,
        },
      })
    );
    const cli = require.resolve("firebase-tools/lib/bin/firebase");
    const command = [
      process.execPath,
      "--test",
      "--test-concurrency=1",
      path.join(root, "test/security/storage-containment.test.cjs"),
      path.join(root, "test/security/storage-owner-rules.test.cjs"),
    ]
      .map(value => "'" + value.replace(/'/g, "'\\''") + "'")
      .join(" ");
    const env = {
      ...process.env,
      GCLOUD_PROJECT: "demo-autopromote-containment",
      FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
      CHOKIDAR_USEPOLLING: "true",
      CI: "true",
    };
    const firestoreJar =
      process.env.SECURITY_FIRESTORE_JAR ||
      path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar");
    if (fs.existsSync(firestoreJar)) env.FIRESTORE_EMULATOR_BINARY_PATH = firestoreJar;
    if (process.env.SECURITY_JAVA_BIN)
      env.PATH = path.dirname(process.env.SECURITY_JAVA_BIN) + path.delimiter + env.PATH;
    const child = spawn(
      process.execPath,
      [
        cli,
        "emulators:exec",
        "--only",
        "firestore,storage",
        "--project",
        "demo-autopromote-containment",
        "--config",
        path.join(scratch, "firebase.json"),
        command,
      ],
      { cwd: scratch, env, stdio: "inherit" }
    );
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
    const [code] = await once(child, "exit");
    process.exitCode = Number.isInteger(code) ? code : 1;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error("Local containment test failed; inspect emulator diagnostics.");
  process.exitCode = 1;
});
