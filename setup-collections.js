const { db } = require('./firebaseAdmin');

async function setupCollections() {
    try {
        console.log('🔄 Setting up Firestore collections...');

        // 1. Users Collection
        console.log('📝 Creating users collection example document...');
        await db.collection('users').doc('example-user').set({
            name: 'Example User',
            email: 'example@test.com',
            role: 'creator',
            created_at: new Date(),
            updated_at: new Date()
        });

        // 2. Content Collection
        console.log('📝 Creating content collection example document...');
        await db.collection('content').doc('example-content').set({
            title: 'Example Content',
            type: 'video',
            url: 'https://example.com/video',
            description: 'Example description',
            user_id: 'example-user',
            target_platforms: ['youtube', 'tiktok'],
            views: 0,
            revenue: 0,
            status: 'draft',
            promotion_started_at: null,
            scheduled_promotion_time: null,
            promotion_frequency: 'once',
            next_promotion_time: null,
            target_rpm: 900000,
            min_views_threshold: 1000000,
            max_budget: 1000,
            created_at: new Date(),
            updated_at: new Date()
        });

        // 3. Promotion Schedules Collection
        console.log('📝 Creating promotion_schedules collection example document...');
        await db.collection('promotion_schedules').doc('example-schedule').set({
            content_id: 'example-content',
            platform: 'youtube',
            schedule_type: 'specific',
            start_time: new Date(),
            end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            frequency: null,
            is_active: true,
            budget: 0,
            target_metrics: {
                target_views: 1000000,
                target_engagement: 0.1
            },
            created_at: new Date(),
            updated_at: new Date()
        });

        // 4. Analytics Collection
        console.log('📝 Creating analytics collection example document...');
        await db.collection('analytics').doc('example-analytics').set({
            content_id: 'example-content',
            platform: 'all',
            views: 0,
            engagement: 0,
            revenue: 0,
            clicks: 0,
            shares: 0,
            comments: 0,
            conversion_rate: 0,
            optimization_score: 0,
            algorithm_version: 'v1.0',
            metrics_updated_at: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        });

        console.log('✅ Collections setup completed successfully!');
        
        // Clean up example documents
        console.log('🧹 Cleaning up example documents...');
        await db.collection('users').doc('example-user').delete();
        await db.collection('content').doc('example-content').delete();
        await db.collection('promotion_schedules').doc('example-schedule').delete();
        await db.collection('analytics').doc('example-analytics').delete();
        
        console.log('✅ Example documents cleaned up successfully');
        console.log('🎉 Database setup complete!');

    } catch (error) {
        console.error('❌ Error setting up collections:', error);
    }
}

setupCollections();
