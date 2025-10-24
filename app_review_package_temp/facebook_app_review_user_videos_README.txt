App Review package - user_videos permission

What this is for
- This folder contains ready-to-use instructions and API commands you can run to collect the evidence Facebook App Review needs for the user_videos permission.
- Because Facebook now converts many personal-profile video uploads to Reels, this README explains the fastest accepted evidence options (Reel UI evidence + token debug, or Page-based video evidence).

Files you should produce and attach
- screenshot_banner.png    # screenshot showing "All videos you post on Facebook are now reels"
- screen_recording.mp4    # 60-120s screen recording following the included script
- me_videos.json          # output from GET /me/videos using a test user token (may be empty for Reels)
- debug_token.json        # output from debug_token for the same test user token (shows scopes)
- OPTIONAL: page_videos.json  # output from GET /{page-id}/videos if you upload to a Page

Brief checklist to finish (5 - 15 minutes)
1) Record the screen recording (follow the script below). Save as screen_recording.mp4.
2) In Graph API Explorer generate a test user access token with user_videos and run GET /me/videos?fields=id,title,created_time,thumbnails,source — save the JSON as me_videos.json.
3) Locally run the debug_token command to save debug_token.json (see api commands file for exact command).
4) Put the files above in this folder, run the packaging helper (create_package.ps1) or zip manually and upload to the App Review submission.

Exact wording to paste into the App Review justification box (copy-paste)
We request user_videos so our app can read videos a person has uploaded to their Facebook account to analyze and moderate content created by the account owner. Note: Facebook recently consolidates profile video uploads into Reels in many regions — personal-profile uploads may therefore appear as Reels instead of legacy feed videos. For testing we show (a) the UI banner and a screen recording demonstrating the upload flow that becomes a Reel, (b) Graph API outputs (GET /me/videos and debug_token) produced with a test user token, and (c) if the reviewer prefers legacy feed-video evidence we can also provide Page-level video evidence upon request.

Screen recording script (what to show and say)
- Intro (1–5s): "Hi — I'm [name]. I'll demonstrate how our app requests and reads user videos for the reviewer."
- Generate token & consent (10s): Open Graph API Explorer, Get User Access Token, check user_videos, show consent dialog and token value (copy, do not speak tokens out loud). Say: "I generate a test user token that includes the user_videos permission." Pause briefly.
- Upload flow (20–40s): Show the Facebook composer or Creator Studio upload of the test video. Narrate: "Uploading a test video now — note the banner that says videos are now Reels and the composer shows Reels output." Wait for processing.
- API call (15–25s): In Graph API Explorer run GET /me/videos?fields=id,title,created_time,thumbnails,source using the same token and show the response. Narrate: "Here is the GET /me/videos response saved as me_videos.json. Personal-profile uploads in this region may return no legacy feed objects because they are Reels." Show the saved me_videos.json file.
- Debug token (10s): Run debug_token locally and show debug_token.json (or show debug_token response in Explorer). Narrate: "Showing debug_token output proving the token includes user_videos." 
- Close (3–5s): "If you prefer Page-level evidence we can supply page_videos.json from a Page upload."

Notes and FAQ
- If personal uploads are converted to Reels in your account/region, GET /me/videos may return an empty data array — include me_videos.json anyway; attach the screen recording and banner as evidence of the platform behavior.
- If a reviewer prefers Page evidence, upload to a Page you manage and fetch /{page-id}/videos; page_videos.json will show Facebook-hosted (fbcdn) sources.

Where to run commands
- Use Graph API Explorer for token generation and GET /me/videos.
- Use the PowerShell/curl examples in facebook_app_review_api_commands.txt to run debug_token or to upload/fetch Page videos locally.

When you're ready
- Place the files in this folder, then run the packaging script or tell me and I will create the package and the final App Review ZIP for you.

---
Created to help prepare App Review evidence for user_videos. Replace placeholder tokens locally — do NOT commit secrets.
Facebook App Review — user_videos evidence

File purpose:
This file accompanies the screen recording for App Review. It contains the test user info (replace placeholders), exact reproduction steps, Graph API calls used in the recording, and expected behavior. Upload this README together with the video file.

---
App / test details
App name: [Your App Name]
Staging URL / app entry point: [https://staging.example.com or app link]

Test user (replace with real test user credentials generated for App Review):
Email: TEST_USER_EMAIL_PLACEHOLDER
Password: TEST_USER_PASSWORD_PLACEHOLDER

Note: Use a Facebook test user or a test account created under the app's Roles > Test Users in the Facebook Developer Console. Do not include personal/prod accounts.

Recording file name (suggested): facebook_user_videos_demo.mp4
Format: MP4 (H.264), 720p or 1080p recommended
Length: 60–180 seconds (90–150 seconds recommended)

---
Exact steps performed in the recording (copy these into the Notes and follow in the video):
1) Open the app landing page: show the app name and URL in the browser header.
2) Click 'Login with Facebook'.
3) Sign in using the provided test user credentials.
4) When the Facebook permission dialog appears, show the dialog and the requested permission scope. Grant access by clicking 'Continue' / 'Allow'.
5) After redirect, open the app section called 'My Videos' or 'Library'. Show thumbnails, titles, and upload timestamps.
6) Click one video to open the preview player and play 3–6 seconds. Show metadata (title/description) and any schedule or share controls.
7) Open a terminal/browser console and run the Graph API call shown below using the test user's access token to demonstrate the app read.
8) Demonstrate selecting the video and clicking 'Schedule' (or 'Reshare') and show the explicit confirmation dialog that requires final user consent.
9) End with the scheduled items list or library view.

Spoken lines to read during recording (short):
- "This is [Your Name]. This recording demonstrates how [Your App Name] uses the user_videos permission to list and preview videos uploaded by the signed-in user."
- "The app requests the 'user_videos' permission. I will grant access so the app can list videos I uploaded for preview and scheduling."
- "After granting permission, the app displays my uploaded videos with thumbnails, titles, and upload times pulled from Facebook. These are my videos only."
- "I am previewing the selected video. The app uses the video metadata and source only for preview and scheduling. No content is posted without explicit confirmation."
- "Here is the API call showing the user's videos returned by the Graph API, confirming the app reads only the signed-in user's videos."
- "I confirm scheduling this video. The app requires explicit user confirmation before any posting or scheduling is applied."

---
Graph API calls to show in the recording (replace placeholders):
1) List user videos
cURL:
  curl -i -X GET "https://graph.facebook.com/v17.0/me/videos?fields=id,title,description,created_time,thumbnails,source&access_token={ACCESS_TOKEN}"
JS (browser console):
  fetch("https://graph.facebook.com/v17.0/me/videos?fields=id,title,description,created_time,thumbnails,source&access_token={ACCESS_TOKEN}")
    .then(r => r.json())
    .then(console.log)

2) Single video object
GET https://graph.facebook.com/v17.0/{VIDEO_ID}?fields=id,title,description,created_time,thumbnails,source&access_token={ACCESS_TOKEN}

3) Debug token (shows scopes)
GET https://graph.facebook.com/debug_token?input_token={ACCESS_TOKEN}&access_token={APP_ID}|{APP_SECRET}

Expected JSON snippet for /me/videos (example):
{
  "data": [
    {
      "id": "1234567890",
      "title": "My test clip",
      "description": "Short demo",
      "created_time": "2025-10-01T12:34:56+0000",
      "thumbnails": {...},
      "source": "https://video.xx.fbcdn.net/....mp4"
    }
  ],
  "paging": {...}
}

Expected debug_token snippet (must include "user_videos"):
{
  "data": {
    "app_id": "YOUR_APP_ID",
    "type": "USER",
    "application": "Your App Name",
    "scopes": ["email","user_videos", ...]
  }
}

---
What to upload in App Review (minimum):
1) Screen recording video (MP4) — showing the full flow described above.
2) This README file (facebook_app_review_user_videos_README.txt) attached alongside the video.
3) In the App Review "Notes" or text fields: include the test user credentials (email/password) and the staging URL.
4) If possible, include a short text file with the exact Graph API calls you ran (copy/paste from above) and the debug_token output.

Security notes:
- Use only test users and test tokens in the video. Remove or redact any production secrets.
- Do not reveal your app secret in public places. If reviewers ask for debug_token output, include it as a JSON snippet (redact the app secret) or run debug_token with the app's app_access_token and paste only the JSON data showing scopes.

Contact:
If you want, upload the recorded video file here and I will review and provide edits before submission.

---
End of file
