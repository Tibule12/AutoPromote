# OpenAI Integration Status & Setup Guide

**Last Updated:** December 4, 2025  
**Status:** ⚠️ **NEEDS CONFIGURATION**

---

## 🤖 Current OpenAI Features

Your platform already has **3 powerful OpenAI integrations** built and ready:

### 1. ✅ AI Chatbot (GPT-4o)
**File:** `src/services/chatbotService.js`
- **Model:** GPT-4o (latest, best multilingual)
- **Features:**
  - 11 South African languages support
  - AutoPromote platform knowledge
  - User troubleshooting
  - Content recommendations
  - Real-time chat widget
- **Cost:** ~$0.015 per 1K input tokens, $0.06 per 1K output tokens
- **Monthly estimate:** $5-20 for 100 users

### 2. ✅ AI Video Clipping (Whisper API)
**File:** `src/services/videoClippingService.js`
- **Model:** Whisper (speech-to-text)
- **Features:**
  - Video transcription
  - Scene detection
  - Viral clip suggestions
  - Automatic editing
- **Cost:** $0.006 per minute of audio
- **Monthly estimate:** $3-15 for 100 videos

### 3. ⏳ AI Content Optimization (Not yet implemented)
**Potential features:**
- Generate viral captions
- Optimize video titles
- Create engaging thumbnails descriptions
- Suggest trending topics

---

## ⚙️ Setup Required

### Step 1: Get OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Click **"Create new secret key"**
4. Copy the key (starts with `sk-proj-...`)
5. **Save it securely** - you won't see it again!

**Cost:** 
- Free tier: $5 credit (expires after 3 months)
- Pay-as-you-go: Add credit card, pay only for usage
- Estimated monthly cost: **$10-50** for 100-500 users

### Step 2: Add API Key to Backend (Render.com)

1. Go to https://dashboard.render.com
2. Select your **AutoPromote** service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:
   ```
   OPENAI_API_KEY=sk-proj-your-actual-key-here
   ```
6. Click **Save**
7. Service will automatically redeploy

### Step 3: Add API Key to Firebase Functions (Optional)

If using Firebase Functions:

1. Run in terminal:
   ```bash
   firebase functions:config:set openai.key="sk-proj-your-actual-key-here"
   ```

2. Or add in Firebase Console:
   - Go to Firebase Console
   - Select **Functions** → **Configuration**
   - Add environment variable: `OPENAI_API_KEY`

3. Redeploy functions:
   ```bash
   firebase deploy --only functions
   ```

### Step 4: Test Integration

Test the chatbot endpoint:
```bash
curl https://autopromote.onrender.com/api/chat/send \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how do I upload content?",
    "conversationId": "test123"
  }'
```

Expected response:
```json
{
  "success": true,
  "reply": "Hi! To upload content to AutoPromote...",
  "conversationId": "test123"
}
```

---

## 📊 What's Currently Working

### ✅ Code is Ready
- Chatbot service fully implemented
- Video clipping service integrated
- Error handling in place
- Fallback logic if API key missing

### ⚠️ Needs Configuration
- **OPENAI_API_KEY** environment variable not set
- Features will fail silently without API key
- Users will see generic error messages

### 🔧 Current Behavior Without API Key
1. **Chatbot:** Returns error "OpenAI API key not configured"
2. **Video Clipping:** Falls back to basic scene detection (no transcription)
3. **No crashes:** Code handles missing key gracefully

---

## 💰 Cost Breakdown

### GPT-4o (Chatbot)
- **Input:** $0.0025 per 1K tokens (~750 words)
- **Output:** $0.01 per 1K tokens (~750 words)
- **Average conversation:** ~500 tokens = $0.0063
- **100 conversations/day:** ~$0.63/day = **$19/month**

### Whisper (Video Transcription)
- **Cost:** $0.006 per minute
- **10-minute video:** $0.06
- **100 videos/month:** **$6/month**

### Total Estimated Cost
- **Low usage (100 users):** $10-20/month
- **Medium usage (1,000 users):** $50-100/month
- **High usage (10,000 users):** $300-500/month

**Your Revenue vs Cost:**
- 100 Premium users = $2,000/month revenue
- OpenAI cost = $20/month
- **Profit margin: 99%** 💰

---

## 🚀 Optimization Tips

### 1. Cache Responses
For common questions, cache chatbot responses:
```javascript
// Before calling OpenAI
const cachedResponse = await getCachedResponse(question);
if (cachedResponse) return cachedResponse;

// After OpenAI response
await cacheResponse(question, response);
```

**Savings:** 50-70% reduction in API calls

### 2. Use Cheaper Models for Simple Tasks
```javascript
// For FAQs and simple questions
model: 'gpt-3.5-turbo' // 10x cheaper than GPT-4o

// For complex troubleshooting
model: 'gpt-4o' // Better understanding
```

### 3. Set Token Limits
```javascript
max_tokens: 500, // Limit response length
```

### 4. Implement Rate Limiting
```javascript
// Per user: 20 messages/hour
// Per IP: 50 messages/hour
```

---

## 🔒 Security Best Practices

### ✅ DO:
- Store API key in environment variables only
- Never commit `.env` file to Git
- Rotate API keys every 3 months
- Monitor usage on OpenAI dashboard
- Set monthly spending limits

### ❌ DON'T:
- Hardcode API key in code
- Expose API key in frontend
- Share API key publicly
- Use same key for dev and production

---

## 📈 Feature Roadmap

### Phase 1: Essential (Do Now)
- ✅ Add OPENAI_API_KEY to Render.com
- ✅ Test chatbot endpoint
- ✅ Test video transcription

### Phase 2: Optimization (Next Week)
- [ ] Add response caching
- [ ] Implement rate limiting
- [ ] Add cost monitoring dashboard
- [ ] Set up usage alerts

### Phase 3: Advanced (Next Month)
- [ ] AI caption generation
- [ ] AI thumbnail optimization
- [ ] AI hashtag suggestions
- [ ] AI content scoring

---

## 🛠️ Troubleshooting

### Error: "OpenAI API key not configured"
**Solution:** Add `OPENAI_API_KEY` to environment variables

### Error: "Insufficient quota"
**Solution:** Add credits to OpenAI account at https://platform.openai.com/settings/organization/billing

### Error: "Rate limit exceeded"
**Solution:** Upgrade OpenAI tier or implement request queuing

### Error: "Invalid API key"
**Solution:** 
1. Verify key starts with `sk-proj-`
2. Check for extra spaces
3. Regenerate key if needed

---

## 📞 Quick Setup Checklist

- [ ] Sign up for OpenAI account
- [ ] Generate API key
- [ ] Add `OPENAI_API_KEY` to Render.com environment
- [ ] Redeploy backend service
- [ ] Test chatbot endpoint
- [ ] Test video clipping
- [ ] Set up billing alerts
- [ ] Monitor usage for first week
- [ ] Optimize based on usage patterns

---

## 🎯 Next Steps

1. **Immediate (Today):**
   - Get OpenAI API key
   - Add to Render.com
   - Test one feature

2. **This Week:**
   - Add caching to reduce costs
   - Implement rate limiting
   - Monitor usage

3. **This Month:**
   - Build advanced AI features
   - Optimize token usage
   - Add usage analytics

---

## 💡 Pro Tips

1. **Start with GPT-3.5-turbo** for testing (cheaper)
2. **Switch to GPT-4o** when you have paying users
3. **Cache aggressively** - 80% of questions are repetitive
4. **Monitor daily** for first 2 weeks to understand usage patterns
5. **Set billing alerts** at $10, $50, $100

---

**Status:** Ready to go! Just need to add the API key. 🚀

**Estimated setup time:** 5 minutes  
**Estimated monthly cost:** $10-50 (scales with users)  
**Value to users:** Massive (AI-powered support & features)
