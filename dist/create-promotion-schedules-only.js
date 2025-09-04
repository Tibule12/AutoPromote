const fs = require('fs');
const path = require('path');
require('dotenv').config();

function extractPromotionSchedulesSQL() {
  console.log('📋 Extracting promotion_schedules table SQL...');
  
  try {
    const schemaPath = path.join(__dirname, 'supabase-schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    
    // Extract the promotion_schedules table creation SQL
    const promotionSchedulesMatch = schemaSQL.match(
      /-- Promotion schedules table[\s\S]*?CREATE TABLE IF NOT EXISTS public\.promotion_schedules \([\s\S]*?\);/m
    );
    
    if (promotionSchedulesMatch) {
      const promotionSchedulesSQL = promotionSchedulesMatch[0];
      console.log('✅ Successfully extracted promotion_schedules table SQL');
      
      console.log('\n📋 Manual Creation Instructions:');
      console.log('================================');
      console.log('1. Go to your Supabase dashboard: https://app.supabase.com');
      console.log('2. Select your project');
      console.log('3. Go to the SQL Editor (left sidebar)');
      console.log('4. Create a new query');
      console.log('5. Copy and paste the following SQL:');
      console.log('\n' + promotionSchedulesSQL);
      console.log('\n6. Click "Run" to execute the SQL');
      console.log('7. Wait for the table to be created');
      
      // Also extract the index creation SQL for this table
      const indexSQL = schemaSQL.match(
        /CREATE INDEX IF NOT EXISTS idx_promotion_schedules_content ON public\.promotion_schedules\(content_id\);[\s\S]*?CREATE INDEX IF NOT EXISTS idx_promotion_schedules_active ON public\.promotion_schedules\(is_active\);[\s\S]*?CREATE INDEX IF NOT EXISTS idx_promotion_schedules_time ON public\.promotion_schedules\(start_time\);/
      );
      
      if (indexSQL) {
        console.log('\n8. After table creation, run these indexes:');
        console.log(indexSQL[0]);
      }
      
      console.log('\n🎯 After table creation, test with:');
      console.log('   node test-db-connection.js');
      console.log('   node start-server.js');
      
      return promotionSchedulesSQL;
    } else {
      console.log('❌ Could not extract promotion_schedules table SQL from schema file');
      return null;
    }
  } catch (error) {
    console.log('❌ Error reading schema file:', error.message);
    return null;
  }
}

// Also provide a direct test function
async function testAfterCreation() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  console.log('\n🔍 Testing promotion_schedules table access...');
  
  try {
    const { data, error } = await supabase
      .from('promotion_schedules')
      .select('count')
      .limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log('❌ promotion_schedules table still does not exist');
        console.log('💡 Please follow the manual creation instructions above');
      } else {
        console.log('⚠️  Other error:', error.message);
      }
    } else {
      console.log('✅ promotion_schedules table exists and is accessible!');
      console.log('🎉 You can now start your server: node start-server.js');
    }
  } catch (error) {
    console.log('⚠️  Exception during test:', error.message);
  }
}

// Run the extraction
const sql = extractPromotionSchedulesSQL();

console.log('\n💡 Quick test command after table creation:');
console.log('   node test-db-connection.js');
