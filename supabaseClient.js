const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables:');
  if (!supabaseUrl) console.error('   - SUPABASE_URL');
  if (!supabaseAnonKey) console.error('   - SUPABASE_ANON_KEY');
  console.error('💡 Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

module.exports = supabase;
