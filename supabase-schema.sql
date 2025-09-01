-- Supabase schema for AutoPromote project

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
CREATE INDEX IF NOT EXISTS idx_content_scheduled_time ON public.content(scheduled_promotion_time);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_content ON public.promotion_schedules(content_id);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_active ON public.promotion_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_promotion_schedules_time ON public.promotion_schedules(start_time);
CREATE INDEX IF NOT EXISTS idx_analytics_content_id ON public.analytics(content_id);

-- Insert hardcoded admin user
INSERT INTO public.users (id, name, email, password, role, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Admin',
  'admin123@gmail.com',
  '$2a$12$trwTiBoxgdLw/dxqFSHeN.NQ1QWOF5RS3QSW/wTr9cHTaByZswgfm',
  'admin',
  now()
)
ON CONFLICT (email) DO NOTHING;
