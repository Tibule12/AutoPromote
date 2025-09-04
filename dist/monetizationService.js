const { db } = require('./firebaseAdmin');

// Initialize Stripe only if key is available
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
} else {
    console.warn('⚠️  STRIPE_SECRET_KEY not found. Stripe features will be disabled.');
}

class MonetizationService {
    constructor() {
        this.transactionFee = 0.05; // 5% platform fee
        this.subscriptionPlans = {
            basic: { price: 9.99, features: ['Basic Analytics', '5 Content Uploads/month'] },
            pro: { price: 29.99, features: ['Advanced Analytics', 'Unlimited Uploads', 'Priority Support'] },
            enterprise: { price: 99.99, features: ['All Features', 'Custom Integrations', 'Dedicated Support'] }
        };
    }

    // Process transaction with platform fee
    async processTransaction(contentId, amount, userId, type = 'promotion') {
        try {
            const fee = amount * this.transactionFee;
            const netAmount = amount - fee;

            // Record transaction
            const transactionRef = db.collection('transactions').doc();
            const transactionData = {
                contentId,
                userId,
                type,
                grossAmount: amount,
                platformFee: fee,
                netAmount,
                status: 'completed',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await transactionRef.set(transactionData);

            // Update user balance
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                const currentBalance = userData.balance || 0;
                await userRef.update({
                    balance: currentBalance + netAmount,
                    updatedAt: new Date().toISOString()
                });
            }

            // Update platform revenue
            await this.updatePlatformRevenue(fee, type);

            return {
                transactionId: transactionRef.id,
                ...transactionData
            };
        } catch (error) {
            console.error('Error processing transaction:', error);
            throw error;
        }
    }

    // Update platform revenue tracking
    async updatePlatformRevenue(amount, type) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const revenueRef = db.collection('platform_revenue').doc(today);

            const revenueDoc = await revenueRef.get();
            const currentData = revenueDoc.exists ? revenueDoc.data() : {
                date: today,
                totalRevenue: 0,
                transactionFees: 0,
                subscriptionRevenue: 0,
                adRevenue: 0,
                sponsorshipRevenue: 0,
                transactions: []
            };

            const updates = {
                totalRevenue: currentData.totalRevenue + amount,
                updatedAt: new Date().toISOString()
            };

            // Update specific revenue type
            switch (type) {
                case 'transaction_fee':
                    updates.transactionFees = currentData.transactionFees + amount;
                    break;
                case 'subscription':
                    updates.subscriptionRevenue = currentData.subscriptionRevenue + amount;
                    break;
                case 'advertisement':
                    updates.adRevenue = currentData.adRevenue + amount;
                    break;
                case 'sponsorship':
                    updates.sponsorshipRevenue = currentData.sponsorshipRevenue + amount;
                    break;
            }

            await revenueRef.set(updates, { merge: true });
        } catch (error) {
            console.error('Error updating platform revenue:', error);
            throw error;
        }
    }

    // Create subscription for user
    async createSubscription(userId, planType) {
        try {
            const plan = this.subscriptionPlans[planType];
            if (!plan) {
                throw new Error('Invalid subscription plan');
            }

            // Create Stripe subscription
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new Error('User not found');
            }

            const userData = userDoc.data();

            // Create or get Stripe customer
            let customerId = userData.stripeCustomerId;
            if (!customerId) {
                const customer = await stripe.customers.create({
                    email: userData.email,
                    name: userData.displayName || userData.email,
                    metadata: { userId }
                });
                customerId = customer.id;

                await userRef.update({ stripeCustomerId: customerId });
            }

            // Create subscription
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `${planType.charAt(0).toUpperCase() + planType.slice(1)} Plan`,
                            description: plan.features.join(', ')
                        },
                        unit_amount: Math.round(plan.price * 100)
                    }
                }],
                payment_behavior: 'default_incomplete',
                expand: ['latest_invoice.payment_intent']
            });

            // Save subscription to Firestore
            const subscriptionRef = db.collection('subscriptions').doc();
            await subscriptionRef.set({
                userId,
                stripeSubscriptionId: subscription.id,
                planType,
                status: subscription.status,
                currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
                amount: plan.price,
                features: plan.features,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            // Update user subscription status
            await userRef.update({
                subscriptionPlan: planType,
                subscriptionStatus: subscription.status,
                updatedAt: new Date().toISOString()
            });

            // Record subscription revenue
            await this.updatePlatformRevenue(plan.price, 'subscription');

            return {
                subscriptionId: subscriptionRef.id,
                clientSecret: subscription.latest_invoice.payment_intent.client_secret,
                subscription: subscription
            };
        } catch (error) {
            console.error('Error creating subscription:', error);
            throw error;
        }
    }

    // Process ad revenue
    async processAdRevenue(contentId, adRevenue, advertiserId) {
        try {
            // Record ad transaction
            const adTransactionRef = db.collection('ad_transactions').doc();
            await adTransactionRef.set({
                contentId,
                advertiserId,
                amount: adRevenue,
                type: 'advertisement',
                status: 'completed',
                createdAt: new Date().toISOString()
            });

            // Update platform revenue
            await this.updatePlatformRevenue(adRevenue, 'advertisement');

            // Distribute revenue to content creator
            const contentRef = db.collection('content').doc(contentId);
            const contentDoc = await contentRef.get();

            if (contentDoc.exists) {
                const contentData = contentDoc.data();
                const creatorShare = adRevenue * 0.7; // 70% to creator
                const platformShare = adRevenue * 0.3; // 30% to platform

                // Update creator balance
                const userRef = db.collection('users').doc(contentData.userId);
                const userDoc = await userRef.get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const currentBalance = userData.balance || 0;
                    await userRef.update({
                        balance: currentBalance + creatorShare,
                        totalEarnings: (userData.totalEarnings || 0) + creatorShare,
                        updatedAt: new Date().toISOString()
                    });
                }

                // Platform keeps its share
                await this.updatePlatformRevenue(platformShare, 'advertisement');
            }

            return { success: true, adRevenue, creatorShare: adRevenue * 0.7 };
        } catch (error) {
            console.error('Error processing ad revenue:', error);
            throw error;
        }
    }

    // Get revenue analytics
    async getRevenueAnalytics(timeframe = 'month') {
        try {
            const now = new Date();
            let startDate;

            switch (timeframe) {
                case 'week':
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    break;
                case 'year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                default:
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            }

            const revenueSnapshot = await db.collection('platform_revenue')
                .where('date', '>=', startDate.toISOString().split('T')[0])
                .orderBy('date')
                .get();

            const analytics = {
                timeframe,
                totalRevenue: 0,
                transactionFees: 0,
                subscriptionRevenue: 0,
                adRevenue: 0,
                sponsorshipRevenue: 0,
                dailyBreakdown: [],
                growthRate: 0
            };

            revenueSnapshot.forEach(doc => {
                const data = doc.data();
                analytics.totalRevenue += data.totalRevenue || 0;
                analytics.transactionFees += data.transactionFees || 0;
                analytics.subscriptionRevenue += data.subscriptionRevenue || 0;
                analytics.adRevenue += data.adRevenue || 0;
                analytics.sponsorshipRevenue += data.sponsorshipRevenue || 0;

                analytics.dailyBreakdown.push({
                    date: data.date,
                    revenue: data.totalRevenue || 0
                });
            });

            // Calculate growth rate
            if (analytics.dailyBreakdown.length > 1) {
                const firstHalf = analytics.dailyBreakdown.slice(0, Math.floor(analytics.dailyBreakdown.length / 2));
                const secondHalf = analytics.dailyBreakdown.slice(Math.floor(analytics.dailyBreakdown.length / 2));

                const firstHalfAvg = firstHalf.reduce((sum, day) => sum + day.revenue, 0) / firstHalf.length;
                const secondHalfAvg = secondHalf.reduce((sum, day) => sum + day.revenue, 0) / secondHalf.length;

                if (firstHalfAvg > 0) {
                    analytics.growthRate = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
                }
            }

            return analytics;
        } catch (error) {
            console.error('Error getting revenue analytics:', error);
            throw error;
        }
    }

    // Get user earnings
    async getUserEarnings(userId) {
        try {
            const userRef = db.collection('users').doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new Error('User not found');
            }

            const userData = userDoc.data();

            // Get recent transactions
            const transactionsSnapshot = await db.collection('transactions')
                .where('userId', '==', userId)
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();

            const transactions = [];
            transactionsSnapshot.forEach(doc => {
                transactions.push({ id: doc.id, ...doc.data() });
            });

            return {
                currentBalance: userData.balance || 0,
                totalEarnings: userData.totalEarnings || 0,
                subscriptionPlan: userData.subscriptionPlan || 'free',
                subscriptionStatus: userData.subscriptionStatus || 'inactive',
                recentTransactions: transactions
            };
        } catch (error) {
            console.error('Error getting user earnings:', error);
            throw error;
        }
    }

    // Process sponsorship revenue
    async processSponsorship(contentId, sponsorshipAmount, sponsorId) {
        try {
            // Record sponsorship
            const sponsorshipRef = db.collection('sponsorships').doc();
            await sponsorshipRef.set({
                contentId,
                sponsorId,
                amount: sponsorshipAmount,
                status: 'completed',
                createdAt: new Date().toISOString()
            });

            // Update platform revenue
            await this.updatePlatformRevenue(sponsorshipAmount, 'sponsorship');

            // Distribute to creator
            const contentRef = db.collection('content').doc(contentId);
            const contentDoc = await contentRef.get();

            if (contentDoc.exists) {
                const contentData = contentDoc.data();
                const creatorShare = sponsorshipAmount * 0.8; // 80% to creator
                const platformShare = sponsorshipAmount * 0.2; // 20% to platform

                const userRef = db.collection('users').doc(contentData.userId);
                const userDoc = await userRef.get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const currentBalance = userData.balance || 0;
                    await userRef.update({
                        balance: currentBalance + creatorShare,
                        totalEarnings: (userData.totalEarnings || 0) + creatorShare,
                        updatedAt: new Date().toISOString()
                    });
                }

                await this.updatePlatformRevenue(platformShare, 'sponsorship');
            }

            return { success: true, sponsorshipAmount, creatorShare: sponsorshipAmount * 0.8 };
        } catch (error) {
            console.error('Error processing sponsorship:', error);
            throw error;
        }
    }
}

module.exports = new MonetizationService();
