require('dotenv').config();
const { migrateUsers, migrateContent, migratePromotions, migrateAnalytics } = require('./migrate-to-firebase');

async function testMigration() {
    try {
        console.log('🧪 Starting migration tests...\n');

        // Test user migration
        console.log('Testing user migration...');
        try {
            await migrateUsers();
            console.log('✅ User migration test passed\n');
        } catch (error) {
            console.error('❌ User migration test failed:', error, '\n');
        }

        // Test content migration
        console.log('Testing content migration...');
        try {
            await migrateContent();
            console.log('✅ Content migration test passed\n');
        } catch (error) {
            console.error('❌ Content migration test failed:', error, '\n');
        }

        // Test promotion migration
        console.log('Testing promotion migration...');
        try {
            await migratePromotions();
            console.log('✅ Promotion migration test passed\n');
        } catch (error) {
            console.error('❌ Promotion migration test failed:', error, '\n');
        }

        // Test analytics migration
        console.log('Testing analytics migration...');
        try {
            await migrateAnalytics();
            console.log('✅ Analytics migration test passed\n');
        } catch (error) {
            console.error('❌ Analytics migration test failed:', error, '\n');
        }

        console.log('🎉 Migration tests completed!');
    } catch (error) {
        console.error('❌ Migration tests failed:', error);
        process.exit(1);
    }
}

testMigration();
