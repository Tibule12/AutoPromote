# Page snapshot

```yaml
- generic [ref=e1]:
    - heading "Upload E2E Test Page" [level=1] [ref=e2]
    - generic [ref=e3]:
        - text: Title
        - textbox "Title" [ref=e4]: Playwright E2E 1765188563687
    - generic [ref=e5]:
        - text: Description
        - textbox "Description" [ref=e6]: Playwright test upload
    - generic [ref=e7]:
        - text: URL
        - textbox "URL" [ref=e8]: https://example.com/e2e.mp4
    - generic [ref=e9]:
        - text: Type
        - combobox "Type" [ref=e10]:
            - option "video" [selected]
            - option "image"
            - option "audio"
    - generic [ref=e11]:
        - checkbox "Publish to YouTube" [checked] [ref=e12]
        - text: Publish to YouTube
    - generic [ref=e13]:
        - checkbox "Publish to Spotify" [checked] [ref=e14]
        - text: Publish to Spotify
    - generic [ref=e15]:
        - text: Schedule (ISO datetime)
        - textbox "Schedule (ISO datetime)" [ref=e16]
    - button "Submit" [active] [ref=e17]
    - generic [ref=e18]: "{ \"status\": 201, \"content\": { \"id\": \"OKshfxcfGLtfjSjfSmDm\", \"title\": \"Playwright E2E 1765188563687\", \"type\": \"video\", \"url\": \"https://example.com/e2e.mp4\", \"description\": \"Playwright test upload\", \"target_platforms\": [ \"youtube\", \"spotify\" ], \"platform_options\": {}, \"scheduled_promotion_time\": \"2025-12-08T11:09:23.837Z\", \"schedule_hint\": { \"when\": \"2025-12-08T11:09:23.837Z\", \"frequency\": \"once\", \"timezone\": \"UTC\" }, \"auto_promote\": {}, \"user_id\": \"testUser123\", \"created_at\": { \"_seconds\": 1765188565, \"_nanoseconds\": 508000000 }, \"status\": \"pending\", \"viral_optimized\": true, \"viral_optimization\": { \"hashtags\": { \"hashtags\": [] }, \"distribution\": { \"platforms\": [] }, \"algorithm\": { \"optimizationScore\": 0 }, \"seeding\": { \"seedingResults\": [] }, \"boost_chain\": { \"chainId\": null, \"squadSize\": 0 } } }, \"promotion_schedule\": { \"id\": \"nY2bvM7a2wpU6nzs2xgY\", \"contentId\": \"OKshfxcfGLtfjSjfSmDm\", \"user_id\": \"testUser123\", \"platform\": \"youtube,spotify\", \"scheduleType\": \"specific\", \"startTime\": \"2025-12-08T11:09:23.837Z\", \"frequency\": \"once\", \"isActive\": true, \"viral_optimization\": { \"peak_time_score\": 0, \"hashtag_count\": 0, \"algorithm_score\": 0 }, \"schedule_type\": \"specific\" }, \"platform_tasks\": [ { \"platform\": \"youtube\", \"task\": { \"id\": \"UX4jwYgSRpd0l0Hj9sR2\", \"type\": \"youtube_upload\", \"status\": \"queued\", \"contentId\": \"OKshfxcfGLtfjSjfSmDm\", \"uid\": \"testUser123\", \"title\": \"Playwright E2E 1765188563687\", \"description\": \"Playwright test upload\\n\\n\", \"fileUrl\": \"https://example.com/e2e.mp4\", \"shortsMode\": true, \"attempts\": 0, \"nextAttemptAt\": \"2025-12-08T10:09:25.752Z\", \"createdAt\": \"2025-12-08T10:09:25.752Z\", \"updatedAt\": \"2025-12-08T10:09:25.752Z\", \"_sig\": \"89e20986d672605a09d97ce019ab853e2830706eb540d515a7287e5f91a51c9e\" }, \"viral_optimized\": true }, { \"platform\": \"spotify\", \"error\": \"spotify.name or spotify.playlistId or spotify.trackUris required\", \"viral_optimized\": false } ], \"viral_metrics\": { \"optimization_score\": 0, \"hashtag_count\": 0, \"seeding_zones\": 0, \"boost_chain_members\": 0 }, \"growth_guarantee_badge\": { \"enabled\": true, \"message\": \"AutoPromote Boosted: Guaranteed to Grow or Retried Free\", \"viral_score\": 0, \"expected_views\": 0 }, \"auto_promotion\": { \"viral_optimized\": false, \"expected_viral_velocity\": \"none\", \"overnight_viral_plan\": { \"plan\": [] } } }"
```
