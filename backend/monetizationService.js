const { db } = require('./firebaseAdmin');

class MonetizationService {
  constructor() {
  // Business rules now env-driven with conservative defaults
  this.REVENUE_PER_MILLION_VIEWS = parseInt(process.env.REVENUE_PER_MILLION || '3000', 10);
  this.CREATOR_PAYOUT_RATE = parseFloat(process.env.CREATOR_PAYOUT_RATE || '0.05');
  this.PLATFORM_FEE_RATE = parseFloat(process.env.PLATFORM_FEE_RATE || '0.10');
  }

  /**
   * Process a transaction for content promotion revenue
   * @param {Object} transactionData - Transaction details
   * @param {string} transactionData.contentId - Content ID
   * @param {string} transactionData.userId - Creator user ID
   * @param {number} transactionData.viewsGenerated - Views generated
   * @param {number} transactionData.engagementsGenerated - Engagements generated
   * @param {number} transactionData.cost - Promotion cost
   * @returns {Object} Transaction result
   */
  async processTransaction(transactionData) {
    try {
      console.log('💰 Processing monetization transaction:', transactionData);

      const {
        contentId,
        userId,
        viewsGenerated = 0,
        engagementsGenerated = 0,
        cost = 0,
        paypalOrderId,
        paypalCaptureId
      } = transactionData;

      // Calculate revenue based on views generated
      const revenueGenerated = (viewsGenerated / 1000000) * this.REVENUE_PER_MILLION_VIEWS;

      // Calculate payouts
      const creatorPayout = revenueGenerated * this.CREATOR_PAYOUT_RATE;
      const platformFee = revenueGenerated * this.PLATFORM_FEE_RATE;
      const netRevenue = revenueGenerated - creatorPayout - platformFee;

      // Create transaction record
      const transactionRecord = {
        contentId,
        userId,
        viewsGenerated,
        engagementsGenerated,
        revenueGenerated,
        creatorPayout,
        platformFee,
        netRevenue,
        cost,
        paypalOrderId,
        paypalCaptureId,
        timestamp: new Date(),
        type: 'promotion_revenue',
        status: 'completed'
      };

      // Save to Firestore
      const transactionRef = await db.collection('transactions').add(transactionRecord);

      console.log('✅ Transaction processed successfully:', {
        transactionId: transactionRef.id,
        revenueGenerated,
        creatorPayout,
        platformFee
      });

      return {
        success: true,
        transactionId: transactionRef.id,
        transaction: transactionRecord
      };

    } catch (error) {
      console.error('❌ Error processing transaction:', error);
      throw new Error(`Failed to process transaction: ${error.message}`);
    }
  }

  /**
   * Get revenue analytics for a specific time period
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start date
   * @param {Date} options.endDate - End date
   * @param {string} options.userId - Filter by user ID (optional)
   * @returns {Object} Revenue analytics
   */
  async getRevenueAnalytics(options = {}) {
    try {
      console.log('📊 Fetching revenue analytics:', options);

      let query = db.collection('transactions');

      // Apply filters
      if (options.startDate) {
        query = query.where('timestamp', '>=', options.startDate);
      }
      if (options.endDate) {
        query = query.where('timestamp', '<=', options.endDate);
      }
      if (options.userId) {
        query = query.where('userId', '==', options.userId);
      }

      const snapshot = await query.get();
      const transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Calculate analytics
      const totalRevenue = transactions.reduce((sum, t) => sum + (t.revenueGenerated || 0), 0);
      const totalCreatorPayouts = transactions.reduce((sum, t) => sum + (t.creatorPayout || 0), 0);
      const totalPlatformFees = transactions.reduce((sum, t) => sum + (t.platformFee || 0), 0);
      const totalViews = transactions.reduce((sum, t) => sum + (t.viewsGenerated || 0), 0);
      const totalEngagements = transactions.reduce((sum, t) => sum + (t.engagementsGenerated || 0), 0);

      // Calculate monthly breakdown
      const monthlyRevenue = {};
      transactions.forEach(transaction => {
        const date = transaction.timestamp?.toDate();
        if (date) {
          const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + (transaction.revenueGenerated || 0);
        }
      });

      // Calculate revenue by content type (if available)
      const revenueByContentType = {};
      transactions.forEach(transaction => {
        const type = transaction.contentType || 'Other';
        revenueByContentType[type] = (revenueByContentType[type] || 0) + (transaction.revenueGenerated || 0);
      });

      // Convert to percentages for content type breakdown
      const totalRevenueForTypes = Object.values(revenueByContentType).reduce((sum, amount) => sum + amount, 0);
      const contentTypePercentages = {};
      Object.entries(revenueByContentType).forEach(([type, amount]) => {
        contentTypePercentages[type] = Math.round((amount / totalRevenueForTypes) * 100);
      });

      const analytics = {
        totalRevenue,
        totalCreatorPayouts,
        totalPlatformFees,
        totalViews,
        totalEngagements,
        transactionCount: transactions.length,
        averageRevenuePerTransaction: transactions.length > 0 ? totalRevenue / transactions.length : 0,
        averageViewsPerTransaction: transactions.length > 0 ? totalViews / transactions.length : 0,
        monthlyRevenue: Object.entries(monthlyRevenue).map(([month, revenue]) => ({
          month,
          revenue
        })).slice(-6), // Last 6 months
        revenueByContentType: contentTypePercentages,
        transactions: transactions.slice(-10) // Last 10 transactions
      };

      console.log('✅ Revenue analytics calculated:', {
        totalRevenue,
        transactionCount: transactions.length
      });

      return analytics;

    } catch (error) {
      console.error('❌ Error fetching revenue analytics:', error);
      throw new Error(`Failed to fetch revenue analytics: ${error.message}`);
    }
  }

  /**
   * Get creator payout summary
   * @param {string} userId - Creator user ID
   * @returns {Object} Payout summary
   */
  async getCreatorPayoutSummary(userId) {
    try {
      const transactions = await db.collection('transactions')
        .where('userId', '==', userId)
        .get();

      const payoutData = transactions.docs.map(doc => doc.data());

      const totalEarned = payoutData.reduce((sum, t) => sum + (t.creatorPayout || 0), 0);
      const totalViews = payoutData.reduce((sum, t) => sum + (t.viewsGenerated || 0), 0);
      const transactionCount = payoutData.length;

      return {
        totalEarned,
        totalViews,
        transactionCount,
        averagePayoutPerTransaction: transactionCount > 0 ? totalEarned / transactionCount : 0,
        averagePayoutPerThousandViews: totalViews > 0 ? (totalEarned / totalViews) * 1000 : 0
      };

    } catch (error) {
      console.error('❌ Error fetching creator payout summary:', error);
      throw new Error(`Failed to fetch creator payout summary: ${error.message}`);
    }
  }

  /**
   * Process platform fees collection
   * @returns {Object} Platform fees summary
   */
  async getPlatformFeesSummary() {
    try {
      const transactions = await db.collection('transactions').get();
      const totalFees = transactions.docs.reduce((sum, doc) => {
        const data = doc.data();
        return sum + (data.platformFee || 0);
      }, 0);

      return {
        totalCollected: totalFees,
        transactionCount: transactions.size
      };

    } catch (error) {
      console.error('❌ Error fetching platform fees summary:', error);
      throw new Error(`Failed to fetch platform fees summary: ${error.message}`);
    }
  }
}

module.exports = new MonetizationService();
