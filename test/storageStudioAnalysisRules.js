const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");

(async () => {
  const environment = await initializeTestEnvironment({
    projectId: "demo-studio-analysis-rules",
    storage: { rules: fs.readFileSync(path.join(__dirname, "../storage.rules"), "utf8") },
  });
  try {
    const privatePaths = [
      "temp/studio-analysis/alice/job.mp4",
      "studio/analysis-results/alice/job/result.json",
    ];
    for (const objectPath of privatePaths) {
      await environment.withSecurityRulesDisabled(context =>
        context.storage().ref(objectPath).putString("server bytes")
      );
      for (const uid of ["alice", "bob"]) {
        const storage = environment.authenticatedContext(uid).storage();
        storage.setMaxOperationRetryTime(3000);
        storage.setMaxUploadRetryTime(3000);
        const reference = storage.ref(objectPath);
        await assertFails(reference.getMetadata());
        await assertFails(reference.putString("client overwrite"));
        await assertFails(reference.parent.listAll());
      }
    }
    const ordinary = environment.authenticatedContext("alice").storage().ref("other/alice.txt");
    await assertSucceeds(ordinary.putString("ordinary upload"));
    await assertSucceeds(ordinary.getMetadata());
    console.log("Studio analysis storage rules: private paths denied, ordinary upload preserved");
  } finally {
    await environment.cleanup();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
