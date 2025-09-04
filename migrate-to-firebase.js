require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { db, auth, storage, admin } = require('./firebaseAdmin');

// Initialize Supabase client
const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function migrateUsers() {
    try {
        console.log('🔄 Starting user migration...');
        
        // Get all users from Supabase
        const { data: supabaseUsers, error } = await supabase
            .from('users')
            .select('*');

        if (error) throw error;
        console.log(`📊 Found ${supabaseUsers.length} users to migrate`);

        // Migrate each user
        for (const user of supabaseUsers) {
            try {
                // Check if Firestore is ready
            try {
                await db.collection('users').limit(1).get();
            } catch (dbError) {
                console.error('❌ Firestore is not ready. Please create a Firestore database in the Firebase Console first.');
                console.error('Instructions:');
                console.error('1. Go to Firebase Console (https://console.firebase.google.com)');
                console.error('2. Select project "autopromote-464de"');
                console.error('3. Click on "Firestore Database" in the left sidebar');
                console.error('4. Click "Create Database"');
                console.error('5. Choose your preferred location and start in production mode');
                console.error('6. Wait for the database to be provisioned');
                throw new Error('Firestore database not initialized');
            }

            // Try to get existing user or create new one
            let userRecord;
            try {
                    // Try to get the existing user
                    userRecord = await auth.getUserByEmail(user.email);
                    console.log(`📝 User ${user.email} already exists, updating...`);
                } catch (error) {
                    if (error.code === 'auth/user-not-found') {
                        // Create new user if they don't exist
                        userRecord = await auth.createUser({
                            email: user.email,
                            emailVerified: user.email_confirmed_at != null,
                            displayName: user.full_name || user.username,
                            disabled: !user.is_active,
                            // Note: Can't migrate passwords, users will need to reset
                        });
                        console.log(`✨ Created new user: ${user.email}`);
                    } else {
                        throw error;
                    }
                }

                // Store additional user data in Firestore
                const userData = {
                    email: user.email || '',
                    fullName: user.full_name || '',
                    username: user.username || '',
                    createdAt: user.created_at ? admin.firestore.Timestamp.fromDate(new Date(user.created_at)) : admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: user.updated_at ? admin.firestore.Timestamp.fromDate(new Date(user.updated_at)) : admin.firestore.FieldValue.serverTimestamp(),
                    role: user.role || 'user',
                    settings: user.settings || {},
                    metadata: {
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                        migratedFrom: 'supabase',
                        originalId: user.id.toString()
                    }
                };

                // Filter out any undefined values
                const cleanUserData = Object.fromEntries(
                    Object.entries(userData).filter(([_, value]) => value !== undefined)
                );
                
                await db.collection('users').doc(userRecord.uid).set(cleanUserData);

                console.log(`✅ Migrated user: ${user.email}`);
            } catch (userError) {
                console.error(`❌ Error migrating user ${user.email}:`, userError);
            }
        }

        console.log('✅ User migration completed');
    } catch (error) {
        console.error('❌ Error in user migration:', error);
        throw error;
    }
}

async function migrateContent() {
    try {
        // Check if Firestore is ready
        try {
            await db.collection('content').limit(1).get();
        } catch (dbError) {
            console.error('❌ Firestore is not ready. Please create a Firestore database in the Firebase Console first.');
            console.error('Instructions:');
            console.error('1. Go to Firebase Console (https://console.firebase.google.com)');
            console.error('2. Select project "autopromote-464de"');
            console.error('3. Click on "Firestore Database" in the left sidebar');
            console.error('4. Click "Create Database"');
            console.error('5. Choose your preferred location and start in production mode');
            console.error('6. Wait for the database to be provisioned');
            throw new Error('Firestore database not initialized');
        }

        console.log('🔄 Starting content migration...');
        
        // Get all content from Supabase
        const { data: supabaseContent, error } = await supabase
            .from('content')
            .select('*');

        if (error) throw error;
        console.log(`📊 Found ${supabaseContent.length} content items to migrate`);

        // Migrate each content item
        for (const content of supabaseContent) {
            try {
                const contentRef = db.collection('content').doc();
                
                // Prepare content data
                const contentData = {
                    title: content.title || '',
                    type: content.type || 'post',
                    description: content.description || '',
                    url: content.url || '',
                    userId: content.user_id ? content.user_id.toString() : '',
                    status: content.status || 'active',
                    tags: content.tags || [],
                    createdAt: content.created_at ? admin.firestore.Timestamp.fromDate(new Date(content.created_at)) : admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: content.updated_at ? admin.firestore.Timestamp.fromDate(new Date(content.updated_at)) : admin.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                        migratedFrom: 'supabase',
                        originalId: content.id.toString()
                    }
                };

                // Filter out any undefined values
                const cleanContentData = Object.fromEntries(
                    Object.entries(contentData).filter(([_, value]) => value !== undefined)
                );
                
                await contentRef.set(cleanContentData);

                // If there's associated file/media, migrate it to Firebase Storage
                if (content.file_path) {
                    const { data: fileData } = await supabase.storage
                        .from('content')
                        .download(content.file_path);

                    if (fileData) {
                        const bucket = storage.bucket();
                        const file = bucket.file(`content/${contentRef.id}/${content.file_path.split('/').pop()}`);
                        
                        await file.save(fileData);
                        
                        // Update content with new file URL
                        await contentRef.update({
                            fileUrl: `gs://${bucket.name}/${file.name}`
                        });
                    }
                }

                console.log(`✅ Migrated content: ${content.title}`);
            } catch (contentError) {
                console.error(`❌ Error migrating content ${content.title}:`, contentError);
            }
        }

        console.log('✅ Content migration completed');
    } catch (error) {
        console.error('❌ Error in content migration:', error);
        throw error;
    }
}

async function migratePromotions() {
    try {
        // Check if Firestore is ready
        try {
            await db.collection('promotions').limit(1).get();
        } catch (dbError) {
            console.error('❌ Firestore is not ready. Please create a Firestore database in the Firebase Console first.');
            console.error('Instructions:');
            console.error('1. Go to Firebase Console (https://console.firebase.google.com)');
            console.error('2. Select project "autopromote-464de"');
            console.error('3. Click on "Firestore Database" in the left sidebar');
            console.error('4. Click "Create Database"');
            console.error('5. Choose your preferred location and start in production mode');
            console.error('6. Wait for the database to be provisioned');
            throw new Error('Firestore database not initialized');
        }

        console.log('🔄 Starting promotion migration...');
        
        // Get all promotions from Supabase
        const { data: supabasePromotions, error } = await supabase
            .from('promotion_schedules')
            .select('*');

        if (error) throw error;
        console.log(`📊 Found ${supabasePromotions.length} promotions to migrate`);

        // Migrate each promotion
        for (const promotion of supabasePromotions) {
            try {
                const promotionData = {
                    contentId: promotion.content_id ? promotion.content_id.toString() : '',
                    platform: promotion.platform || '',
                    scheduleType: promotion.schedule_type || 'one-time',
                    startTime: promotion.start_time ? admin.firestore.Timestamp.fromDate(new Date(promotion.start_time)) : admin.firestore.FieldValue.serverTimestamp(),
                    endTime: promotion.end_time ? admin.firestore.Timestamp.fromDate(new Date(promotion.end_time)) : null,
                    frequency: promotion.frequency || '',
                    isActive: typeof promotion.is_active === 'boolean' ? promotion.is_active : false,
                    budget: promotion.budget || 0,
                    targetMetrics: promotion.target_metrics || {},
                    platformSettings: promotion.platform_specific_settings || {},
                    recurrencePattern: promotion.recurrence_pattern || '',
                    maxOccurrences: promotion.max_occurrences || 0,
                    timezone: promotion.timezone || 'UTC',
                    createdAt: promotion.created_at ? admin.firestore.Timestamp.fromDate(new Date(promotion.created_at)) : admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: promotion.updated_at ? admin.firestore.Timestamp.fromDate(new Date(promotion.updated_at)) : admin.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                        migratedFrom: 'supabase',
                        originalId: promotion.id.toString()
                    }
                };

                // Filter out any undefined values
                const cleanPromotionData = Object.fromEntries(
                    Object.entries(promotionData).filter(([_, value]) => value !== undefined)
                );
                
                await db.collection('promotions').doc().set(cleanPromotionData);

                console.log(`✅ Migrated promotion for content: ${promotion.content_id}`);
            } catch (promotionError) {
                console.error(`❌ Error migrating promotion ${promotion.id}:`, promotionError);
            }
        }

        console.log('✅ Promotion migration completed');
    } catch (error) {
        console.error('❌ Error in promotion migration:', error);
        throw error;
    }
}

async function migrateAnalytics() {
    try {
        // Check if Firestore is ready
        try {
            await db.collection('analytics').limit(1).get();
        } catch (dbError) {
            console.error('❌ Firestore is not ready. Please create a Firestore database in the Firebase Console first.');
            console.error('Instructions:');
            console.error('1. Go to Firebase Console (https://console.firebase.google.com)');
            console.error('2. Select project "autopromote-464de"');
            console.error('3. Click on "Firestore Database" in the left sidebar');
            console.error('4. Click "Create Database"');
            console.error('5. Choose your preferred location and start in production mode');
            console.error('6. Wait for the database to be provisioned');
            throw new Error('Firestore database not initialized');
        }

        console.log('🔄 Starting analytics migration...');
        
        // Get all analytics data from Supabase
        const { data: supabaseAnalytics, error } = await supabase
            .from('analytics')
            .select('*');

        if (error) throw error;
        console.log(`📊 Found ${supabaseAnalytics.length} analytics records to migrate`);

        // Migrate each analytics record
        for (const record of supabaseAnalytics) {
            try {
                const analyticsData = {
                    contentId: record.content_id ? record.content_id.toString() : '',
                    userId: record.user_id ? record.user_id.toString() : '',
                    promotionId: record.promotion_id ? record.promotion_id.toString() : '',
                    metrics: {
                        views: record.views || 0,
                        engagements: record.engagements || 0,
                        conversions: record.conversions || 0,
                        revenue: record.revenue || 0
                    },
                    platform: record.platform || '',
                    date: record.date ? admin.firestore.Timestamp.fromDate(new Date(record.date)) : admin.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                        migratedFrom: 'supabase',
                        originalId: record.id.toString()
                    }
                };

                // Filter out any undefined values
                const cleanAnalyticsData = Object.fromEntries(
                    Object.entries(analyticsData).filter(([_, value]) => value !== undefined)
                );
                
                await db.collection('analytics').doc().set(cleanAnalyticsData);

                console.log(`✅ Migrated analytics for content: ${record.content_id}`);
            } catch (analyticsError) {
                console.error(`❌ Error migrating analytics ${record.id}:`, analyticsError);
            }
        }

        console.log('✅ Analytics migration completed');
    } catch (error) {
        console.error('❌ Error in analytics migration:', error);
        throw error;
    }
}

// Main migration function
async function migrateAll() {
    try {
        console.log('🚀 Starting full migration from Supabase to Firebase...\n');

        // Migrate in order of dependencies
        await migrateUsers();
        console.log('\n');
        
        await migrateContent();
        console.log('\n');
        
        await migratePromotions();
        console.log('\n');
        
        await migrateAnalytics();
        
        console.log('\n✨ Migration completed successfully!');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration if this file is run directly
if (require.main === module) {
    migrateAll();
}

module.exports = {
    migrateUsers,
    migrateContent,
    migratePromotions,
    migrateAnalytics,
    migrateAll
};
