// chatbotService.js
// AI Chatbot Service with multilingual support (all 11 South African languages)
// Powered by OpenAI GPT-4o

const axios = require('axios');
const { logOpenAIUsage } = require('./openaiUsageLogger');
const { db } = require('../firebaseAdmin');

class ChatbotService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.model = 'gpt-4o'; // Best for multilingual support
    this.systemPrompt = this.buildSystemPrompt();
    
    // Validate API key is configured
    if (!this.openaiApiKey) {
      console.warn('[Chatbot] ⚠️ OPENAI_API_KEY not configured. Chatbot will not work.');
      console.warn('[Chatbot] 💡 Add OPENAI_API_KEY to your environment variables.');
      console.warn('[Chatbot] 📖 See OPENAI_SETUP_GUIDE.md for setup instructions.');
    }
  }

  /**
   * Build system prompt with AutoPromote context
   */
  buildSystemPrompt() {
    return `You are AutoPromote AI Assistant, a helpful and friendly chatbot for the AutoPromote social media automation platform.

LANGUAGE SUPPORT:
- You MUST respond in the SAME language the user uses
- Support ALL 11 South African official languages:
  * English, Afrikaans, Zulu (isiZulu), Xhosa (isiXhosa)
  * Sotho (Sesotho), Northern Sotho (Sepedi), Tswana (Setswana)
  * Swazi (siSwati), Ndebele (isiNdebele), Tsonga (Xitsonga), Venda (Tshivenda)
- If user switches language mid-conversation, switch with them
- Be culturally aware and respectful of South African context

PLATFORM KNOWLEDGE - AutoPromote Features:
1. Content Upload: Upload videos, images, audio to schedule across platforms
2. AI Clips: Generate viral short clips from long-form videos automatically
3. Multi-Platform: TikTok, Instagram, YouTube, Facebook, Twitter, LinkedIn, Spotify, Reddit, Discord, Snapchat, Pinterest, Telegram
4. Scheduling: Auto-schedule or manual scheduling with timezone support
5. Analytics: Track views, clicks, engagement, revenue
6. Earnings: Revenue sharing program for content creators
7. Community: Help forum for users to connect

YOUR CAPABILITIES:
✅ Answer questions about features
✅ Troubleshoot issues
✅ Suggest best practices
✅ Explain how to use features
✅ Recommend optimal posting times
✅ Help with account setup
✅ Provide content tips

TONE:
- Friendly, helpful, encouraging
- Use emojis sparingly (1-2 per response)
- Keep responses concise (2-4 sentences ideal)
- If you don't know something, admit it and offer to connect them with support

IMPORTANT:
- Never make up features that don't exist
- Always be honest about limitations
- Encourage users to try premium features when relevant
- If technical issue, suggest checking help docs or contacting support`;
  }

  /**
   * Send message to chatbot and get response
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   * @param {string} message - User's message
   * @param {object} userContext - Additional context about user
   * @returns {Promise<object>} - Bot response
   */
  async sendMessage(userId, conversationId, message, userContext = {}) {
    try {
      // Check if API key is configured
      if (!this.openaiApiKey) {
        throw new Error('AI Chatbot is not configured. Please contact support.');
      }
      
      // Get conversation history
      const history = await this.getConversationHistory(conversationId);

      // Build messages array for OpenAI
      const messages = [
        { role: 'system', content: this.systemPrompt }
      ];

      // Add user context if available
      if (userContext.plan || userContext.connectedPlatforms) {
        const contextMsg = this.buildUserContextMessage(userContext);
        messages.push({ role: 'system', content: contextMsg });
      }

      // Add conversation history
      history.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });

      // Add current message
      messages.push({
        role: 'user',
        content: message
      });

      // Call OpenAI API
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: messages,
          temperature: 0.7,
          max_tokens: 500,
          presence_penalty: 0.6,
          frequency_penalty: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const botResponse = response.data.choices[0].message.content;
      // Log OpenAI usage for chat
      try {
        const usage = response.data.usage || {};
        await logOpenAIUsage({ userId, model: this.model, feature: 'chatbot', usage, promptSnippet: messages.slice(-1)[0]?.content?.toString()?.slice(0,300) });
      } catch (_) {}

      // Save messages to database
      await this.saveMessage(conversationId, 'user', message, userId);
      await this.saveMessage(conversationId, 'assistant', botResponse, userId);

      // Update conversation metadata
      await this.updateConversation(conversationId, {
        lastMessageAt: new Date().toISOString(),
        messageCount: history.length + 2
      });

      return {
        success: true,
        message: botResponse,
        conversationId,
        usage: {
          promptTokens: response.data.usage.prompt_tokens,
          completionTokens: response.data.usage.completion_tokens,
          totalTokens: response.data.usage.total_tokens
        }
      };

    } catch (error) {
      console.error('[Chatbot] Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error?.message || 'Failed to get chatbot response');
    }
  }

  /**
   * Build user context message
   */
  buildUserContextMessage(userContext) {
    const parts = ['USER CONTEXT:'];
    
    if (userContext.plan) {
      parts.push(`- Subscription: ${userContext.plan}`);
    }
    
    if (userContext.connectedPlatforms?.length > 0) {
      parts.push(`- Connected platforms: ${userContext.connectedPlatforms.join(', ')}`);
    }
    
    if (userContext.contentCount) {
      parts.push(`- Content uploaded: ${userContext.contentCount} items`);
    }

    if (userContext.hasAIClips !== undefined) {
      parts.push(`- AI Clips access: ${userContext.hasAIClips ? 'Yes' : 'No (suggest upgrade)'}`);
    }

    return parts.join('\n');
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId, limit = 20) {
    try {
      const snapshot = await db.collection('chat_messages')
        .where('conversationId', '==', conversationId)
        .orderBy('createdAt', 'asc')
        .limit(limit)
        .get();

      const messages = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        messages.push({
          role: data.role,
          content: data.content,
          createdAt: data.createdAt
        });
      });

      return messages;
    } catch (error) {
      console.error('[Chatbot] Error fetching history:', error);
      return [];
    }
  }

  /**
   * Save message to database
   */
  async saveMessage(conversationId, role, content, userId) {
    try {
      await db.collection('chat_messages').add({
        conversationId,
        userId,
        role,
        content,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Chatbot] Error saving message:', error);
    }
  }

  /**
   * Create new conversation
   */
  async createConversation(userId, initialMessage = null) {
    try {
      const conversationRef = await db.collection('chat_conversations').add({
        userId,
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        messageCount: 0,
        active: true
      });

      const conversationId = conversationRef.id;

      // If initial message provided, send it
      if (initialMessage) {
        await this.sendMessage(userId, conversationId, initialMessage);
      }

      return conversationId;
    } catch (error) {
      console.error('[Chatbot] Error creating conversation:', error);
      throw error;
    }
  }

  /**
   * Update conversation metadata
   */
  async updateConversation(conversationId, updates) {
    try {
      await db.collection('chat_conversations').doc(conversationId).update({
        ...updates,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Chatbot] Error updating conversation:', error);
    }
  }

  /**
   * Get user's conversations
   */
  async getUserConversations(userId, limit = 10) {
    try {
      const snapshot = await db.collection('chat_conversations')
        .where('userId', '==', userId)
        .where('active', '==', true)
        .orderBy('lastMessageAt', 'desc')
        .limit(limit)
        .get();

      const conversations = [];
      snapshot.forEach(doc => {
        conversations.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return conversations;
    } catch (error) {
      console.error('[Chatbot] Error fetching conversations:', error);
      return [];
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId, userId) {
    try {
      // Verify ownership
      const convDoc = await db.collection('chat_conversations').doc(conversationId).get();
      if (!convDoc.exists || convDoc.data().userId !== userId) {
        throw new Error('Unauthorized');
      }

      // Mark as inactive instead of deleting
      await db.collection('chat_conversations').doc(conversationId).update({
        active: false,
        deletedAt: new Date().toISOString()
      });

      return { success: true };
    } catch (error) {
      console.error('[Chatbot] Error deleting conversation:', error);
      throw error;
    }
  }

  /**
   * Get suggested prompts based on user context
   */
  getSuggestedPrompts(userContext = {}) {
    const prompts = [];

    // Always show basics
    prompts.push({
      text: "How do I schedule a post?",
      icon: "📅"
    });

    prompts.push({
      text: "What platforms are supported?",
      icon: "🌐"
    });

    // AI Clips suggestion
    if (userContext.hasVideos && !userContext.hasUsedAIClips) {
      prompts.push({
        text: "What are AI Clips?",
        icon: "🎬"
      });
    }

    // Connection help
    if (!userContext.connectedPlatforms || userContext.connectedPlatforms.length === 0) {
      prompts.push({
        text: "How do I connect my TikTok?",
        icon: "🔗"
      });
    }

    // Multilingual prompt
    prompts.push({
      text: "Ngicela usizo (Help in Zulu)",
      icon: "🗣️"
    });

    return prompts.slice(0, 4); // Return max 4 suggestions
  }
}

module.exports = new ChatbotService();
