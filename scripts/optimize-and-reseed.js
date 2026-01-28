require('dotenv').config();
const { db } = require('../firebaseAdmin');
(async function(){
  try{
    const contentId = process.argv[2] || '9xNxmdWL78jcQBeReoLi';
    console.log('[optimize] optimizing content', contentId);
    const contentSnap = await db.collection('content').doc(contentId).get();
    if (!contentSnap.exists) throw new Error('Content not found: ' + contentId);
    const content = { id: contentSnap.id, ...contentSnap.data() };

    const hashtagEngine = require('../src/services/hashtagEngine');
    const algorithm = require('../src/services/algorithmExploitationEngine');
    const viralImpact = require('../src/services/viralImpactEngine');

    const hashtagsRes = await hashtagEngine.generateCustomHashtags({ content, platform: 'twitter', customTags: [] });
    const optimized = await algorithm.optimizeForAlgorithm(content, 'twitter');

    const updates = {
      hashtags: hashtagsRes.hashtags,
      optimizedCaption: optimized.optimizedCaption || optimized.hook || content.description || content.title,
      quality_score: 0.95,
      engagement_rate: 0.2,
      features: ['trending_sound','hook','engagement_bait'],
      viral_optimized: true,
      updated_at: new Date().toISOString(),
    };

    await db.collection('content').doc(contentId).update(updates);
    console.log('[optimize] updated content with optimization fields');

    // Re-fetch
    const newContentSnap = await db.collection('content').doc(contentId).get();
    const newContent = { id: newContentSnap.id, ...newContentSnap.data() };

    console.log('[optimize] reseeding content to visibility zones (twitter)');
    const seedRes = await viralImpact.seedContentToVisibilityZones(newContent, 'twitter', { forceAll: false });
    console.log('[optimize] seeding result:', JSON.stringify(seedRes, null, 2));
    process.exit(0);
  }catch(e){
    console.error('[optimize] ERROR', e && e.message); console.error(e && e.stack); process.exit(2);
  }
})();