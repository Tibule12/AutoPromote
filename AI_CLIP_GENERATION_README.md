# AI Video Clipping Feature - Opus Clip Style

## Overview

AutoPromote now includes an AI-powered video clipping system that automatically analyzes long-form videos and generates viral short clips optimized for TikTok, Instagram Reels, YouTube Shorts, and other platforms.

## Features

### 🎯 Core Capabilities

- **Automatic Video Analysis**: FFmpeg-based scene detection and shot boundary analysis
- **AI Transcription**: OpenAI Whisper or Google Speech-to-Text integration
- **Viral Score Algorithm**: Scores segments based on:
  - Hook strength (first 5 seconds)
  - Engagement keywords and questions
  - Optimal pacing (30-60 second clips)
  - Emotional intensity (exclamations)
  - Word count and density
- **Smart Clip Generation**: Automatically identifies 10-20 best moments
- **Multi-Format Export**: 9:16 (vertical), 16:9 (horizontal), 1:1 (square)
- **Caption Overlay**: Burn-in subtitles from transcript
- **Platform-Specific Optimization**: Suggests best platforms per clip

### 📊 Viral Scoring System

Each video segment is scored 0-100 based on:

| Factor              | Points  | Description                                       |
| ------------------- | ------- | ------------------------------------------------- |
| Hook Detection      | +20     | Clips starting in first 5 seconds                 |
| Ideal Length        | +15     | 30-60 second duration                             |
| Engagement Keywords | +5 each | Words like "amazing", "secret", "how to", "never" |
| Questions           | +10     | Contains question marks                           |
| Exclamations        | +3 each | Enthusiasm indicators (max +15)                   |
| Good Pacing         | +10     | 50-150 words in clip                              |

## Architecture

### Backend Services

#### `videoClippingService.js`

Main service handling:

- Video download and metadata extraction
- FFmpeg scene detection
- AI transcription (OpenAI/Google)
- Segment scoring algorithm
- Clip rendering with effects

#### `clipRoutes.js`

API endpoints:

- `POST /api/clips/analyze` - Analyze video, generate suggestions
- `GET /api/clips/analysis/:analysisId` - Retrieve analysis results
- `POST /api/clips/generate` - Render specific clip
- `GET /api/clips/user` - Get user's generated clips
- `DELETE /api/clips/:clipId` - Delete clip
- `POST /api/clips/:clipId/export` - Schedule clip for platform export

### Frontend

#### `ClipStudioPanel.js`

Dashboard tab featuring:

- Video selection grid
- Analysis progress tracking
- Clip suggestions with viral scores
- Timeline visualization
- Export options (aspect ratio, captions, branding)
- Preview and batch export

### Database Schema

#### `clip_analyses` Collection

```javascript
{
  userId: string,
  contentId: string,
  videoUrl: string,
  metadata: {
    duration: number,
    width: number,
    height: number,
    aspectRatio: string,
    fps: number,
    hasAudio: boolean
  },
  transcript: [
    { start: number, end: number, text: string, words: [] }
  ],
  scenes: number,
  clipSuggestions: number,
  topClips: [
    {
      id: string,
      start: number,
      end: number,
      score: number,
      reason: string,
      platforms: string[],
      text: string,
      captionSuggestion: string
    }
  ],
  status: 'completed' | 'processing' | 'failed',
  createdAt: ISO8601
}
```

#### `generated_clips` Collection

```javascript
{
  userId: string,
  contentId: string,
  analysisId: string,
  clipId: string,
  start: number,
  end: number,
  duration: number,
  viralScore: number,
  url: string, // Firebase Storage URL
  reason: string,
  platforms: string[],
  caption: string,
  createdAt: ISO8601
}
```

## Setup Instructions

### 1. Environment Variables

Add to `.env`:

```bash
# Video Clipping Configuration
TRANSCRIPTION_PROVIDER=openai  # 'openai' or 'google'
OPENAI_API_KEY=sk-your-openai-key-here
GOOGLE_CLOUD_API_KEY=your-google-cloud-key  # Optional

# FFmpeg (must be installed on server)
# Ubuntu: sudo apt-get install ffmpeg
# macOS: brew install ffmpeg
# Windows: Download from ffmpeg.org
```

### 2. Install Dependencies

```bash
npm install fluent-ffmpeg axios form-data
```

### 3. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

New rules added for:

- `clip_analyses` - User-owned analysis results
- `generated_clips` - User-owned generated clips

### 4. Test the Feature

1. Upload a long-form video (5+ minutes recommended)
2. Navigate to "AI Clips" tab in dashboard
3. Click "Generate Clips" on a video
4. Wait for analysis (may take 2-5 minutes for long videos)
5. Review suggested clips sorted by viral score
6. Generate individual clips with custom settings
7. Export to platforms

## API Usage Examples

### Analyze Video

```javascript
POST /api/clips/analyze
Authorization: Bearer {firebase-token}
Content-Type: application/json

{
  "contentId": "content-123",
  "videoUrl": "https://storage.googleapis.com/bucket/video.mp4"
}

Response:
{
  "success": true,
  "analysisId": "analysis-abc123",
  "duration": 600,
  "transcriptLength": 45,
  "scenesDetected": 32,
  "clipsGenerated": 15,
  "topClips": [...]
}
```

### Generate Clip

```javascript
POST /api/clips/generate
Authorization: Bearer {firebase-token}
Content-Type: application/json

{
  "analysisId": "analysis-abc123",
  "clipId": "clip-xyz789",
  "options": {
    "aspectRatio": "9:16",
    "addCaptions": true,
    "addBranding": false
  }
}

Response:
{
  "success": true,
  "clipId": "clip-xyz789",
  "url": "https://storage.googleapis.com/...",
  "duration": 45
}
```

### Export to Platforms

```javascript
POST /api/clips/{clipId}/export
Authorization: Bearer {firebase-token}
Content-Type: application/json

{
  "platforms": ["tiktok", "instagram", "youtube-shorts"],
  "scheduledTime": "2025-12-04T15:00:00Z"
}

Response:
{
  "success": true,
  "contentId": "content-456",
  "message": "Clip scheduled for export",
  "platforms": ["tiktok", "instagram", "youtube-shorts"],
  "scheduledTime": "2025-12-04T15:00:00Z"
}
```

## Performance Considerations

### Processing Times

- 5 min video: ~2-3 minutes analysis
- 15 min video: ~5-7 minutes analysis
- 60 min video: ~15-20 minutes analysis

Processing time depends on:

- Video length and resolution
- Transcription API speed
- Server CPU for FFmpeg
- Scene complexity

### Optimization Tips

1. **Async Processing**: Consider background job queue for long videos
2. **Caching**: Store analysis results, avoid re-analyzing
3. **Concurrent Limits**: Rate limit to 5 analyses per user per minute
4. **Storage Cleanup**: Implement retention policy for old clips
5. **CDN**: Use Firebase Storage CDN for clip delivery

## Pricing Estimates

### OpenAI Whisper API

- ~$0.006 per minute of audio
- 10 minute video = $0.06
- 60 minute video = $0.36

### Firebase Storage

- Storage: $0.026/GB/month
- Bandwidth: $0.12/GB
- 1 min clip (1080p) ≈ 50MB = $0.006 storage/month + download costs

### Recommended Pricing Model

- Free tier: 3 clips per month
- Pro tier: Unlimited clips + priority processing
- Charge per-clip or subscription model

## Future Enhancements

### Planned Features

- [ ] Real-time preview during analysis
- [ ] Manual clip editor (trim, adjust)
- [ ] Custom branding templates
- [ ] Batch analysis for multiple videos
- [ ] AI voice-over generation
- [ ] Automatic background music
- [ ] Face detection for optimal framing
- [ ] Trending topic detection
- [ ] A/B testing for clip variations
- [ ] Performance analytics per clip

### Integration Ideas

- Auto-generate clips on long video upload
- Schedule clips at optimal posting times
- Cross-platform performance comparison
- Clip recommendation based on past performance

## Troubleshooting

### Common Issues

**FFmpeg Not Found**

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
# Add to system PATH
```

**Transcription Fails**

- Check API keys are valid
- Verify audio track exists in video
- Ensure sufficient API quota/credits

**Slow Processing**

- Upgrade server CPU
- Implement background job queue
- Use lower resolution for analysis
- Cache analysis results

**Storage Issues**

- Check Firebase Storage quotas
- Implement automatic cleanup
- Use compression for clips

## Security Notes

- All clips scoped to user ID
- Firestore rules enforce ownership
- Rate limiting prevents abuse
- Signed URLs for video access
- Input validation on all endpoints

## Testing

### Manual Test Flow

1. Upload test video (use public domain content)
2. Trigger analysis via dashboard
3. Verify clips generated with scores
4. Test export to platforms
5. Verify Firestore data structure
6. Check Firebase Storage files

### Automated Tests

```bash
# Add to test suite
npm test -- clipRoutes.test.js
npm test -- videoClippingService.test.js
```

## Support

For issues or questions:

1. Check server logs for errors
2. Verify FFmpeg installation
3. Test API keys manually
4. Review Firestore permissions
5. Check Firebase Storage quotas

## License

This feature is part of AutoPromote and follows the same license terms.

---

**Last Updated**: December 3, 2025
**Version**: 1.0.0
**Status**: Production Ready 🚀
