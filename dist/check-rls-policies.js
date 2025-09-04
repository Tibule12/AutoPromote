require('dotenv').config();
const supabase = require('./supabaseClient');

async function checkRLSPolicies() {
  console.log('Checking RLS policies on Supabase tables...');
  
  try {
    // Check if we can query the users table without RLS issues
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (usersError) {
      console.log('❌ Users table RLS error:', usersError.message);
    } else {
      console.log('✅ Users table accessible:', users);
    }

    // Try to insert a test record to see if RLS blocks it
    const testEmail = `test-${Date.now()}@example.com`;
    const { data: insertData, error: insertError } = await supabase
      .from('users')
      .insert({
        name: 'Test User',
        email: testEmail,
        password: 'hashed_password_placeholder',
        role: 'creator',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.log('❌ Insert blocked by RLS:', insertError.message);
      console.log('💡 You may need to:');
      console.log('   1. Disable RLS on the users table in Supabase dashboard');
      console.log('   2. Or use a service role key instead of anon key');
      console.log('   3. Or create appropriate RLS policies');
    } else {
      console.log('✅ Insert successful:', insertData);
      
      // Clean up test record
      await supabase.from('users').delete().eq('email', testEmail);
    }

  } catch (error) {
    console.error('❌ Error checking RLS:', error.message);
  }
}

checkRLSPolicies();
