# 🧪 AutoPromote Testing Guide

Complete guide for testing PayPal integration and production readiness before December 15 launch.

---

## 📋 Test Scripts Overview

### 1. `test-paypal-webhook-local.js`

**Purpose:** Verify PayPal webhook configuration locally  
**Tests:**

- Environment variables (CLIENT_ID, SECRET, WEBHOOK_ID)
- PayPal SDK initialization
- Webhook signature components
- Database connection

**Run:** `node test-paypal-webhook-local.js`

---

### 2. `test-paypal-integration.js`

**Purpose:** Comprehensive PayPal integration testing  
**Tests:**

- Environment variables validation
- Backend health check
- Payment status endpoint
- PayPal webhook endpoint
- Subscription plans
- PayPal SDK configuration
- Database operations
- Order creation (with auth token)

**Run:** `node test-paypal-integration.js`  
**With Auth:** `node test-paypal-integration.js --token YOUR_FIREBASE_TOKEN`

---

### 3. `test-production-flow.js`

**Purpose:** End-to-end production readiness test  
**Tests:**

- Frontend accessibility
- Backend API health
- All payment endpoints
- All 11 platform integration endpoints
- Critical API routes
- Legal/compliance pages

**Run:** `node test-production-flow.js`

---

### 4. `run-tests.bat` (Windows)

**Purpose:** Run all tests in sequence  
**Runs:**

1. Local webhook configuration test
2. PayPal integration tests
3. Production readiness tests
4. Shows summary of results

**Run:** Double-click `run-tests.bat` or run `.\run-tests.bat` in PowerShell

---

## 🚀 Quick Start Testing

### Step 1: Setup Environment

```bash
# Make sure you have .env file or environment variables set
# Required variables:
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_CLIENT_SECRET=your_client_secret
PAYPAL_MODE=live
PAYPAL_WEBHOOK_ID=your_webhook_id
PAYMENTS_ENABLED=true
PAYOUTS_ENABLED=true
ALLOW_LIVE_PAYMENTS=true
NODE_ENV=production
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Run Test Suite

```bash
# Windows:
.\run-tests.bat

# Or run individually:
node test-paypal-webhook-local.js
node test-paypal-integration.js
node test-production-flow.js

## 🔍 Integration Scan (Dashboard Self-Test)

There's a new integration scan endpoint which runs a suite of lightweight checks intended to simulate core dashboard workflows (both user and admin). The scan is available at:

```

GET /api/diagnostics/scan?dashboard=user
GET /api/diagnostics/scan?dashboard=admin # admin-only

```

- Requesting the Admin scan requires admin privileges — the UI automatically falls back to a user-level scan if the client is non-admin.
- Admins can request to persist scan results by adding `&store=1` to the request (the result will be saved to the `system_scans` collection).
- This endpoint is intended to be called when opening the Admin or User dashboards. The frontend `SystemHealthPanel` automatically triggers the scan and displays results.

Run from the command line using a valid token (or in bypass/test mode with `test-token-for-<uid>`):

```

curl -H "Authorization: Bearer test-token-for-testUser123" "http://localhost:5000/api/diagnostics/scan?dashboard=user"
curl -H "Authorization: Bearer test-token-for-adminUser" "http://localhost:5000/api/diagnostics/scan?dashboard=admin&store=1"

```

The endpoint returns a JSON structure containing per-check results and an overall status (ok/warning/failed). Use the Admin UI to view details and errors.

### Scheduled Scans

You can have the server run scheduled scans automatically by enabling the following environment variables:

```

ENABLE_HEALTH_SCANS=true
HEALTH_SCAN_INTERVAL_MS=3600000 # 1 hour
HEALTH_SCAN_STORE=true # Persist scans to `system_scans`
SCAN_FAILURE_WEBHOOK=https://hooks.example.com/your-webhook-url

```

When scheduled scans are enabled, results will be persisted to `system_scans`. If `SCAN_FAILURE_WEBHOOK` is configured, a POST will be sent when a scan fails.

### Remediation & Auto-Fixes

The diagnostics system also provides remediation suggestions for failing checks, and administrators can request an automatic remediation for a recorded scan. This can be useful for automated fixes like re-seeding a missing admin document, creating a sample leaderboard entry, or seeding test content used for validation.

To run a remediation for a stored scan:

```

curl -X POST -H "Authorization: Bearer test-token-for-adminUser" "http://localhost:5000/api/diagnostics/scans/{SCAN_ID}/remediate"

```

You can also pass a JSON body to target specific checks:

```

{ "checks": ["db", "admin", "leaderboard"] }

```

Remediations are safe, limited actions intended for testing and recovery; they do not change environment variables. They are logged in `system_scans_remediation` with details and the admin who requested them.
```

## Test Environment Setup

### Prerequisites

Before running tests, ensure you have the following:

1. Node.js (v14 or later)
2. Firebase project set up with Firestore
3. Service account key saved as `serviceAccountKey.json` in the project root
4. All npm dependencies installed

### Environment Configuration

1. Verify that your `.env` file contains the necessary Firebase configuration:

```
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

2. For running backend tests, ensure that service account credentials are properly configured.

---

## 📊 Understanding Test Results

### ✅ All Green (100% Pass)

**Meaning:** Platform is production-ready  
**Action:** Deploy with confidence!

### ⚠️ 80-99% Pass

**Meaning:** Minor issues present  
**Action:** Review failed tests, fix non-critical issues, soft launch OK

### ❌ Below 80% Pass

**Meaning:** Critical issues present  
**Action:** Fix issues before launching

---

## 🔍 Common Test Failures & Fixes

### Test: "PAYPAL_MODE is not 'live'"

**Problem:** Still in sandbox mode  
**Fix:** Set `PAYPAL_MODE=live` in Render environment

### Test: "PAYMENTS_ENABLED must be true"

**Problem:** Payments disabled  
**Fix:** Set `PAYMENTS_ENABLED=true` in Render

### Test: "Live calls are BLOCKED"

**Problem:** `ALLOW_LIVE_PAYMENTS` not set  
**Fix:** Set `ALLOW_LIVE_PAYMENTS=true` and `NODE_ENV=production`

### Test: "Missing PayPal Plan ID"

**Problem:** Subscription plans not configured  
**Fix:** Create plans in PayPal dashboard, set IDs in environment:

```bash
PAYPAL_PREMIUM_PLAN_ID=P-xxx
PAYPAL_UNLIMITED_PLAN_ID=P-yyy
```

### Test: "Webhook endpoint not found"

**Problem:** Route not mounted or deployed  
**Fix:** Verify `paypalWebhookRoutes` is loaded in `server.js`, redeploy

### Test: "Backend health check failed"

**Problem:** Backend not running or crashed  
**Fix:** Check Render logs, verify deployment succeeded

---

## 🧪 Manual Testing Checklist

After automated tests pass, perform these manual tests:

### Test 1: User Registration

1. Go to https://www.autopromote.org
2. Click "Sign Up"
3. Register with email/password
4. Check email for verification link
5. Click verification link
6. Should redirect to dashboard
7. Accept terms modal should appear

**Expected:** ✅ Registration complete, email verified, terms accepted

---

### Test 2: PayPal Subscription

1. Login to dashboard
2. Click user menu → "Upgrade"
3. Select "Premium" plan ($9.99/month)
4. Click "Subscribe with PayPal"
5. Complete PayPal authorization
6. Should redirect back to dashboard
7. User menu should show "Premium Member"

**Expected:** ✅ Subscription created, payment successful, plan activated

**Verify in:**

- Firestore: `users/{uid}/subscription` document exists
- PayPal Dashboard: Subscription shows "Active"
- Render Logs: Webhook event received

---

### Test 3: Platform Connection (YouTube)

1. Click "Connections" tab
2. Click "Connect YouTube"
3. Sign in to Google account
4. Authorize AutoPromote
5. Should redirect back with success message
6. YouTube should show as "Connected" with channel name

**Expected:** ✅ OAuth successful, tokens stored, channel name displayed

**Verify in:**

- Firestore: `users/{uid}/connections/youtube` document exists
- Dashboard: YouTube shows connected

---

### Test 4: Content Upload & Schedule

1. Click "Upload" tab
2. Upload a video file (MP4)
3. Enter title and description
4. Select platforms: YouTube, Twitter, TikTok
5. Choose "Schedule for later"
6. Select date/time (tomorrow)
7. Click "Schedule"

**Expected:** ✅ Upload successful, schedule created

**Verify in:**

- Firestore: `content/{id}` document exists
- Firestore: `promotion_schedules/{id}` document exists
- Dashboard: Schedule appears in "Schedules" tab

---

### Test 5: Platform Posting (Live Test)

1. Create a schedule for 5 minutes from now
2. Wait for scheduled time
3. Check platform (Twitter/YouTube)
4. Post should appear on platform

**Expected:** ✅ Content posted automatically to selected platforms

**Verify in:**

- Twitter: Tweet appears on your timeline
- YouTube: Video appears in channel (if YouTube selected)
- Firestore: `promotion_executions/{id}` status = "completed"

---

### Test 6: Webhook Verification

1. Make a PayPal payment (subscription or test payment)
2. Check Render logs for webhook event
3. Check Firestore `payments` collection
4. Should see payment recorded

**Expected:** ✅ Webhook received, signature verified, payment recorded

**Verify in:**

- Render Logs: "Webhook received" message
- Firestore: `payments/{orderId}` status = "captured"
- Admin Dashboard: Payment shows in revenue

---

### Test 7: Email Notifications

1. Register new user
2. Check email for verification
3. Trigger password reset
4. Check email for reset link
5. Complete payment
6. Check email for receipt (if enabled)

**Expected:** ✅ All emails received within 2 minutes

**Verify:**

- Welcome email arrives
- Verification email arrives
- Password reset email arrives

---

## 🛠️ Debugging Test Failures

### Enable Verbose Logging

```bash
# In your .env or Render environment:
DEBUG=true
LOG_LEVEL=debug
```

### Check Render Logs

```bash
# View live logs:
1. Go to Render Dashboard
2. Click on your Backend service
3. Click "Logs" tab
4. Filter for ERROR or WARN
```

### Test Individual Components

#### Test PayPal Token Generation:

```javascript
// test-token.js
require("dotenv").config();
const https = require("https");

const basic = Buffer.from(
  `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
).toString("base64");

const options = {
  hostname: process.env.PAYPAL_MODE === "live" ? "api-m.paypal.com" : "api-m.sandbox.paypal.com",
  path: "/v1/oauth2/token",
  method: "POST",
  headers: {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
};

const req = https.request(options, res => {
  let data = "";
  res.on("data", chunk => (data += chunk));
  res.on("end", () => {
    console.log("Status:", res.statusCode);
    console.log("Response:", JSON.parse(data));
  });
});

req.write("grant_type=client_credentials");
req.end();
```

Run: `node test-token.js`

---

#### Test Firestore Connection:

```javascript
// test-firestore.js
require("dotenv").config();
const { db } = require("./src/firebaseAdmin");

async function test() {
  try {
    const testRef = db.collection("_test").doc("health");
    await testRef.set({ tested: new Date().toISOString() });
    console.log("✅ Write successful");

    const doc = await testRef.get();
    console.log("✅ Read successful:", doc.data());

    await testRef.delete();
    console.log("✅ Delete successful");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

test();
```

Run: `node test-firestore.js`

---

## 📈 Performance Testing

### Load Test Payment Endpoint

```bash
# Using Apache Bench (install: choco install apache-bench)
ab -n 100 -c 10 https://api.autopromote.org/api/payments/status

# Expected:
# - 100% success rate
# - Average response time < 500ms
# - No 500 errors
```

### Monitor During Testing

```bash
# Watch Render metrics:
1. Go to Render Dashboard
2. Click "Metrics" tab
3. Monitor:
   - Response time
   - Error rate
   - Memory usage
   - CPU usage
```

---

## ✅ Pre-Launch Testing Checklist

### December 12 (D-3)

- [ ] Run `node test-paypal-webhook-local.js` → 100% pass
- [ ] Run `node test-paypal-integration.js` → 100% pass
- [ ] Run `node test-production-flow.js` → 95%+ pass
- [ ] Verify all environment variables set in Render
- [ ] Test PayPal payment yourself (buy Premium)
- [ ] Verify webhook received in Render logs

### December 13 (D-2)

- [ ] Complete all 7 manual tests above
- [ ] Test on mobile device (iOS or Android)
- [ ] Test on different browser (Chrome, Firefox, Safari)
- [ ] Invite 3 beta users to test
- [ ] Fix any issues found

### December 14 (D-1)

- [ ] Re-run all automated tests
- [ ] Verify beta user feedback addressed
- [ ] Check Firestore backup exists
- [ ] Prepare launch announcement
- [ ] Set up monitoring alerts
- [ ] Standby for hotfixes

### December 15 (Launch Day)

- [ ] Final smoke test (quick manual test)
- [ ] Monitor logs continuously
- [ ] Track first 10 signups
- [ ] Track first PayPal payment
- [ ] 🎉 Celebrate launch!

---

## 🚨 Emergency Rollback Procedure

If critical issues arise post-launch:

1. **Disable Payments** (quick fix):

   ```bash
   # In Render environment:
   PAYMENTS_ENABLED=false
   ALLOW_LIVE_PAYMENTS=false
   ```

   Redeploy → Payments will be disabled, platform still works

2. **Rollback Deployment**:

   ```bash
   # In Render:
   1. Go to "Deploys" tab
   2. Find previous successful deploy
   3. Click "Rollback to this deploy"
   ```

3. **Emergency Contact**:
   - Render Support: https://render.com/support
   - PayPal Developer Support: https://developer.paypal.com/support

---

## 📞 Support & Resources

**Documentation:**

- [PayPal Developer Docs](https://developer.paypal.com/docs/)
- [Render Documentation](https://render.com/docs)
- [Firebase Documentation](https://firebase.google.com/docs)

**Community:**

- AutoPromote Discord: [link]
- GitHub Issues: https://github.com/Tibule12/AutoPromote/issues

**Emergency Contacts:**

- Tech Lead: [your email]
- DevOps: [devops email]
- Support: thulani@autopromote.org

---

## 🎯 Success Criteria

**Platform is ready to launch when:**

- ✅ All automated tests pass (95%+)
- ✅ All 7 manual tests complete successfully
- ✅ PayPal payment flow works end-to-end
- ✅ At least 3 platform integrations tested
- ✅ Webhook events received and processed
- ✅ Email verification working
- ✅ No critical errors in logs
- ✅ Performance metrics acceptable

**You're ready! 🚀 Let's launch on December 15!**

- Create 20 sample users (including 2 admin users)
- Generate 30 content items
- Create 25 promotions
- Add 50 activity logs
- Generate an analytics summary with 30 days of data

## Database Integration Testing

### Automated Testing

The application includes a database connection checking utility:

```powershell
node checkDatabaseConnection.js
```

This script checks:

1. Connection to Firestore
2. Existence of required collections
3. Functionality of admin dashboard queries

### Browser-Based Testing

You can also test database integration through the browser:

1. Login as an admin user
2. Navigate to `/test-console` or click the "Test Connection" button in the admin dashboard
3. Use the Test Console UI to run various database tests

## Admin Dashboard Testing

### Component Testing

Test each component of the admin dashboard:

1. **Overview Section**
   - Verify that key metrics are displayed
   - Check that charts load with data
   - Verify period selector functionality

2. **User Management**
   - Test user filtering and sorting
   - Verify user details display
   - Test admin user creation (if applicable)

3. **Content Analysis**
   - Verify content metrics are accurate
   - Test content filtering and sorting
   - Check content performance data

4. **Promotion Management**
   - Test promotion status filters
   - Verify promotion metrics
   - Check scheduling functionality

5. **Activity Feed**
   - Verify recent activities are displayed
   - Test activity filtering
   - Check timestamp display

### Integration Points

Test integration between different parts of the admin dashboard:

1. User ↔ Content relationship
2. Content ↔ Promotions relationship
3. All activities related to users, content, and promotions

## Running Tests

### Command Line Testing

Run the following command to test database integration:

```powershell
node checkDatabaseConnection.js
```

The test results will be saved to `database-check-results.json`.

### Browser Testing

1. Start the development server:

```powershell
npm start
```

2. Login with admin credentials
3. Navigate to `/test-console`
4. Click "Run All Tests" to perform browser-based testing

### End-to-End (E2E) Tests

E2E tests simulate a real user interacting with a minimal upload UI and assert that uploaded content is created server-side.

Run the E2E test locally with:

```powershell
npm run test:e2e
```

Notes:

- The E2E script uses Puppeteer and will open a headless browser to post an upload to `/api/content/upload`.
- The test uses the integration bypass token `Bearer test-token-for-testUser123` to avoid needing a full OAuth flow.
- Ensure Firestore/service account credentials are available in the environment for the test to validate DB writes.

### Visual Testing

Perform visual inspection of the admin dashboard:

1. Verify that all sections load correctly
2. Check responsive design at different screen sizes
3. Verify that all data is displayed correctly
4. Test interactive elements (tabs, buttons, filters)

## Test Automation

### Setting Up Automated Tests

You can set up automated testing using CI/CD:

1. **GitHub Actions**: Add a workflow file to run tests on push or pull request
2. **Scheduled Tests**: Set up scheduled test runs to verify ongoing functionality

Example GitHub Actions workflow:

```yaml
name: Database Integration Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: "0 0 * * 1" # Run weekly on Mondays

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js
        uses: actions/setup-node@v2
        with:
          node-version: "14"
      - run: npm ci
      - name: Run database connection tests
        run: node checkDatabaseConnection.js
        env:
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
```

## Troubleshooting

### Common Issues

1. **Firebase Connection Issues**
   - Verify that your Firebase project is correctly set up
   - Check that service account key has proper permissions
   - Ensure Firestore is enabled in your Firebase project

2. **Missing Collections**
   - Run `generateSampleData.js` to create missing collections
   - Check Firestore security rules to ensure proper access

3. **Authentication Issues**
   - Verify admin user credentials
   - Check Firebase Authentication settings
   - Ensure custom claims are properly set for admin users

4. **Data Not Displaying**
   - Check browser console for errors
   - Verify that queries are constructed correctly
   - Ensure data exists in the database

### Logs and Diagnostics

For detailed diagnostics:

1. Run the connection check with verbose logging:

```powershell
$env:DEBUG="true"; node checkDatabaseConnection.js
```

2. Check Firebase Authentication logs in the Firebase Console
3. Review browser console logs when using the admin dashboard

### Getting Help

If you encounter persistent issues:

1. Check the Firebase documentation
2. Review the AutoPromote codebase for recent changes
3. Contact the development team with specific error messages

---

_This testing guide was last updated on June 2023 and applies to the current version of AutoPromote._
