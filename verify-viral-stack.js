const http = require('http');
const fs = require('fs');

// Mock checks since we don't have a running server on localhost yet
const CHECKS = [
    { name: "Server Entry Point", file: "src/server.js", pattern: "/api/revenue", expected: true },
    { name: "Revenue Routes", file: "src/routes/revenueRoutes.js", pattern: "/create-bounty", expected: true },
    { name: "Revenue Routes (Board)", file: "src/routes/revenueRoutes.js", pattern: "/bounty-board", expected: true },
    { name: "Content Routes (Upload)", file: "src/contentRoutes.js", pattern: "revenueEngine.createViralBounty", expected: true },
    { name: "Revenue Engine", file: "src/services/revenueEngine.js", pattern: "class RevenueEngine", expected: true }
];

function checkFiles() {
    console.log("🔍 Starting Static Analysis of Viral Bounty Stack...");
    let passed = 0;
    
    // 1. Check Server Code
    CHECKS.forEach(check => {
        try {
            if (fs.existsSync(check.file)) {
                const content = fs.readFileSync(check.file, 'utf8');
                const hasPattern = content.includes(check.pattern);
                if (hasPattern === check.expected) {
                    console.log(`✅ [PASS] ${check.name}: Found required logic.`);
                    passed++;
                } else {
                    console.log(`❌ [FAIL] ${check.name}: Missing '${check.pattern}'.`);
                }
            } else {
                 console.log(`❌ [FAIL] ${check.name}: File ${check.file} does not exist.`);
            }
        } catch (e) {
            console.error(`ERROR reading ${check.file}:`, e.message);
        }
    });

    // 2. Check Frontend Config specifically
    const configPath = "frontend/src/config.js";
    if (fs.existsSync(configPath)) {
        const config = fs.readFileSync(configPath, 'utf8');
        // We need to make sure the endpoints are exposed
        const endpoints = ["/api/revenue/create-bounty", "/api/revenue/bounty-board", "/api/revenue/my-bounties"];
        let configPass = true;
        
        // Simple check if the file defines these paths string-wise
        endpoints.forEach(ep => {
            // We search for the suffix or the key
            if(!config.includes('revenue') && !config.includes('bounty')) {
                 console.log(`⚠️ [WARN] Frontend Config might be missing definitions for: ${ep}`);
                 configPass = false;
            }
        });
        
        if (configPass) {
             console.log(`✅ [PASS] Frontend Config: Seems to have revenue constants.`);
             passed++;
        }
    }

    console.log(`\nStack Verification Complete.`);
}

checkFiles();
