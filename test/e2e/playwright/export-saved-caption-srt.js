const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const profileDir =
  process.env.FULL_PODCAST_BROWSER_PROFILE ||
  "/home/tibule12/.cache/autopromote-full-podcast-caption-browser";
const outputPath = path.join(
  repoRoot,
  "proof/viral-clip-studio/full-podcast-captions/full-podcast-editable-captions.srt"
);

const toSrtTimestamp = seconds => {
  const time = Math.max(0, Math.round(Number(seconds) * 1000));
  const parts = [
    Math.floor(time / 3600000),
    Math.floor((time % 3600000) / 60000),
    Math.floor((time % 60000) / 1000),
  ];
  return `${parts.map(part => String(part).padStart(2, "0")).join(":")},${String(
    time % 1000
  ).padStart(3, "0")}`;
};

async function main() {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: ["--disable-gpu"],
  });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(process.env.E2E_BASE_URL || "http://localhost:5000", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const captions = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const openRequest = indexedDB.open("autopromote-viral-studio", 1);
          openRequest.onerror = () => reject(openRequest.error);
          openRequest.onsuccess = () => {
            const database = openRequest.result;
            const getRequest = database
              .transaction("projects", "readonly")
              .objectStore("projects")
              .getAll();
            getRequest.onerror = () => reject(getRequest.error);
            getRequest.onsuccess = () => {
              const projects = getRequest.result.sort((a, b) => b.updatedAt - a.updatedAt);
              const project = projects.find(item => item.snapshot?.captionSegments?.length >= 600);
              resolve(project?.snapshot?.captionSegments || []);
            };
          };
        })
    );
    if (captions.length < 600 || !/^Molweni\b/.test(captions[0]?.text || "")) {
      throw new Error("Corrected full-podcast caption project was not found in the QA browser");
    }
    const srt = captions
      .map((cue, index) => {
        const start = Number(cue.start);
        const end = Number(cue.end);
        const text = String(cue.text || "").replace(/\s+/g, " ").trim();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
          throw new Error(`Invalid saved caption cue ${index + 1}`);
        }
        return `${index + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(end)}\n${text}`;
      })
      .join("\n\n");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${srt}\n`, "utf8");
    console.log(`Exported ${captions.length} editable SRT cues to ${outputPath}`);
  } finally {
    await context.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
