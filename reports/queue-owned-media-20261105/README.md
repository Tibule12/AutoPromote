# Queue owned-media regression — 5 November 2026

Prepared on `fix/queue-owned-media-preview-20261105`, from main `4de4b213`. Not pushed, merged or deployed. The ongoing Reframe/Moments and playback-clock work remains in its separate worktree.

Read-only production evidence confirms the two selected historical movies exist, have matching owner metadata, active retention until 14 November and readable MP4 data. Their schedules have no workspace field; their content records have an older automatically assigned workspace ID. The recent strict personal/team filter therefore removed the owner’s content from Queue while retaining the schedules. No missing/deleted media or failed publication is inferred from the empty preview. A live-origin browser probe loaded the source in both ordinary and anonymous CORS modes; CORS was ruled out as the primary cause.

The patch permits authenticated human owners to **read** their historical workspace-stamped records in personal scope. Conflicting owner aliases, other users, reviewed Team releases, other selected workspaces and shared writes stay denied. It does not activate Team or restore owner impersonation. Existing schedule IDs, times, pending statuses, credits, subscriptions, authority and Rules remain unchanged.

Queue also uses a destination’s saved media when its main content list is delayed, clears failed-preview state when its URL changes and offers a user-controlled retry. Media tags explicitly request anonymous CORS for compatibility with isolated serving origins. A compact “View release” label removes repeated long titles overflowing the date row; full titles remain in the group/detail headings.

Validation: **71 distinct tests passed**: 18 backend boundary/workspace cases, 18 Queue frontend cases, 31 real Firestore-emulator Team/security cases and four community-publishing cases. The previously failed main Action’s one test used an implicit workspace selection; its fixture now explicitly enables only the owned local Team demo. The actual signed-in App, normal Auth middleware, content route and Queue pass the exact historical namespace fixture: owner media included, another owner and reviewed Team excluded, real MP4 loaded/played, no row overflow at 390/1280/1840 pixels, schedule and financial fields unchanged. Native source/provider transport is local controlled test data. No production login, posting or data seeding was performed. Targeted lint has zero errors/warnings and whitespace checks pass.

The actual App QA build passed, including nineteen welcome assets and 47 public pages. The final production-configuration build also passed and includes the last retry-control update. No remote CI rerun or deployment is implied by local tests.

[Production read-only evidence](evidence/production-readonly.json) · [actual App result](evidence/queue-legacy-media-result.json) · [preserved sources](evidence/preservation.json).

Raw records, object URLs/tokens, authenticated emulator state and recordings remain private under restricted `/tmp` directories. This compatibility repair addresses this regression; actual deleted media, revoked access and network failures still require truthful error handling. The retry cannot recreate a deleted file. Release through the normal process only after approval; rollback retains main `4de4b213` or later security fixes.
