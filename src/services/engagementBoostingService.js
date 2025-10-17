// engagementBoostingService.js
// AutoPromote Engagement Boosting System
// Caption generators, viral sound matchers, A/B testing, retry boosts

const { db } = require('../firebaseAdmin');

// Caption templates for different content types and viral hooks
const CAPTION_TEMPLATES = {
  hooks: [
    "Watch till the end... you won't believe what happens! 🤯",
    "This changed my life... and it might change yours too 💫",
    "The secret they don't want you to know... 🤫",
    "I almost didn't post this... but I'm glad I did 🔥",
    "You need to see this RIGHT NOW! ⚡",
    "This is blowing up... and here's why 🌟",
    "The most important video you'll watch today 📌",
    "I cried making this... emotional warning ⚠️",
    "This took me 3 months to figure out... now you know! 🧠",
    "The real reason this works... science backed 💯"
  ],
  viral: [
    "POV: {scenario} 💭",
    "Nobody: {blank}\nMe: {punchline} 😂",
    "When {common_situation} but {twist} 😱",
    "How to {skill} in {timeframe} 🚀",
    "{number} ways to {benefit} 💪",
    "The difference between {amateur} vs {pro} 🎯",
    "Why {everyone} is wrong about {topic} 🤔",
    "{celebrity} would never admit this... but it's true! ⭐",
    "I tried {trend} for {duration}... here's what happened 📈",
    "The {adjective} way to {action} 💫"
  ],
  engagement: [
    "Comment your thoughts below! 👇",
    "What's your take on this? 🤔",
    "Tag a friend who needs to see this! 👥",
    "Save this for later! 💾",
    "Drop a 🔥 if you agree!",
    "What's your experience with this? 💭",
    "Share your story in the comments! 📝",
    "Who's trying this? 🙋‍♀️",
    "Rate this 1-10! ⭐",
    "What's your favorite part? 🎯"
  ],
  hashtags: {
    trending: ['#fyp', '#viral', '#trending', '#explorepage', '#reels'],
    niche: ['#lifehacks', '#motivation', '#success', '#mindset', '#growth'],
    branded: ['#AutoPromoteBoosted', '#ViralGrowth', '#ContentThatConverts']
  }
};

// Viral sound library (would be populated from trending data)
const VIRAL_SOUND_LIBRARY = {
  tiktok: [
    { id: 'trend1', name: 'Viral Dance Beat', category: 'dance', popularity: 95 },
    { id: 'trend2', name: 'Emotional Piano', category: 'emotional', popularity: 88 },
    { id: 'trend3', name: 'Comedy Sound', category: 'comedy', popularity: 92 },
    { id: 'trend4', name: 'Motivational Beat', category: 'motivation', popularity: 85 }
  ],
  instagram: [
    { id: 'reel1', name: 'Trending Reels Sound', category: 'general', popularity: 90 },
    { id: 'reel2', name: 'Story Sound', category: 'story', popularity: 78 }
  ]
};

class EngagementBoostingService {
  // Generate viral caption with hook, body, and engagement bait
  generateViralCaption(content, platform, options = {}) {
    const { category, tone, length } = options;

    // Select hook based on content type
    const hook = this.selectHook(content, category);

    // Generate main caption body
    const body = this.generateCaptionBody(content, platform, tone);

    // Add engagement bait
    const engagementBait = this.generateEngagementBait(platform);

    // Combine with optimal formatting
    const fullCaption = this.formatCaption(hook, body, engagementBait, platform);

    return {
      caption: fullCaption,
      hook,
      body,
      engagementBait,
      wordCount: fullCaption.split(' ').length,
      hashtags: this.generateCaptionHashtags(content, platform),
      optimizationScore: this.calculateCaptionScore(fullCaption, platform)
    };
  }

  // Select optimal hook for content
  selectHook(content, category) {
    const hooks = CAPTION_TEMPLATES.hooks;
    const categoryHooks = {
      educational: hooks.filter(h => h.includes('learn') || h.includes('secret') || h.includes('important')),
      emotional: hooks.filter(h => h.includes('cried') || h.includes('life') || h.includes('emotional')),
      entertaining: hooks.filter(h => h.includes('believe') || h.includes('happens') || h.includes('blowing')),
      motivational: hooks.filter(h => h.includes('changed') || h.includes('secret') || h.includes('works')),
      general: hooks
    };

    const relevantHooks = categoryHooks[category] || categoryHooks.general;
    return relevantHooks[Math.floor(Math.random() * relevantHooks.length)];
  }

  // Generate main caption body
  generateCaptionBody(content, platform, tone) {
    const templates = CAPTION_TEMPLATES.viral;
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Fill in template variables
    return template
      .replace('{scenario}', content.scenario || 'you wake up tomorrow')
      .replace('{blank}', content.blank || 'absolutely nothing')
      .replace('{punchline}', content.punchline || 'viral content everywhere')
      .replace('{common_situation}', content.situation || 'life is normal')
      .replace('{twist}', content.twist || 'this happens')
      .replace('{skill}', content.skill || 'go viral')
      .replace('{timeframe}', content.timeframe || '24 hours')
      .replace('{number}', content.number || '5')
      .replace('{benefit}', content.benefit || 'grow your audience')
      .replace('{amateur}', content.amateur || 'beginners')
      .replace('{pro}', content.pro || 'experts')
      .replace('{everyone}', content.everyone || 'people')
      .replace('{topic}', content.topic || 'social media')
      .replace('{celebrity}', content.celebrity || 'influencers')
      .replace('{trend}', content.trend || 'this trend')
      .replace('{duration}', content.duration || 'a week')
      .replace('{adjective}', content.adjective || 'smart')
      .replace('{action}', content.action || 'succeed');
  }

  // Generate engagement bait for platform
  generateEngagementBait(platform) {
    const baits = CAPTION_TEMPLATES.engagement;
    const platformBaits = {
      tiktok: baits.filter(b => b.includes('comment') || b.includes('tag') || b.includes('save')),
      instagram: baits.filter(b => b.includes('save') || b.includes('tag') || b.includes('story')),
      youtube: baits.filter(b => b.includes('like') || b.includes('subscribe') || b.includes('comment')),
      twitter: baits.filter(b => b.includes('retweet') || b.includes('reply') || b.includes('like'))
    };

    const relevantBaits = platformBaits[platform] || baits;
    return relevantBaits[Math.floor(Math.random() * relevantBaits.length)];
  }

  // Format caption with optimal structure for platform
  formatCaption(hook, body, engagementBait, platform) {
    const formats = {
      tiktok: `${hook}\n\n${body}\n\n${engagementBait}`,
      instagram: `${hook}\n\n${body}\n\n${engagementBait}`,
      youtube: `${hook}\n\n${body}\n\n${engagementBait}\n\n#viral #trending`,
      twitter: `${hook} ${body} ${engagementBait}`
    };

    return formats[platform] || `${hook}\n\n${body}\n\n${engagementBait}`;
  }

  // Generate hashtags for caption
  generateCaptionHashtags(content, platform) {
    const trending = CAPTION_TEMPLATES.hashtags.trending;
    const niche = CAPTION_TEMPLATES.hashtags.niche.filter(tag =>
      content.category && tag.toLowerCase().includes(content.category.toLowerCase())
    );
    const branded = CAPTION_TEMPLATES.hashtags.branded;

    // Platform-specific hashtag limits
    const limits = { tiktok: 5, instagram: 30, youtube: 15, twitter: 5 };
    const limit = limits[platform] || 5;

    const allTags = [...trending, ...niche, ...branded];
    const selected = allTags.sort(() => 0.5 - Math.random()).slice(0, limit);

    return selected;
  }

  // Calculate caption optimization score
  calculateCaptionScore(caption, platform) {
    let score = 50; // Base score

    // Length optimization
    const wordCount = caption.split(' ').length;
    const optimalLengths = { tiktok: [10, 25], instagram: [15, 30], youtube: [20, 40], twitter: [5, 15] };
    const [min, max] = optimalLengths[platform] || [10, 25];
    if (wordCount >= min && wordCount <= max) score += 20;

    // Hook presence
    if (caption.includes('!') || caption.includes('?') || caption.includes('...')) score += 15;

    // Engagement bait
    if (caption.includes('comment') || caption.includes('tag') || caption.includes('save')) score += 10;

    // Hashtags
    const hashtagCount = (caption.match(/#/g) || []).length;
    if (hashtagCount > 0 && hashtagCount <= 5) score += 5;

    return Math.min(100, score);
  }

  // Match trending sounds for content
  matchTrendingSound(content, platform) {
    const sounds = VIRAL_SOUND_LIBRARY[platform] || [];
    if (!sounds.length) return null;

    // Match by content category
    const categoryMatches = sounds.filter(sound =>
      content.category && sound.category === content.category
    );

    // Fallback to most popular
    const candidates = categoryMatches.length ? categoryMatches : sounds;
    const selected = candidates.sort((a, b) => b.popularity - a.popularity)[0];

    return selected || null;
  }

  // Create A/B test for content variations
  async createABTest(contentId, variations, platform, duration = 24) {
    try {
      const testId = `ab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const abTest = {
        testId,
        contentId,
        platform,
        variations: variations.map((v, i) => ({
          id: `v${i + 1}`,
          ...v,
          metrics: { views: 0, engagements: 0, clicks: 0 }
        })),
        duration, // hours
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + duration * 60 * 60 * 1000).toISOString(),
        status: 'active',
        winner: null
      };

      // Store in database
      await db.collection('ab_tests').doc(testId).set(abTest);

      return abTest;
    } catch (error) {
      console.error('Error creating A/B test:', error);
      throw error;
    }
  }

  // Get A/B test results
  async getABTestResults(testId) {
    try {
      const testDoc = await db.collection('ab_tests').doc(testId).get();
      if (!testDoc.exists) throw new Error('A/B test not found');

      const test = testDoc.data();

      // Calculate winner based on engagement rate
      const variations = test.variations.map(v => ({
        ...v,
        engagementRate: v.metrics.views > 0 ? v.metrics.engagements / v.metrics.views : 0
      }));

      const winner = variations.reduce((best, current) =>
        current.engagementRate > best.engagementRate ? current : best
      );

      return {
        testId,
        status: test.status,
        variations,
        winner: winner.id,
        confidence: this.calculateTestConfidence(variations),
        endTime: test.endTime
      };
    } catch (error) {
      console.error('Error getting A/B test results:', error);
      throw error;
    }
  }

  // Calculate A/B test confidence
  calculateTestConfidence(variations) {
    if (variations.length < 2) return 0;

    const rates = variations.map(v =>
      v.metrics.views > 0 ? v.metrics.engagements / v.metrics.views : 0
    );

    const maxRate = Math.max(...rates);
    const minRate = Math.min(...rates);
    const range = maxRate - minRate;

    // Simple confidence calculation
    if (range === 0) return 50; // No difference
    if (maxRate === 0) return 0; // No engagement

    return Math.min(95, (range / maxRate) * 100);
  }

  // Check if content needs retry boost
  async checkRetryEligibility(contentId) {
    try {
      const contentDoc = await db.collection('content').doc(contentId).get();
      if (!contentDoc.exists) throw new Error('Content not found');

      const content = contentDoc.data();
      const metrics = content.metrics || {};

      // Growth guarantee thresholds
      const thresholds = {
        tiktok: { views: 20000, engagements: 1000 },
        instagram: { views: 15000, engagements: 800 },
        youtube: { views: 10000, engagements: 500 },
        twitter: { views: 5000, engagements: 200 }
      };

      const platform = content.target_platforms?.[0] || 'tiktok';
      const threshold = thresholds[platform] || thresholds.tiktok;

      const needsRetry = metrics.views < threshold.views ||
                        metrics.engagements < threshold.engagements;

      return {
        contentId,
        needsRetry,
        currentMetrics: metrics,
        thresholds: threshold,
        platform,
        retryReason: needsRetry ? this.getRetryReason(metrics, threshold) : null
      };
    } catch (error) {
      console.error('Error checking retry eligibility:', error);
      throw error;
    }
  }

  // Get reason for retry
  getRetryReason(metrics, threshold) {
    if (metrics.views < threshold.views) {
      return `Views (${metrics.views}) below threshold (${threshold.views})`;
    }
    if (metrics.engagements < threshold.engagements) {
      return `Engagements (${metrics.engagements}) below threshold (${threshold.engagements})`;
    }
    return 'Performance below growth guarantee';
  }

  // Schedule retry boost
  async scheduleRetryBoost(contentId, retryStrategy = {}) {
    try {
      const eligibility = await this.checkRetryEligibility(contentId);
      if (!eligibility.needsRetry) {
        throw new Error('Content does not qualify for retry boost');
      }

      const retryBoost = {
        contentId,
        retryId: `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalMetrics: eligibility.currentMetrics,
        strategy: {
          newCaption: retryStrategy.newCaption || true,
          newHashtags: retryStrategy.newHashtags || true,
          newTiming: retryStrategy.newTiming || true,
          newThumbnail: retryStrategy.newThumbnail || false,
          ...retryStrategy
        },
        scheduledTime: retryStrategy.scheduledTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours later
        status: 'scheduled',
        createdAt: new Date().toISOString()
      };

      await db.collection('retry_boosts').doc(retryBoost.retryId).set(retryBoost);

      return retryBoost;
    } catch (error) {
      console.error('Error scheduling retry boost:', error);
      throw error;
    }
  }

  // Generate hook templates for content type
  generateHookTemplates(contentType, count = 5) {
    const templates = {
      educational: [
        "The secret {experts} don't want you to know...",
        "This {concept} changed everything for me...",
        "What {industry} gets wrong about {topic}...",
        "The {number} step process that actually works...",
        "Why {common_belief} is completely wrong..."
      ],
      entertaining: [
        "I tried {activity} for {time}... here's what happened!",
        "POV: You're {scenario} 💭",
        "When {normal_thing} goes {unexpected} 😱",
        "Nobody: {nothing}\nMe: {everything} 😂",
        "The most {adjective} {thing} ever created..."
      ],
      motivational: [
        "How I went from {starting_point} to {ending_point}...",
        "The {one_thing} that changed my entire life...",
        "Why {successful_people} all do this one thing...",
        "The mindset shift that brought me {result}...",
        "Stop {bad_habit} and start {good_habit}..."
      ]
    };

    const typeTemplates = templates[contentType] || templates.entertaining;
    return typeTemplates.sort(() => 0.5 - Math.random()).slice(0, count);
  }
}

module.exports = new EngagementBoostingService();
