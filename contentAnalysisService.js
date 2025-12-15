const { db, storage } = require("./src/firebaseAdmin");
const crypto = require("crypto");
const axios = require("axios");

class ContentAnalysisService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.useAI = !!this.openaiApiKey;

    if (!this.openaiApiKey) {
      console.warn("[ContentAnalysis] ⚠️ OPENAI_API_KEY not set. Using basic heuristic analysis.");
    }
  }

  async analyzeContent(contentId) {
    try {
      // Get content details
      const contentRef = db.collection("content").doc(contentId);
      const content = await contentRef.get();

      if (!content.exists) {
        throw new Error("Content not found");
      }

      const contentData = content.data();
      const analysis = {
        contentId,
        timestamp: new Date(),
        metrics: {},
        recommendations: [],
        targetAudience: [],
        optimizationScore: 0,
      };

      // Analyze based on content type
      switch (contentData.type) {
        case "video":
          analysis.metrics = await this.analyzeVideo(contentData);
          break;
        case "image":
          analysis.metrics = await this.analyzeImage(contentData);
          break;
        case "website":
          analysis.metrics = await this.analyzeWebsite(contentData);
          break;
        case "song":
          analysis.metrics = await this.analyzeSong(contentData);
          break;
      }

      // AI-powered deep analysis if available
      if (this.useAI) {
        try {
          const aiAnalysis = await this.analyzeWithAI(contentData);
          analysis.aiInsights = aiAnalysis;
          analysis.optimizationScore =
            aiAnalysis.viralScore || this.calculateOptimizationScore(analysis.metrics);
          analysis.recommendations =
            aiAnalysis.recommendations || this.generateRecommendations(analysis.metrics);
          analysis.targetAudience =
            aiAnalysis.targetAudience || this.identifyTargetAudience(analysis.metrics);
          analysis.hashtags = aiAnalysis.hashtags || [];
        } catch (aiError) {
          console.warn("[ContentAnalysis] AI analysis failed, using fallback:", aiError.message);
          analysis.recommendations = this.generateRecommendations(analysis.metrics);
          analysis.optimizationScore = this.calculateOptimizationScore(analysis.metrics);
          analysis.targetAudience = this.identifyTargetAudience(analysis.metrics);
        }
      } else {
        // Fallback to basic analysis
        analysis.recommendations = this.generateRecommendations(analysis.metrics);
        analysis.optimizationScore = this.calculateOptimizationScore(analysis.metrics);
        analysis.targetAudience = this.identifyTargetAudience(analysis.metrics);
      }

      // Store analysis results
      await contentRef.update({
        lastAnalysis: analysis,
        updatedAt: new Date(),
      });

      return analysis;
    } catch (error) {
      console.error("Error in content analysis:", error);
      throw error;
    }
  }

  /**
   * AI-powered content analysis using OpenAI
   */
  async analyzeWithAI(contentData) {
    try {
      const prompt = `Analyze this content for viral potential and provide optimization recommendations:

Title: ${contentData.title || "No title"}
Description: ${contentData.description || "No description"}
Tags: ${contentData.tags ? contentData.tags.join(", ") : "No tags"}
Type: ${contentData.type || "unknown"}

Provide analysis in JSON format with:
{
  "viralScore": (0-100),
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "targetAudience": ["demographic1", "demographic2"],
  "bestPlatforms": ["platform1", "platform2"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "postingStrategy": "best time and frequency advice"
}`;

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a viral content strategist and social media expert. Analyze content and provide actionable optimization insights.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 800,
        },
        {
          headers: {
            Authorization: `Bearer ${this.openaiApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        }
      );

      const result = JSON.parse(response.data.choices[0].message.content);
      return result;
    } catch (error) {
      console.error("[ContentAnalysis] AI analysis error:", error.message);
      throw error;
    }
  }

  async analyzeVideo(contentData) {
    return {
      duration: contentData.duration || 0,
      quality: contentData.quality || "HD",
      thumbnailQuality: "good",
      titleOptimization: this.analyzeTitleSEO(contentData.title),
      descriptionOptimization: this.analyzeDescriptionSEO(contentData.description),
      tagOptimization: this.analyzeTagsSEO(contentData.tags),
      viralPotentialScore: this.calculateViralPotential(contentData),
    };
  }

  async analyzeImage(contentData) {
    return {
      resolution: contentData.resolution || "high",
      colorProfile: "RGB",
      visualAppeal: "high",
      seoOptimization: this.analyzeTitleSEO(contentData.title),
    };
  }

  async analyzeWebsite(contentData) {
    return {
      loadSpeed: "fast",
      mobileOptimization: true,
      seoScore: 85,
      userExperience: "good",
    };
  }

  async analyzeSong(contentData) {
    return {
      duration: contentData.duration || 0,
      genre: contentData.genre || "unknown",
      quality: "high",
      marketPotential: "good",
    };
  }

  analyzeTitleSEO(title) {
    // Implement title SEO analysis
    return {
      length: title.length,
      keywordOptimized: true,
      score: 85,
    };
  }

  analyzeDescriptionSEO(description) {
    // Implement description SEO analysis
    return {
      length: description?.length || 0,
      keywordDensity: 2.5,
      score: 80,
    };
  }

  analyzeTagsSEO(tags) {
    // Implement tags SEO analysis
    return {
      count: tags?.length || 0,
      relevance: "high",
      score: 90,
    };
  }

  calculateViralPotential(contentData) {
    // Implement viral potential calculation (placeholder uses secure RNG)
    return crypto.randomInt(0, 100);
  }

  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.titleOptimization?.score < 90) {
      recommendations.push({
        type: "title",
        priority: "high",
        suggestion: "Optimize title with trending keywords",
      });
    }

    if (metrics.descriptionOptimization?.score < 85) {
      recommendations.push({
        type: "description",
        priority: "medium",
        suggestion: "Add more detailed description with keywords",
      });
    }

    // Add more recommendation logic

    return recommendations;
  }

  calculateOptimizationScore(metrics) {
    // Calculate overall optimization score
    let score = 0;
    let factors = 0;

    if (metrics.titleOptimization?.score) {
      score += metrics.titleOptimization.score;
      factors++;
    }

    if (metrics.descriptionOptimization?.score) {
      score += metrics.descriptionOptimization.score;
      factors++;
    }

    if (metrics.tagOptimization?.score) {
      score += metrics.tagOptimization.score;
      factors++;
    }

    return factors > 0 ? Math.round(score / factors) : 0;
  }

  identifyTargetAudience(metrics) {
    // Implement target audience identification
    return [
      {
        demographic: "young-adults",
        ageRange: "18-34",
        interests: ["technology", "entertainment"],
        platforms: ["instagram", "tiktok"],
      },
    ];
  }
}

module.exports = new ContentAnalysisService();
