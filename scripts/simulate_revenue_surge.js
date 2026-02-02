// scripts/simulate_revenue_surge.js

// 1. Setup Mock DB Environment BEFORE importing RevenueEngine
const mockDB = {
    'system_metrics/engagement_velocity': { count: 0 }
};

const adminMock = {
    firestore: {
        Timestamp: {
            now: () => new Date()
        },
        FieldValue: {
            increment: (val) => ({ __op: 'increment', val }),
            serverTimestamp: () => new Date()
        }
    }
};

const dbMock = {
    collection: (name) => {
        return {
            doc: (docId) => {
                const docIdGenerated = docId || `doc_${Date.now()}_${Math.random()}`;
                const path = `${name}/${docIdGenerated}`;
                return {
                    id: docIdGenerated,
                    get: async () => {
                        const data = mockDB[path];
                        return {
                            exists: !!data,
                            data: () => data || {}
                        };
                    },
                    path // store path for batch to use
                };
            },
            add: async (data) => {
                 // simplified add
                 return { id: 'mock_tx_id' };
            }
        }
    },
    batch: () => {
        const ops = [];
        return {
            set: (ref, data, opts) => ops.push({ type: 'set', ref, data, opts }),
            commit: async () => {
                for (const op of ops) {
                    const path = op.ref.path;
                    if (!path) continue;
                    
                    if (op.type === 'set') {
                        let currentData = mockDB[path] || {};
                        const updates = op.data;
                        
                        // Handle increment manually
                        for (const [key, val] of Object.entries(updates)) {
                            if (val && val && typeof val === 'object' && val.__op === 'increment') {
                                currentData[key] = (currentData[key] || 0) + val.val;
                            } else {
                                currentData[key] = val;
                            }
                        }
                        mockDB[path] = currentData;
                    }
                }
            }
        };
    }
};

// 2. Mock require cache
const path = require('path');
const adminPath = path.resolve(__dirname, '../src/firebaseAdmin');

require.cache[adminPath + '.js'] = {
    id: adminPath + '.js',
    filename: adminPath + '.js',
    loaded: true,
    exports: {
        db: dbMock,
        admin: adminMock
    }
};

// 3. Import Revenue Engine (it will use our mock)
const revenueEngine = require('../src/services/revenueEngine');

async function runSimulation() {
    console.log("🚀 Starting Greedy Revenue Engine Simulation...\n");
    
    // Step 1: Baseline
    console.log("--- BASELINE CHECKS ---");
    const baseline = await revenueEngine.calculateBlockPrice('tech', 1000);
    console.log(`[Baseline] Tech Block Price (1k units): $${baseline.price}`);
    console.log(`           Velocity: ${(mockDB['system_metrics/engagement_velocity'] || {}).count || 0}`);
    
    // Step 2: Inject Surge
    console.log("\n--- INJECTING SURGE TRAFFIC (600 Engagements) ---");
    console.log("Simulating viral spike...");
    // SURGE_THRESHOLD is 500. We'll add 600.
    const BATCH_SIZE = 100;
    for (let i = 0; i < 600; i += BATCH_SIZE) {
        const promises = [];
        for (let j = 0; j < BATCH_SIZE; j++) {
            promises.push(revenueEngine.logEngagement('user1', 'content1', 'like', 1, { niche: 'tech' }));
        }
        await Promise.all(promises);
        process.stdout.write("."); // Progress bar
    }
    console.log("\nTraffic injection complete.");
    
    // Step 3: Surge Pricing Check
    console.log("\n--- SURGE PRICING CHECK ---");
    const surge = await revenueEngine.calculateBlockPrice('tech', 1000);
    const velocity = (mockDB['system_metrics/engagement_velocity'] || {}).count || 0;
    
    console.log(`[Surge]    Tech Block Price (1k units): $${surge.price}`);
    console.log(`           Velocity: ${velocity}`);
    console.log(`           Surge Multiplier: ${surge.breakdown.surgeMultiplier}x`);
    console.log(`           Niche Multiplier: ${surge.breakdown.nicheMultiplier}x`);
    
    const priceDiff = (surge.price - baseline.price).toFixed(2);
    console.log(`\n💰 PRICE INCREASE: +$${priceDiff}`);
    
    if (surge.price > baseline.price && velocity > 500) {
        console.log("\n✅ SUCCESS: Surge Pricing Active & Greedy!");
    } else {
        console.log("\n❌ FAIL: Pricing did not surge correctly.");
    }
}

runSimulation().catch(console.error);
