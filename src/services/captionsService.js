// captionsService.js - generate subtitle assets (SRT / VTT) and optional burn-in
// Light first iteration: stores caption text in Firestore asset doc and updates content reference.
// Burn-in (re-encoding) attempted best-effort using fluent-ffmpeg if burnIn=true.

const fs = require("fs");
const path = require("path");
const os = require("os");
const ffmpeg = require("fluent-ffmpeg");
const { db, admin } = require("../firebaseAdmin");

const MAX_CHARS = parseInt(process.env.MAX_CAPTION_CHARS || "5000", 10);

function plainTextToSRT(text) {
  // Naive split by period or newline into segments ~ max 80 chars
  const cleaned = text.replace(/\r/g, "").trim();
  const rawParts = cleaned.split(/\n+|(?<=[.!?])\s+/).filter(Boolean);
  let idx = 1;
  let out = [];
  let timeCursorMs = 0;
  const perWordMs = 350; // heuristic
  rawParts.forEach(segment => {
    const seg = segment.trim();
    if (!seg) return;
    const words = seg.split(/\s+/).length;
    const dur = Math.min(6000, Math.max(1200, words * perWordMs));
    const start = msToTimestamp(timeCursorMs);
    const end = msToTimestamp(timeCursorMs + dur);
    out.push(`${idx++}\n${start} --> ${end}\n${seg}\n`);
    timeCursorMs += dur + 300; // small gap
  });
  return out.join("\n");
}

function plainTextToVTT(text) {
  return (
    "WEBVTT\n\n" +
    plainTextToSRT(text)
      .replace(/^(\d+\n)/gm, "") // remove numeric counters for basic VTT
      .replace(/,/g, ".")
  );
}

function msToTimestamp(ms) {
  const h = Math.floor(ms / 3600000)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((ms % 3600000) / 60000)
    .toString()
    .padStart(2, "0");
  const s = Math.floor((ms % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const cs = Math.floor(ms % 1000)
    .toString()
    .padStart(3, "0");
  return `${h}:${m}:${s},${cs}`;
}

async function createCaptions({ contentId, userId, transcript, format = "srt", burnIn = false }) {
  if (!transcript || typeof transcript !== "string") throw new Error("transcript_required");
  if (transcript.length > MAX_CHARS) transcript = transcript.slice(0, MAX_CHARS);
  format = format.toLowerCase();
  if (!["srt", "vtt", "plain"].includes(format)) format = "srt";
  const contentRef = db.collection("content").doc(contentId);
  const snap = await contentRef.get();
  if (!snap.exists) throw new Error("content_not_found");
  const data = snap.data();
  if (data.user_id && data.user_id !== userId) throw new Error("forbidden");
  if (data.type && data.type !== "video") throw new Error("not_video");

  let srtText;
  if (format === "plain") {
    srtText = plainTextToSRT(transcript);
    format = "srt";
  } else if (format === "srt") {
    srtText = transcript;
  } else if (format === "vtt") {
    srtText = plainTextToVTT(transcript);
  }

  const assetDoc = await db
    .collection("content")
    .doc(contentId)
    .collection("assets")
    .add({
      type: "captions",
      format,
      createdAt: new Date().toISOString(),
      burnInRequested: !!burnIn,
      transcriptLength: transcript.length,
      srt: format === "srt" ? srtText : undefined,
      vtt: format === "vtt" ? srtText : undefined,
    });

  await contentRef.set(
    {
      captions: {
        assetId: assetDoc.id,
        format,
        burnIn: false,
        updatedAt: new Date().toISOString(),
      },
    },
    { merge: true }
  );

  if (burnIn) {
    // async best-effort burn-in
    setImmediate(async () => {
      try {
        const videoUrl = data.url;
        if (!videoUrl) throw new Error("missing_video_url");
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
        const subtitlePath = path.join(tmpDir, `captions.${format === "vtt" ? "vtt" : "srt"}`);
        fs.writeFileSync(subtitlePath, srtText, "utf8");
        const outPath = path.join(tmpDir, "burnin.mp4");
        await new Promise((resolve, reject) => {
          ffmpeg(videoUrl)
            .outputOptions(["-vf", `subtitles='${subtitlePath.replace(/'/g, "\\'")}'`])
            .on("error", reject)
            .on("end", resolve)
            .save(outPath);
        });
        // Upload to storage bucket if configured
        let publicUrl = null;
        try {
          const bucket = admin.storage().bucket();
          const dest = `captions-burnin/${contentId}-${Date.now()}.mp4`;
          await bucket.upload(outPath, { destination: dest, contentType: "video/mp4" });
          const file = bucket.file(dest);
          const [signed] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
          });
          publicUrl = signed;
        } catch (e) {
          // fallback: no storage configured
        }
        await contentRef.set(
          {
            captions: {
              assetId: assetDoc.id,
              format,
              burnIn: true,
              videoWithCaptionsUrl: publicUrl || null,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      } catch (e) {
        await contentRef.set(
          {
            captions: {
              assetId: assetDoc.id,
              format,
              burnIn: false,
              error: e.message,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        );
      }
    });
  }

  return { assetId: assetDoc.id, format, burnInQueued: !!burnIn };
}

module.exports = { createCaptions };
