const contentAnalysisService = require('./contentAnalysisService');
const abTestingService = require('./abTestingService');
const { db } = require('./firebaseAdmin');

async function testNewFeatures() {
    try {
        // Test Content Analysis
        console.log('Testing Content Analysis Service...');
        const testContent = {
            id: 'test-content-1',
            title: 'Test Video',
            type: 'video',
            description: 'This is a test video for content analysis',
            duration: 180, // 3 minutes
            quality: 'HD',
            tags: ['test', 'video', 'analysis']
        };

        const analysis = await contentAnalysisService.analyzeContent(testContent.id);
        console.log('✅ Content Analysis successful:', analysis);

        // Test A/B Testing
        console.log('\nTesting A/B Testing Service...');
        const variants = [
            {
                id: 'variant-a',
                name: 'Version A',
                promotionSettings: {
                    platform: 'youtube',
                    target_audience: ['tech-enthusiasts'],
                    budget: 100
                }
            },
            {
                id: 'variant-b',
                name: 'Version B',
                promotionSettings: {
                    platform: 'facebook',
                    target_audience: ['general-audience'],
                    budget: 100
                }
            }
        ];

        const abTest = await abTestingService.createTest(testContent.id, variants);
        console.log('✅ A/B Test created successfully:', abTest);

        // Enable autopilot for this test (quick settings for test)
        await db.collection('ab_tests').doc(abTest.testId).update({
            'autopilot.enabled': true,
            'autopilot.confidenceThreshold': 80,
            'autopilot.minSample': 20
        });
        console.log('✅ Autopilot enabled for test', abTest.testId);

        // Update test metrics
        const metrics = {
            views: 1500,
            engagement: 450,
            conversions: 50,
            revenue: 200
        };

        // Update each variant metrics to simulate a winner
        const variantA_metrics = { views: 500, engagement: 200, conversions: 40, revenue: 100 };
        const variantB_metrics = { views: 110, engagement: 40, conversions: 1, revenue: 2 };

        await abTestingService.updateTestMetrics(abTest.testId, 'variant-b', variantB_metrics);
        const updatedTestB = await abTestingService.updateTestMetrics(abTest.testId, 'variant-a', variantA_metrics);
        console.log('✅ Test metrics updated successfully:', updatedTestB);

        // Read updated test doc to see if the autopilot applied a winner
        const snap = await db.collection('ab_tests').doc(abTest.testId).get();
        const testDoc = snap.data();
        console.log('🔎 Test doc after updates:', { winner: testDoc.winner, autopilotActions: testDoc.autopilotActions });
        console.log('✅ Test metrics updated successfully:', updatedTest);

        return true;
    } catch (error) {
        console.error('❌ New features test failed:', error);
        throw error;
    }
}

testNewFeatures()
    .then(() => console.log('All new feature tests completed successfully!'))
    .catch(console.error);
