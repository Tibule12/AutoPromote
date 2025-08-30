const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testPromotionDirect() {
  console.log('🚀 Testing promotion functionality directly...');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  // Test 1: Check if promotion_schedules table exists and is accessible
  console.log('\n📋 Test 1: Checking promotion_schedules table accessibility');
  try {
    const { data, error } = await supabase
      .from('promotion_schedules')
      .select('count')
      .limit(1);
    
    if (error) {
      console.log('❌ Error accessing promotion_schedules:', error.message);
      return false;
    }
    
    console.log('✅ promotion_schedules table is accessible');
  } catch (error) {
    console.log('❌ Exception accessing promotion_schedules:', error.message);
    return false;
  }
  
  // Test 2: Try to insert a promotion schedule
  console.log('\n📋 Test 2: Testing promotion schedule insertion');
  try {
    // First get a valid content ID
    const { data: contentData } = await supabase
      .from('content')
      .select('id')
      .limit(1);
    
    if (!contentData || contentData.length === 0) {
      console.log('❌ No content available for testing');
      return false;
    }
    
    const contentId = contentData[0].id;
    console.log('📝 Using content ID:', contentId);
    
    const scheduleData = {
      content_id: contentId,
      platform: 'youtube',
      schedule_type: 'specific',
      start_time: new Date().toISOString(),
      is_active: true,
      budget: 500,
      target_metrics: { target_views: 500000, target_rpm: 800 }
    };
    
    console.log('📋 Inserting promotion schedule:', scheduleData);
    
    const { data, error } = await supabase
      .from('promotion_schedules')
      .insert([scheduleData])
      .select();
    
    if (error) {
      console.log('❌ Error inserting promotion schedule:', error.message);
      console.log('💡 Error details:', {
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      return false;
    }
    
    console.log('✅ Promotion schedule inserted successfully:', data[0]);
    
    // Test 3: Verify the schedule can be retrieved
    console.log('\n📋 Test 3: Verifying schedule retrieval');
    const { data: schedules, error: retrieveError } = await supabase
      .from('promotion_schedules')
      .select('*')
      .eq('content_id', contentId);
    
    if (retrieveError) {
      console.log('❌ Error retrieving schedules:', retrieveError.message);
      return false;
    }
    
    console.log('✅ Schedules retrieved successfully:', schedules);
    
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('promotion_schedules')
      .delete()
      .eq('content_id', contentId);
    
    if (deleteError) {
      console.log('⚠️  Warning: Could not clean up test data:', deleteError.message);
    } else {
      console.log('✅ Test data cleaned up successfully');
    }
    
    return true;
    
  } catch (error) {
    console.log('❌ Exception during promotion test:', error.message);
    return false;
  }
}

// Run the test
testPromotionDirect()
  .then(success => {
    if (success) {
      console.log('\n🎉 All promotion functionality tests passed!');
      console.log('💡 The promotion_schedules table is working correctly');
      console.log('🚀 You can now use the promotion features in your application');
    } else {
      console.log('\n💥 Some promotion tests failed');
      console.log('📋 Check the error messages above for details');
    }
  })
  .catch(error => {
    console.log('💥 Unexpected error:', error);
  });
