// hashtagService.js
// AI-powered hashtag generation and optimization
// Finds trending, relevant hashtags for maximum reach

/* eslint-disable no-console */
class HashtagService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = "gpt-4o";

    if (!this.openaiApiKey) {
      console.warn(
        "[Hashtag] ⚠️ OPENAI_API_KEY not configured. Advanced hashtag generation will not work."
      );
    }
  }

  /**
   * Generate optimized hashtags for content
   * @param {object} contentData - Content metadata
   * @param {string} platform - Target platform
   * @param {object} options - Generation options
   * @returns {Promise<object>} Generated hashtags with analytics
   */
  async generateHashtags(contentData, platform = "instagram", options = {}) {
    try {
      if (!this.openaiApiKey) {
        return this.generateBasicHashtags(contentData, platform, options.count || 15);
      }

      const {
        count = 15,
        mixRatio = { trending: 0.4, niche: 0.4, branded: 0.2 }, // Distribution
        language = "en",
        includeMetrics: _includeMetrics = true,
      } = options;
      void _includeMetrics;

      // Build prompt
      const prompt = this.buildHashtagPrompt(contentData, platform, count, mixRatio, language);

      // Call OpenAI via central openaiClient
      const { chatCompletions } = require("./openaiClient");
      const aiResp = await chatCompletions(
        {
          model: this.model,
          messages: [
            {
              role: "system",
              content:
                "You are a social media hashtag expert. You understand trending topics, niche communities, and platform-specific hashtag strategies. You generate hashtags that maximize reach and engagement.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 500,
        },
        { feature: "hashtag_generation" }
      );

      const generatedText = aiResp.choices[0].message.content.trim();
      // (Logging done via openaiClient)

      // Parse hashtags
      const parsed = this.parseHashtagResponse(generatedText, count);

      return {
        success: true,
        platform,
        hashtags: parsed.hashtags,
        categories: parsed.categories,
        formatted: parsed.hashtags.join(" "),
        count: parsed.hashtags.length,
        estimatedReach: this.estimateReach(parsed.hashtags, platform),
        metadata: {
          language,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("[Hashtag] Error generating hashtags:", error.message);

      // Fallback
      return this.generateBasicHashtags(contentData, platform, options.count || 15);
    }
  }

  /**
   * Build hashtag generation prompt
   */
  buildHashtagPrompt(contentData, platform, count, mixRatio, language) {
    const trendingCount = Math.round(count * mixRatio.trending);
    const nicheCount = Math.round(count * mixRatio.niche);
    const brandedCount = count - trendingCount - nicheCount;

    let prompt = `Generate ${count} optimized hashtags for ${platform}.\n\n`;

    prompt += `Content Information:\n`;
    prompt += `Title: ${contentData.title || "Untitled"}\n`;
    if (contentData.description) {
      prompt += `Description: ${contentData.description.substring(0, 200)}\n`;
    }
    if (contentData.tags && contentData.tags.length > 0) {
      prompt += `Tags: ${contentData.tags.join(", ")}\n`;
    }
    if (contentData.type) {
      prompt += `Content Type: ${contentData.type}\n`;
    }

    prompt += `\nHashtag Distribution:\n`;
    prompt += `- ${trendingCount} Trending hashtags (100k-1M+ posts) for reach\n`;
    prompt += `- ${nicheCount} Niche hashtags (10k-100k posts) for targeted audience\n`;
    prompt += `- ${brandedCount} Branded/specific hashtags (1k-10k posts) for community\n`;

    prompt += `\nRequirements:\n`;
    prompt += `- Generate hashtags in ${language === "en" ? "English" : language}\n`;
    prompt += `- All hashtags must be relevant to the content\n`;
    prompt += `- Use current trending topics when applicable\n`;
    prompt += `- Mix uppercase/lowercase appropriately (e.g., #SocialMedia not #socialmedia)\n`;
    prompt += `- Avoid banned or spam hashtags\n`;
    prompt += `- Each hashtag should start with #\n`;

    prompt += `\nPlatform-specific notes:\n`;
    prompt += this.getPlatformHashtagGuidelines(platform);

    prompt += `\n\nFormat: List hashtags separated by spaces, categorized as [Trending], [Niche], or [Branded].\n`;
    prompt += `Example: [Trending] #Viral #FYP [Niche] #ContentCreator #DigitalMarketing [Branded] #AutoPromote\n`;

    return prompt;
  }

  /**
   * Get platform-specific hashtag guidelines
   */
  getPlatformHashtagGuidelines(platform) {
    const guidelines = {
      instagram: "- Instagram optimal: 10-15 hashtags. Mix popular and niche. Use hashtag stories.",
      tiktok:
        "- TikTok optimal: 4-8 hashtags. Prioritize trending sounds and challenges. Use #FYP wisely.",
      youtube:
        "- YouTube optimal: 10-15 hashtags (max 60 chars in title). Use in description and as video tags.",
      twitter:
        "- Twitter optimal: 1-2 hashtags. Keep it concise. Hashtags reduce engagement if overused.",
      facebook: "- Facebook optimal: 2-3 hashtags. Less is more. Focus on branded hashtags.",
      linkedin: "- LinkedIn optimal: 3-5 hashtags. Use professional, industry-specific tags.",
      pinterest:
        "- Pinterest optimal: 10-20 hashtags. Very keyword-focused. Include location tags.",
      reddit: "- Reddit: Minimal hashtags. Use subreddit-specific terminology instead.",
      discord: "- Discord: Hashtags not commonly used. Focus on channel names and roles.",
      telegram: "- Telegram optimal: 3-5 hashtags. Use for message searchability.",
      snapchat: "- Snapchat optimal: 1-3 hashtags. Keep casual and trending.",
      spotify: "- Spotify: Hashtags not used. Focus on genre and mood keywords instead.",
    };

    return guidelines[platform.toLowerCase()] || guidelines.instagram;
  }

  /**
   * Parse OpenAI hashtag response
   */
  parseHashtagResponse(text, maxCount) {
    const hashtags = [];
    const categories = {
      trending: [],
      niche: [],
      branded: [],
    };

    let currentCategory = "trending";

    // Extract hashtags and categorize
    // previously captured matches (not used directly):
    void (text.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g) || []);

    // Check for category markers
    const lines = text.split("\n");
    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      if (lowerLine.includes("[trending]") || lowerLine.includes("trending:")) {
        currentCategory = "trending";
      } else if (lowerLine.includes("[niche]") || lowerLine.includes("niche:")) {
        currentCategory = "niche";
      } else if (lowerLine.includes("[branded]") || lowerLine.includes("branded:")) {
        currentCategory = "branded";
      }

      // Extract hashtags from this line
      const lineHashtags = line.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g) || [];
      lineHashtags.forEach(tag => {
        if (!hashtags.includes(tag)) {
          hashtags.push(tag);
          categories[currentCategory].push(tag);
        }
      });
    }

    // If no categories detected, distribute evenly
    if (
      categories.trending.length === 0 &&
      categories.niche.length === 0 &&
      categories.branded.length === 0
    ) {
      const third = Math.floor(hashtags.length / 3);
      categories.trending = hashtags.slice(0, third);
      categories.niche = hashtags.slice(third, third * 2);
      categories.branded = hashtags.slice(third * 2);
    }

    return {
      hashtags: hashtags.slice(0, maxCount),
      categories,
    };
  }

  /**
   * Estimate reach potential of hashtags
   */
  estimateReach(hashtags, platform) {
    // Simplified estimation based on hashtag count and platform
    const baseReach = {
      instagram: 1000,
      tiktok: 2000,
      youtube: 800,
      twitter: 500,
      facebook: 300,
      linkedin: 400,
      pinterest: 600,
      reddit: 200,
      discord: 100,
      telegram: 300,
      snapchat: 400,
      spotify: 0,
    };

    const base = baseReach[platform.toLowerCase()] || 500;
    const multiplier = Math.min(hashtags.length, 15) * 0.2; // Diminishing returns after 15

    const estimatedMin = Math.round(base * (1 + multiplier));
    const estimatedMax = Math.round(estimatedMin * 3);

    return {
      min: estimatedMin,
      max: estimatedMax,
      formatted: `${estimatedMin.toLocaleString()} - ${estimatedMax.toLocaleString()}`,
    };
  }

  /**
   * Generate basic hashtags (fallback when OpenAI unavailable)
   */
  generateBasicHashtags(contentData, platform, count = 15) {
    const hashtags = new Set();

    // Platform-specific hashtag
    hashtags.add(`#${platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase()}`);

    // Content type
    if (contentData.type) {
      hashtags.add(`#${contentData.type.charAt(0).toUpperCase() + contentData.type.slice(1)}`);
    }

    // Extract from title
    if (contentData.title) {
      const words = contentData.title
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

      words.slice(0, 8).forEach(word => hashtags.add(`#${word}`));
    }

    // Extract from tags
    if (contentData.tags) {
      contentData.tags.slice(0, 5).forEach(tag => {
        const clean = tag.replace(/[^\w]/g, "");
        if (clean) {
          hashtags.add(`#${clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()}`);
        }
      });
    }

    // Platform-specific trending hashtags
    const trendingByPlatform = {
      instagram: ["#Viral", "#Trending", "#Explore", "#InstaGood", "#PhotoOfTheDay"],
      tiktok: ["#FYP", "#ForYou", "#Viral", "#TikTokTrend", "#Trending"],
      youtube: ["#YouTube", "#Subscribe", "#Video", "#Content", "#Creator"],
      twitter: ["#Trending", "#Twitter", "#Thread", "#News", "#Discussion"],
      facebook: ["#Facebook", "#Community", "#Share", "#Family", "#Friends"],
      linkedin: ["#LinkedIn", "#Professional", "#Career", "#Business", "#Industry"],
      pinterest: ["#Pinterest", "#Inspiration", "#DIY", "#Ideas", "#Design"],
      reddit: ["#Reddit", "#Community", "#Discussion", "#AskReddit", "#TIL"],
      discord: ["#Discord", "#Community", "#Gaming", "#Chat", "#Server"],
      telegram: ["#Telegram", "#Channel", "#Updates", "#News", "#Community"],
      snapchat: ["#Snapchat", "#Snap", "#Story", "#Friends", "#Fun"],
    };

    const trending = trendingByPlatform[platform.toLowerCase()] || trendingByPlatform.instagram;
    trending.forEach(tag => hashtags.add(tag));

    const hashtagArray = Array.from(hashtags).slice(0, count);

    return {
      success: true,
      platform,
      hashtags: hashtagArray,
      formatted: hashtagArray.join(" "),
      count: hashtagArray.length,
      fallback: true,
      estimatedReach: this.estimateReach(hashtagArray, platform),
      message: "Generated using fallback method (OpenAI not available)",
    };
  }

  /**
   * Analyze hashtag performance from historical data
   */
  async analyzeHashtagPerformance(hashtag, platform) {
    // This would integrate with platform APIs or your analytics database
    // Placeholder implementation
    return {
      hashtag,
      platform,
      estimatedPosts: "Unknown",
      trendingScore: "Unknown",
      competition: "Unknown",
      recommendation: "Use with other hashtags for best results",
    };
  }

  /**
   * Get trending hashtags for platform
   */
  async getTrendingHashtags(platform, count = 20) {
    try {
      if (!this.openaiApiKey) {
        throw new Error("OpenAI not configured");
      }

      const prompt = `List the top ${count} trending hashtags on ${platform} right now (as of December 2025).

Requirements:
- Include hashtags that are currently viral
- Mix of evergreen and timely hashtags
- Suitable for content creators
- Order by popularity (most popular first)

Format: Just list the hashtags separated by spaces, starting with #`;

      const { chatCompletions } = require("./openaiClient");
      const aiResp = await chatCompletions(
        {
          model: this.model,
          messages: [
            { role: "system", content: "You are a social media trends expert." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 300,
        },
        { feature: "trending_hashtags" }
      );

      const text = aiResp.choices[0].message.content.trim();
      const hashtags = (text.match(/#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g) || []).slice(0, count);

      return {
        success: true,
        platform,
        trending: hashtags,
        count: hashtags.length,
        asOf: new Date().toISOString(),
      };
    } catch (error) {
      console.error("[Hashtag] Error getting trending:", error.message);

      // Return cached/hardcoded trending hashtags as fallback
      return this.getFallbackTrending(platform, count);
    }
  }

  /**
   * Fallback trending hashtags
   */
  getFallbackTrending(platform, count) {
    const trending = {
      instagram: [
        "#Viral",
        "#Trending",
        "#Explore",
        "#InstaDaily",
        "#PhotoOfTheDay",
        "#Love",
        "#Instagood",
        "#Beautiful",
        "#Happy",
        "#Fashion",
        "#Art",
        "#Style",
        "#Travel",
        "#Nature",
        "#Food",
        "#Fitness",
        "#Motivation",
        "#LifeStyle",
        "#Photography",
        "#Inspiration",
      ],
      tiktok: [
        "#FYP",
        "#ForYou",
        "#Viral",
        "#TikTok",
        "#Trending",
        "#Dance",
        "#Comedy",
        "#Duet",
        "#Challenge",
        "#LearnOnTikTok",
        "#TikTokTrend",
        "#Funny",
        "#Music",
        "#Tutorial",
        "#POV",
        "#Storytime",
        "#Transition",
        "#Skit",
        "#Relatable",
        "#Aesthetic",
      ],
      youtube: [
        "#YouTube",
        "#Subscribe",
        "#YouTuber",
        "#Video",
        "#Vlog",
        "#Gaming",
        "#Tutorial",
        "#HowTo",
        "#Review",
        "#Unboxing",
        "#Shorts",
        "#Live",
        "#Stream",
        "#Content",
        "#Creator",
        "#Entertainment",
        "#Music",
        "#Comedy",
        "#Education",
        "#Technology",
      ],
      twitter: [
        "#Trending",
        "#News",
        "#Breaking",
        "#Thread",
        "#Twitter",
        "#Politics",
        "#Tech",
        "#Sports",
        "#Entertainment",
        "#Business",
        "#Finance",
        "#Crypto",
        "#AI",
        "#Climate",
        "#Health",
        "#Education",
        "#Science",
        "#Culture",
        "#Social",
        "#Media",
      ],
      linkedin: [
        "#LinkedIn",
        "#Career",
        "#Jobs",
        "#Professional",
        "#Business",
        "#Leadership",
        "#Hiring",
        "#Networking",
        "#Innovation",
        "#Technology",
        "#Marketing",
        "#Sales",
        "#Entrepreneurship",
        "#StartUp",
        "#Success",
        "#WorkLifeBalance",
        "#Remote",
        "#AI",
        "#Digital",
        "#Growth",
      ],
    };

    const tags = (trending[platform.toLowerCase()] || trending.instagram).slice(0, count);

    return {
      success: true,
      platform,
      trending: tags,
      count: tags.length,
      fallback: true,
      message: "Showing cached trending hashtags",
    };
  }
}

module.exports = new HashtagService();
