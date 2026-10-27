// Local-only preexisting owned Queue item. Never a provider receipt or balance edit.
const fs = require("node:fs");
const path = require("node:path");
async function main() {
  const config = JSON.parse(fs.readFileSync(path.join(process.argv[2], "config.json")));
  Object.assign(process.env, config.env);
  const {
    createSandboxDatabase,
    assertSandbox,
  } = require("../../src/services/unifiedCredits/runtime");
  const db = createSandboxDatabase();
  assertSandbox(process.env, db);
  try {
    const content = (
      await db.collection("content").where("user_id", "==", config.cohort[0]).limit(1).get()
    ).docs[0];
    if (!content) throw new Error("Publish an owned demo source first");
    const id = "demo-preexisting-paused";
    const ref = db.collection("promotion_schedules").doc(id);
    if (!(await ref.get()).exists)
      await ref.create({
        contentId: content.id,
        user_id: config.cohort[0],
        platform: "facebook",
        frequency: "once",
        startTime: new Date(Date.now() - 60000).toISOString(),
        timezone: "UTC",
        status: "pending",
        isActive: false,
        createdAt: new Date().toISOString(),
        platformSpecificSettings: { pageId: "local-page" },
        budget: 0,
        localDeliveryOnly: true,
      });
    console.log("Created/retained one paused owned demo Queue fixture; balances unchanged.");
  } finally {
    await db.terminate();
  }
}
main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
