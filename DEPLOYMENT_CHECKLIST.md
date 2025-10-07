# Deployment Checklist (AutoPromote)

## One-Time Setup
- [ ] Create Firebase project & enable Auth (Email/Password) + Firestore + Storage
- [ ] Configure Firestore indexes (deploy `firestore.indexes.json` if modified)
- [ ] Set Firestore & Storage security rules for production
- [ ] Provision service account JSON & set env vars or GOOGLE_APPLICATION_CREDENTIALS path
 - [ ] (Optional) Configure PayPal if enabling payments

## Environment Vars (Core Minimum)
| Var | Purpose |
|-----|---------|
| FIREBASE_PROJECT_ID | Firestore & Auth project id |
| FIREBASE_CLIENT_EMAIL | Service account client email |
| FIREBASE_PRIVATE_KEY | Service account private key (escaped newlines) |
| ENABLE_BACKGROUND_JOBS | true to enable workers |
| VARIANT_SELECTION_STRATEGY | bandit or rotation |
| EMAIL_SENDER_MODE | enabled / disabled |
| EMAIL_PROVIDER | console / sendgrid / mailgun |
| BANDIT_TUNER_MIN_EVENTS | Min events for weight tuning |

## Optional / Recommended
| Var | Purpose |
|-----|---------|
| ALERT_CHECK_INTERVAL_MS | Alert periodic check interval |
| VARIANT_GENERATION_STRATEGY | heuristic / llm |
| ADAPTIVE_FAST_FOLLOW | Enable fast-follow scheduling |
| BANDIT_TUNER_WINDOW_MIN | Tuning window length |
| BANDIT_TUNER_LR | Weight learning rate |
| RATE_LIMIT_WINDOW_MS_DEFAULT | Rate limit cooldown baseline |
| FAST_FOLLOW_MIN_CLICKS | Threshold for fast follow |
| GIT_COMMIT | Deployment commit id |

## Pre-Deploy Validation
- [ ] `node check-firebase-setup.js` (or existing validation scripts) passes
- [ ] `/api/health` returns status OK
- [ ] `/api/health/ready` returns 200 (ready)
- [ ] At least one admin user created (admin claim set)
- [ ] Background job logs appear (bandit-tuner / exploration-controller) if enabled

## Post-Deploy Smoke Tests
- [ ] Create test user -> receives verification email (console or provider logs)
- [ ] Verify user & login -> token accepted -> `/api/content` basic request 200
- [ ] Upload content with multiple variants -> variant_stats doc created after first task
- [ ] Force selection events (simulate tasks) -> weight history begins populating
- [ ] Manually trigger rollback: POST `/api/admin/bandit/rollback` -> history + alert
- [ ] Check `/api/admin/dashboard/overview` -> exploration ratio present
- [ ] Check alert endpoints `/api/admin/alerts/stats`

## Operational Runbook (Abbreviated)
| Scenario | Action |
|----------|--------|
| High error rate in promotion tasks | Inspect `dead_letter_tasks`, check rate limit events |
| Exploration ratio stuck | Verify bandit selection events producing exploration flag; adjust `banditExplorationTarget` |
| Diversity drops | Confirm regeneration events, inspect suppressed/quarantined variants; increase `VARIANT_REGENERATE_TARGET` |
| Frequent rollbacks | Lower `BANDIT_TUNER_LR` or increase `BANDIT_TUNER_MIN_EVENTS` |
| Email failures | Switch `EMAIL_PROVIDER` to console, inspect provider logs, verify API key |
| Alert flood | Add throttling (future enhancement) or reduce enabledEvents list |

## Safe Rollback Procedure
1. Use `POST /api/admin/bandit/rollback {"strategy":"previous","reason":"hotfix"}`
2. Confirm restored weights via `/api/admin/bandit/status`
3. Alert should fire (bandit_manual_rollback)

## Data Retention (Manual Practices)
- `events` growth: periodically archive older >30d documents (future automation)
- `bandit_selection_metrics`: consider TTL / daily compaction if >100k docs
- `system_locks`: stale cleanup already scheduled

## Future Ops Automation (Not Blocking Launch)
- Alert deduplication & retry queue
- Automated event archival
- Emulator-based CI integration tests

---
Keep this file updated with any new critical env vars or operational scripts.
