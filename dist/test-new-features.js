const contentAnalysisService = require('./contentAnalysisService');
const abTestingService = require('./abTestingService');

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

        // Update test metrics
        const metrics = {
            views: 1500,
            engagement: 450,
            conversions: 50,
            revenue: 200
        };

        const updatedTest = await abTestingService.updateTestMetrics(abTest.testId, 'variant-a', metrics);
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
