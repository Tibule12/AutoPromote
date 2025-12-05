// captionGenerationService.js
// AI-powered caption generation for social media content
// Generates platform-optimized, engaging captions with hashtags

const axios = require('axios');

class CaptionGenerationService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = 'gpt-4o';
    
    if (!this.openaiApiKey) {
      console.warn('[CaptionGen] ⚠️ OPENAI_API_KEY not configured. Caption generation will not work.');
    }
  }

  /**
   * Generate platform-optimized caption
   * @param {object} contentData - Content metadata (title, description, tags)
   * @param {string} platform - Target platform (instagram, tiktok, youtube, etc.)
   * @param {object} options - Generation options (tone, length, emojis, hashtags)
   * @returns {Promise<object>} Generated caption with hashtags
   */
  async generateCaption(contentData, platform = 'instagram', options = {}) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OpenAI API key not configured');
      }

      const {
        tone = 'casual', // casual, professional, funny, inspirational, sales
        length = 'medium', // short, medium, long
        includeEmojis = true,
        includeHashtags = true,
        hashtagCount = 10,
        includeCallToAction = true,
        language = 'en' // Language code
      } = options;

      // Build platform-specific prompt
      const prompt = this.buildCaptionPrompt(
        contentData,
        platform,
        tone,
        length,
        includeEmojis,
        includeHashtags,
        hashtagCount,
        includeCallToAction,
        language
      );

      // Call OpenAI API
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: `You are an expert social media copywriter specializing in ${platform}. You create engaging, viral-worthy captions that drive engagement and conversions.`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.8, // More creative
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const generatedText = response.data.choices[0].message.content.trim();
      
      // Parse the response
      const parsed = this.parseGeneratedCaption(generatedText, includeHashtags);

      return {
        success: true,
        platform,
        caption: parsed.caption,
        hashtags: parsed.hashtags,
        characterCount: parsed.caption.length,
        estimatedEngagement: this.estimateEngagement(parsed, platform),
        metadata: {
          tone,
          length,
          language,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('[CaptionGen] Error generating caption:', error.message);
      
      // Fallback to basic caption
      return {
        success: false,
        error: error.message,
        platform,
        caption: this.generateFallbackCaption(contentData, platform),
        hashtags: this.generateBasicHashtags(contentData, platform, options.hashtagCount || 10)
      };
    }
  }

  /**
   * Generate multiple caption variations for A/B testing
   */
  async generateVariations(contentData, platform, count = 3, options = {}) {
    try {
      const variations = [];
      const tones = ['casual', 'professional', 'funny', 'inspirational'];
      
      for (let i = 0; i < count; i++) {
        const variantOptions = {
          ...options,
          tone: tones[i % tones.length]
        };
        
        const caption = await this.generateCaption(contentData, platform, variantOptions);
        variations.push({
          ...caption,
          variant: i + 1
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return {
        success: true,
        variations,
        count: variations.length
      };

    } catch (error) {
      console.error('[CaptionGen] Error generating variations:', error.message);
      throw error;
    }
  }

  /**
   * Build platform-specific prompt
   */
  buildCaptionPrompt(contentData, platform, tone, length, emojis, hashtags, hashtagCount, cta, language) {
    const platformSpecs = this.getPlatformSpecs(platform);
    
    let prompt = `Generate a ${tone} ${length}-length caption for ${platform}.\n\n`;
    prompt += `Content Details:\n`;
    prompt += `Title: ${contentData.title || 'Untitled'}\n`;
    if (contentData.description) {
      prompt += `Description: ${contentData.description}\n`;
    }
    if (contentData.tags && contentData.tags.length > 0) {
      prompt += `Tags: ${contentData.tags.join(', ')}\n`;
    }
    if (contentData.type) {
      prompt += `Content Type: ${contentData.type}\n`;
    }
    
    prompt += `\n${platformSpecs.requirements}\n\n`;
    
    prompt += `Requirements:\n`;
    prompt += `- Write in ${language === 'en' ? 'English' : language}\n`;
    prompt += `- Start with a strong hook that grabs attention\n`;
    prompt += `- ${length === 'short' ? 'Keep it under 100 characters' : length === 'medium' ? 'Keep it 100-200 characters' : 'Make it 200-300 characters'}\n`;
    
    if (emojis) {
      prompt += `- Include ${platformSpecs.emojiStyle}\n`;
    }
    
    if (cta) {
      prompt += `- End with a clear call-to-action (${platformSpecs.ctaStyle})\n`;
    }
    
    if (hashtags) {
      prompt += `- Add ${hashtagCount} relevant hashtags at the end\n`;
      prompt += `- Mix of trending (100k+) and niche (10k-50k) hashtags\n`;
      prompt += `- Hashtags should be specific to the content and platform\n`;
    }
    
    prompt += `\nFormat: Write the caption, then list hashtags on a new line starting with "Hashtags:"\n`;
    
    return prompt;
  }

  /**
   * Get platform-specific specifications
   */
  getPlatformSpecs(platform) {
    const specs = {
      instagram: {
        maxLength: 2200,
        emojiStyle: '2-4 relevant emojis',
        ctaStyle: 'tag friends, save post, or share',
        requirements: 'Instagram users love authentic, visual storytelling. Use line breaks for readability.'
      },
      tiktok: {
        maxLength: 300,
        emojiStyle: '1-2 emojis',
        ctaStyle: 'follow, like, or duet',
        requirements: 'TikTok captions should be short, punchy, and trend-aware. Reference sounds or challenges if relevant.'
      },
      youtube: {
        maxLength: 5000,
        emojiStyle: '1-2 emojis in key points',
        ctaStyle: 'subscribe, like, comment, or watch next',
        requirements: 'YouTube descriptions can be longer. Include timestamps, links, and detailed info.'
      },
      twitter: {
        maxLength: 280,
        emojiStyle: '1 emoji max',
        ctaStyle: 'retweet, reply, or follow',
        requirements: 'Twitter demands brevity and wit. Get to the point fast.'
      },
      facebook: {
        maxLength: 63206,
        emojiStyle: '2-3 emojis',
        ctaStyle: 'comment, share, or react',
        requirements: 'Facebook users engage with personal stories and community-focused content.'
      },
      linkedin: {
        maxLength: 3000,
        emojiStyle: 'minimal emojis, professional tone',
        ctaStyle: 'connect, comment with insights, or share',
        requirements: 'LinkedIn requires professional, value-driven content. Share insights and lessons learned.'
      },
      pinterest: {
        maxLength: 500,
        emojiStyle: '2-3 descriptive emojis',
        ctaStyle: 'save pin, click link, or explore board',
        requirements: 'Pinterest captions should be descriptive and keyword-rich for search.'
      },
      reddit: {
        maxLength: 40000,
        emojiStyle: 'minimal or no emojis',
        ctaStyle: 'upvote, discuss, or check comments',
        requirements: 'Reddit values authenticity and substance. No corporate speak. Be genuine.'
      },
      discord: {
        maxLength: 2000,
        emojiStyle: 'community-specific emojis',
        ctaStyle: 'react, join voice, or check pinned',
        requirements: 'Discord is conversational. Speak directly to the community.'
      },
      telegram: {
        maxLength: 4096,
        emojiStyle: '1-2 emojis',
        ctaStyle: 'forward, react, or join channel',
        requirements: 'Telegram users value concise, informative updates.'
      },
      snapchat: {
        maxLength: 250,
        emojiStyle: '1-2 fun emojis',
        ctaStyle: 'swipe up, add friend, or send snap',
        requirements: 'Snapchat is casual and ephemeral. Keep it fun and urgent.'
      }
    };

    return specs[platform.toLowerCase()] || specs.instagram;
  }

  /**
   * Parse AI-generated caption text
   */
  parseGeneratedCaption(text, includeHashtags) {
    const lines = text.split('\n');
    let caption = '';
    let hashtags = [];

    let isHashtagSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.toLowerCase().startsWith('hashtags:')) {
        isHashtagSection = true;
        const hashtagsText = trimmedLine.substring(9).trim();
        if (hashtagsText) {
          hashtags = this.extractHashtags(hashtagsText);
        }
        continue;
      }

      if (isHashtagSection) {
        hashtags.push(...this.extractHashtags(trimmedLine));
      } else {
        if (trimmedLine) {
          caption += (caption ? '\n' : '') + trimmedLine;
        }
      }
    }

    // If no hashtags section found, extract from caption
    if (hashtags.length === 0 && includeHashtags) {
      const extracted = this.extractHashtags(caption);
      hashtags = extracted;
      // Remove hashtags from caption if they're at the end
      caption = caption.replace(/(\n\n|\n)?#\w+(\s+#\w+)*\s*$/, '').trim();
    }

    return {
      caption: caption.trim(),
      hashtags: [...new Set(hashtags)] // Remove duplicates
    };
  }

  /**
   * Extract hashtags from text
   */
  extractHashtags(text) {
    const hashtagRegex = /#[\w\u00C0-\u024F\u1E00-\u1EFF]+/g;
    const matches = text.match(hashtagRegex) || [];
    return matches.map(tag => tag.trim());
  }

  /**
   * Estimate engagement potential
   */
  estimateEngagement(parsed, platform) {
    let score = 50; // Base score

    // Caption length optimization
    const idealLengths = {
      instagram: { min: 138, max: 150 },
      tiktok: { min: 100, max: 150 },
      twitter: { min: 240, max: 280 },
      facebook: { min: 40, max: 80 }
    };

    const ideal = idealLengths[platform] || idealLengths.instagram;
    const length = parsed.caption.length;
    
    if (length >= ideal.min && length <= ideal.max) {
      score += 15;
    }

    // Hashtag optimization
    if (parsed.hashtags.length >= 5 && parsed.hashtags.length <= 15) {
      score += 10;
    }

    // Emoji usage
    const emojiCount = (parsed.caption.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount >= 1 && emojiCount <= 4) {
      score += 10;
    }

    // Call-to-action detection
    const ctaKeywords = ['click', 'tap', 'follow', 'subscribe', 'share', 'comment', 'save', 'like', 'join'];
    const hasCTA = ctaKeywords.some(keyword => 
      parsed.caption.toLowerCase().includes(keyword)
    );
    if (hasCTA) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Generate fallback caption (when OpenAI fails)
   */
  generateFallbackCaption(contentData, platform) {
    const title = contentData.title || 'Check this out!';
    const ctas = {
      instagram: 'Double tap if you agree! 💫',
      tiktok: 'Follow for more! 🔥',
      youtube: 'Subscribe for more content!',
      twitter: 'RT if you found this helpful!',
      facebook: 'Share with friends!',
      linkedin: 'What are your thoughts?',
      pinterest: 'Save this for later!',
      reddit: 'Upvote if you relate!',
      discord: 'Drop a reaction! 👍',
      telegram: 'Forward to your crew!',
      snapchat: 'Swipe up! ⬆️'
    };

    const cta = ctas[platform.toLowerCase()] || ctas.instagram;
    
    return `${title}\n\n${cta}`;
  }

  /**
   * Generate basic hashtags (when OpenAI fails)
   */
  generateBasicHashtags(contentData, platform, count = 10) {
    const hashtags = [];
    
    // Platform-specific hashtag
    hashtags.push(`#${platform.toLowerCase()}`);
    
    // Title-based hashtags
    if (contentData.title) {
      const words = contentData.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3);
      
      words.slice(0, 5).forEach(word => {
        hashtags.push(`#${word}`);
      });
    }
    
    // Tag-based hashtags
    if (contentData.tags && contentData.tags.length > 0) {
      contentData.tags.slice(0, 4).forEach(tag => {
        const cleanTag = tag.replace(/[^\w]/g, '').toLowerCase();
        if (cleanTag) {
          hashtags.push(`#${cleanTag}`);
        }
      });
    }
    
    // Generic engagement hashtags
    const generic = ['#viral', '#trending', '#fyp', '#explore', '#foryou'];
    hashtags.push(...generic.slice(0, Math.max(0, count - hashtags.length)));
    
    return [...new Set(hashtags)].slice(0, count);
  }
}

module.exports = new CaptionGenerationService();
