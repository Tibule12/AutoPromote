#!/usr/bin/env node
// Revise the real title masks and frame through Studio inspectors. Preserve draft.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = path.resolve("reports/daily-studio/2026-10-17/editable-reveal"),
  folder = path.join(base, "proof/refinement");
fs.mkdirSync(folder, { recursive: true });
Object.assign(process.env, {
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_TIMELINE_HEIGHT: "560",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const { pause, seek } = require("../studio-professional/kinetic-type-proof"),
  h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run"),
  { hash } = require("../../src/creativeTemplates/contract"),
  { chromium } = require("playwright");
const config = JSON.parse(fs.readFileSync(path.join(base, "config.json"))),
  name = "Split type — balanced bands",
  output = "editable-reveal";
async function backup(page, file) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download project backup", exact: true }).click();
  await (await pending).saveAs(path.join(folder, file));
}
async function main() {
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
    args: ["--mute-audio", "--host-resolver-rules=MAP localhost 127.0.0.1"],
  });
  const context = await browser.newContext({
    storageState: path.resolve(
      "reports/studio-platform-packaging-20261016/proof/publisher-session.private.json"
    ),
    viewport: { width: 1920, height: 1200 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  let submissions = 0;
  page.on("request", r => {
    if (new URL(r.url()).pathname === "/api/media/process") submissions++;
  });
  try {
    const prepare = process.argv[2] === "prepare",
      viewOnly = process.argv[2] === "view";
    await page.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
    );
    await page
      .getByLabel("Restore project backup", { exact: true })
      .setInputFiles(
        prepare
          ? path.join(base, "proof", config.backupName)
          : path.join(folder, viewOnly ? config.backupName : "prepared.autopromote.json")
      );
    await page
      .getByRole("button", { name: prepare ? config.projectName : name, exact: true })
      .click();
    await h.rail(page);
    await pause(page);
    if (prepare) {
      assert(
        !fs.existsSync(path.join(folder, "native-refinement.json")),
        "Preserve the prepared revision"
      );
      const original = await h.save(page, "original");
      await page.getByRole("button", { name: "Duplicate", exact: true }).first().click();
      await page.waitForFunction(() =>
        document.querySelector('[aria-label="Project name"]')?.value.endsWith(" copy")
      );
      await page.getByLabel("Project name", { exact: true }).fill(name);
      await q.tool(page, "Composite");
      console.log("Native duplicate open; revising three mask paths");
      for (const [i, [top, bottom]] of [
        [0, [0, 44]],
        [1, [43, 57]],
        [2, [56, 100]],
      ]) {
        await page
          .locator(".advanced-inspector-body select")
          .first()
          .selectOption({ label: `01 / REVEAL band ${i + 1}` });
        const input = page.getByLabel("Mask polygon path", { exact: true });
        await input.fill(`polygon(0% ${top}%, 100% ${top}%, 100% ${bottom}%, 0% ${bottom}%)`);
        await input.press("Enter");
      }
      await q.tool(page, "Motion");
      await page.getByRole("button", { name: "Logo & layers", exact: true }).click();
      console.log("Three native masks changed; increasing the frame margin");
      const target = page.locator(".advanced-inspector-body select").first();
      await target.selectOption({ label: "05 / final frame" });
      await page.getByLabel("Motion layer height", { exact: true }).fill("80");
      const saved = await h.save(page, "refined");
      assert.notEqual(saved.id, original.id);
      assert.equal(saved.snapshot.motionKeyframes.length, 48);
      assert.equal(saved.snapshot.overlays.find(o => o.name === "05 / final frame").height, 80);
      await page.reload();
      await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
      await page.getByRole("button", { name, exact: true }).click();
      await h.rail(page);
      await pause(page);
      const reopened = await h.save(page, "reopened");
      assert.equal(hash(saved.snapshot.studioDocument), hash(reopened.snapshot.studioDocument));
      for (const t of [0.15, 1, 2, 5.5, 7.5]) {
        await seek(page, t);
        await page.waitForTimeout(350);
        await page
          .getByTestId("hook-preview-frame")
          .screenshot({ path: path.join(folder, `live-${t}.png`) });
      }
      await h.rail(page);
      await backup(page, "prepared.autopromote.json");
      fs.writeFileSync(
        path.join(folder, "native-refinement.json"),
        JSON.stringify(
          {
            at: new Date().toISOString(),
            projectId: saved.id,
            originalProjectId: original.id,
            originalPreserved: true,
            nativeMaskPathEdits: 3,
            nativeFrameHeightEdit: true,
            keys: 48,
            exactColdReopen: true,
            graphInjection: false,
          },
          null,
          2
        )
      );
    } else {
      if (viewOnly) {
        const completed = JSON.parse(
            fs.readFileSync(path.join(folder, output, "native-render-completed.json"))
          ),
          file = path.join(folder, "observed-completion-identity.json");
        fs.writeFileSync(
          file,
          JSON.stringify({
            projectId: completed.projectId,
            projectHash: completed.projectHash,
            submittedJobId: completed.submittedJobId,
            outputSha256: completed.serverOutputSha256,
          }),
          { mode: 0o600 }
        );
        await q.tool(page, "Export");
        await page.getByLabel("Restore export receipt", { exact: true }).setInputFiles(file);
      } else {
        assert(
          !fs.existsSync(path.join(folder, `${output}-render-request.private.json`)),
          "Accepted export already exists; recover it before retrying"
        );
        await h.render(page, output);
      }
      await q.tool(page, "Export");
      await page.getByTestId("rendered-output-ready").waitFor();
      const timeline = page.getByTestId("studio-pro-timeline");
      await timeline.getByRole("button", { name: "Composition layers", exact: true }).click();
      const filter = timeline.getByRole("button", { name: "At playhead", exact: true });
      if ((await filter.getAttribute("aria-pressed")) !== "true") await filter.click();
      await require("../creative-templates/materials-editing-proof").view(page, output);
      await h.rail(page);
      await pause(page);
      await backup(page, config.backupName);
      const project = JSON.parse(fs.readFileSync(path.join(folder, config.backupName))),
        receipt = JSON.parse(fs.readFileSync(path.join(folder, output, "render-receipt.json")));
      assert.equal(hash(project.snapshot.studioDocument), receipt.projectHash);
      fs.writeFileSync(
        path.join(folder, "native-backup.json"),
        JSON.stringify(
          {
            projectId: project.id,
            canonicalHash: receipt.projectHash,
            normalStudioBackupDownload: true,
          },
          null,
          2
        )
      );
    }
    assert.equal(submissions, prepare || viewOnly ? 0 : 1);
  } catch (e) {
    await page.screenshot({ path: path.join(folder, "failure.png") }).catch(() => {});
    fs.writeFileSync(
      path.join(folder, "failure.private.txt"),
      await page.locator("body").innerText(),
      { mode: 0o600 }
    );
    throw e;
  } finally {
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
