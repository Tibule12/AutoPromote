// dbSchemaSync.js
// This file ensures Firebase collections align with admin dashboard requirements

import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseClient';

/**
 * Utility class to ensure database schema aligns with admin dashboard
 */
export class DatabaseSyncService {
  /**
   * Check if all required collections exist and create sample data if needed
   */
  /**
   * Validate database schema, only checking admin collections if user is admin
   * @param {Object} user - The current user object (should have role or isAdmin)
   */
  static async validateDatabaseSchema(user) {
    console.log('Validating database schema for admin dashboard...');
    try {
      // Always check user and content collections (read-only)
      await this.validateCollection('users', { allowWrite: false });
      await this.validateCollection('content', { allowWrite: false });

      // Only check admin collections if user is admin; still avoid writes on client
      const isAdmin = user && (user.role === 'admin' || user.isAdmin === true);
      if (isAdmin) {
        await this.validateCollection('promotions', { allowWrite: false });
        await this.validateCollection('activities', { allowWrite: false });
        await this.validateCollection('analytics', { allowWrite: false });
      }

      console.log('Database schema validation complete');
      return true;
    } catch (error) {
      console.error('Error validating database schema:', error);
      return false;
    }
  }

  /**
   * Validate that a collection exists with at least one document
   */
  static async validateCollection(collectionName, options = { allowWrite: false }) {
    const collectionRef = collection(db, collectionName);
    const snapshot = await getDocs(query(collectionRef, limit(1)));
    
    if (snapshot.empty) {
      console.log(`Collection '${collectionName}' is empty${options.allowWrite ? ', adding sample data...' : ', skipping client-side writes.'}`);
      if (options.allowWrite) {
        await this.createSampleData(collectionName);
      }
    } else {
      console.log(`Collection '${collectionName}' exists and contains data`);
    }
  }

  /**
   * Create sample data for a collection if needed
   */
  static async createSampleData(collectionName) {
    switch(collectionName) {
      case 'users':
        await this.createSampleUsers();
        break;
      case 'content':
        await this.createSampleContent();
        break;
      case 'promotions':
        await this.createSamplePromotions();
        break;
      case 'activities':
        await this.createSampleActivities();
        break;
      case 'analytics':
        await this.createSampleAnalytics();
        break;
      default:
        console.log(`No sample data generator for '${collectionName}'`);
    }
  }

  /**
   * Create sample users if needed
   */
  static async createSampleUsers() {
    const users = [
      {
        id: 'admin1',
        name: 'Admin User',
        email: 'admin@autopromote.com',
        role: 'admin',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      },
      {
        id: 'user1',
        name: 'Regular User',
        email: 'user@example.com',
        role: 'user',
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
      },
      {
        id: 'user2',
        name: 'Power User',
        email: 'power@example.com',
        role: 'user',
        createdAt: new Date() // Today
      }
    ];

    for (const user of users) {
      await setDoc(doc(db, 'users', user.id), {
        ...user,
        createdAt: user.createdAt
      });
    }
    
    console.log('Sample users created');
  }

  /**
   * Create sample content if needed
   */
  static async createSampleContent() {
    const contentItems = [
      {
        id: 'content1',
        userId: 'user1',
        title: 'Getting Started with AutoPromote',
        type: 'article',
        url: 'https://example.com/article1',
        description: 'A beginner\'s guide to automated content promotion',
        views: 1250,
        engagementRate: 0.08,
        status: 'active',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      },
      {
        id: 'content2',
        userId: 'user2',
        title: 'AutoPromote Demo Video',
        type: 'video',
        url: 'https://example.com/video1',
        description: 'Watch this demo to see AutoPromote in action',
        views: 850,
        engagementRate: 0.12,
        status: 'active',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      },
      {
        id: 'content3',
        userId: 'user1',
        title: 'Marketing Tips and Tricks',
        type: 'article',
        url: 'https://example.com/article2',
        description: 'Advanced marketing strategies for content creators',
        views: 356,
        engagementRate: 0.05,
        status: 'pending',
        createdAt: new Date() // Today
      }
    ];

    for (const item of contentItems) {
      await setDoc(doc(db, 'content', item.id), {
        ...item,
        createdAt: item.createdAt
      });
    }
    
    console.log('Sample content created');
  }

  /**
   * Create sample promotions if needed
   */
  static async createSamplePromotions() {
    const now = new Date();
    const promotions = [
      {
        id: 'promo1',
        contentId: 'content1',
        userId: 'user1',
        status: 'active',
        platform: 'twitter',
        startDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        endDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        budget: 50.00,
        results: {
          impressions: 2450,
          clicks: 127,
          conversions: 5
        },
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) // 3 days ago
      },
      {
        id: 'promo2',
        contentId: 'content2',
        userId: 'user2',
        status: 'scheduled',
        platform: 'facebook',
        startDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
        endDate: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000), // 8 days from now
        budget: 75.00,
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) // Yesterday
      },
      {
        id: 'promo3',
        contentId: 'content1',
        userId: 'user1',
        status: 'completed',
        platform: 'instagram',
        startDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
        endDate: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000), // 8 days ago
        budget: 30.00,
        results: {
          impressions: 1850,
          clicks: 93,
          conversions: 3
        },
        createdAt: new Date(now.getTime() - 16 * 24 * 60 * 60 * 1000) // 16 days ago
      }
    ];

    for (const promo of promotions) {
      await setDoc(doc(db, 'promotions', promo.id), {
        ...promo,
        createdAt: promo.createdAt,
        startDate: promo.startDate,
        endDate: promo.endDate
      });
    }
    
    console.log('Sample promotions created');
  }

  /**
   * Create sample activities if needed
   */
  static async createSampleActivities() {
    const now = new Date();
    const activities = [
      {
        id: 'activity1',
        type: 'user',
        title: 'New User Registered',
        description: 'A new user has registered on the platform',
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        userId: 'user2'
      },
      {
        id: 'activity2',
        type: 'content',
        title: 'Content Published',
        description: 'A new article has been published',
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        contentId: 'content3',
        userId: 'user1'
      },
      {
        id: 'activity3',
        type: 'promotion',
        title: 'Promotion Started',
        description: 'A new promotion campaign has begun',
        timestamp: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
        promotionId: 'promo1',
        userId: 'user1'
      }
    ];

    for (const activity of activities) {
      await setDoc(doc(db, 'activities', activity.id), {
        ...activity,
        timestamp: activity.timestamp
      });
    }
    
    console.log('Sample activities created');
  }

  /**
   * Create sample analytics if needed
   */
  static async createSampleAnalytics() {
    const now = new Date();
    const analytics = [
      {
        id: 'analytics1',
        userId: 'user1',
        contentId: 'content1',
        views: 1250,
        clicks: 324,
        shares: 57,
        comments: 23,
        revenue: 43.25,
        date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) // Yesterday
      },
      {
        id: 'analytics2',
        userId: 'user2',
        contentId: 'content2',
        views: 850,
        clicks: 192,
        shares: 32,
        comments: 15,
        revenue: 26.75,
        date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000) // Yesterday
      }
    ];

    for (const analytic of analytics) {
      await setDoc(doc(db, 'analytics', analytic.id), {
        ...analytic,
        date: analytic.date
      });
    }
    
    console.log('Sample analytics created');
  }
}

export default DatabaseSyncService;
