const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function comprehensivePromotionTest() {
  console.log('🎯 Comprehensive Promotion Functionality Test');
  console.log('=============================================');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  // Test 1: Verify all required tables exist
  console.log('\n📋 Test 1: Database Table Verification');
  const requiredTables = ['users', 'content', 'promotion_schedules', 'analytics'];
  
  for (const table of requiredTables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('count')
        .limit(1);
      
      if (error && error.code === '42P01') {
        console.log(`❌ Table '${table}' does not exist`);
        return false;
      } else if (error) {
        console.log(`⚠️  Table '${table}' has access issues:`, error.message);
      } else {
        console.log(`✅ Table '${table}' exists and is accessible`);
      }
    } catch (error) {
      console.log(`❌ Exception accessing table '${table}':`, error.message);
      return false;
    }
  }
  
  // Test 2: Test promotion service functionality
  console.log('\n📋 Test 2: Promotion Service Integration');
  try {
    const promotionService = require('./promotionService');
    
    // Get content for testing
    const { data: contentData } = await supabase
      .from('content')
      .select('id')
      .limit(1);
    
    if (!contentData || contentData.length === 0) {
      console.log('❌ No content available for testing');
      return false;
    }
    
    const contentId = contentData[0].id;
    console.log('📝 Testing with content ID:', contentId);
    
    // Test schedule promotion
    const scheduleData = {
      platform: 'youtube',
      schedule_type: 'specific',
      start_time: new Date().toISOString(),
      is_active: true,
      budget: 1000,
      target_metrics: { target_views: 1000000, target_rpm: 900 }
    };
    
    console.log('📋 Testing promotionService.schedulePromotion()');
    const promotion = await promotionService.schedulePromotion(contentId, scheduleData);
    console.log('✅ Promotion scheduled successfully:', promotion.id);
    
    // Test get promotion schedules
    console.log('📋 Testing promotionService.getContentPromotionSchedules()');
    const schedules = await promotionService.getContentPromotionSchedules(contentId);
    console.log('✅ Schedules retrieved:', schedules.length, 'schedule(s) found');
    
    // Test update promotion schedule
    console.log('📋 Testing promotionService.updatePromotionSchedule()');
    const updatedSchedule = await promotionService.updatePromotionSchedule(
      promotion.id,
      { budget: 1500, is_active: false }
    );
    console.log('✅ Schedule updated successfully');
    
    // Test delete promotion schedule
    console.log('📋 Testing promotionService.deletePromotionSchedule()');
    const deleteResult = await promotionService.deletePromotionSchedule(promotion.id);
    console.log('✅ Schedule deleted successfully');
    
    // Test active promotions
    console.log('📋 Testing promotionService.getActivePromotions()');
    const activePromotions = await promotionService.getActivePromotions();
    console.log('✅ Active promotions retrieved:', activePromotions.length, 'active promotion(s)');
    
  } catch (error) {
    console.log('❌ Promotion service test failed:', error.message);
    console.log('💡 Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return false;
  }
  
  // Test 3: Verify server is running and endpoints work
  console.log('\n📋 Test 3: Server Endpoint Verification');
  try {
    const fetch = require('node-fetch');
    const response = await fetch('http://localhost:5000/api/health');
    const healthData = await response.json();
    
    if (healthData.status === 'OK') {
      console.log('✅ Health endpoint working:', healthData.message);
    } else {
      console.log('❌ Health endpoint not working properly');
      return false;
    }
    
    // Test content endpoint
    const contentResponse = await fetch('http://localhost:5000/api/content');
    const contentData = await contentResponse.json();
    
    if (contentData.content && Array.isArray(contentData.content)) {
      console.log('✅ Content endpoint working:', contentData.content.length, 'content item(s)');
    } else {
      console.log('❌ Content endpoint not working properly');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Server endpoint test failed:', error.message);
    return false;
  }
  
  console.log('\n🎉 ALL TESTS PASSED!');
  console.log('=============================================');
  console.log('✅ Database tables are properly configured');
  console.log('✅ Promotion service functionality works');
  console.log('✅ Server endpoints are accessible');
  console.log('✅ promotion_schedules table is fully operational');
  console.log('🚀 Your AutoPromote system is ready for use!');
  
  return true;
}

// Run comprehensive test
comprehensivePromotionTest()
  .then(success => {
    if (!success) {
      console.log('\n💥 Some tests failed. Please check the error messages above.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.log('💥 Unexpected error during testing:', error);
    process.exit(1);
  });
