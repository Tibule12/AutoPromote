require('dotenv').config();
const supabase = require('./supabaseClient');

async function testConnection() {
  console.log('Testing Supabase connection and schema...');
  
  try {
    // Test connection by listing tables
    const { data: tables, error } = await supabase
      .from('pg_tables')
      .select('tablename')
      .eq('schemaname', 'public');
    
    if (error) {
      console.error('❌ Error connecting to Supabase:', error.message);
      return;
    }
    
    console.log('✅ Connected to Supabase successfully');
    console.log('📋 Available tables in public schema:');
    
    if (tables && tables.length > 0) {
      tables.forEach(table => {
        console.log(`   - ${table.tablename}`);
      });
    } else {
      console.log('   No tables found in public schema');
    }
    
    // Check if required tables exist
    const requiredTables = ['users', 'content', 'analytics'];
    const existingTables = tables ? tables.map(t => t.tablename) : [];
    
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log('\n❌ Missing required tables:');
      missingTables.forEach(table => {
        console.log(`   - ${table}`);
      });
      console.log('\n💡 Please run the SQL script in supabase-schema.sql to create the required tables');
    } else {
      console.log('\n✅ All required tables exist!');
    }
    
  } catch (error) {
    console.error('❌ Error testing Supabase connection:', error.message);
  }
}

testConnection();
