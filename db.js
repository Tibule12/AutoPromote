const supabase = require('./supabaseClient');

const connectDB = async () => {
  console.log('🔗 Testing Supabase connection...');
  
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    
    if (error) {
      console.error('❌ Supabase connection test failed:');
      console.error(`   Error: ${error.message}`);
      console.error('💡 Please check:');
      console.error('   - SUPABASE_URL and SUPABASE_ANON_KEY in your .env file');
      console.error('   - Your Supabase project is active and accessible');
      console.error('   - Your network connection');
      console.error('⚠️  Proceeding anyway, but database operations may fail');
      return false;
    } else {
      console.log('✅ Supabase connection successful');
      console.log('📊 Connection test response:', data);
      return true;
    }
  } catch (error) {
    console.error('❌ Supabase connection test failed with exception:');
    console.error(`   ${error.message}`);
    console.error('⚠️  Proceeding anyway, but database operations may fail');
    return false;
  }
};

module.exports = connectDB;
