// Native UI only. No browser session fabrication, graph injection or API mocks.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const {
  clickStudioControl,
  assertStudioTimelineLayout,
} = require("../../test/e2e/playwright/studio-timeline-layout");
async function main() {
  const directory = process.argv[2],
    phase = process.argv[3] || "studio";
  const config = JSON.parse(fs.readFileSync(path.join(directory, "browser-private.json")));
  const state = path.join(directory, "browser-state.json");
  const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    ...(fs.existsSync(state) && phase !== "restore" && !process.argv.includes("--fresh")
      ? { storageState: state }
      : {}),
    recordVideo: { dir: path.join(directory, "recordings") },
  });
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", error => console.log("BROWSER_ERROR", error.message));
  page.on("response", response => {
    if (response.status() >= 400 && response.url().includes("/api/"))
      console.log("HTTP", response.status(), new URL(response.url()).pathname);
  });
  page.on("dialog", dialog => void dialog.accept());
  const text = () => page.locator("body").innerText();
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await fetch(config.origin, { signal: AbortSignal.timeout(1000) })).ok) break;
      } catch {
        /* API restart. */
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    await page.goto(config.origin);
    await page.waitForTimeout(1500); // Let normal Firebase persisted sign-in resolve.
    await page
      .getByRole("button", { name: "Sign In", exact: true })
      .or(page.getByTestId("shared-credit-balance"))
      .first()
      .waitFor();
    if (await page.getByRole("button", { name: "Sign In", exact: true }).isVisible()) {
      await page
        .getByRole("button", { name: "Sign In", exact: true })
        .click()
        .catch(async error => {
          if (!(await page.getByTestId("shared-credit-balance").count())) throw error;
        });
      if (await page.locator("#login-email").count()) {
        await page.locator("#login-email").fill(config.email);
        await page.locator("#login-password").fill(config.password);
        await page.locator("input[type=checkbox]").check();
        await page.locator("form button[type=submit]").click();
      }
    }
    await page.getByTestId("shared-credit-balance").waitFor();
    await page.waitForFunction(() =>
      /^\d+$/.test(
        document.querySelector('[data-testid="shared-credit-balance"]')?.textContent || ""
      )
    );
    const beforeBalance = Number(await page.getByTestId("shared-credit-balance").innerText());
    if (phase.startsWith("studio")) {
      await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
      await page.waitForTimeout(500); // Existing IndexedDB project listing.
      const saved = page.getByRole("button", {
        name: "Credit lifecycle local project",
        exact: true,
      });
      if (await saved.count()) await saved.click();
      else if (
        phase === "studio-zero" &&
        (await page
          .getByRole("button", { name: "Zero credit recovery project", exact: true })
          .count())
      )
        await page
          .getByRole("button", { name: "Zero credit recovery project", exact: true })
          .click();
      else {
        await page
          .locator(".creator-studio-dropzone input[type=file]")
          .setInputFiles(path.join(directory, "source.mp4"));
        await page.getByRole("button", { name: "Open Creator Studio", exact: true }).click();
      }
      await page.locator(".viral-studio-container").waitFor({ timeout: 30000 });
      if (await page.getByRole("button", { name: "Show media", exact: true }).count())
        await page.getByRole("button", { name: "Show media", exact: true }).click();
      const projectName = page.getByRole("textbox", {
        name: "Project name",
        exact: true,
        includeHidden: true,
      });
      await clickStudioControl(page, projectName);
      const title =
        phase === "studio-zero" ? "Zero credit recovery project" : "Credit lifecycle local project";
      await projectName.fill(title);
      if (phase === "studio-zero") {
        await clickStudioControl(page, page.getByRole("button", { name: "Graphics", exact: true }));
        await page.getByRole("button", { name: /H1 Headline Bold hook copy/ }).click();
        await page
          .getByRole("textbox", { name: "Title text", exact: true })
          .fill("Saved at zero credits");
      }
      await page.getByTestId("studio-save-project").click();
      await page.waitForTimeout(1200);
      await assertStudioTimelineLayout(page, phase);
      if (phase === "studio-zero") {
        if (beforeBalance !== 0)
          throw new Error("Zero-credit workflow requires an actually exhausted wallet");
        const workerCount = fs
          .readdirSync(path.join(directory, "worker"))
          .filter(name => /^[a-f0-9]{64}$/.test(name)).length;
        const backup = page.waitForEvent("download");
        await page.getByRole("button", { name: "Download project backup", exact: true }).click();
        await (await backup).saveAs(path.join(directory, "zero-project.autopromote.json"));
        await page.reload();
        await page.getByTestId("shared-credit-balance").waitFor();
        await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
        await page.getByRole("button", { name: title, exact: true }).click();
        await page.locator(".viral-studio-container").waitFor();
        await clickStudioControl(page, page.getByRole("button", { name: "Export", exact: true }));
        const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
        if (await dismiss.count()) await dismiss.click();
        await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
        await page
          .getByText(/Not enough credits\. Your project is safe/)
          .first()
          .waitFor();
        if (await page.getByRole("dialog", { name: "Studio export", exact: true }).count())
          throw new Error("Unaffordable operation requested consent");
        if (
          fs.readdirSync(path.join(directory, "worker")).filter(name => /^[a-f0-9]{64}$/.test(name))
            .length !== workerCount
        )
          throw new Error("Zero credits dispatched work");
        console.log("ZERO_CREDIT_SAVE_BACKUP_COLD_REOPEN_AND_DENIED_RENDER_PASSED");
      } else if (phase !== "studio-save") {
        const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
        if (await dismiss.count()) await dismiss.click();
        const exportControl = page.getByRole("button", { name: "Export", exact: true });
        if (await exportControl.count()) await clickStudioControl(page, exportControl);
        console.log("BEFORE_RENDER", (await text()).slice(-4500));
        await page.getByRole("button", { name: /^(Render Final Clip|Render Again)$/ }).click();
        const modal = page.getByRole("dialog", { name: "Studio export", exact: true });
        await modal.waitFor({ timeout: 15000 });
        await page.screenshot({ path: path.join(directory, `${phase}-consent.png`) });
        const workerDirectory = path.join(directory, "worker");
        const previousExecutions = new Set(fs.readdirSync(workerDirectory));
        if (phase === "studio-failure")
          fs.writeFileSync(path.join(workerDirectory, "fail-after-render"), "1", { mode: 0o600 });
        await modal
          .getByRole("button", { name: phase === "studio-cancel" ? "Keep editing" : /^Approve / })
          .click();
        if (["studio-restart", "studio-failure"].includes(phase)) {
          let execution;
          for (let attempt = 0; attempt < 100; attempt++) {
            execution = fs
              .readdirSync(workerDirectory)
              .find(
                name =>
                  !previousExecutions.has(name) &&
                  fs.existsSync(path.join(workerDirectory, name, "process.json"))
              );
            if (execution) break;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (!execution || fs.existsSync(path.join(workerDirectory, execution, "receipt.json")))
            throw new Error("Expected an actual running worker");
          if (phase === "studio-restart") {
            const restarted = await require("./restart-demo-api.cjs").restartDemoApi(directory);
            fs.writeFileSync(
              path.join(directory, "restart-observation.json"),
              JSON.stringify({ execution, ...restarted }),
              { mode: 0o600 }
            );
            await page.reload();
            await page.getByTestId("shared-credit-balance").waitFor();
            await page
              .getByRole("button", { name: "Viral Clip Studio", exact: true })
              .first()
              .click();
            await page
              .getByRole("button", { name: "Credit lifecycle local project", exact: true })
              .click();
            await page.locator(".viral-studio-container").waitFor();
            await clickStudioControl(
              page,
              page.getByRole("button", { name: "Export", exact: true })
            );
          } else {
            const receipt = path.join(workerDirectory, execution, "receipt.json");
            for (let attempt = 0; attempt < 1500 && !fs.existsSync(receipt); attempt++)
              await new Promise(resolve => setTimeout(resolve, 100));
            const expected = JSON.parse(
              fs.readFileSync(path.join(workerDirectory, execution, "request.json"))
            ).expected;
            const proof =
              require("../../src/services/unifiedCredits/workerVerification").verifyLocalProcessEnvelope(
                JSON.parse(fs.readFileSync(receipt)),
                expected,
                fs.readFileSync(path.join(workerDirectory, "public-key.pem"))
              );
            if (
              proof.state !== "failed" ||
              !fs.existsSync(path.join(workerDirectory, execution, "retained-0.mp4"))
            )
              throw new Error("Late failure must follow real canonical CPU rendering");
          }
        }
        if (phase !== "studio-cancel") {
          if (phase === "studio-failure") {
            await page.waitForFunction(
              before =>
                Number(
                  document.querySelector('[data-testid="shared-credit-balance"]')?.textContent
                ) === before &&
                document.querySelector(".credit-pilot summary")?.textContent.includes("0 held"),
              beforeBalance,
              { timeout: 150000 }
            );
            console.log("VERIFIED_FAILURE_REFUND", beforeBalance);
          } else {
            await page
              .getByRole("button", { name: "Download Rendered Clip", exact: true })
              .waitFor({ timeout: 150000 });
            const download = page.waitForEvent("download");
            await page.getByRole("button", { name: "Download Rendered Clip", exact: true }).click();
            await (await download).saveAs(path.join(directory, `${phase}-final.mp4`));
            await page.waitForTimeout(4000); // Full matching three-second finished playback, muted.
          }
        }
      }
    } else if (phase === "restore") {
      if (beforeBalance !== 0) throw new Error("Restore must be tested with exhausted credits");
      await page.getByRole("button", { name: "Viral Clip Studio", exact: true }).first().click();
      await page
        .getByLabel("Restore project backup", { exact: true })
        .setInputFiles(path.join(directory, "zero-project.autopromote.json"));
      await page.getByRole("button", { name: "Zero credit recovery project", exact: true }).click();
      await page.locator(".viral-studio-container").waitFor({ timeout: 30000 });
      await page.getByRole("button", { name: "Show media", exact: true }).click();
      await clickStudioControl(
        page,
        page.getByRole("textbox", { name: "Project name", exact: true, includeHidden: true })
      );
      if (
        (await page.getByRole("textbox", { name: "Project name", exact: true }).inputValue()) !==
        "Zero credit recovery project"
      )
        throw new Error("Restored the wrong project");
      await assertStudioTimelineLayout(page, "independent-zero-credit-restore");
      await page.getByTestId("studio-save-project").click();
      console.log("INDEPENDENT_BACKUP_RESTORE_AT_ZERO_PASSED");
    } else if (phase === "scan") {
      await page.getByRole("button", { name: "Find Viral Clips", exact: true }).first().click();
      console.log("SCAN_START", (await text()).slice(-3000));
      console.log(
        "FILES",
        await page
          .locator('input[type="file"]')
          .evaluateAll(nodes =>
            nodes.map(node => ({ accept: node.accept, label: node.getAttribute("aria-label") }))
          )
      );
      await page
        .locator('input[type="file"][accept*="video"]')
        .first()
        .setInputFiles(path.join(directory, "source.mp4"));
      await page.getByRole("button", { name: /Analyse video/ }).click();
      const modal = page.getByRole("dialog", { name: "Find Viral Clips analysis", exact: true });
      await modal.waitFor();
      await modal.getByRole("button", { name: /^Approve / }).click();
      await page
        .getByRole("button", { name: /Create clip/ })
        .first()
        .waitFor({ timeout: 150000 });
    } else if (phase === "publisher") {
      await page.getByRole("button", { name: "Publisher", exact: true }).first().click();
      await page.getByRole("tab", { name: "Upload", exact: true }).click();
      await page
        .getByLabel("Upload release media", { exact: true })
        .setInputFiles(path.join(directory, "source.mp4"));
      await page.getByRole("button", { name: /Choose destinations →/ }).click();
      await page.getByRole("checkbox", { name: /Facebook/ }).check();
      await page.locator(".release-footer .release-primary").click();
      await page.getByLabel("Master title", { exact: true }).fill("Local shared-credit release");
      await page
        .getByLabel("Master description", { exact: true })
        .fill("Isolated local delivery only. No platform publication.");
      console.log("PUBLISH_CUSTOMIZE", (await text()).slice(-4000));
      const pageSelect = page
        .locator("select")
        .filter({ has: page.locator('option[value="local-page"]') });
      if (await pageSelect.count()) await pageSelect.selectOption("local-page");
      await page.locator(".release-footer .release-primary").click();
      console.log("PUBLISH_DELIVERY", (await text()).slice(-3000));
      await page.locator(".release-footer .release-primary").click();
      await page.locator(".release-footer .release-primary").click();
      const modal = page.getByRole("dialog", { name: "Publisher release", exact: true });
      await modal.waitFor();
      await modal.getByRole("button", { name: /^Approve / }).click();
      await page.waitForFunction(
        before =>
          Number(document.querySelector('[data-testid="shared-credit-balance"]')?.textContent) ===
            before - 1 &&
          document.querySelector(".credit-pilot summary")?.textContent.includes("0 held"),
        beforeBalance,
        { timeout: 40000 }
      );
      await page.reload();
      await page.getByTestId("shared-credit-balance").waitFor();
      await page.getByRole("button", { name: "Queue", exact: true }).first().click();
      await page.getByLabel("Queue period", { exact: true }).selectOption("all");
      await page.waitForTimeout(1500);
    } else if (phase === "queue") {
      await page.getByRole("button", { name: "Queue", exact: true }).first().click();
      await page.getByLabel("Queue period", { exact: true }).selectOption("all");
      await page.locator(".schedule-calendar-card").filter({ hasText: "Paused" }).first().click();
      await page
        .locator(".schedule-destination-toggle")
        .filter({ hasText: "Paused" })
        .first()
        .click();
      await page.getByRole("button", { name: "Resume destination", exact: true }).first().click();
      const modal = page.getByRole("dialog", { name: "Queue delivery", exact: true });
      await modal.waitFor();
      await modal.getByRole("button", { name: /^Approve / }).click();
      await page.waitForFunction(
        before =>
          Number(document.querySelector('[data-testid="shared-credit-balance"]')?.textContent) ===
            before - 1 &&
          document.querySelector(".credit-pilot summary")?.textContent.includes("0 held"),
        beforeBalance,
        { timeout: 40000 }
      );
      await page.reload();
      await page.getByTestId("shared-credit-balance").waitFor();
      await page.getByRole("button", { name: "Queue", exact: true }).first().click();
      await page.getByLabel("Queue period", { exact: true }).selectOption("all");
    }
    await page.waitForTimeout(1000);
    console.log("UI", (await text()).slice(-6500));
    await page.screenshot({ path: path.join(directory, `${phase}.png`) });
  } finally {
    console.log("FINAL_UI", (await text()).slice(-1800));
    await page.screenshot({ path: path.join(directory, `${phase}-final.png`) });
    await Promise.race([
      context.storageState({ path: state, indexedDB: true }),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
    const recording = await page.video()?.path();
    await context.close();
    if (recording)
      fs.writeFileSync(
        path.join(directory, `${phase}-recording.json`),
        JSON.stringify({ phase, recording: path.basename(recording) }),
        { mode: 0o600 }
      );
    await browser.close();
  }
}
main().catch(error => {
  console.error(error.stack);
  process.exitCode = 1;
});
