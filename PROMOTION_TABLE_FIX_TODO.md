# Promotion Table Fix - TODO List

## Current Status
- ✅ Users table exists
- ✅ Content table exists  
- ✅ Analytics table exists
- ❌ Promotion_schedules table missing - causing server errors

## Steps to Fix

### 1. Manual Table Creation in Supabase
Go to your Supabase dashboard and execute this SQL in the SQL Editor:

```sql
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_content ON public.promotion_schedules(content_id);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_active ON public.promotion_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_time ON public.promotion_schedules(start_time);
```

### 2. Verification Steps
After creating the table, run these tests:

```bash
# Test database connection and table access
node test-db-connection.js

# Test the server
node start-server.js
```

### 3. Expected Results
- ✅ `node test-db-connection.js` should show all tests passing
- ✅ `node start-server.js` should start without promotion_schedules errors
- ✅ Server should be accessible at http://localhost:5000

### 4. Troubleshooting
If you still encounter issues:
1. Check that the table was created successfully in Supabase dashboard
2. Verify your environment variables are correct
3. Ensure you're using the service role key for proper permissions

## Files Created for This Fix
- `migrate-schema.js` - General schema migration script
- `execute-schema-sql.js` - Manual SQL execution instructions
- `create-tables-via-usage.js` - Table existence checker
- `create-promotion-schedules-only.js` - Focused promotion table fix

## Next Steps After Fix
1. Test promotion functionality
2. Verify all API endpoints work
3. Test the frontend integration
