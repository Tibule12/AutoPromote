// Read-only export from this owned local emulator. No production credentials.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function main() {
  const directory = process.argv[2];
  const config = JSON.parse(fs.readFileSync(path.join(directory, "config.json")));
  Object.assign(process.env, config.env);
  const {
    createSandboxDatabase,
    assertSandbox,
  } = require("../../src/services/unifiedCredits/runtime");
  const db = createSandboxDatabase();
  assertSandbox(process.env, db);
  const { OAuth2Client } = require("google-auth-library");
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: "owner", expiry_date: Date.now() + 3600000 });
  const bucket = new (require("@google-cloud/storage").Storage)({
    projectId: "demo-autopromote-credits",
    authClient: auth,
  }).bucket("demo-autopromote-credits");
  const target = path.join(directory, "retained-evidence");
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  try {
    const documents = {};
    async function collection(ref) {
      for (const doc of (await ref.get()).docs) {
        documents[doc.ref.path] = doc.data();
        for (const nested of await doc.ref.listCollections()) await collection(nested);
      }
    }
    for (const ref of await db.listCollections()) await collection(ref);
    fs.writeFileSync(path.join(target, "demo-firestore.json"), JSON.stringify(documents), {
      mode: 0o600,
    });
    const media = [];
    for (const file of (await bucket.getFiles())[0]) {
      const [meta] = await file.getMetadata(),
        [bytes] = await file.download();
      const sha256 = hash(bytes);
      fs.writeFileSync(path.join(target, sha256), bytes, { mode: 0o600 });
      media.push({
        storagePath: file.name,
        sha256,
        bytes: bytes.length,
        contentType: meta.contentType,
        generation: meta.generation,
        metadata: meta.metadata,
      });
    }
    fs.writeFileSync(path.join(target, "demo-media.json"), JSON.stringify(media), { mode: 0o600 });
    const executions = [];
    for (const folder of fs
      .readdirSync(path.join(directory, "worker"))
      .filter(name => /^[a-f0-9]{64}$/.test(name))) {
      const receipt = path.join(directory, "worker", folder, "receipt.json");
      if (!fs.existsSync(receipt)) {
        executions.push({ executionId: folder, state: "unknown" });
        continue;
      }
      const envelope = JSON.parse(fs.readFileSync(receipt));
      const expected = JSON.parse(
        fs.readFileSync(path.join(directory, "worker", folder, "request.json"))
      ).expected;
      const proof =
        require("../../src/services/unifiedCredits/workerVerification").verifyLocalProcessEnvelope(
          envelope,
          expected,
          fs.readFileSync(path.join(directory, "worker/public-key.pem"))
        );
      executions.push({
        executionId: proof.executionId,
        operationId: proof.operationId,
        endpoint: proof.endpoint,
        state: proof.state,
        exitCode: proof.exitCode,
        processTerminated: proof.processTerminated,
        sourceHash: proof.sourceHash,
        inputBytes: proof.sources.reduce((sum, source) => sum + source.size, 0),
        outputBytes: proof.output?.bytes || 0,
        outputHash: proof.output?.sha256 || null,
        resource: proof.resource,
        finishedAt: proof.finishedAt,
      });
    }
    const wallets = Object.entries(documents)
      .filter(([name]) => name.startsWith("credits_v2_wallets/"))
      .map(([, value]) => ({
        userId: value.userId,
        balance: value.balance,
        reserved: value.reserved,
        totals: value.totals,
      }));
    const operations = Object.entries(documents)
      .filter(([name]) => name.startsWith("credits_v2_operations/"))
      .map(([name, value]) => ({
        operationId: name.split("/")[1],
        operation: value.operation,
        state: value.state,
        credits: value.credits,
      }));
    const financial = Object.entries(documents)
      .filter(([name]) => /^users\/[^/]+$/.test(name))
      .map(([name, value]) => ({
        userId: name.split("/")[1],
        credits: value.credits,
        role: value.role,
        tier: value.subscriptionTier,
      }));
    const summary = {
      recordedAt: new Date().toISOString(),
      project: "demo-autopromote-credits",
      locality: "loopback-only",
      paidWorkloadsStarted: false,
      invoiceCostsAvailable: false,
      cloudPricingQualified: false,
      mediaBytesRetained: media.reduce((sum, item) => sum + item.bytes, 0),
      wallets,
      operations,
      executions,
      legacyFinancialFields: financial,
      legacyCreditUsageDocuments: Object.keys(documents).filter(name =>
        /^credit_(usage|refunds)\//.test(name)
      ).length,
    };
    fs.writeFileSync(path.join(target, "public-summary.json"), JSON.stringify(summary, null, 2), {
      mode: 0o600,
    });
    console.log(
      `Exported ${operations.length} operations and ${media.length} real media objects to the private demo evidence directory.`
    );
  } finally {
    await db.terminate();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
