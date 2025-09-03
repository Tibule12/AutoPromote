// Firestore data model documentation for AutoPromote
// This file describes the collections and fields for migration reference

/**
 * users (collection)
 *   - name: string
 *   - email: string
 *   - role: string ('creator' | 'admin')
 *   - created_at: timestamp
 *   - updated_at: timestamp
 */

/**
 * content (collection)
 *   - title: string
 *   - type: string
 *   - url: string
 *   - description: string
 *   - user_id: reference (users)
 *   - target_platforms: array of strings
 *   - views: number
 *   - revenue: number
 *   - created_at: timestamp
 *   - updated_at: timestamp
 */

/**
 * promotion_schedules (collection)
 *   - content_id: reference (content)
 *   - platform: string
 *   - schedule_type: string
 *   - start_time: timestamp
 *   - is_active: boolean
 *   - budget: number
 *   - target_metrics: map/object
 *   - created_at: timestamp
 *   - updated_at: timestamp
 */

/**
 * analytics (collection)
 *   - content_id: reference (content)
 *   - platform: string
 *   - views: number
 *   - engagement: number
 *   - revenue: number
 *   - clicks: number
 *   - shares: number
 *   - comments: number
 *   - conversion_rate: number
 *   - optimization_score: number
 *   - algorithm_version: string
 *   - metrics_updated_at: timestamp
 *   - created_at: timestamp
 *   - updated_at: timestamp
 */
