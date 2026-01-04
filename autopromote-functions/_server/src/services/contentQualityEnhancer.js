// contentQualityEnhancer.js
// AutoPromote Content Quality Enhancement
// Thumbnail generator, caption optimizer, hook builder, preview system

const { db } = require("../firebaseAdmin");
const fs = require("fs").promises;
const path = require("path");

class ContentQualityEnhancer {
  // Generate thumbnail suggestions
  async generateThumbnailSuggestions(content, platform) {
    try {
      const suggestions = [];

      // Text overlay suggestions based on content
      const textOverlays = this.generateTextOverlays(content);

      // Color scheme suggestions
      const colorSchemes = this.generateColorSchemes(content.category);

      // Layout suggestions
      const layouts = this.generateLayoutSuggestions(content.type, platform);

      // Font and styling suggestions
      const styling = this.generateStylingSuggestions(content.category);

      suggestions.push({
        type: "thumbnail",
        textOverlays,
        colorSchemes,
        layouts,
        styling,
        platform,
        score: this.calculateThumbnailScore(textOverlays, layouts, styling),
      });

      return suggestions;
    } catch (error) {
      console.error("Error generating thumbnail suggestions:", error);
      throw error;
    }
  }

  // Generate text overlays for thumbnails
  generateTextOverlays(content) {
    const overlays = [];

    // Hook-based overlays
    if (content.hook) {
      overlays.push({
        text: content.hook.substring(0, 50),
        position: "top",
        size: "large",
        style: "bold",
        color: "#FFFFFF",
        background: "gradient_dark",
      });
    }

    // Question overlays
    overlays.push({
      text: this.generateEngagingQuestion(content),
      position: "center",
      size: "medium",
      style: "italic",
      color: "#FFD700",
      background: "transparent",
    });

    // Call-to-action overlays
    overlays.push({
      text: "Watch Now!",
      position: "bottom_right",
      size: "small",
      style: "uppercase",
      color: "#FF6B35",
      background: "solid_light",
    });

    return overlays;
  }

  // Generate engaging questions for thumbnails
  generateEngagingQuestion(content) {
    const questions = {
      educational: [
        "Want to know the secret?",
        "This changed everything...",
        "The truth they hide?",
        "Ready for the revelation?",
      ],
      entertaining: [
        "You won't believe this!",
        "This is insane!",
        "Wait till the end!",
        "Mind = BLOWN!",
      ],
      motivational: [
        "What if I told you...",
        "The breakthrough moment!",
        "This transformed my life!",
        "Your breakthrough awaits!",
      ],
      general: ["This is huge!", "You need to see this!", "Life changing!", "Unbelievable!"],
    };

    const categoryQuestions = questions[content.category] || questions.general;
    return categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];
  }

  // Generate color schemes
  generateColorSchemes(category) {
    const schemes = {
      educational: [
        { primary: "#2E86AB", secondary: "#F24236", accent: "#FFD700" },
        { primary: "#1A535C", secondary: "#4ECDC4", accent: "#FFE66D" },
      ],
      entertaining: [
        { primary: "#FF6B35", secondary: "#F7931E", accent: "#FFD23F" },
        { primary: "#E63946", secondary: "#F1FAEE", accent: "#A8DADC" },
      ],
      motivational: [
        { primary: "#264653", secondary: "#2A9D8F", accent: "#E9C46A" },
        { primary: "#283618", secondary: "#606C38", accent: "#DDA0DD" },
      ],
      general: [
        { primary: "#7209B7", secondary: "#560BAD", accent: "#480CA8" },
        { primary: "#4361EE", secondary: "#4CC9F0", accent: "#F72585" },
      ],
    };

    return schemes[category] || schemes.general;
  }

  // Generate layout suggestions
  generateLayoutSuggestions(contentType, platform) {
    const layouts = [];

    if (contentType === "video") {
      layouts.push({
        name: "text_overlay",
        elements: ["background_video", "text_overlay", "brand_logo"],
        aspectRatio: platform === "tiktok" ? "9:16" : "16:9",
      });
    } else {
      layouts.push({
        name: "image_with_text",
        elements: ["background_image", "text_overlay", "icon"],
        aspectRatio: platform === "instagram" ? "1:1" : "16:9",
      });
    }

    layouts.push({
      name: "minimalist",
      elements: ["single_text", "subtle_background"],
      aspectRatio: "16:9",
    });

    return layouts;
  }

  // Generate styling suggestions
  generateStylingSuggestions(category) {
    const styles = {
      educational: {
        font: "serif",
        weight: "bold",
        effects: ["drop_shadow", "outline"],
        mood: "professional",
      },
      entertaining: {
        font: "display",
        weight: "black",
        effects: ["glow", "neon"],
        mood: "energetic",
      },
      motivational: {
        font: "sans_serif",
        weight: "bold",
        effects: ["emboss", "gradient"],
        mood: "inspiring",
      },
      general: {
        font: "modern",
        weight: "medium",
        effects: ["shadow"],
        mood: "clean",
      },
    };

    return styles[category] || styles.general;
  }

  // Calculate thumbnail score
  calculateThumbnailScore(textOverlays, layouts, styling) {
    let score = 50;

    // Text overlay quality
    if (textOverlays.length >= 2) score += 15;
    if (textOverlays.some(o => o.text.length < 30)) score += 10;

    // Layout effectiveness
    if (layouts.some(l => l.elements.includes("brand_logo"))) score += 10;

    // Styling appeal
    if (styling.effects.length > 1) score += 10;
    if (styling.mood === "energetic" || styling.mood === "inspiring") score += 5;

    return Math.min(100, score);
  }

  // Optimize caption with AI suggestions
  async optimizeCaption(caption, platform, content) {
    try {
      const optimization = {
        original: caption,
        suggestions: [],
        improvements: [],
      };

      // Length optimization
      const lengthCheck = this.checkCaptionLength(caption, platform);
      if (!lengthCheck.optimal) {
        optimization.suggestions.push({
          type: "length",
          suggestion: lengthCheck.suggestion,
          priority: "high",
        });
      }

      // Hook optimization
      const hookCheck = this.analyzeHookStrength(caption);
      if (hookCheck.score < 70) {
        optimization.suggestions.push({
          type: "hook",
          suggestion: hookCheck.suggestion,
          priority: "high",
        });
      }

      // Engagement bait optimization
      const engagementCheck = this.analyzeEngagementBait(caption, platform);
      if (engagementCheck.score < 60) {
        optimization.suggestions.push({
          type: "engagement",
          suggestion: engagementCheck.suggestion,
          priority: "medium",
        });
      }

      // Hashtag optimization
      const hashtagCheck = this.analyzeHashtags(caption, platform);
      if (hashtagCheck.needsImprovement) {
        optimization.suggestions.push({
          type: "hashtags",
          suggestion: hashtagCheck.suggestion,
          priority: "low",
        });
      }

      // Generate improved caption
      optimization.improved = this.generateImprovedCaption(caption, optimization.suggestions);
      optimization.score = this.calculateCaptionOptimizationScore(optimization);

      return optimization;
    } catch (error) {
      console.error("Error optimizing caption:", error);
      throw error;
    }
  }

  // Check caption length for platform
  checkCaptionLength(caption, platform) {
    const limits = {
      tiktok: { min: 10, max: 80, optimal: 40 },
      instagram: { min: 15, max: 125, optimal: 60 },
      youtube: { min: 20, max: 200, optimal: 80 },
      twitter: { min: 5, max: 60, optimal: 30 },
    };

    const limit = limits[platform] || limits.instagram;
    const wordCount = caption.split(" ").length;

    if (wordCount < limit.min) {
      return {
        optimal: false,
        suggestion: `Caption is too short (${wordCount} words). Add more engaging content to reach ${limit.optimal} words.`,
      };
    } else if (wordCount > limit.max) {
      return {
        optimal: false,
        suggestion: `Caption is too long (${wordCount} words). Shorten to ${limit.optimal} words for better engagement.`,
      };
    }

    return { optimal: true };
  }

  // Analyze hook strength
  analyzeHookStrength(caption) {
    const hooks = [
      "watch",
      "see",
      "know",
      "believe",
      "happens",
      "secret",
      "truth",
      "changed",
      "crazy",
      "insane",
    ];
    const questions = caption.includes("?");
    const exclamations = (caption.match(/!/g) || []).length;
    const hookWords = hooks.filter(word => caption.toLowerCase().includes(word)).length;

    let score = 30;
    if (questions) score += 25;
    if (exclamations > 0) score += 15;
    if (hookWords > 0) score += 20;
    if (caption.length < 50 && (questions || exclamations)) score += 10;

    const suggestion =
      score < 70
        ? "Add a stronger hook at the beginning. Try questions or surprising statements."
        : "Hook is strong!";

    return { score: Math.min(100, score), suggestion };
  }

  // Analyze engagement bait
  analyzeEngagementBait(caption, platform) {
    const engagementWords = {
      tiktok: ["comment", "duet", "stitch", "tag", "save", "share"],
      instagram: ["save", "tag", "comment", "story", "dm", "share"],
      youtube: ["like", "subscribe", "comment", "share", "bell"],
      twitter: ["retweet", "reply", "like", "follow", "share"],
    };

    const words = engagementWords[platform] || engagementWords.instagram;
    const hasEngagement = words.some(word => caption.toLowerCase().includes(word));

    const score = hasEngagement ? 80 : 30;
    const suggestion = hasEngagement
      ? "Good engagement bait!"
      : `Add engagement bait like "${words[0]}" or "${words[1]}" to increase interactions.`;

    return { score, suggestion };
  }

  // Analyze hashtags
  analyzeHashtags(caption, platform) {
    const hashtags = caption.match(/#\w+/g) || [];
    const limits = { tiktok: 5, instagram: 30, youtube: 15, twitter: 5 };
    const limit = limits[platform] || 10;

    if (hashtags.length === 0) {
      return {
        needsImprovement: true,
        suggestion: "Add relevant hashtags to increase discoverability.",
      };
    }

    if (hashtags.length > limit) {
      return {
        needsImprovement: true,
        suggestion: `Too many hashtags (${hashtags.length}). Limit to ${limit} for better engagement.`,
      };
    }

    return { needsImprovement: false };
  }

  // Generate improved caption
  generateImprovedCaption(original, suggestions) {
    let improved = original;

    // Apply high-priority suggestions first
    const highPriority = suggestions.filter(s => s.priority === "high");

    for (const suggestion of highPriority) {
      switch (suggestion.type) {
        case "hook": {
          // Add a strong hook if missing
          const hooks = [
            "You won't believe this...",
            "This changed everything!",
            "Watch till the end!",
            "The secret they don't want you to know...",
          ];
          improved = hooks[Math.floor(Math.random() * hooks.length)] + "\n\n" + improved;
          break;
        }

        case "length":
          // This would require more complex logic to expand/shorten
          break;
      }
    }

    // Add engagement bait if missing
    if (
      !improved.toLowerCase().includes("comment") &&
      !improved.toLowerCase().includes("save") &&
      !improved.toLowerCase().includes("tag")
    ) {
      improved += "\n\nComment your thoughts below! 👇";
    }

    return improved;
  }

  // Calculate caption optimization score
  calculateCaptionOptimizationScore(optimization) {
    let score = 60; // Base score

    // Original caption quality
    if (optimization.original.length > 20) score += 10;

    // Number of improvements
    score += Math.min(20, optimization.suggestions.length * 5);

    // High priority suggestions addressed
    const highPriority = optimization.suggestions.filter(s => s.priority === "high").length;
    if (highPriority === 0) score += 10;

    return Math.min(100, score);
  }

  // Generate content preview across platforms
  async generateContentPreview(content, platforms) {
    try {
      const previews = {};

      for (const platform of platforms) {
        previews[platform] = {
          thumbnail: await this.generateThumbnailSuggestions(content, platform),
          caption: await this.optimizeCaption(content.description || "", platform, content),
          hashtags: await this.generateOptimalHashtags(content, platform),
          timing: this.getOptimalPostingTime(platform),
          expectedPerformance: this.predictPerformance(content, platform),
        };
      }

      return {
        content,
        previews,
        summary: this.generatePreviewSummary(previews),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error generating content preview:", error);
      throw error;
    }
  }

  // Generate optimal hashtags for content
  async generateOptimalHashtags(content, platform) {
    try {
      const hashtagEngine = require("./hashtagEngine");
      return await hashtagEngine.generateCustomHashtags({
        content,
        platform,
        customTags: [],
        growthGuarantee: true,
      });
    } catch (error) {
      // Fallback hashtags
      return {
        hashtags: ["#viral", "#trending", "#content", "#amazing"],
        score: 50,
      };
    }
  }

  // Get optimal posting time
  getOptimalPostingTime(platform) {
    const optimalTimes = {
      tiktok: "19:00",
      instagram: "11:00",
      youtube: "15:00",
      twitter: "13:00",
    };

    return {
      time: optimalTimes[platform] || "12:00",
      reason: "Peak engagement time for this platform",
      score: 85,
    };
  }

  // Predict performance
  predictPerformance(content, platform) {
    // Simple prediction based on content quality
    const baseScore = 50;
    let prediction = baseScore;

    if (content.quality_score > 70) prediction += 20;
    if (content.description && content.description.length > 20) prediction += 10;
    if (content.target_platforms && content.target_platforms.includes(platform)) prediction += 10;

    return {
      expectedViews: Math.floor(prediction * 100),
      expectedEngagement: prediction / 2,
      confidence: prediction,
      factors: ["Content quality", "Caption optimization", "Platform targeting", "Posting time"],
    };
  }

  // Generate preview summary
  generatePreviewSummary(previews) {
    const platforms = Object.keys(previews);
    const avgScore =
      platforms.reduce((sum, p) => sum + previews[p].expectedPerformance.confidence, 0) /
      platforms.length;

    return {
      platforms: platforms.length,
      averageScore: Math.round(avgScore),
      bestPlatform: platforms.reduce((best, p) =>
        previews[p].expectedPerformance.confidence > previews[best].expectedPerformance.confidence
          ? p
          : best
      ),
      recommendations: [
        "Review all platform previews before posting",
        "Choose the platform with highest predicted performance",
        "Test different captions for A/B testing",
      ],
    };
  }

  // Hook builder with templates
  generateHookTemplates(contentType, count = 5) {
    const templates = {
      educational: [
        "The secret {experts} don't want you to know...",
        "This {concept} changed my entire perspective...",
        "What {industry} gets completely wrong...",
        "The {number} step formula that actually works...",
        "Why {common_belief} is a total myth...",
      ],
      entertaining: [
        "I tried {activity} for {time}... you won't believe what happened!",
        "POV: You're suddenly {scenario} 💭",
        "When {normal_thing} goes completely {unexpected} 😱",
        "Nobody: {nothing}\nMe: {everything} 😂",
        "The most {adjective} {thing} I've ever created...",
      ],
      motivational: [
        "How I went from {starting_point} to {ending_point} in {timeframe}...",
        "The {one_thing} that transformed my entire life...",
        "Why {successful_people} all follow this one rule...",
        "The mindset shift that brought me {result}...",
        "Stop {bad_habit} and start {good_habit} immediately...",
      ],
    };

    const typeTemplates = templates[contentType] || templates.entertaining;
    return typeTemplates.sort(() => 0.5 - Math.random()).slice(0, count);
  }
}

module.exports = new ContentQualityEnhancer();
