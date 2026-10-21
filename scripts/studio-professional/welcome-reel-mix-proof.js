#!/usr/bin/env node
// Native Sound revision of the verified first welcome film; all picture decisions retained.
const fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict"),
  { chromium } = require("playwright");
const root = path.resolve(__dirname, "../.."),
  folder = path.join(root, "reports/welcome-studio-reel-20261021/proof");
Object.assign(process.env, {
  STUDIO_TEMPLATE_PROOF_DIR: folder,
  STUDIO_KINETIC_PROOF_DIR: folder,
  STUDIO_QA_RENDER_OBSERVATION_BUDGET_MS: "1800000",
  STUDIO_QA_UPLOAD_BUDGET_MS: "300000",
  STUDIO_QA_NATIVE_DOWNLOAD_METHOD: "playwright",
  STUDIO_QA_TIMELINE_HEIGHT: "420",
  STUDIO_QA_HIDE_MEDIA: "1",
});
const h = require("../creative-templates/studio-proof"),
  q = require("../../test/e2e/playwright/studio-stability/run"),
  { pause, seek, range } = require("./kinetic-type-proof"),
  { hash } = require("../../src/creativeTemplates/contract");
Object.assign(process.env, {
  STUDIO_QA_EXPECTED_WIDTH: "1280",
  STUDIO_QA_EXPECTED_HEIGHT: "720",
  STUDIO_QA_EXPORT_FPS: "24",
});
async function backup(p) {
  await h.rail(p);
  const c = p.getByLabel("Include saved versions in backup", { exact: true });
  if (await c.isChecked()) await c.uncheck();
  const d = p.waitForEvent("download");
  await p.getByRole("button", { name: "Download project backup", exact: true }).click();
  await (await d).saveAs(path.join(folder, "FROM-THE-FRAME-SELECTED.autopromote.json"));
  fs.chmodSync(path.join(folder, "FROM-THE-FRAME-SELECTED.autopromote.json"), 0o600);
}
async function main() {
  const action = process.argv[2] || "mix",
    browser = await chromium.launch({
      channel: "chromium",
      headless: true,
      args: [
        "--mute-audio",
        "--host-resolver-rules=MAP localhost 127.0.0.6",
        "--no-proxy-server",
        "--disable-http2",
        "--disable-quic",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=9847",
      ],
    });
  const context = await browser.newContext({
      storageState: require("../creative-templates/studio-session").sessionPath,
      viewport: { width: 1920, height: 1440 },
      acceptDownloads: true,
    }),
    p = await context.newPage();
  p.setDefaultTimeout(90000);
  let renders = 0,
    writes = 0;
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("request", r => {
    const n = new URL(r.url()).pathname;
    if (r.method() === "POST" && n === "/api/media/process") renders++;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(r.method()) &&
      /^\/api\/(content|publisher|platform)\//.test(n)
    )
      writes++;
  });
  p.on("response", async r => {
    if (
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === "/api/media/process" &&
      r.ok()
    ) {
      fs.mkdirSync(path.join(folder, "selected"), { recursive: true });
      fs.writeFileSync(
        path.join(folder, "selected/submission.json"),
        JSON.stringify(await r.json(), null, 2),
        { mode: 0o600 }
      );
    }
  });
  try {
    await p.goto("http://localhost:5000/", { waitUntil: "domcontentloaded" });
    await p
      .getByRole("button", { name: "Viral Clip Studio", exact: true })
      .click({ timeout: 120000 });
    assert(!(await p.evaluate(() => !!window.__E2E_BYPASS)));
    const input = path.join(
        folder,
        action === "restore"
          ? "FROM-THE-FRAME-SELECTED.autopromote.json"
          : "FROM-THE-FRAME.autopromote.json"
      ),
      b = JSON.parse(fs.readFileSync(input));
    await p.waitForFunction(
      () => document.querySelector('[aria-label="Restore project backup"]')?.disabled === false
    );
    await p.getByLabel("Restore project backup", { exact: true }).setInputFiles(input);
    await p
      .getByRole("region", { name: "Saved Studio projects", exact: true })
      .getByRole("button", { name: b.name, exact: true })
      .click();
    await h.rail(p);
    await pause(p);
    const before = await h.save(
      p,
      action === "restore" ? "selected-fresh-restored" : "mix-baseline"
    );
    assert.equal(hash(before.snapshot.studioDocument), hash(b.snapshot.studioDocument));
    if (action === "restore") {
      const receipt = JSON.parse(
        fs.readFileSync(path.join(folder, "selected/render-receipt.json"))
      );
      assert.equal(hash(before.snapshot.studioDocument), receipt.projectHash);
      fs.writeFileSync(
        path.join(folder, "selected/fresh-restore.json"),
        JSON.stringify(
          {
            canonicalHash: receipt.projectHash,
            exactIndependentRestore: true,
            backupSha256: hash(fs.readFileSync(input)),
            matchesSelectedOutput: true,
          },
          null,
          2
        )
      );
    } else {
      assert(!fs.existsSync(path.join(folder, "selected/submission.json")));
      await q.tool(p, "Sound");
      for (const source of ["music", "sfx"]) {
        await p.getByLabel("Automation source", { exact: true }).selectOption(source);
        await seek(p, 0);
        const add = p.getByRole("button", { name: /^◆ Add volume keyframe at/ });
        const stamp = (await add.innerText()).match(/at ([\d.]+)s/)[1];
        await add.click();
        await range(p.getByLabel(`${source} volume at ${stamp} seconds`, { exact: true }), 190);
      }
      const after = await h.save(p, "mix-raised");
      const clean = v =>
        Array.isArray(v)
          ? v.map(clean)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v)
                  .filter(
                    ([k]) =>
                      !["url", "src", "file", "previewUrl", "signedUrl", "blobUrl"].includes(k)
                  )
                  .map(([k, x]) => [k, clean(x)])
              )
            : v;
      const fields = [
        "timeline",
        "orderedClips",
        "overlays",
        "mainTransform",
        "mainFrame",
        "motionKeyframes",
        "motionScenes",
        "speedKeyframes",
        "finishFx",
        "finishKeyframes",
        "reframeAspect",
        "smartCrop",
        "reframeKeyframes",
        "videoFit",
        "compoundClips",
        "graphicLayerOrder",
        "compositionOrder",
        "captionSegments",
        "addHook",
        "hookDarkOverlay",
        "brandWatermark",
      ];
      const picture = s =>
        hash(Object.fromEntries(fields.filter(k => k in s).map(k => [k, clean(s[k])])));
      assert.equal(picture(before.snapshot), picture(after.snapshot));
      await p.reload();
      await p.getByRole("button", { name: "Viral Clip Studio", exact: true }).click();
      await p
        .getByRole("region", { name: "Saved Studio projects", exact: true })
        .getByRole("button", { name: after.name, exact: true })
        .click();
      await h.rail(p);
      await pause(p);
      const cold = await h.save(p, "mix-raised-cold");
      assert.equal(hash(cold.snapshot.studioDocument), hash(after.snapshot.studioDocument));
      fs.writeFileSync(
        path.join(folder, "mix-revision.json"),
        JSON.stringify(
          {
            beforeCanonicalHash: hash(before.snapshot.studioDocument),
            selectedCanonicalHash: hash(cold.snapshot.studioDocument),
            pictureDecisionsUnchanged: true,
            pictureHash: picture(cold.snapshot),
            nativeMusicAndSfxGainPercent: 190,
            exactColdReopen: true,
            firstMixLufs: -21.4,
            firstMixTruePeakDb: -7,
            firstOutputPreserved: true,
          },
          null,
          2
        )
      );
      await h.render(p, "selected");
      await require("../creative-templates/materials-editing-proof").view(p, "selected");
      await backup(p);
    }
    assert.equal(renders, action === "restore" ? 0 : 1);
    assert.equal(writes, 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(folder, `selected/${action}-verification.json`),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          renders,
          publishingWrites: writes,
          errors,
          normalAuthenticatedUi: true,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error(e.stack);
    await p
      .screenshot({ path: path.join(folder, `mix-failure-${Date.now()}.png`) })
      .catch(() => {});
    console.error("Native browser retained on CDP 9847; no render resubmission.");
    await p.waitForTimeout(30 * 60000);
    throw e;
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(e => {
  console.error(e.stack);
  process.exitCode = 1;
});
