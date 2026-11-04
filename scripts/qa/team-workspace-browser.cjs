const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");

module.exports = async function teamBrowser({
  page,
  browser,
  origin,
  db,
  admin,
  directory,
  identity,
  authPort,
  project,
  providerDeliveries,
  navigateWorkspace,
}) {
  if (!origin.startsWith("http://127.0.0.1:") || !project.startsWith("demo-"))
    throw new Error("Team browser QA is loopback/demo only");
  console.log("Starting actual Team workspace browser flow");
  // A separate demo paid-owner precondition, after the ordinary free-user
  // financial preservation assertions. No existing/cloud subscription changes.
  await db
    .collection("users")
    .doc(identity.localId)
    .update({
      subscriptionPlan: "pro",
      subscriptionTier: "pro",
      subscriptionStatus: "active",
      subscription: { planId: "pro", status: "active" },
    });
  await db
    .collection("user_billing")
    .doc(identity.localId)
    .set(
      { tier: "pro", subscriptionStatus: "active", subscription: { status: "active" } },
      { merge: true }
    );
  await page.reload();
  await page.locator(".dashboard-root").waitFor();
  await navigateWorkspace("Team");
  await page.getByLabel("Workspace name", { exact: true }).fill("Isolated production team");
  await page.getByRole("button", { name: "Create Workspace", exact: true }).click();
  await page.getByRole("heading", { name: "Isolated production team", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Team production", exact: true }).waitFor();
  await page.getByRole("checkbox", { name: "telegram", exact: true }).check();
  await page.getByRole("checkbox", { name: "discord", exact: true }).check();
  await page.getByRole("button", { name: "Save shared connections", exact: true }).click();
  const workspaceDoc = (
    await db.collection("workspaces").where("ownerUid", "==", identity.localId).get()
  ).docs[0];
  assert.ok(workspaceDoc);
  // Invite through the actual owner form, with an independent verified login.
  await page.locator(".team-management-settings > summary").click();
  await page.getByPlaceholder("teammate@example.com").fill("team-editor@example.test");
  await page.locator(".team-panel form select").selectOption("editor");
  await page.getByRole("button", { name: "Send Invitation", exact: true }).click();
  const inviteInput = page.locator(".team-invite-link input");
  await inviteInput.waitFor();
  const invitation = await inviteInput.inputValue();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ||
      ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  const editor = await context.newPage();
  editor.setDefaultTimeout(30000);
  try {
    await editor.goto(origin);
    await editor
      .getByRole("button", { name: /get started|create.*account|start creating/i })
      .first()
      .click();
    await editor.getByPlaceholder("Enter your full name").fill("Team Editor");
    await editor.getByPlaceholder("Enter your email").fill("team-editor@example.test");
    await editor.getByPlaceholder("Create a password").fill("Isolated-editor-password!24");
    await editor.getByPlaceholder("Confirm your password").fill("Isolated-editor-password!24");
    await editor.getByRole("button", { name: /create autopromote account/i }).click();
    await editor.getByRole("heading", { name: "Verify your email", exact: true }).waitFor();
    let code;
    for (let attempt = 0; attempt < 60 && !code; attempt++) {
      const codes = await (
        await fetch(`http://127.0.0.1:${authPort}/emulator/v1/projects/${project}/oobCodes`)
      ).json();
      code = codes.oobCodes
        .filter(
          item => item.email === "team-editor@example.test" && item.requestType === "VERIFY_EMAIL"
        )
        .at(-1);
      if (!code) await editor.waitForTimeout(250);
    }
    assert.ok(code);
    const verify = await context.newPage();
    await verify.goto(code.oobLink);
    await verify.waitForURL(origin + "/**");
    await verify.close();
    await editor
      .getByRole("heading", { name: "Verify your email", exact: true })
      .waitFor({ state: "hidden", timeout: 60000 });
    console.log("Team QA: independent Editor verified");
    await editor.goto(invitation);
    await editor
      .getByRole("heading", { name: "Isolated production team", exact: true })
      .waitFor({ timeout: 60000 });
    console.log("Team QA: invitation accepted through the actual App");
    assert.equal(await editor.getByRole("button", { name: /^Approve revision/ }).count(), 0);
    assert.equal(
      await editor.getByRole("button", { name: "Save shared connections", exact: true }).count(),
      0
    );
    const editorUser = await admin.auth().getUserByEmail("team-editor@example.test");
    await db
      .collection("content")
      .doc("editor-private-source")
      .set({
        user_id: editorUser.uid,
        title: "Editor private movie",
        description: "Movie for Team review",
        type: "video",
        status: "ready",
        url: `https://storage.googleapis.com/${project}/uploads/videos/${editorUser.uid}/team-movie.mp4`,
        storagePath: `uploads/videos/${editorUser.uid}/team-movie.mp4`,
        created_at: new Date().toISOString(),
        duration: 1,
      });
    // The owner's private file stays outside the Team content list.
    assert.equal(
      (await db.collection("content").doc("community-source").get()).data().workspace_id,
      undefined
    );
    await editor.getByRole("button", { name: "Prepare a team release", exact: true }).click();
    await editor.getByRole("heading", { name: "Publisher", exact: true }).waitFor();
    await editor.getByRole("tab", { name: "Project assets", exact: true }).click();
    await editor.getByRole("button", { name: /Editor private movie/ }).click();
    await editor.getByRole("button", { name: /Choose destinations/ }).click();
    for (const name of [
      "Facebook",
      "Instagram",
      "LinkedIn",
      "Reddit",
      "TikTok",
      "YouTube",
      "Telegram",
      "Discord",
    ]) {
      const checkbox = editor.getByRole("checkbox", { name: new RegExp(name, "i") });
      await checkbox.setChecked(name === "Telegram");
    }
    await editor.getByRole("button", { name: /Customize destinations/ }).click();
    await editor.getByRole("tab", { name: "Telegram", exact: true }).click();
    const select = editor.getByRole("combobox", { name: "telegram publishing destination" });
    await select
      .locator("option")
      .filter({ hasText: "Creator subscribers" })
      .waitFor({ state: "attached" });
    await select.selectOption({
      label: await select
        .locator("option")
        .filter({ hasText: "Creator subscribers" })
        .textContent(),
    });
    await editor.getByRole("button", { name: /Continue to Delivery/ }).click();
    await editor.getByRole("radio", { name: /^After approval/ }).check();
    await editor.getByRole("button", { name: /Review release/ }).click();
    await editor.getByText("Send after approval and scheduling", { exact: true }).waitFor();
    console.log("Team QA: Publisher review ready");
    const sentBefore = providerDeliveries.length;
    await editor.getByRole("button", { name: /Submit for Team review/ }).click();
    await editor
      .getByText("Submitted for Team review. Nothing has been published or scheduled.", {
        exact: true,
      })
      .waitFor();
    assert.equal(providerDeliveries.length, sentBefore);
    assert.equal(
      (
        await db
          .collection("promotion_schedules")
          .where("workspace_id", "==", workspaceDoc.id)
          .get()
      ).size,
      0
    );
    await editor.screenshot({
      path: path.join(directory, "team-editor-submitted-390.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Refresh reviews", exact: true }).click();
    const releaseCard = page
      .locator(".team-release")
      .filter({ has: page.getByRole("heading", { name: "Editor private movie", exact: true }) });
    await releaseCard.getByRole("button", { name: "Approve revision 1", exact: true }).click();
    await releaseCard
      .getByRole("button", { name: "Schedule approved release", exact: true })
      .waitFor();
    // Changing copy visibly clears approval before the final scheduling step.
    await releaseCard.getByRole("button", { name: "Revise release", exact: true }).click();
    await releaseCard
      .getByRole("textbox", { name: /^Release description/ })
      .fill("Reviewed revised copy");
    await releaseCard
      .getByRole("textbox", { name: /^telegram description/ })
      .fill("Reviewed revised copy");
    await releaseCard
      .getByRole("button", { name: "Save revision for review", exact: true })
      .click();
    await releaseCard.getByRole("button", { name: "Approve revision 2", exact: true }).waitFor();
    assert.equal(
      await releaseCard
        .getByRole("button", { name: "Schedule approved release", exact: true })
        .count(),
      0
    );
    await releaseCard.getByRole("button", { name: "Approve revision 2", exact: true }).click();
    await releaseCard
      .getByRole("button", { name: "Schedule approved release", exact: true })
      .click();
    await releaseCard
      .getByText("Scheduled once. View delivery receipts in Queue.", { exact: true })
      .waitFor();
    const schedules = await db
      .collection("promotion_schedules")
      .where("workspace_id", "==", workspaceDoc.id)
      .get();
    assert.equal(schedules.size, 1);
    for (const schedule of schedules.docs)
      await schedule.ref.update({ startTime: new Date(Date.now() - 1000).toISOString() });
    const promotion = require("../../src/promotionService"),
      worker = require("../../src/services/promotionTaskQueue");
    assert.equal(await promotion.processDueSchedules(), 1);
    const result = await worker.processNextPlatformTask();
    assert.equal(result?.outcome?.success, true, JSON.stringify(result));
    assert.equal(providerDeliveries.length, sentBefore + 1);
    assert.equal(providerDeliveries.at(-1).body.caption, "Reviewed revised copy");
    assert.equal(await worker.processNextPlatformTask(), null);
    await page.screenshot({
      path: path.join(directory, "team-approved-history-1280.png"),
      fullPage: true,
    });
    await navigateWorkspace("Queue");
    await page.getByRole("combobox", { name: "Queue period" }).selectOption("all");
    await page.getByText("Editor private movie", { exact: true }).first().waitFor();
    await page.getByText("Published", { exact: true }).first().waitFor();
    assert.equal(
      await page.getByText("Community release", { exact: true }).count(),
      0,
      "Owner personal queue leaked into team"
    );
    // A native-backup fixture is imported through ordinary file controls. The
    // editor, project validator and local save/reopen path remain real.
    await navigateWorkspace("Team");
    await page.getByRole("heading", { name: "Team production", exact: true }).waitFor();
    const sourcePath = `uploads/videos/${identity.localId}/native-team-source.mp4`;
    const sourceUrl = `https://storage.googleapis.com/${project}/${sourcePath}`;
    const originalId = "viral-project-team-ui-source";
    const snapshot = {
      orderedClips: [{ id: "source", start: 0, end: 1 }], selectedClipId: "source",
      timeline: [{ id: "main", sourceClipId: "source", sourceStoragePath: sourcePath, url: sourceUrl, startRequest: 0, endRequest: 1 }],
      projectMedia: [{ id: "source", storagePath: sourcePath, url: sourceUrl, type: "video", status: "ready", duration: 1 }],
      overlays: [{ id: "headline", type: "text", text: "Shared native headline", startTime: 0, duration: 1 }],
    };
    snapshot.studioDocument = require("../../src/generated/studioDirectorReplayKernel.cjs").adaptStudioSnapshotToDocument({ snapshot, projectId: originalId });
    const nativeBackup = { id: originalId, name: "Shared native project", snapshot, versions: [] };
    const original = JSON.stringify(nativeBackup);
    await page.getByLabel("Native project backup", { exact: true }).setInputFiles({ name: "native.autopromote.json", mimeType: "application/json", buffer: Buffer.from(original) });
    const projectCard = page.locator(".team-release").filter({ has: page.getByRole("heading", { name: "Shared native project", exact: true }) });
    await projectCard.getByRole("button", { name: "Check out for editing", exact: true }).click();
    await projectCard.getByText(/Checked out by/).waitFor();
    await page.getByLabel("Native project backup", { exact: true }).setInputFiles({ name: "native.autopromote.json", mimeType: "application/json", buffer: Buffer.from(original) });
    await projectCard.getByText(/Version 2/).first().waitFor();
    await projectCard.getByText("Retained editable versions", { exact: true }).click();
    const downloadEvent = page.waitForEvent("download");
    await projectCard.getByRole("button", { name: "Take editable copy of version 2", exact: true }).click();
    const download = await downloadEvent, copyPath = path.join(directory, "team-personal-copy.autopromote.json");
    await download.saveAs(copyPath);
    const copied = JSON.parse(fs.readFileSync(copyPath));
    assert.notEqual(copied.id, originalId);
    assert.equal(copied.snapshot.studioDocument.projectId, copied.id);
    assert.equal(copied.snapshot.overlays[0].text, "Shared native headline");
    assert.notEqual(copied.snapshot.timeline[0].sourceStoragePath, sourcePath);
    assert.equal(JSON.stringify(nativeBackup), original);
    await page.context().route(`https://storage.googleapis.com/${project}/uploads/**`, route => route.fulfill({ status: 200, contentType: "video/mp4", body: fs.readFileSync(path.join(directory, "source.mp4")) }));
    await navigateWorkspace("Viral Clip Studio");
    await page.getByLabel("Restore project backup", { exact: true }).setInputFiles(copyPath);
    await page.getByRole("button", { name: "Shared native project", exact: true }).click();
    await page.getByTestId("viral-studio-workspace").waitFor();
    await page.getByRole("button", { name: "Show media", exact: true }).click();
    await page.locator(".studio-project-rail__head > summary").click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Shared project — personal edit");
    await page.getByTestId("studio-save-project").click();
    // The compact Studio layout hides its secondary save label. Check the
    // completed state, then independently prove persistence by a cold reopen.
    await page.locator(".studio-project-save-state.is-saved").waitFor({ state: "attached" });
    await page.screenshot({ path: path.join(directory, "team-native-studio-edit.png"), fullPage: true });
    await page.reload();
    await navigateWorkspace("Viral Clip Studio");
    await page.getByRole("button", { name: "Shared project — personal edit", exact: true }).click();
    await page.getByTestId("viral-studio-workspace").waitFor();
    console.log("PASS: actual Team native backup share, checkout/versioning, private copy, Studio import/edit/save and cold reopen");
    fs.writeFileSync(
      path.join(directory, "team-browser-summary.json"),
      JSON.stringify(
        {
          actualApp: true,
          independentNormalVerifiedLogins: true,
          ownerCreatesAndInvites: true,
          editorCannotApprove: true,
          submittedWithoutDispatch: true,
          revisionClearsApproval: true,
          approvedNativeWorkerDelivery: true,
          duplicateSend: false,
          personalQueueIsolated: true,
          nativeProjectShareCheckoutPrivateCopy: true,
          actualStudioImportEditSaveColdReopen: true,
          paidRenderAttempted: false,
          livePosts: 0,
          storageBoundary: "owned metadata and private archive fixture; not live GCS qualification",
        },
        null,
        2
      )
    );
    console.log(
      "PASS: actual Team invite, independent Editor login, Publisher submission, stale approval invalidation, approved worker delivery and isolated Queue"
    );
  } catch (error) {
    await editor
      .screenshot({ path: path.join(directory, "team-browser-failure.png"), fullPage: true })
      .catch(() => {});
    fs.writeFileSync(
      path.join(directory, "team-browser-failure.html"),
      await editor.content().catch(() => "")
    );
    throw error;
  } finally {
    await context.close();
  }
};
