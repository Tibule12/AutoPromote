# 🤖 AI Caption & Hashtag Generation

**AI-powered content optimization for viral growth**

AutoPromote now includes intelligent caption and hashtag generation powered by OpenAI GPT-4o, helping creators maximize engagement across all social media platforms.

---

## 🎯 Features

### 1. **Smart Caption Generation**
- Platform-optimized captions (Instagram, TikTok, YouTube, LinkedIn, etc.)
- Multiple tone options (casual, professional, funny, inspirational, sales)
- Automatic emoji integration
- Built-in call-to-action suggestions
- Multilingual support

### 2. **Intelligent Hashtag Generation**
- AI-curated hashtag selection
- Mix of trending (100k+) and niche (10k-100k) hashtags
- Platform-specific optimization
- Estimated reach predictions
- Category breakdown (trending/niche/branded)

### 3. **A/B Testing Variations**
- Generate multiple caption variations
- Different tones for same content
- Compare performance metrics
- Optimize for conversion

### 4. **Content Analysis Enhancement**
- Viral potential scoring (0-100)
- Target audience identification
- Platform recommendations
- Posting strategy suggestions
- SEO optimization tips

---

## 📡 API Endpoints

### Generate Caption
```http
POST /api/captions/generate
Authorization: Bearer <firebase-token>

{
  "contentData": {
    "title": "Your content title",
    "description": "Your content description",
    "tags": ["tag1", "tag2"],
    "type": "video"
  },
  "platform": "instagram",
  "options": {
    "tone": "casual",
    "length": "medium",
    "includeEmojis": true,
    "includeHashtags": true,
    "hashtagCount": 10,
    "includeCallToAction": true,
    "language": "en"
  }
}
```

**Response:**
```json
{
  "success": true,
  "platform": "instagram",
  "caption": "Your AI-generated caption here! 🔥",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "characterCount": 145,
  "estimatedEngagement": 85,
  "metadata": {
    "tone": "casual",
    "length": "medium",
    "language": "en",
    "generatedAt": "2025-12-05T10:30:00Z"
  }
}
```

---

### Generate Caption Variations (A/B Testing)
```http
POST /api/captions/variations
Authorization: Bearer <firebase-token>

{
  "contentData": { ... },
  "platform": "linkedin",
  "count": 3,
  "options": { ... }
}
```

---

### Generate Hashtags Only
```http
POST /api/captions/hashtags
Authorization: Bearer <firebase-token>

{
  "contentData": { ... },
  "platform": "youtube",
  "options": {
    "count": 15,
    "mixRatio": {
      "trending": 0.4,
      "niche": 0.4,
      "branded": 0.2
    },
    "language": "en",
    "includeMetrics": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "platform": "youtube",
  "hashtags": ["#YouTube", "#ContentCreator", ...],
  "categories": {
    "trending": ["#Viral", "#FYP"],
    "niche": ["#VideoMarketing", "#CreatorEconomy"],
    "branded": ["#AutoPromote"]
  },
  "formatted": "#YouTube #ContentCreator #Viral ...",
  "count": 15,
  "estimatedReach": {
    "min": 5000,
    "max": 15000,
    "formatted": "5,000 - 15,000"
  }
}
```

---

### Get Trending Hashtags
```http
GET /api/captions/trending/:platform?count=20
Authorization: Bearer <firebase-token>
```

---

### Complete Caption (Caption + Hashtags)
```http
POST /api/captions/complete
Authorization: Bearer <firebase-token>

{
  "contentData": { ... },
  "platform": "instagram",
  "captionOptions": { ... },
  "hashtagOptions": { ... }
}
```

**Response:**
```json
{
  "success": true,
  "platform": "instagram",
  "caption": "Your caption here! 💫",
  "hashtags": ["#Instagram", "#ContentCreator", ...],
  "formatted": "Your caption here! 💫\n\n#Instagram #ContentCreator ...",
  "metadata": {
    "captionLength": 145,
    "hashtagCount": 15,
    "estimatedEngagement": 85,
    "estimatedReach": { "min": 5000, "max": 15000 }
  }
}
```

---

### Check Service Status
```http
GET /api/captions/status
```

**Response:**
```json
{
  "available": true,
  "service": "OpenAI GPT-4o",
  "features": {
    "caption_generation": true,
    "hashtag_generation": true,
    "variations": true,
    "trending": true
  },
  "fallback": true,
  "message": "AI caption service is operational"
}
```

---

## 🔧 Setup

### 1. Get OpenAI API Key
1. Go to https://platform.openai.com
2. Create account or sign in
3. Navigate to API Keys
4. Click "Create new secret key"
5. Copy the key (starts with `sk-`)

### 2. Configure Environment
Add to Render backend environment variables:
```bash
OPENAI_API_KEY=sk-your-key-here
```

### 3. Deploy
```bash
git push origin main
```

Render will automatically redeploy with AI features enabled.

---

## 🎨 Platform-Specific Guidelines

### Instagram
- **Caption Length:** 138-150 characters ideal
- **Hashtags:** 10-15 hashtags
- **Emojis:** 2-4 relevant emojis
- **CTA:** "Double tap", "Tag friends", "Save this"

### TikTok
- **Caption Length:** 100-150 characters
- **Hashtags:** 4-8 hashtags (include #FYP)
- **Emojis:** 1-2 emojis
- **CTA:** "Follow for more", "Like if..."

### YouTube
- **Caption Length:** Can be long, include timestamps
- **Hashtags:** 10-15 hashtags (max 60 chars in title)
- **Emojis:** Minimal, strategic placement
- **CTA:** "Subscribe", "Watch next", "Comment"

### Twitter
- **Caption Length:** 240-280 characters
- **Hashtags:** 1-2 hashtags maximum
- **Emojis:** 1 emoji max
- **CTA:** "Retweet", "Reply with..."

### LinkedIn
- **Caption Length:** Longer, value-driven content
- **Hashtags:** 3-5 professional hashtags
- **Emojis:** Minimal, professional tone
- **CTA:** "Connect", "Share your insights"

---

## 💰 Rate Limits

### Free Tier
- 5 caption generations per hour
- Basic hashtag generation
- No A/B testing variations

### Premium Tier
- 30 caption generations per 15 minutes
- Advanced hashtag analytics
- Unlimited A/B testing
- Priority processing

### Unlimited Tier
- No limits
- All features unlocked
- Priority API access

---

## 🧪 Testing

Run the test script locally:
```bash
node test-caption-generation.js
```

**Test Coverage:**
1. ✅ Instagram caption generation
2. ✅ TikTok caption generation
3. ✅ Hashtag generation with categories
4. ✅ Caption variations for A/B testing
5. ✅ Trending hashtags retrieval

---

## 🎯 Usage Examples

### Frontend Integration (React)

```javascript
import { useState } from 'react';

function CaptionGenerator({ content }) {
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);

  const generateCaption = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/captions/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseToken}`
        },
        body: JSON.stringify({
          contentData: {
            title: content.title,
            description: content.description,
            tags: content.tags,
            type: content.type
          },
          platform: 'instagram',
          captionOptions: {
            tone: 'casual',
            length: 'medium',
            includeEmojis: true
          },
          hashtagOptions: {
            count: 15
          }
        })
      });

      const data = await response.json();
      setCaption(data.formatted);
      
    } catch (error) {
      console.error('Caption generation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={generateCaption} disabled={loading}>
        {loading ? 'Generating...' : '✨ Generate AI Caption'}
      </button>
      
      {caption && (
        <textarea 
          value={caption} 
          onChange={(e) => setCaption(e.target.value)}
          rows={8}
        />
      )}
    </div>
  );
}
```

---

## 🔒 Security

### Rate Limiting
- IP-based rate limiting
- User tier-based quotas
- Token bucket algorithm
- Abuse prevention

### Data Privacy
- Content data not stored by OpenAI
- Ephemeral processing only
- GDPR compliant
- No training on your data

### API Key Security
- Never expose API key to frontend
- Backend-only access
- Environment variable storage
- Rotation recommended quarterly

---

## 📊 Monitoring

### Usage Tracking
All AI operations logged in `ai_usage_logs` collection:
```javascript
{
  userId: "user123",
  type: "caption_generation",
  platform: "instagram",
  timestamp: "2025-12-05T10:30:00Z",
  success: true
}
```

### Admin Dashboard
Monitor AI usage in Admin Panel → AI Usage tab:
- Total requests
- Success rate
- Cost tracking
- User breakdown

---

## 💡 Best Practices

### 1. Caption Generation
- Provide detailed descriptions for better results
- Use relevant tags to guide AI
- Test different tones for your audience
- Always review and personalize AI output

### 2. Hashtag Selection
- Mix trending and niche hashtags
- Avoid banned/spam hashtags
- Research platform-specific trends
- Update hashtags based on performance

### 3. A/B Testing
- Test 2-3 variations per post
- Track engagement metrics
- Iterate based on data
- Document winning patterns

### 4. Cost Optimization
- Batch generate for scheduled posts
- Cache frequent hashtag sets
- Use fallback for non-critical content
- Monitor usage in admin dashboard

---

## 🐛 Troubleshooting

### "OpenAI API key not configured"
**Solution:** Set `OPENAI_API_KEY` in Render environment variables

### "Rate limit exceeded"
**Solution:** 
- Free tier: Wait 1 hour
- Upgrade to Premium for higher limits
- Check admin dashboard for usage

### "AI analysis failed"
**Solution:** System automatically falls back to heuristic analysis

### Captions seem generic
**Solution:**
- Add more detailed descriptions
- Include specific keywords in tags
- Adjust tone parameter
- Try different platforms

---

## 📈 Future Enhancements

- [ ] Multi-language caption generation (beyond English)
- [ ] Image analysis for caption context
- [ ] Video analysis for hook suggestions
- [ ] Sentiment analysis for community feedback
- [ ] Performance prediction models
- [ ] Automated A/B test scheduling

---

## 🤝 Support

**Documentation:** https://docs.autopromote.org  
**Email:** thulani@autopromote.org  
**Discord:** [Community Server]  
**GitHub Issues:** https://github.com/Tibule12/AutoPromote/issues

---

## 📝 License

AI Caption Generation is part of AutoPromote platform.  
© 2025 AutoPromote. All rights reserved.
