// videoClippingService.js
// AI-powered video clipping service (Opus Clip style)
// Analyzes long-form videos and generates viral short clips

const ffmpeg = require("fluent-ffmpeg");
const { db, storage } = require("../firebaseAdmin");
const axios = require("axios");
const { logOpenAIUsage } = require("./openaiUsageLogger");
const { validateUrl, safeFetch } = require("../utils/ssrfGuard");
const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");

class VideoClippingService {
  constructor() {
    this.transcriptionProvider = process.env.TRANSCRIPTION_PROVIDER || "openai"; // 'openai' or 'google'
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.googleCloudKey = process.env.GOOGLE_CLOUD_API_KEY;

    // Log provider status
    if (this.transcriptionProvider === "openai" && !this.openaiApiKey) {
      console.warn(
        "[VideoClipping] ⚠️ OPENAI_API_KEY not configured. Falling back to Google Cloud."
      );
      this.transcriptionProvider = "google";
    }
    if (this.transcriptionProvider === "google" && !this.googleCloudKey) {
      console.warn("[VideoClipping] ⚠️ GOOGLE_CLOUD_API_KEY not configured.");
      console.warn(
        "[VideoClipping] 💡 Add OPENAI_API_KEY or GOOGLE_CLOUD_API_KEY for transcription."
      );
    }
  }

  /**
   * Analyze video and generate clip suggestions
   * @param {string} videoUrl - Firebase Storage URL or public video URL
   * @param {string} contentId - Content document ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Analysis results with clip suggestions
   */
  async analyzeVideo(videoUrl, contentId, userId) {
    try {
      console.log("[VideoClipping] Starting analysis for", contentId);

      // 1. Download video to temp location
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-analysis-"));
      const videoPath = path.join(tempDir, "source.mp4");

      await this.downloadVideo(videoUrl, videoPath);

      // 2. Extract video metadata
      const metadata = await this.extractMetadata(videoPath);
      console.log("[VideoClipping] Video duration:", metadata.duration + "s");

      // 3. Generate transcript
      const transcript = await this.generateTranscript(videoPath);

      // 4. Detect scenes and shot boundaries
      const scenes = await this.detectScenes(videoPath, metadata.duration);

      // 5. Score segments for viral potential
      const scoredSegments = await this.scoreSegments(scenes, transcript, metadata);

      // 6. Generate clip recommendations
      const clipSuggestions = this.generateClipSuggestions(scoredSegments, transcript);

      // 7. Save analysis to Firestore
      const analysisId = crypto.randomBytes(16).toString("hex");
      // Persist a rich topClips payload so downstream `generateClip` can find
      // clips by `id` and access caption/platform suggestions.
      await db
        .collection("clip_analyses")
        .doc(analysisId)
        .create({
          userId,
          contentId,
          videoUrl,
          metadata,
          transcript,
          scenes: scenes.length,
          clipSuggestions: clipSuggestions.length,
          topClips: clipSuggestions.slice(0, 10).map(c => ({
            id: c.id,
            start: c.start,
            end: c.end,
            duration: c.duration,
            score: c.viralScore,
            reason: c.reason,
            platforms: c.platforms || [],
            captionSuggestion: c.captionSuggestion || null,
            text: c.text || "",
          })),
          createdAt: new Date().toISOString(),
          status: "completed",
        });

      // Cleanup temp files
      await fs.rm(tempDir, { recursive: true, force: true });

      return {
        analysisId,
        duration: metadata.duration,
        transcriptLength: transcript.length,
        scenesDetected: scenes.length,
        clipsGenerated: clipSuggestions.length,
        topClips: clipSuggestions.slice(0, 10),
      };
    } catch (error) {
      console.error("[VideoClipping] Analysis failed:", error);
      throw new Error(`Video analysis failed: ${error.message}`);
    }
  }

  /**
   * Download video from URL to local file
   * Protected against SSRF attacks
   */
  async downloadVideo(url, destPath) {
    // Use central SSRF validation helper
    const allowedDomains = [
      "firebasestorage.googleapis.com",
      "storage.googleapis.com",
      "cloudinary.com",
      "cloudfront.net",
    ];

    const v = await validateUrl(url, { requireHttps: true, allowHosts: allowedDomains });
    if (!v.ok) {
      // Map validation failure reasons to friendly errors (keeps previous behavior/messages)
      switch (v.reason) {
        case "insecure_protocol":
        case "invalid_protocol":
          throw new Error("Only HTTPS URLs are allowed");
        case "private_ip":
          throw new Error("Private IP addresses are not allowed");
        case "host_not_whitelisted":
          throw new Error("Only trusted storage domains are allowed");
        case "unresolvable_host":
          throw new Error("Failed to access video URL");
        default:
          throw new Error("Invalid URL");
      }
    }

    // Check port explicitly
    const parsedUrl = new URL(url);
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443;
    if (port !== 443) throw new Error("Invalid port for HTTPS resource");

    // Perform a HEAD preflight using safeFetch (axios.head)
    let headResp = null;
    try {
      headResp = await safeFetch(url, axios.head, {
        requireHttps: true,
        allowHosts: allowedDomains,
        fetchOptions: { timeout: 10000, maxRedirects: 0 },
      });
    } catch (err) {
      if (err.response) {
        headResp = err.response;
      } else {
        // If HEAD fails (e.g., Nock didn't set up HEAD but GET exists), log and continue to GET
        console.warn(
          "[VideoClipping] HEAD check failed, attempting GET anyway:",
          err.message || err
        );
        headResp = null; // allow fallback to streaming GET
      }
    }
    if (headResp && headResp.status >= 300 && headResp.status < 400) {
      const location = headResp.headers && headResp.headers.location;
      if (location) {
        const redirectUrl = new URL(location, url);
        const redirectCheck = await validateUrl(redirectUrl.toString(), {
          requireHttps: true,
          allowHosts: allowedDomains,
        });
        if (!redirectCheck.ok)
          throw new Error("Redirects to private or disallowed hosts are not allowed");
      }
      throw new Error("Redirects are not allowed when downloading video");
    }

    // Validate content-length and content-type
    const contentLength =
      headResp && headResp.headers && headResp.headers["content-length"]
        ? parseInt(headResp.headers["content-length"], 10)
        : null;
    const MAX_BYTES = this.maxDownloadBytes || 400 * 1024 * 1024;
    if (contentLength !== null && contentLength > MAX_BYTES) {
      throw new Error("Video file is too large");
    }
    const contentType = headResp && headResp.headers && headResp.headers["content-type"];
    if (
      contentType &&
      !contentType.startsWith("video/") &&
      contentType !== "application/octet-stream"
    ) {
      throw new Error("Unexpected content type");
    }

    const response = await safeFetch(url, axios.get, {
      requireHttps: true,
      allowHosts: allowedDomains,
      fetchOptions: { responseType: "stream", timeout: 60000, maxRedirects: 0 },
    });
    const writer = require("fs").createWriteStream(destPath);

    // Check the streaming size and abort if it exceeds MAX_BYTES
    let totalBytes = 0;
    let aborted = false;
    response.data.on("data", chunk => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        aborted = true;
        response.data.destroy(new Error("Video file is too large"));
      }
    });
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        if (aborted) return reject(new Error("Video file is too large"));
        resolve();
      });
      writer.on("error", err => reject(err));
      response.data.on("error", err => reject(err));
    });
  }

  /**
   * Extract video metadata using FFmpeg
   */
  extractMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find(s => s.codec_type === "video");
        const audioStream = metadata.streams.find(s => s.codec_type === "audio");

        resolve({
          duration: metadata.format.duration,
          width: videoStream?.width,
          height: videoStream?.height,
          aspectRatio: videoStream ? `${videoStream.width}:${videoStream.height}` : "16:9",
          fps: videoStream ? parseRFrameRate(videoStream.r_frame_rate) : 30,
          hasAudio: !!audioStream,
          fileSize: metadata.format.size,
          bitrate: metadata.format.bit_rate,
        });

        function parseRFrameRate(r) {
          // Accept formats like '30', '30000/1001', '25/1'
          if (!r) return 30;
          if (typeof r === "number") return r;
          const s = String(r).trim();
          if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
          const m = s.match(/^(\d+)\/(\d+)$/);
          if (m) {
            const num = parseFloat(m[1]);
            const den = parseFloat(m[2]);
            if (den === 0) return 30;
            return num / den;
          }
          // Fallback to default
          return 30;
        }
      });
    });
  }

  /**
   * Generate transcript using AI (OpenAI Whisper or Google Speech-to-Text)
   */
  async generateTranscript(videoPath) {
    try {
      // Extract audio from video
      const audioPath = videoPath.replace(".mp4", ".wav");
      await this.extractAudio(videoPath, audioPath);

      let transcript = [];

      if (this.transcriptionProvider === "openai" && this.openaiApiKey) {
        transcript = await this.transcribeWithOpenAI(audioPath);
      } else if (this.transcriptionProvider === "google" && this.googleCloudKey) {
        transcript = await this.transcribeWithGoogle(audioPath);
      } else {
        // Fallback: Return empty transcript with placeholder
        console.warn("[VideoClipping] No transcription API configured, using placeholder");
        transcript = [{ start: 0, end: 60, text: "Transcription not available" }];
      }

      // Cleanup audio file
      await fs.unlink(audioPath).catch(() => {});

      return transcript;
    } catch (error) {
      console.error("[VideoClipping] Transcription failed:", error);
      return [];
    }
  }

  /**
   * Extract audio from video using FFmpeg
   */
  extractAudio(videoPath, audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(audioPath)
        .audioCodec("pcm_s16le")
        .audioFrequency(16000)
        .audioChannels(1)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });
  }

  /**
   * Transcribe audio using OpenAI Whisper API
   */
  async transcribeWithOpenAI(audioPath) {
    try {
      const FormData = require("form-data");
      const formData = new FormData();
      formData.append("file", require("fs").createReadStream(audioPath));
      formData.append("model", "whisper-1");
      formData.append("response_format", "verbose_json");
      formData.append("timestamp_granularities", "word");

      const { audioTranscriptions } = require("./openaiClient");
      const response = await audioTranscriptions(formData, { feature: "transcription" });

      // Convert Whisper format to our format
      const segments = response.segments || response?.data?.segments || [];
      // Log OpenAI usage: record transcription event + size
      try {
        const st = await fs.stat(audioPath).catch(() => null);
        const sizeBytes = st ? st.size : null;
        await logOpenAIUsage({
          feature: "transcription",
          model: "whisper-1",
          usage: { bytes: sizeBytes },
          promptSnippet: null,
        });
      } catch (_) {}
      return segments.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        words: seg.words || [],
      }));
    } catch (error) {
      console.error(
        "[VideoClipping] OpenAI transcription failed:",
        error.response?.data || error.message
      );
      return [];
    }
  }

  /**
   * Transcribe audio using Google Cloud Speech-to-Text
   */
  async transcribeWithGoogle(_audioPath) {
    // Placeholder - implement Google Cloud Speech-to-Text integration
    console.warn("[VideoClipping] Google transcription not yet implemented");
    return [];
  }

  /**
   * Detect scene changes using FFmpeg scene detection
   */
  async detectScenes(videoPath, duration) {
    return new Promise((resolve, _reject) => {
      const scenes = [];
      let lastTimestamp = 0;

      ffmpeg(videoPath)
        .videoFilters("select='gt(scene,0.3)',showinfo")
        .output("/dev/null")
        .on("stderr", line => {
          // Parse FFmpeg output for scene changes
          const match = line.match(/pts_time:([\d.]+)/);
          if (match) {
            const timestamp = parseFloat(match[1]);
            if (timestamp - lastTimestamp > 2) {
              // Min 2 second scenes
              scenes.push({
                start: lastTimestamp,
                end: timestamp,
                duration: timestamp - lastTimestamp,
              });
              lastTimestamp = timestamp;
            }
          }
        })
        .on("end", () => {
          // Add final scene
          if (lastTimestamp < duration) {
            scenes.push({
              start: lastTimestamp,
              end: duration,
              duration: duration - lastTimestamp,
            });
          }
          resolve(scenes);
        })
        .on("error", err => {
          // If scene detection fails, create segments every 10 seconds
          console.warn(
            "[VideoClipping] Scene detection failed, using fixed intervals:",
            err.message
          );
          const fallbackScenes = [];
          for (let i = 0; i < duration; i += 10) {
            fallbackScenes.push({
              start: i,
              end: Math.min(i + 10, duration),
              duration: Math.min(10, duration - i),
            });
          }
          resolve(fallbackScenes);
        })
        .run();
    });
  }

  /**
   * Score video segments for viral potential
   */
  async scoreSegments(scenes, transcript, _metadata) {
    return scenes.map((scene, _index) => {
      // Find transcript segments overlapping this scene
      const sceneTranscript = transcript.filter(
        t =>
          (t.start >= scene.start && t.start < scene.end) ||
          (t.end > scene.start && t.end <= scene.end)
      );

      const text = sceneTranscript.map(t => t.text).join(" ");

      // Calculate viral score (0-100)
      let score = 50; // Base score

      // Hook bonus (first 5 seconds get +20)
      if (scene.start < 5) score += 20;

      // Length penalty/bonus (30-60s is ideal)
      const duration = scene.end - scene.start;
      if (duration >= 30 && duration <= 60) {
        score += 15;
      } else if (duration < 15 || duration > 90) {
        score -= 20;
      }

      // Engagement keywords
      const engagementKeywords = [
        "amazing",
        "incredible",
        "secret",
        "trick",
        "how to",
        "why",
        "never",
        "always",
        "must",
        "need to know",
      ];
      const keywordMatches = engagementKeywords.filter(kw =>
        text.toLowerCase().includes(kw)
      ).length;
      score += keywordMatches * 5;

      // Question detection
      if (text.includes("?")) score += 10;

      // Exclamation detection (enthusiasm)
      const exclamations = (text.match(/!/g) || []).length;
      score += Math.min(exclamations * 3, 15);

      // Word count (good pacing)
      const wordCount = text.split(/\s+/).length;
      if (wordCount >= 50 && wordCount <= 150) score += 10;

      // Clamp score between 0-100
      score = Math.max(0, Math.min(100, score));

      return {
        ...scene,
        transcript: sceneTranscript,
        text,
        viralScore: Math.round(score),
        wordCount,
        hasQuestion: text.includes("?"),
        keywordMatches,
      };
    });
  }

  /**
   * Generate clip suggestions from scored segments
   */
  generateClipSuggestions(scoredSegments, _transcript) {
    const clips = [];

    // Sort segments by viral score
    const topSegments = [...scoredSegments]
      .sort((a, b) => b.viralScore - a.viralScore)
      .slice(0, 20); // Top 20 segments

    topSegments.forEach((segment, _index) => {
      const duration = segment.end - segment.start;

      // Skip very short or very long segments
      if (duration < 10 || duration > 120) return;

      // Determine best clip length
      let clipDuration = duration;
      if (duration > 60) clipDuration = 60; // Cap at 60s
      if (duration < 30) clipDuration = Math.min(45, segment.end); // Extend if too short

      const clipEnd = Math.min(segment.start + clipDuration, segment.end);

      clips.push({
        id: crypto.randomBytes(8).toString("hex"),
        start: segment.start,
        end: clipEnd,
        duration: clipEnd - segment.start,
        viralScore: segment.viralScore,
        text: segment.text,
        transcript: segment.transcript,
        reason: this.getClipReason(segment),
        platforms: this.suggestPlatforms(segment),
        captionSuggestion: this.generateCaption(segment.text),
      });
    });

    return clips.sort((a, b) => b.viralScore - a.viralScore);
  }

  /**
   * Get reason why this clip was suggested
   */
  getClipReason(segment) {
    const reasons = [];

    if (segment.start < 5) reasons.push("Strong hook");
    if (segment.hasQuestion) reasons.push("Engaging question");
    if (segment.keywordMatches > 0) reasons.push("Viral keywords");
    if (segment.wordCount >= 50 && segment.wordCount <= 150) reasons.push("Good pacing");
    if (segment.viralScore > 80) reasons.push("High engagement potential");

    return reasons.length > 0 ? reasons.join(", ") : "Interesting content";
  }

  /**
   * Suggest best platforms for this clip
   */
  suggestPlatforms(segment) {
    const platforms = [];
    const duration = segment.end - segment.start;

    if (duration <= 60) platforms.push("tiktok", "instagram", "youtube-shorts");
    if (duration <= 90) platforms.push("twitter");
    if (duration > 30) platforms.push("linkedin");

    return platforms;
  }

  /**
   * Generate suggested caption from transcript
   */
  generateCaption(text) {
    // Take first sentence or first 100 chars
    const sentences = text.split(/[.!?]/);
    const caption = sentences[0] || text.substring(0, 100);

    return caption.trim() + (caption.length < text.length ? "..." : "");
  }

  /**
   * Generate a specific clip from suggestions
   */
  async generateClip(analysisId, clipId, options = {}) {
    try {
      // Retrieve analysis data
      const analysisDoc = await db.collection("clip_analyses").doc(analysisId).get();
      if (!analysisDoc.exists) {
        throw new Error("Analysis not found");
      }

      const analysis = analysisDoc.data();
      const clip = analysis.topClips.find(c => c.id === clipId);

      if (!clip) {
        throw new Error("Clip not found in analysis");
      }

      // Sanitize clipId to prevent path traversal
      const safeClipId = String(clipId).replace(/[^a-zA-Z0-9-_]/g, "");

      // Download source video
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-gen-"));
      const sourcePath = path.join(tempDir, "source.mp4");
      const outputPath = path.join(tempDir, `clip-${safeClipId}.mp4`);

      await this.downloadVideo(analysis.videoUrl, sourcePath);

      // Generate clip with FFmpeg
      await this.renderClip(sourcePath, outputPath, clip, options);

      // Upload to Firebase Storage
      const bucket = storage.bucket();
      const clipFileName = `clips/${analysis.userId}/${clipId}.mp4`;
      await bucket.upload(outputPath, {
        destination: clipFileName,
        metadata: {
          contentType: "video/mp4",
          metadata: {
            analysisId,
            clipId,
            start: clip.start,
            end: clip.end,
            viralScore: clip.score,
          },
        },
      });

      const file = bucket.file(clipFileName);
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
      });

      // Save clip metadata
      await db.collection("generated_clips").add({
        userId: analysis.userId,
        contentId: analysis.contentId,
        analysisId,
        clipId,
        start: clip.start,
        end: clip.end,
        duration: clip.end - clip.start,
        viralScore: clip.score,
        url,
        reason: clip.reason,
        platforms: clip.platforms,
        caption: clip.captionSuggestion,
        createdAt: new Date().toISOString(),
      });

      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });

      return {
        success: true,
        clipId,
        url,
        duration: clip.end - clip.start,
      };
    } catch (error) {
      console.error("[VideoClipping] Clip generation failed:", error);
      throw error;
    }
  }

  /**
   * Render clip using FFmpeg with effects
   */
  async renderClip(sourcePath, outputPath, clip, options) {
    const tempSrtPath = outputPath.replace(".mp4", ".srt");

    try {
      return await new Promise(async (resolve, reject) => {
        let command = ffmpeg(sourcePath)
          .setStartTime(clip.start)
          .setDuration(clip.end - clip.start);

        const videoFilters = [];
        const audioFilters = [];

        // Apply aspect ratio conversion if requested
        if (options.aspectRatio === "9:16") {
          // Smart crop to center (could require face detection coords in future)
          // Scale first, then crop
          // TUNE: Using 720p (720x1280) instead of 1080p to fit within Cloud Function timeout limits and ensure completion
          videoFilters.push("scale=720:1280:force_original_aspect_ratio=increase");
          videoFilters.push("crop=720:1280");
        }

        // TUNE: Add Dynamic Audio Normalization for professional "viral" loudness
        audioFilters.push("dynaudnorm");

        // CRITICAL: Add captions BEFORE changing speed/tempo.
        // If we change speed first, the video timestamps shrink, but the SRT file
        // still has original timestamps, causing massive desync.
        if (options.addCaptions && clip.transcript && clip.transcript.length > 0) {
          try {
            const srtContent = this.generateSRT(clip.transcript, clip.start);

            // SECURITY: Ensure we use the resolved absolute path to prevent traversal/confusion
            const absoluteSrtPath = path.resolve(tempSrtPath);

            await fs.writeFile(absoluteSrtPath, srtContent);

            // Escape path for ffmpeg (windows paths can be tricky).
            // CodeQL Fix: "Incomplete string escaping or encoding"
            // We use a robust escaping strategy for FFmpeg filter graph syntax.
            // 1. Normalize backslashes to forward slashes (safe for FFmpeg on all OS)
            let srtPathEscaped = absoluteSrtPath.replace(/\\/g, "/");

            // 2. Escape colons (filter separator) and single quotes (string delimiter)
            // Note: In a filter string like "subtitles='path'", the path is singly-quoted.
            // To represent a literal ' inside, we use the sequence: '\'
            // To represent a literal : inside, we escape it as \:
            srtPathEscaped = srtPathEscaped.replace(/:/g, "\\\\:").replace(/'/g, "'\\\\''");

            // Use 'Sans' instead of 'Arial' for better Linux/Cloud compatibility
            // Quote the path string for safety against spaces/special chars
            videoFilters.push(
              `subtitles='${srtPathEscaped}':force_style='FontName=Sans,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=20'`
            );
          } catch (err) {
            console.error("[VideoClipping] Failed to generate subtitles:", err);
          }
        }

        // Apply Tempo/Speed LAST (Memetic Composer feature)
        if (options.tempo && options.tempo !== 1.0) {
          // video speed = 1/tempo (setpts), audio speed = tempo (atempo)
          videoFilters.push(`setpts=${1 / options.tempo}*PTS`);
          audioFilters.push(`atempo=${options.tempo}`);
        }

        if (videoFilters.length > 0) {
          command = command.videoFilters(videoFilters);
        }

        if (audioFilters.length > 0) {
          command = command.audioFilters(audioFilters);
        }

        command
          .output(outputPath)
          .videoCodec("libx264")
          .audioCodec("aac")
          .outputOptions(["-preset fast", "-crf 23"])
          .on("end", async () => {
            // Cleanup temp srt
            try {
              await fs.unlink(tempSrtPath).catch(() => {});
            } catch (e) {
              /* ignore */
            }
            resolve();
          })
          .on("error", err => {
            // Cleanup temp srt
            fs.unlink(tempSrtPath).catch(() => {});
            reject(err);
          })
          .run();
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Helper to generate SRT content from transcript
   */
  generateSRT(transcript, offsetTime) {
    let srt = "";
    transcript.forEach((entry, index) => {
      // Each entry ideally has words. If not, we use the segment text.
      // If we have detailed word-level timestamps, we use them.
      // Fallback to segment level if entry.words is missing.

      const items = entry.words || [{ start: entry.start, end: entry.end, word: entry.text }];

      items.forEach((wordItem, wordIndex) => {
        // Adjust time relative to clip start
        const relativeStart = Math.max(0, wordItem.start - offsetTime);
        const relativeEnd = Math.max(0, wordItem.end - offsetTime);

        // Skip if word is outside the clip range
        if (relativeEnd <= 0) return;

        const startTime = this.formatSRTTime(relativeStart);
        const endTime = this.formatSRTTime(relativeEnd);

        // Simple sequential index
        srt += `${index * 1000 + wordIndex + 1}\n`;
        srt += `${startTime} --> ${endTime}\n`;
        srt += `${wordItem.word}\n\n`;
      });
    });
    return srt;
  }

  /**
   * Format seconds to SRT time string (HH:MM:SS,ms)
   */
  formatSRTTime(seconds) {
    const pad = (num, size) => ("000" + num).slice(size * -1);
    const date = new Date(seconds * 1000);
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hours, 2)}:${pad(mins, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
  }
}

module.exports = new VideoClippingService();
