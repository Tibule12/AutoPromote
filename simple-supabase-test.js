require('dotenv').config();
const supabase = require('./supabaseClient');

async function simpleTest() {
  console.log('Testing basic Supabase connection...');
  
  try {
    // Try a simple query to test connection
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('✅ Supabase connection successful');
        console.log('❌ Users table does not exist yet');
        console.log('💡 Please create the tables using the SQL script in supabase-schema.sql');
      } else {
        console.error('❌ Error connecting to Supabase:', error.message);
      }
      return;
    }
    
    console.log('✅ Supabase connection and users table both working!');
    
  } catch (error) {
    console.error('❌ Error testing Supabase connection:', error.message);
  }
}

simpleTest();
