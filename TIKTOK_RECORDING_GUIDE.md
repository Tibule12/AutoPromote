# TikTok Content Posting API - Screen Recording Guide

## 📹 What You Need to Record

TikTok requires a screen recording showing your complete "Post to TikTok" user flow. This guide helps you prepare and record it.

## ✅ Pre-Recording Checklist

### 1. Enable Demo Mode
Add this to your `.env` file (both local and Render):
```bash
TIKTOK_DEMO_MODE=true
```

This enables a mock upload response so you can demonstrate the full flow without having the upload scopes yet.

### 2. Deploy to Production
```bash
git add .
git commit -m "Enable TikTok demo mode for API approval recording"
git push origin main
```

Wait for Render to deploy, then add `TIKTOK_DEMO_MODE=true` to your Render environment variables.

### 3. Test Your Flow
Before recording, test the complete flow:
1. Go to https://autopromote.org (or your deployed URL)
2. Login
3. Go to Connections tab
4. Click "Connect TikTok"
5. Authorize with TikTok (OAuth should work ✅)
6. Go to Upload tab
7. Select a video file
8. Check "TikTok" as target platform
9. Fill in title and description
10. Click upload - should show success in demo mode

## 🎬 Recording Script

### Part 1: TikTok Authorization (30-45 seconds)
**Show:**
1. Open your app (autopromote.org)
2. Login to your account
3. Navigate to "Connections" tab
4. Click "Connect TikTok" button
5. **TikTok OAuth page appears**
6. Click "Authorize" on TikTok
7. **Redirected back to your app**
8. TikTok shows as "Connected" with green status

**Narration/Text:** "User authorizes AutoPromote to access their TikTok account"

### Part 2: Post-to-TikTok Flow (60-90 seconds)
**Show:**
1. Navigate to "Upload" tab
2. Click "Choose File" and select a video (must be .mp4, under 50MB)
3. Video preview appears
4. Fill in fields:
   - **Title:** "My awesome video for TikTok"
   - **Description:** "Testing AutoPromote integration #TikTok"
5. **Check the "TikTok" checkbox** (important to show clearly)
6. Click "Upload" or "Post Content" button
7. **Success message appears:**
   - "Content posted to TikTok successfully!"
   - Shows video ID or confirmation
8. (Optional) Show in content library/dashboard

**Narration/Text:** "User selects video, chooses TikTok as target, and posts content"

### Part 3: Confirmation (15-30 seconds)
**Show:**
1. Navigate to content dashboard/history
2. Show the posted content appears
3. TikTok is listed as one of the platforms
4. Status shows "Posted" or "Published"

**Narration/Text:** "Content successfully posted and tracked in dashboard"

## 📋 Technical Requirements

### Video Requirements:
- **Format:** MP4 (TikTok requires this)
- **Max size:** 50MB per file
- **Max files:** 3 videos in the recording
- **Resolution:** 1080p recommended for clarity

### Recording Requirements:
- **Screen capture software:** OBS Studio, Loom, or QuickTime (Mac)
- **Duration:** 2-4 minutes total
- **Show clearly:**
  - Browser URL bar (showing your domain)
  - All button clicks
  - TikTok authorization page
  - Success confirmations

## 🎯 What TikTok Wants to See

From their guidelines at https://developers.tiktok.com/doc/content-sharing-guidelines:

1. ✅ **User explicitly authorizes** TikTok connection
2. ✅ **User flow to Export/Post page** is clear
3. ✅ **User triggers the post action** themselves
4. ✅ **Confirmation/feedback** shown after posting
5. ✅ **Content Sharing Guidelines** are followed:
   - No pre-selected platforms (user must choose)
   - Clear labeling of TikTok option
   - User controls when to post
   - No automatic/background posting

## 📝 Form Fields to Fill

### "Please list the API response data fields that your API client will save in its database"

Answer with:
```
Our application stores the following TikTok API response fields in our database:

1. video_id - Unique identifier for the uploaded video
2. share_url - Public URL to the TikTok video
3. creator_username - TikTok username of the creator
4. upload_status - Status of the upload (success/pending/failed)
5. upload_timestamp - When the video was posted
6. video_title - Title of the video
7. video_description - Description/caption
8. privacy_level - Video privacy setting (public/private/friends)
9. view_count - Number of views (if available via video.list scope)
10. error_message - Any error details if upload failed

Note: We do NOT store access_tokens or refresh_tokens in our database for security. These are encrypted and stored separately in Firebase Authentication secure storage.
```

## 🚀 After Recording

1. **Upload to TikTok form:** Maximum 3 files, up to 50MB each
2. **Complete the form fields**
3. **Submit for review**
4. **Once approved:** Remove `TIKTOK_DEMO_MODE=true` and uncomment the real upload code

## ⚠️ Important Notes

- **Demo mode is only for recording** - Make this clear in your submission notes
- **Explain you're requesting video.upload/video.publish scopes** and this demo shows intended UX
- **After approval:** You'll need to update your app with the real API implementation
- The mock response clearly indicates it's a demo

## 📞 If You Have Issues

Common problems:
- **TikTok OAuth fails:** Check TIKTOK_CLIENT_KEY and redirect URI match
- **Upload button disabled:** Make sure video is MP4 and under 50MB
- **No success message:** Check browser console for errors

## ✅ Ready to Record Checklist

- [ ] `TIKTOK_DEMO_MODE=true` set in Render environment
- [ ] Deployed latest code to production
- [ ] Tested complete flow once
- [ ] Prepared 1-2 test MP4 videos (under 50MB)
- [ ] Screen recording software installed and tested
- [ ] Browser window clean (close unnecessary tabs)
- [ ] Practice run completed successfully

Good luck! 🎬
