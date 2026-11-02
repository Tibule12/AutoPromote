// Bounded integration check. Owns a fresh in-memory demo emulator; no cloud credentials.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const project = "demo-autopromote-cost-check";
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${port}`;
  process.env.GCLOUD_PROJECT = project;
  process.env.GOOGLE_CLOUD_PROJECT = project;
  assert.match(project, /^demo-/);
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "autopromote-cost-emulator-"));
  const emulator = spawn(process.env.COST_CHECK_JAVA || "java", [
    "-jar", path.join(os.homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"),
    "--host", "127.0.0.1", "--port", String(port), "--project_id", project,
  ], { cwd: scratch, stdio: "ignore" });
  let app;
  try {
    let ready = false;
    for (let n = 0; n < 150; n++) {
      if (emulator.exitCode !== null) throw new Error("Local emulator exited before readiness");
      try { ready = (await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/`, {
        signal: AbortSignal.timeout(300),
      })).ok; } catch (_) {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, "Local emulator must be ready before SDK initialization");
    const admin = require("firebase-admin");
    const { withCache } = require("../../../src/utils/simpleCache");
    app = admin.initializeApp({ projectId: project }, "cost-check");
    const db = app.firestore();
    await db.collection("notifications").doc("fixture-a").set({ user_id: "fixture-user-a", message: "A" });
    await db.collection("notifications").doc("fixture-b").set({ user_id: "fixture-user-b", message: "B" });
    let queries = 0;
    const load = uid => async () => {
      queries++;
      const result = await db.collection("notifications").where("user_id", "==", uid).limit(10).get();
      return { rows: result.docs.map(d => d.data().message) };
    };
    const results = await Promise.all(Array.from({ length: 10 }, () =>
      withCache("notifications_fixture-user-a_10", 30000, load("fixture-user-a"))));
    assert.equal(queries, 1, "Ten concurrent requests must perform one Firestore query");
    results.forEach(result => assert.deepEqual(result.rows, ["A"]));
    assert.deepEqual((await withCache("notifications_fixture-user-a_10", 30000, load("fixture-user-a"))).rows, ["A"]);
    assert.equal(queries, 1, "A cached repeat must not query Firestore");
    assert.deepEqual((await withCache("notifications_fixture-user-b_10", 30000, load("fixture-user-b"))).rows, ["B"]);
    assert.equal(queries, 2, "A different user must have an independent query");
    fs.writeFileSync(path.join(__dirname, "firestore-emulator-result.json"), JSON.stringify({
      passed: true, project, concurrentRequests: 10, firstUserQueries: 1,
      totalQueriesWithSecondUser: queries, cloudReads: 0,
    }, null, 2) + "\n");
    console.log("PASS: emulator query coalescing, cached repeat, and user isolation; zero cloud reads");
  } finally {
    if (app) await app.delete();
    emulator.kill("SIGTERM");
    if (emulator.exitCode === null) await once(emulator, "exit");
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
