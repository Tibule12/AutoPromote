# Firestore Collections and Fields (Production)

This document describes the expected structure of your Firestore data model used by AutoPromote. Field names are case-sensitive. Timestamps are Firestore `Timestamp` when written with JS `new Date()`.

The app enforces a daily upload cap of 10 items per user (UTC day) and auto-schedules posting at platform-optimal windows if you don’t specify a time.

## 1) users (collection)
- Document ID: Firebase Auth UID (string)
- Fields:
  - email: string
  - displayName: string
  - role: 'user' | 'admin'
  - createdAt: Timestamp
  - lastLoginAt: Timestamp
  - plan: 'free' | 'pro' | 'enterprise' (optional)
  - dailyUploadCount: number (optional cache; source of truth is counting `content` for the current UTC day)

### Subcollection: connections
- Path: users/{uid}/connections/{provider}
- {provider} one of: 'tiktok' | 'facebook' | 'instagram' | 'youtube'
- Fields (provider-specific):
  - provider: string (same as document id)
  - access_token: string (sensitive)
  - refresh_token: string (if applicable)
  - expires_at: Timestamp (if applicable)
  - scope: string | string[]
  - meta: object
    - For facebook:
      - pages: Array<{ id: string, name: string, access_token: string }>
      - ig_business_account_id: string (if any)
    - For youtube:
      - channelId: string
      - channelTitle: string
    - For tiktok:
      - open_id: string
      - display_name: string

## 2) content (collection)
- Document ID: auto-generated
- Fields:
  - user_id: string (UID)
  - title: string
  - description: string
  - type: 'video' | 'image' | 'text' | 'link'
  - url: string (public URL to the uploaded media)
  - target_platforms: string[] (e.g., ['youtube','tiktok','instagram','facebook'])
  - status: 'pending' | 'draft' | 'scheduled' | 'published' | 'paused' | 'archived'
  - created_at: Timestamp
  - updated_at: Timestamp (optional)
  - scheduled_promotion_time: string | Timestamp | null (ISO if string)
  - promotion_frequency: 'once' | 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
  - next_promotion_time: string | Timestamp | null
  - promotion_started_at: Timestamp | null
  - target_rpm: number (default 900000)
  - min_views_threshold: number (default 2000000)
  - max_budget: number
  - views: number (default 0)
  - revenue: number (default 0)
  - revenue_per_million: number (default 900000)
  - creator_payout_rate: number (default 0.01)
  - schedule_hint: { when?: string, timezone?: string, frequency?: string } | null
  - landingPageRequestedAt: Timestamp (optional)
  - smartLinkRequestedAt: Timestamp (optional)
  - quality_score: number (0-100, optional)
  - quality_feedback: string[] (optional)
  - quality_enhanced: boolean (optional)

Indexes (recommended):
- content by created_at desc
- content where user_id == :uid order by created_at desc
- Optional (may trigger index prompt): user_id == :uid AND created_at >= :startOfDayUTC (for daily upload cap)

## 3) promotion_schedules (collection)
- Document ID: auto-generated
- Fields:
  - contentId: string (ref: content doc id)
  - platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'all'
  - schedule_type: 'specific' | 'recurring'
  - start_time: string (ISO UTC)
  - end_time: string | null
  - frequency: 'once' | 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
  - is_active: boolean
  - budget: number
  - target_metrics: { target_views: number, target_rpm: number }
  - created_at: Timestamp
  - updated_at: Timestamp

Indexes (recommended):
- promotion_schedules where contentId in [:ids]
- promotion_schedules where is_active == true order by start_time asc

## 4) analytics (collection)
- Document ID: auto-generated
- Fields:
  - content_id: string (ref)
  - platform: string
  - metrics_updated_at: Timestamp
  - metrics: object (views, likes, shares, comments, watchTime, etc.)

Indexes (recommended):
- analytics where content_id == :id order by metrics_updated_at desc

## 5) notifications (collection)
- Document ID: auto-generated
- Fields:
  - user_id: string
  - type: string (e.g., 'content_uploaded','schedule_created')
  - content_id: string
  - title: string
  - message: string
  - read: boolean
  - created_at: Timestamp

## 6) payouts (collection)
- Document ID: auto-generated
- Fields:
  - contentId: string
  - creatorId: string
  - amount: number
  - currency: 'USD'
  - recipientEmail: string
  - status: 'processed' | 'failed' | 'pending'
  - paypalBatchId: string
  - processedAt: Timestamp
  - revenueGenerated: number
  - payoutRate: number

---

Daily upload cap:
- The backend checks `content.where('user_id','==',uid).where('created_at','>=', startOfDayUTC)` and limits to max 10 per UTC day.
- If Firestore prompts for an index, create the suggested composite index.

Auto-scheduling windows (if you don’t specify a time):
- YouTube: 15:00 UTC
- TikTok: 19:00 UTC
- Instagram: 11:00 UTC
- Facebook: 09:00 UTC

Quality checks:
- Endpoint: POST /api/content/quality-check (multipart/form-data file="file")
- The server analyzes with ffmpeg and, if needed, enhances to 1280x720, ~1.5 Mbps video, 128 kbps audio, returning a qualityScore and feedback.
- Consider running a quick quality check before final upload for best results. If you pass `quality_score`, `quality_feedback`, and `quality_enhanced` in `/api/content/upload` body, they will be stored on the content document for auditing.
