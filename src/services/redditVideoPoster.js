const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { publishingError } = require("./publishingTaskErrors");
const run = promisify(execFile);

async function createRedditVideoPoster(videoBuffer) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "autopromote-reddit-poster-"));
  try {
    const input = path.join(directory, "source.mp4");
    const output = path.join(directory, "poster.png");
    await fs.writeFile(input, videoBuffer, { mode: 0o600 });
    let ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
    if (!process.env.FFMPEG_PATH) {
      try {
        ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
      } catch (_) {}
    }
    await run(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        input,
        "-frames:v",
        "1",
        "-vf",
        "scale=min(1280\\,iw):-2",
        "-threads",
        "1",
        output,
      ],
      { timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    return await fs.readFile(output);
  } catch (_) {
    throw publishingError(
      "Reddit needs a real video poster. Frame extraction failed; supply a thumbnail before retrying.",
      "validation"
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

module.exports = { createRedditVideoPoster };
