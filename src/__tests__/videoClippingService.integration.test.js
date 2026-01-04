const fs = require("fs").promises;
const path = require("path");
const { spawnSync } = require("child_process");

// Integration test: runs only when RUN_INTEGRATION_CLIP=1
const runIntegration = process.env.RUN_INTEGRATION_CLIP === "1";

// Mock firebaseAdmin to capture saved generated clip metadata and provide analysis doc
jest.mock("../firebaseAdmin", () => {
  const fsPromises = require("fs").promises;
  const path = require("path");
  const os = require("os");
  let savedGeneratedClip = null;
  const db = {
    collection: name => {
      if (name === "clip_analyses") {
        return {
          doc: _id => ({
            get: async () => ({
              exists: true,
              data: () => ({
                userId: "integ-user",
                contentId: "content-integ",
                videoUrl: "https://example.test/video.mp4",
                topClips: [
                  {
                    id: "clip-int-1",
                    start: 0,
                    end: 8,
                    duration: 8,
                    score: 90,
                    platforms: ["tiktok"],
                    captionSuggestion: "Integ caption",
                  },
                ],
              }),
            }),
          }),
        };
      }
      if (name === "generated_clips") {
        return {
          add: async obj => {
            savedGeneratedClip = obj;
            return { id: "gen-1" };
          },
        };
      }
      return { doc: __id => ({ get: async () => ({ exists: false }) }) };
    },
  };

  const storage = {
    bucket: () => ({
      upload: async (src, _opts) => {
        // copy to temp to simulate upload
        const dest = path.join(os.tmpdir(), path.basename(src));
        await fsPromises.copyFile(src, dest);
        return;
      },
      file: () => ({ getSignedUrl: async () => ["https://storage.test/signed-clip.mp4"] }),
    }),
  };

  return { __mocks: { getSavedGeneratedClip: () => savedGeneratedClip }, db, storage };
});

const svc = require("../services/videoClippingService");

// Helper: ensure ffmpeg exists
function ffmpegAvailable() {
  let cp;
  try {
    cp = spawnSync("ffmpeg", ["-version"]);
    return !cp.error && cp.status === 0;
  } catch (e) {
    return false;
  }
}

(runIntegration && ffmpegAvailable() ? test : test.skip)(
  "integration: generate clip end-to-end (requires ffmpeg)",
  async () => {
    // copy a small test asset into place via mocking downloadVideo
    const assetPath = path.resolve(__dirname, "../../../test/e2e/playwright/test-assets/test.mp4");
    jest.spyOn(svc, "downloadVideo").mockImplementation(async (url, destPath) => {
      await fs.copyFile(assetPath, destPath);
    });

    // Run clip generation for the mocked analysis/clip
    const result = await svc.generateClip("analysis-integ", "clip-int-1", { aspectRatio: "9:16" });

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.url).toMatch(/https?:\/\/|file:\/\//);

    const fb = require("../firebaseAdmin");
    const saved = fb.__mocks.getSavedGeneratedClip();
    expect(saved).toBeDefined();
    expect(saved.caption).toContain("Integ");
    expect(saved.platforms).toContain("tiktok");
  }
);
