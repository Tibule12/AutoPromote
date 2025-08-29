# Environment Setup Guide

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url_here

# IMPORTANT: Use Service Role Key (not anon key) to bypass RLS
SUPABASE_ANON_KEY=your_supabase_service_role_key_here

# JWT Secret (must be at least 32 characters)
JWT_SECRET=your_very_long_and_secure_jwt_secret_here_at_least_32_characters

# Server Configuration
PORT=5000

# Optional: Allowed CORS origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Getting Service Role Key

1. Go to your Supabase dashboard
2. Navigate to Settings > API
3. Copy the "service_role" key (not the anon key)
4. Use this as your `SUPABASE_ANON_KEY` value

## Generating JWT Secret

Run this command to generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use the provided script:
```bash
npm run generate-secret
```

## Testing Setup

After setting up your `.env` file, test the configuration:
```bash
node test-env.js
node simple-supabase-test.js
```

## Starting the Server

```bash
node start-server.js
```

For more details on Supabase RLS issues, see `SUPABASE_SETUP.md`
