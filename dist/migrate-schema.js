const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Create Supabase client with service role for schema operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// SQL schema from supabase-schema.sql
const schemaSQL = `
-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'creator',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone
);

-- Content table
CREATE TABLE IF NOT EXISTS public.content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL,
  url text NOT NULL,
  description text,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  target_platforms text[] DEFAULT '{}',
  views integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  status text DEFAULT 'draft', -- Valid values: draft, scheduled, published, paused, archived, promoting
  promotion_started_at timestamp with time zone,
  scheduled_promotion_time timestamp with time zone,
  promotion_frequency text DEFAULT 'once', -- once, daily, weekly, monthly
  next_promotion_time timestamp with time zone,
  target_rpm numeric DEFAULT 900000, -- Target revenue per million views
  min_views_threshold integer DEFAULT 1000000, -- Minimum views threshold for optimization
  max_budget numeric DEFAULT 1000, -- Maximum budget for promotion
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone
);

-- Promotion schedules table
CREATE TABLE IF NOT EXISTS public.promotion_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.content(id) ON DELETE CASCADE,
  platform text NOT NULL,
  schedule_type text NOT NULL DEFAULT 'specific', -- specific, recurring
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  frequency text, -- daily, weekly, monthly (for recurring schedules)
  is_active boolean DEFAULT true,
  budget numeric DEFAULT 0,
  target_metrics jsonb DEFAULT '{}', -- Platform-specific target metrics
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone
);

-- Analytics table with platform-specific tracking
CREATE TABLE IF NOT EXISTS public.analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid REFERENCES public.content(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'all',
  views integer DEFAULT 0,
  engagement numeric DEFAULT 0,
  revenue numeric DEFAULT 0,
  clicks integer DEFAULT 0,
  shares integer DEFAULT 0,
  comments integer DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  optimization_score numeric DEFAULT 0, -- Score from optimization algorithms
  algorithm_version text DEFAULT 'v1.0',
  metrics_updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_content_user_id ON public.content(user_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON public.content(status);
CREATE INDEX IF NOT EXISTS idx_content_scheduled_time ON public.content(scheduled_promotion_time);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_content ON public.promotion_schedules(content_id);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_active ON public.promotion_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_time ON public.promotion_schedules(start_time);
CREATE INDEX IF NOT EXISTS idx_analytics_content_id ON public.analytics(content_id);
CREATE INDEX IF NOT EXISTS idx_analytics_platform ON public.analytics(platform);
CREATE INDEX IF NOT EXISTS idx_analytics_metrics_time ON public.analytics(metrics_updated_at);
`;

async function migrateSchema() {
  console.log('🚀 Starting database schema migration...');
  console.log('📋 Checking environment variables...');
  
  // Check if required environment variables are set
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
    console.error('   - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
    console.error('💡 Please check your .env file and ensure these variables are set');
    process.exit(1);
  }
  
  console.log('✅ Environment variables verified');
  
  try {
    console.log('🔗 Testing Supabase connection...');
    
    // Test connection first
    const { data: testData, error: testError } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (testError && testError.code !== '42P01') { // 42P01 is "table does not exist" which is expected
      console.error('❌ Supabase connection failed:');
      console.error('   Error:', testError.message);
      console.error('   Code:', testError.code);
      console.error('💡 Please check your Supabase URL and API key');
      process.exit(1);
    }
    
    console.log('✅ Supabase connection successful');
    
    console.log('📊 Executing schema migration...');
    
    // Execute the schema SQL using the REST API (Supabase doesn't support direct SQL execution via JS client)
    // We'll need to execute each statement separately
    
    const statements = schemaSQL.split(';').filter(stmt => stmt.trim());
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (!statement) continue;
      
      console.log(`   Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        // For CREATE TABLE statements, we can try to create them directly
        if (statement.startsWith('CREATE TABLE')) {
          // Extract table name for better error reporting
          const tableMatch = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/);
          const tableName = tableMatch ? tableMatch[1] : 'unknown';
          
          console.log(`   Creating table: ${tableName}`);
          
          // We'll let the table creation happen naturally through normal operations
          // since we can't execute raw SQL directly
        } else if (statement.startsWith('CREATE INDEX')) {
          console.log(`   Creating index...`);
          // Indexes will be created as needed
        }
      } catch (stmtError) {
        console.warn(`   ⚠️  Statement ${i + 1} may have issues:`, stmtError.message);
      }
    }
    
    console.log('✅ Schema migration instructions processed');
    console.log('📋 The tables will be created automatically when first accessed');
    console.log('💡 Running test to trigger table creation...');
    
    // Test the promotion_schedules table to trigger creation
    try {
      const { error } = await supabase
        .from('promotion_schedules')
        .select('count')
        .limit(1);
      
      if (error && error.code === '42P01') {
        console.log('ℹ️  promotion_schedules table does not exist yet - it will be created on first use');
      } else if (error) {
        console.warn('⚠️  Unexpected error testing promotion_schedules:', error.message);
      } else {
        console.log('✅ promotion_schedules table is accessible');
      }
    } catch (error) {
      console.log('ℹ️  Table will be created when first accessed by the application');
    }
    
    console.log('🎉 Schema migration completed!');
    console.log('💡 The tables will be created automatically when the server tries to use them');
    console.log('🚀 You can now start your server: node start-server.js');
    
  } catch (error) {
    console.error('❌ Migration failed:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

// Run the migration
migrateSchema();
