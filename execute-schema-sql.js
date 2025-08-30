const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function executeSchemaSQL() {
  console.log('🚀 Executing schema SQL directly...');
  
  // Check environment variables
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }
  
  // Read the schema SQL file
  const schemaPath = path.join(__dirname, 'supabase-schema.sql');
  let schemaSQL;
  
  try {
    schemaSQL = fs.readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file loaded successfully');
  } catch (error) {
    console.error('❌ Failed to read schema file:', error.message);
    process.exit(1);
  }
  
  // Since we can't execute raw SQL directly through the JS client,
  // we'll provide instructions for manual execution
  
  console.log('\n📋 Manual Schema Execution Instructions:');
  console.log('==========================================');
  console.log('1. Go to your Supabase dashboard: https://app.supabase.com');
  console.log('2. Select your project');
  console.log('3. Go to the SQL Editor (left sidebar)');
  console.log('4. Create a new query');
  console.log('5. Copy and paste the following SQL:');
  console.log('\n' + schemaSQL);
  console.log('\n6. Click "Run" to execute the SQL');
  console.log('7. Wait for all statements to complete');
  console.log('8. Your tables will be created!');
  
  console.log('\n💡 Alternative: Use the Supabase CLI');
  console.log('If you have the Supabase CLI installed:');
  console.log('1. Run: supabase db push');
  console.log('2. This will push your local schema to Supabase');
  
  console.log('\n🎯 After executing the schema, test with:');
  console.log('   node test-db-connection.js');
  console.log('   node start-server.js');
}

executeSchemaSQL();
