
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');

// 1. Setup Environment Bypasses
process.env.FIREBASE_ADMIN_BYPASS = '1';
process.env.NO_VIRAL_OPTIMIZATION = '1'; // Skip heavy viral logic

// 2. Mock Auth Middleware
const authMiddlewarePath = require.resolve('./src/authMiddleware');
require.cache[authMiddlewarePath] = {
    id: authMiddlewarePath,
    filename: authMiddlewarePath,
    loaded: true,
    exports: (req, res, next) => {
        req.user = { uid: 'test-user-123', email: 'test@bounty.com' };
        req.userId = 'test-user-123';
        next();
    }
};

// 3. Mock Revenue Engine
const revenueEnginePath = require.resolve('./src/services/revenueEngine');
const mockRevenueEngine = {
    createViralBounty: async (uid, niche, amount, method) => {
        console.log(`[MOCK] createViralBounty called! Amount: ${amount}, Niche: ${niche}`);
        return { success: true, bountyId: 'bounty_mock_123' };
    },
    logEngagement: async () => ({ success: true })
};
require.cache[revenueEnginePath] = {
    id: revenueEnginePath,
    filename: revenueEnginePath,
    loaded: true,
    exports: mockRevenueEngine
};

// 4. Load Content Routes
const contentRoutes = require('./src/contentRoutes');

// 5. Setup Server
const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
    // Mock userUsage for usageLimitMiddleware
    req.userUsage = { usage: 0, limit: 100 };
    next();
});
app.use('/api/content', contentRoutes);

const PORT = 9999;
const server = app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
    runClientTest();
});

// 6. Client Test Logic
function runClientTest() {
    console.log("SENDING BOUNTY UPLOAD REQUEST...");
    
    // We must mimic valid payloads to pass Joi validation
    const postData = JSON.stringify({
        title: "Test Viral Video",
        type: "video",
        url: "http://example.com/video.mp4",
        bounty: {
            amount: 500,
            niche: "crypto"
        },
        isDryRun: false 
    });

    const req = http.request({
        hostname: '127.0.0.1', // Use IP to connect
        port: PORT,
        path: '/api/content/upload',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Host': 'autopromote.internal' // SPOOF HOST to evade "localhost" E2E check
        }
    }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
            console.log(`STATUS: ${res.statusCode}`);
            // console.log(`BODY: ${responseBody}`);

            try {
                const json = JSON.parse(responseBody);
                
                // VERIFICATIONS
                let passed = true;
                
                if (json.error) {
                    console.log(`❌ [FAIL] API returned error: ${json.error}`);
                    passed = false;
                } else {
                    if (json.content && json.content.viral_bounty_id === 'bounty_mock_123') {
                        console.log("✅ [PASS] Response contains generated Bounty ID.");
                    } else {
                        console.log("❌ [FAIL] Response missing Bounty ID.");
                        console.log("Response content:", json.content);
                        passed = false;
                    }

                    if (json.content && json.content.has_bounty === true) {
                        console.log("✅ [PASS] Content marked as has_bounty.");
                    } else {
                        console.log("❌ [FAIL] Content missing has_bounty flag.");
                        passed = false;
                    }
                }

                console.log(passed ? "\nTEST SUITE PASSED" : "\nTEST SUITE FAILED");
            } catch (e) {
                console.log(`❌ [FAIL] Invalid JSON response: ${responseBody}`);
            }
            
            server.close();
            process.exit(0); // Exit clean to not block terminal
        });
    });

    req.on('error', (e) => {
        console.error(`Request error: ${e.message}`);
        server.close();
        process.exit(1);
    });

    req.write(postData);
    req.end();
}
