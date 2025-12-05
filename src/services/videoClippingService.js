// videoClippingService.js
// AI-powered video clipping service (Opus Clip style)
// Analyzes long-form videos and generates viral short clips

const ffmpeg = require('fluent-ffmpeg');
const { db, storage } = require('../firebaseAdmin');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class VideoClippingService {
  constructor() {
    this.transcriptionProvider = process.env.TRANSCRIPTION_PROVIDER || 'openai'; // 'openai' or 'google'
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.googleCloudKey = process.env.GOOGLE_CLOUD_API_KEY;
    
    // Log provider status
    if (this.transcriptionProvider === 'openai' && !this.openaiApiKey) {
      console.warn('[VideoClipping] ⚠️ OPENAI_API_KEY not configured. Falling back to Google Cloud.');
      this.transcriptionProvider = 'google';
    }
    if (this.transcriptionProvider === 'google' && !this.googleCloudKey) {
      console.warn('[VideoClipping] ⚠️ GOOGLE_CLOUD_API_KEY not configured.');
      console.warn('[VideoClipping] 💡 Add OPENAI_API_KEY or GOOGLE_CLOUD_API_KEY for transcription.');
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
      console.log(`[VideoClipping] Starting analysis for ${contentId}`);
      
      // 1. Download video to temp location
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-analysis-'));
      const videoPath = path.join(tempDir, 'source.mp4');
      
      await this.downloadVideo(videoUrl, videoPath);

      // 2. Extract video metadata
      const metadata = await this.extractMetadata(videoPath);
      console.log(`[VideoClipping] Video duration: ${metadata.duration}s`);

      // 3. Generate transcript
      const transcript = await this.generateTranscript(videoPath);
      
      // 4. Detect scenes and shot boundaries
      const scenes = await this.detectScenes(videoPath, metadata.duration);
      
      // 5. Score segments for viral potential
      const scoredSegments = await this.scoreSegments(scenes, transcript, metadata);
      
      // 6. Generate clip recommendations
      const clipSuggestions = this.generateClipSuggestions(scoredSegments, transcript);

      // 7. Save analysis to Firestore
      const analysisId = crypto.randomBytes(16).toString('hex');
      await db.collection('clip_analyses').doc(analysisId).create({
        userId,
        contentId,
        videoUrl,
        metadata,
        transcript,
        scenes: scenes.length,
        clipSuggestions: clipSuggestions.length,
        topClips: clipSuggestions.slice(0, 10).map(c => ({
          start: c.start,
          end: c.end,
          score: c.viralScore,
          reason: c.reason
        })),
        createdAt: new Date().toISOString(),
        status: 'completed'
      });

      // Cleanup temp files
      await fs.rm(tempDir, { recursive: true, force: true });

      return {
        analysisId,
        duration: metadata.duration,
        transcriptLength: transcript.length,
        scenesDetected: scenes.length,
        clipsGenerated: clipSuggestions.length,
        topClips: clipSuggestions.slice(0, 10)
      };

    } catch (error) {
      console.error('[VideoClipping] Analysis failed:', error);
      throw new Error(`Video analysis failed: ${error.message}`);
    }
  }

  /**
   * Download video from URL to local file
   * Protected against SSRF attacks
   */
  async downloadVideo(url, destPath) {
    // Validate URL to prevent SSRF attacks
    const parsedUrl = new URL(url);
    
    // Only allow HTTPS protocol
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Only HTTPS URLs are allowed');
    }
    
    // Block private/internal IP ranges
    const hostname = parsedUrl.hostname;
    const blockedHosts = [
      'localhost', '127.0.0.1', '0.0.0.0',
      /^10\..*/, /^172\.(1[6-9]|2[0-9]|3[01])\..*/, /^192\.168\..*/,
      /^169\.254\..*/, /^::1$/, /^fc00:.*/, /^fe80:.*/
    ];
    
    if (blockedHosts.some(blocked => 
      typeof blocked === 'string' ? hostname === blocked : blocked.test(hostname)
    )) {
      throw new Error('Access to private networks is not allowed');
    }
    
    // Only allow Firebase Storage and trusted CDN domains
    const allowedDomains = [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'cloudinary.com',
      'cloudfront.net'
    ];
    
    if (!allowedDomains.some(domain => hostname.endsWith(domain))) {
      throw new Error('Only trusted storage domains are allowed');
    }
    
    // SSRF protection: Validate URL protocol to prevent SSRF attacks
    const urlProtocol = parsedUrl.protocol;
    if (urlProtocol !== 'https:' && urlProtocol !== 'http:') {
      throw new Error('Only HTTP/HTTPS protocols are allowed');
    }
    
    // Additional SSRF protection: prevent private IP ranges
    const privateIpPattern = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|::1|fc00:|fe80:)/;
    if (privateIpPattern.test(hostname)) {
      throw new Error('Private IP addresses are not allowed');
    }
    
    // Using axios with strict domain and protocol checking
    const response = await axios.get(url, { 
      responseType: 'stream',
      timeout: 60000, // 60s timeout
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
      // Prevent redirects to private IPs
      beforeRedirect: (options) => {
        const redirectHost = new URL(options.href).hostname;
        if (privateIpPattern.test(redirectHost)) {
          throw new Error('Redirect to private IP blocked');
        }
      }
    });
    const writer = require('fs').createWriteStream(destPath);
    
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * Extract video metadata using FFmpeg
   */
  extractMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(err);
        
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        
        resolve({
          duration: metadata.format.duration,
          width: videoStream?.width,
          height: videoStream?.height,
          aspectRatio: videoStream ? `${videoStream.width}:${videoStream.height}` : '16:9',
          fps: videoStream ? eval(videoStream.r_frame_rate) : 30,
          hasAudio: !!audioStream,
          fileSize: metadata.format.size,
          bitrate: metadata.format.bit_rate
        });
      });
    });
  }

  /**
   * Generate transcript using AI (OpenAI Whisper or Google Speech-to-Text)
   */
  async generateTranscript(videoPath) {
    try {
      // Extract audio from video
      const audioPath = videoPath.replace('.mp4', '.wav');
      await this.extractAudio(videoPath, audioPath);

      let transcript = [];

      if (this.transcriptionProvider === 'openai' && this.openaiApiKey) {
        transcript = await this.transcribeWithOpenAI(audioPath);
      } else if (this.transcriptionProvider === 'google' && this.googleCloudKey) {
        transcript = await this.transcribeWithGoogle(audioPath);
      } else {
        // Fallback: Return empty transcript with placeholder
        console.warn('[VideoClipping] No transcription API configured, using placeholder');
        transcript = [{ start: 0, end: 60, text: 'Transcription not available' }];
      }

      // Cleanup audio file
      await fs.unlink(audioPath).catch(() => {});

      return transcript;
    } catch (error) {
      console.error('[VideoClipping] Transcription failed:', error);
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
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .audioChannels(1)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  /**
   * Transcribe audio using OpenAI Whisper API
   */
  async transcribeWithOpenAI(audioPath) {
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', require('fs').createReadStream(audioPath));
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities', 'word');

      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        maxBodyLength: Infinity
      });

      // Convert Whisper format to our format
      const segments = response.data.segments || [];
      return segments.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        words: seg.words || []
      }));
    } catch (error) {
      console.error('[VideoClipping] OpenAI transcription failed:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Transcribe audio using Google Cloud Speech-to-Text
   */
  async transcribeWithGoogle(audioPath) {
    // Placeholder - implement Google Cloud Speech-to-Text integration
    console.warn('[VideoClipping] Google transcription not yet implemented');
    return [];
  }

  /**
   * Detect scene changes using FFmpeg scene detection
   */
  async detectScenes(videoPath, duration) {
    return new Promise((resolve, reject) => {
      const scenes = [];
      let lastTimestamp = 0;

      ffmpeg(videoPath)
        .videoFilters('select=\'gt(scene,0.3)\',showinfo')
        .output('/dev/null')
        .on('stderr', (line) => {
          // Parse FFmpeg output for scene changes
          const match = line.match(/pts_time:([\d.]+)/);
          if (match) {
            const timestamp = parseFloat(match[1]);
            if (timestamp - lastTimestamp > 2) { // Min 2 second scenes
              scenes.push({
                start: lastTimestamp,
                end: timestamp,
                duration: timestamp - lastTimestamp
              });
              lastTimestamp = timestamp;
            }
          }
        })
        .on('end', () => {
          // Add final scene
          if (lastTimestamp < duration) {
            scenes.push({
              start: lastTimestamp,
              end: duration,
              duration: duration - lastTimestamp
            });
          }
          resolve(scenes);
        })
        .on('error', (err) => {
          // If scene detection fails, create segments every 10 seconds
          console.warn('[VideoClipping] Scene detection failed, using fixed intervals:', err.message);
          const fallbackScenes = [];
          for (let i = 0; i < duration; i += 10) {
            fallbackScenes.push({
              start: i,
              end: Math.min(i + 10, duration),
              duration: Math.min(10, duration - i)
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
  async scoreSegments(scenes, transcript, metadata) {
    return scenes.map((scene, index) => {
      // Find transcript segments overlapping this scene
      const sceneTranscript = transcript.filter(t => 
        (t.start >= scene.start && t.start < scene.end) ||
        (t.end > scene.start && t.end <= scene.end)
      );

      const text = sceneTranscript.map(t => t.text).join(' ');
      
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
      const engagementKeywords = ['amazing', 'incredible', 'secret', 'trick', 'how to', 'why', 'never', 'always', 'must', 'need to know'];
      const keywordMatches = engagementKeywords.filter(kw => text.toLowerCase().includes(kw)).length;
      score += keywordMatches * 5;

      // Question detection
      if (text.includes('?')) score += 10;

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
        hasQuestion: text.includes('?'),
        keywordMatches
      };
    });
  }

  /**
   * Generate clip suggestions from scored segments
   */
  generateClipSuggestions(scoredSegments, transcript) {
    const clips = [];

    // Sort segments by viral score
    const topSegments = [...scoredSegments]
      .sort((a, b) => b.viralScore - a.viralScore)
      .slice(0, 20); // Top 20 segments

    topSegments.forEach((segment, index) => {
      const duration = segment.end - segment.start;
      
      // Skip very short or very long segments
      if (duration < 10 || duration > 120) return;

      // Determine best clip length
      let clipDuration = duration;
      if (duration > 60) clipDuration = 60; // Cap at 60s
      if (duration < 30) clipDuration = Math.min(45, segment.end); // Extend if too short

      const clipEnd = Math.min(segment.start + clipDuration, segment.end);

      clips.push({
        id: crypto.randomBytes(8).toString('hex'),
        start: segment.start,
        end: clipEnd,
        duration: clipEnd - segment.start,
        viralScore: segment.viralScore,
        text: segment.text,
        reason: this.getClipReason(segment),
        platforms: this.suggestPlatforms(segment),
        captionSuggestion: this.generateCaption(segment.text)
      });
    });

    return clips.sort((a, b) => b.viralScore - a.viralScore);
  }

  /**
   * Get reason why this clip was suggested
   */
  getClipReason(segment) {
    const reasons = [];
    
    if (segment.start < 5) reasons.push('Strong hook');
    if (segment.hasQuestion) reasons.push('Engaging question');
    if (segment.keywordMatches > 0) reasons.push('Viral keywords');
    if (segment.wordCount >= 50 && segment.wordCount <= 150) reasons.push('Good pacing');
    if (segment.viralScore > 80) reasons.push('High engagement potential');

    return reasons.length > 0 ? reasons.join(', ') : 'Interesting content';
  }

  /**
   * Suggest best platforms for this clip
   */
  suggestPlatforms(segment) {
    const platforms = [];
    const duration = segment.end - segment.start;

    if (duration <= 60) platforms.push('tiktok', 'instagram', 'youtube-shorts');
    if (duration <= 90) platforms.push('twitter');
    if (duration > 30) platforms.push('linkedin');

    return platforms;
  }

  /**
   * Generate suggested caption from transcript
   */
  generateCaption(text) {
    // Take first sentence or first 100 chars
    const sentences = text.split(/[.!?]/);
    const caption = sentences[0] || text.substring(0, 100);
    
    return caption.trim() + (caption.length < text.length ? '...' : '');
  }

  /**
   * Generate a specific clip from suggestions
   */
  async generateClip(analysisId, clipId, options = {}) {
    try {
      // Retrieve analysis data
      const analysisDoc = await db.collection('clip_analyses').doc(analysisId).get();
      if (!analysisDoc.exists) {
        throw new Error('Analysis not found');
      }

      const analysis = analysisDoc.data();
      const clip = analysis.topClips.find(c => c.id === clipId);
      
      if (!clip) {
        throw new Error('Clip not found in analysis');
      }

      // Download source video
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-gen-'));
      const sourcePath = path.join(tempDir, 'source.mp4');
      const outputPath = path.join(tempDir, `clip-${clipId}.mp4`);

      await this.downloadVideo(analysis.videoUrl, sourcePath);

      // Generate clip with FFmpeg
      await this.renderClip(sourcePath, outputPath, clip, options);

      // Upload to Firebase Storage
      const bucket = storage.bucket();
      const clipFileName = `clips/${analysis.userId}/${clipId}.mp4`;
      await bucket.upload(outputPath, {
        destination: clipFileName,
        metadata: {
          contentType: 'video/mp4',
          metadata: {
            analysisId,
            clipId,
            start: clip.start,
            end: clip.end,
            viralScore: clip.score
          }
        }
      });

      const file = bucket.file(clipFileName);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
      });

      // Save clip metadata
      await db.collection('generated_clips').add({
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
        createdAt: new Date().toISOString()
      });

      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });

      return {
        success: true,
        clipId,
        url,
        duration: clip.end - clip.start
      };

    } catch (error) {
      console.error('[VideoClipping] Clip generation failed:', error);
      throw error;
    }
  }

  /**
   * Render clip using FFmpeg with effects
   */
  renderClip(sourcePath, outputPath, clip, options) {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(sourcePath)
        .setStartTime(clip.start)
        .setDuration(clip.end - clip.start);

      // Apply aspect ratio conversion if requested
      if (options.aspectRatio === '9:16') {
        command = command.videoFilters([
          'scale=1080:1920:force_original_aspect_ratio=increase',
          'crop=1080:1920'
        ]);
      }

      // Add captions if requested
      if (options.addCaptions && clip.text) {
        // TODO: Generate SRT file and burn in subtitles
        // This requires subtitle generation logic
      }

      command
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset fast',
          '-crf 23'
        ])
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }
}

module.exports = new VideoClippingService();
