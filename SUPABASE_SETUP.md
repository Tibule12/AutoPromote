# Supabase Setup Instructions

## Row Level Security (RLS) Issue

The backend is currently experiencing RLS (Row Level Security) issues when trying to insert records into the users table. This is a security feature of Supabase that prevents unauthorized operations.

## Solution Options

### Option 1: Use Service Role Key (Recommended)
1. Go to your Supabase dashboard
2. Navigate to Settings > API
3. Copy the "service_role" key (not the anon key)
4. Update your `.env` file:
   ```
   SUPABASE_ANON_KEY=your_service_role_key_here
   ```

### Option 2: Disable RLS on Tables
1. Go to your Supabase dashboard
2. Navigate to Authentication > Policies
3. For each table (users, content, analytics):
   - Disable Row Level Security
   - Or create appropriate policies that allow backend operations

### Option 3: Create Appropriate RLS Policies
Create policies that allow the backend to perform necessary operations. Example for users table:

```sql
-- Allow insert for any authenticated request (backend)
CREATE POLICY "Backend can insert users" ON users
FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Allow select for any authenticated request  
CREATE POLICY "Backend can select users" ON users
FOR SELECT USING (auth.role() = 'service_role');
```

## Current Environment Setup

Your `.env` file should contain:
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_service_role_key_or_anon_key
JWT_SECRET=your_very_long_and_secure_jwt_secret
PORT=5000
```

## Testing Connection

After making changes, test the connection:
```bash
node simple-supabase-test.js
```

## Restart Server

After updating environment variables, restart the server:
```bash
node start-server.js
