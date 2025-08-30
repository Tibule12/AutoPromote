const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createTablesViaUsage() {
  console.log('🚀 Attempting to create tables by using them...');
  
  // Check environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }
  
  console.log('✅ Environment variables verified');
  
  const tablesToCreate = [
    'users',
    'content', 
    'promotion_schedules',
    'analytics'
  ];
  
  console.log('📋 Tables to create:', tablesToCreate.join(', '));
  
  for (const tableName of tablesToCreate) {
    console.log(`\n🔄 Attempting to access table: ${tableName}`);
    
    try {
      // Try to select from the table - this may trigger table creation
      // or at least help us understand the current state
      const { data, error } = await supabase
        .from(tableName)
        .select('count')
        .limit(1);
      
      if (error) {
        if (error.code === '42P01') {
          console.log(`   ℹ️  Table '${tableName}' does not exist yet`);
          console.log(`   💡 This table will be created when first used by the application`);
        } else {
          console.log(`   ⚠️  Error accessing '${tableName}':`, error.message);
        }
      } else {
        console.log(`   ✅ Table '${tableName}' exists and is accessible`);
      }
    } catch (error) {
      console.log(`   ⚠️  Exception accessing '${tableName}':`, error.message);
    }
  }
  
  console.log('\n🎯 Testing promotion_schedules table specifically...');
  
  // Test promotion_schedules with a simple insert that should trigger table creation
  try {
    console.log('   Trying to insert a test record into promotion_schedules...');
    
    const testData = {
      content_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
      platform: 'test-platform',
      schedule_type: 'specific',
      start_time: new Date().toISOString(),
      is_active: true,
      budget: 100,
      target_metrics: { target_views: 1000 }
    };
    
    const { data, error } = await supabase
      .from('promotion_schedules')
      .insert([testData])
      .select();
    
    if (error) {
      if (error.code === '42P01') {
        console.log('   ❌ promotion_schedules table does not exist and cannot be auto-created');
        console.log('   💡 You need to manually create the table in Supabase:');
        console.log('      1. Go to Supabase dashboard → SQL Editor');
        console.log('      2. Run the CREATE TABLE statement for promotion_schedules');
        console.log('      3. The SQL is in supabase-schema.sql file');
      } else {
        console.log('   ⚠️  Other error:', error.message);
      }
    } else {
      console.log('   ✅ Successfully inserted test record! Table exists.');
      
      // Clean up
      await supabase
        .from('promotion_schedules')
        .delete()
        .eq('id', data[0].id);
      
      console.log('   ✅ Test record cleaned up');
    }
  } catch (error) {
    console.log('   ⚠️  Exception during test insert:', error.message);
  }
  
  console.log('\n📋 Next Steps:');
  console.log('1. Manual table creation required in Supabase SQL Editor');
  console.log('2. Copy the SQL from supabase-schema.sql');
  console.log('3. Run each CREATE TABLE statement');
  console.log('4. Test with: node test-db-connection.js');
  console.log('5. Start server: node start-server.js');
}

createTablesViaUsage();
