// Mock Analytics Data
// This provides placeholder analytics data when the backend is not available
// Used to ensure the admin dashboard shows data even when API calls fail

const mockAnalyticsData = {
  totalUsers: 256,
  newUsersToday: 12,
  totalContent: 478,
  newContentToday: 23,
  totalRevenue: 0, // Pay-per-view removed
  revenueToday: 0, // Pay-per-view removed
  activePromotions: 124,
  scheduledPromotions: 47,
  activeUsers: 134,
  activeUsersLastWeek: 127,
  engagementRate: 0.62,
  engagementChange: 0.08,
  userSegmentation: {
    powerUsers: 32,
    regularUsers: 156,
    occasionalUsers: 68,
    total: 256,
  },
  contentPerformance: {
    high: 97,
    medium: 286,
    low: 95,
  },
  avgRevenuePerContent: 0,
  avgRevenuePerUser: 0,
  projectedMonthlyRevenue: 0,
  promotionsCompleted: 287,

  // New fields for enhanced dashboard
  topContent: [
    {
      id: "content1",
      title: "Ultimate Guide to Social Media Marketing",
      type: "Article",
      views: 12540,
      engagementRate: 0.78,
      createdAt: { seconds: Date.now() / 1000 - 86400 * 14, nanoseconds: 0 },
      status: "active",
    },
    {
      id: "content2",
      title: "How to Grow Your Audience in 2025",
      type: "Video",
      views: 8972,
      engagementRate: 0.65,
      createdAt: { seconds: Date.now() / 1000 - 86400 * 7, nanoseconds: 0 },
      status: "active",
    },
    {
      id: "content3",
      title: "Viral Marketing Techniques",
      type: "Article",
      views: 7632,
      engagementRate: 0.53,
      createdAt: { seconds: Date.now() / 1000 - 86400 * 21, nanoseconds: 0 },
      status: "active",
    },
    {
      id: "content4",
      title: "10 Ways to Monetize Your Content",
      type: "Video",
      views: 6943,
      engagementRate: 0.71,
      createdAt: { seconds: Date.now() / 1000 - 86400 * 5, nanoseconds: 0 },
      status: "active",
    },
    {
      id: "content5",
      title: "Building a Loyal Audience",
      type: "Article",
      views: 5421,
      engagementRate: 0.62,
      createdAt: { seconds: Date.now() / 1000 - 86400 * 10, nanoseconds: 0 },
      status: "pending",
    },
  ],

  recentActivities: [
    {
      id: "activity1",
      type: "user",
      title: "New User Registration",
      description: "User johnsmith@example.com registered",
      timestamp: { seconds: Date.now() / 1000 - 3600, nanoseconds: 0 },
    },
    {
      id: "activity2",
      type: "content",
      title: "Content Published",
      description: 'New article "SEO Strategies for 2025" published',
      timestamp: { seconds: Date.now() / 1000 - 7200, nanoseconds: 0 },
    },
    {
      id: "activity3",
      type: "promotion",
      title: "Promotion Started",
      description: 'Promotion "Summer Special" is now active',
      timestamp: { seconds: Date.now() / 1000 - 10800, nanoseconds: 0 },
    },
    {
      id: "activity4",
      type: "user",
      title: "Subscription Upgraded",
      description: "User sarahj@example.com upgraded to premium plan",
      timestamp: { seconds: Date.now() / 1000 - 14400, nanoseconds: 0 },
    },
    {
      id: "activity5",
      type: "content",
      title: "Content Trending",
      description: 'Video "Marketing Tips" is trending with high engagement',
      timestamp: { seconds: Date.now() / 1000 - 18000, nanoseconds: 0 },
    },
    {
      id: "activity6",
      type: "promotion",
      title: "Promotion Ended",
      description: 'Promotion "Spring Sale" has ended with 87% success rate',
      timestamp: { seconds: Date.now() / 1000 - 21600, nanoseconds: 0 },
    },
    {
      id: "activity7",
      type: "user",
      title: "User Milestone",
      description: "User mikeb@example.com reached 1000 followers",
      timestamp: { seconds: Date.now() / 1000 - 25200, nanoseconds: 0 },
    },
  ],

  // Performance metrics
  performanceMetrics: {
    conversionRate: 3.2,
    bounceRate: 42.8,
    averageSessionDuration: 187, // seconds
    returnVisitorRate: 28.5,
    engagementByPlatform: {
      mobile: 64,
      desktop: 31,
      tablet: 5,
    },
  },

  // User demographics
  demographics: {
    ageGroups: {
      "18-24": 15,
      "25-34": 32,
      "35-44": 28,
      "45-54": 18,
      "55+": 7,
    },
    geoDistribution: {
      "North America": 42,
      Europe: 28,
      Asia: 18,
      "South America": 8,
      Africa: 3,
      Oceania: 1,
    },
    deviceTypes: {
      iOS: 38,
      Android: 41,
      Windows: 16,
      Mac: 4,
      Other: 1,
    },
  },

  // Revenue and financial data (Zeroed out for Mission pivot)
  financialMetrics: {
    revenueByMonth: [
      { month: "Jan", revenue: 0 },
      { month: "Feb", revenue: 0 },
      { month: "Mar", revenue: 0 },
    ],
    revenueByContentType: {
      Article: 0,
      Video: 0,
    },
    transactionTrends: {
      averageOrderValue: 0,
      conversionRate: 0,
      repeatPurchaseRate: 0,
    },
  },
};

export default mockAnalyticsData;
