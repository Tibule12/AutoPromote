const supabase = require('./supabaseClient');

async function testDatabaseConnection() {
  console.log('🔗 Testing Supabase database connection...');
  
  try {
    // Test basic connection by querying users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (usersError) {
      console.error('❌ Users table query failed:', usersError);
      return false;
    }
    
    console.log('✅ Users table accessible');
    
    // Test promotion_schedules table
    const { data: schedules, error: schedulesError } = await supabase
      .from('promotion_schedules')
      .select('count')
      .limit(1);
    
    if (schedulesError) {
      console.error('❌ Promotion schedules table query failed:', schedulesError);
      console.error('💡 This might indicate the table does not exist or there are permission issues');
      return false;
    }
    
    console.log('✅ Promotion schedules table accessible');
    
    // Test inserting a sample record
    const testData = {
      content_id: '00000000-0000-0000-0000-000000000000', // dummy UUID
      platform: 'test',
      schedule_type: 'specific',
      start_time: new Date().toISOString(),
      is_active: true,
      budget: 100,
      target_metrics: { target_views: 1000, target_rpm: 500 }
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('promotion_schedules')
      .insert([testData])
      .select();
    
    if (insertError) {
      console.error('❌ Insert test failed:', insertError);
      console.error('💡 Error details:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint
      });
      return false;
    }
    
    console.log('✅ Insert test successful:', insertData);
    
    // Clean up test data
    if (insertData && insertData[0]) {
      const { error: deleteError } = await supabase
        .from('promotion_schedules')
        .delete()
        .eq('id', insertData[0].id);
      
      if (deleteError) {
        console.error('⚠️  Failed to clean up test data:', deleteError);
      } else {
        console.log('✅ Test data cleaned up successfully');
      }
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Database connection test failed with exception:', error);
    return false;
  }
}

// Run the test
testDatabaseConnection()
  .then(success => {
    if (success) {
      console.log('🎉 All database tests passed!');
    } else {
      console.log('💥 Database tests failed');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });
