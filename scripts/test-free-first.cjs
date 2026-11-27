const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
(async () => {
  const probe = net.createServer().listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-free-first-"));
  const env = {
    ...process.env,
    NODE_ENV: "test",
    CHOKIDAR_USEPOLLING: "true",
    UNIFIED_CREDITS_SANDBOX: "true",
    UNIFIED_CREDITS_PROJECT_ID: "demo-autopromote-credits",
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}`,
  };
  const emulator = spawn(
    process.env.CREDITS_JAVA_BIN || "java",
    [
      "-jar",
      path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--project_id",
      env.UNIFIED_CREDITS_PROJECT_ID,
      "--rules",
      path.resolve("firestore.rules"),
    ],
    { env, cwd: scratch, stdio: ["ignore", "pipe", "pipe"] }
  );
  const emulatorExit = once(emulator, "exit");
  let log = "";
  for (const stream of [emulator.stdout, emulator.stderr])
    stream.on("data", b => {
      log = (log + b).slice(-10000);
    });
  try {
    let ready = false;
    for (let n = 0; n < 150; n++) {
      try {
        ready = (
          await fetch(`http://${env.FIRESTORE_EMULATOR_HOST}/`, {
            signal: AbortSignal.timeout(500),
          })
        ).ok;
      } catch {}
      if (ready) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!ready) throw Error(log);
    const files = fs
      .readdirSync("test/free-first")
      .filter(f => f.endsWith(".test.cjs"))
      .filter(f => !process.argv.includes("--infrastructure-only") || ["infrastructure-waste.test.cjs","storage-transfer.test.cjs"].includes(f))
      .filter(f => !process.argv.includes("--storage-transfer-only") || f === "storage-transfer.test.cjs")
      .map(f => "test/free-first/" + f);
    const args = process.argv.includes("--browser")
      ? ["scripts/free-first-browser.cjs"]
      : ["--test", "--test-concurrency=1", ...files];
    const tests = spawn(process.execPath, args, { env, stdio: "inherit", cwd: process.cwd() });
    const [code] = await once(tests, "exit");
    process.exitCode = code;
  } finally {
    emulator.kill("SIGTERM");
    await emulatorExit;
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
