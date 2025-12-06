const abTestingService = require('../abTestingService');
const autopilotService = require('../src/services/autopilotService');
const { db } = require('../src/firebaseAdmin');

async function run() {
  try {
    // Create a dummy content doc
    const contentRef = await db.collection('content').add({ title: 'Autopilot Test Content', type: 'video', created_at: new Date() });
    const contentId = contentRef.id;
    // Create AB test with two variants
    const variants = [
      { id: 'variant-a', name: 'A', promotionSettings: { platform: 'youtube', budget: 50 }, metrics: { views: 1000, conversions: 40 } },
      { id: 'variant-b', name: 'B', promotionSettings: { platform: 'facebook', budget: 50 }, metrics: { views: 1000, conversions: 10 } }
    ];
    const abTest = await abTestingService.createTest(contentId, variants);
    console.log('Created AB test:', abTest.testId);
    // Update autopilot settings for this test
    await db.collection('ab_tests').doc(abTest.testId).update({ 'autopilot.enabled': true, 'autopilot.confidenceThreshold': 50, 'autopilot.minSample': 10 });
    console.log('Autopilot enabled');
    // Simulate a metrics update which will invoke autopilot evaluation
    await abTestingService.updateTestMetrics(abTest.testId, 'variant-a', { views: 1200, conversions: 50 });
    // Try apply autopilot via admin service
    const result = await autopilotService.applyAuto(abTest.testId);
    console.log('Auto apply result:', result);
    // Fetch test doc and print actions
    const snap = await db.collection('ab_tests').doc(abTest.testId).get();
    console.log('Final test doc:', snap.data());
  } catch (e) {
    console.error('Test failed:', e.message || e);
  }
}

run();
