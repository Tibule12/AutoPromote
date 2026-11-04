# Telegram and Discord publishing — 4 November 2026

Branch: `fix/community-publishing-20261104`, from `bb4530f4`. Local implementation; no push, merge, deployment, live post, external account-setting change or production data write. Existing security incident follow-up remains open.

Telegram and Discord now use the existing Publisher → schedule → Queue → platform-adapter path. No second publisher or credit system was introduced. Both are explicit Publisher destinations, with required destination selection, caption/message controls, delivery review and Queue history.

## Implemented

- **Telegram:** verify the linked human's administrator/posting authority and the bot's posting permission through the Bot API; persist an owner-scoped numeric destination; recheck permission at dispatch. The selected destination replaces the old private-chat fallback. Native video, photo and text requests require an actual matching message/chat receipt. Provider rejections cannot become success. Connecting the bot privately does not authorise a channel.
- **Discord:** request `identify webhook.incoming` consent so Discord presents channel selection. Bind an expiring, atomic single-use state to the owner, client and callback; remove legacy UID-from-state fallback. Store the returned channel webhook encrypted in a private destination document. No webhook URL/token reaches the client or task payload. Verify the webhook's application/channel before posting. This uses the existing Discord application; customers do not edit `.env` or supply bot tokens.
- **Discord media:** native multipart MP4/image attachments with a conservative 10 MiB bound, including streaming responses without a declared size. Larger media requires an explicit link-sharing choice. Links depend on existing media retention, not permanent hosting. `wait=true` and a real matching channel/message/attachment response replace placeholder success IDs. Disable automatic mention expansion.
- **Recovery:** reuse Queue's lock, signed task and durable receipt machinery. Store intent before the outbound request, then the concrete provider receipt. Explicit rejection clears intent; timeout, malformed acknowledgement or a wrong destination stops for review without automatic resending or webhook-to-bot fallback. A persisted success recovers without another send. Bind de-duplication to destination and delivery format.
- **UI:** Connections → Manage configures destinations. Publisher displays the authorised destination and native/link format before submission. The account badge says "Account linked" rather than claiming publishing permission. Queue records matched owned schedule outcomes only after verified delivery and preserves paused schedules.
- **Auth compatibility:** repair Telegram widget argument/hash handling and atomically consume private, platform-bound connection links. Keep mandatory verified-email authentication. A separate, explicit loopback/demo-only emulator-build flag lets browser QA exercise ordinary billing without enabling the experimental credit pilot; both flags are off in normal builds.

## Validation

Final evidence is recorded in `evidence/validation.json`.

| Check                                                | Result                                                                                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh Firestore emulator integration                 | 28 passed, including permission loss, OAuth replay, destination isolation, bounded attachments, recovery, Rules and workspace denial      |
| Existing Publisher/Queue/payment backend regressions | 32 passed in 10 suites                                                                                                                    |
| Real frontend components and Publisher workflows     | 29 passed in 4 suites                                                                                                                     |
| Authority/Firestore security regressions             | 99 passed in 4 suites                                                                                                                     |
| Existing dependency/worker guards                    | 8 passed                                                                                                                                  |
| Optimised actual App build                           | Passed                                                                                                                                    |
| Actual signed-in browser                             | Passed: consent/destination setup → review → two single-destination schedules → due scheduler → worker receipts → Published Queue history |
| Lint, syntax, whitespace and Studio contract         | Passed; Studio readiness counts unchanged                                                                                                 |

The browser confirms the existing free-plan two-platform rejection before submitting one release per destination. It advances only those fresh emulator schedules into their due state, then runs the real scheduler and worker. The enqueue test fast path skips production task signatures/quota plumbing; this is not a live queue/load qualification. The separate existing billing/authority tests cover their stated mocked/emulator boundaries. Health/background endpoints are intentionally unmounted in the browser fixture and its degraded-health banner is not a production observation.
The browser uses the actual React App, Firebase Auth/Firestore emulators, normal signup/email verification and application routers. Telegram identity and an owned one-second generated media item are isolated fixture preconditions. External consent and provider APIs are controlled boundaries: this is not a claim of live Telegram/Discord publication. The actual attachment request includes the local movie bytes. Browser screenshots remain locally available under the ignored evidence image paths; authenticated browser state and raw logs stay private.

Initial browser attempts exposed incomplete fixture metadata, a closed-select option visibility matcher, a callback-return fixture mismatch, the old credit-demo test flag, and the normal free-plan one-platform limit. Corrected checks retain those failures privately. The plan limit is preserved and tested rather than bypassed. An initial dependency-guard check resolved an unpatched shared `deepmerge` install; copying that dependency into this worktree's ignored installation and applying the existing install guard made all eight guard checks pass. No lockfile/dependency version or shared installation changed.

## Manual steps and release boundary

After an approved coordinated frontend/backend release:

1. Telegram users add AutoPromote Bot to their channel with administrator posting permission, or a group they administer. In Connections → Manage, enter its `@username` or numeric chat ID and verify it. Then choose that verified destination in Publisher. No test message is sent during verification.
2. Discord users reconnect or choose Authorise Discord channel, approve the destination in Discord's consent screen and return to AutoPromote. Existing identity-only links do not grant publishing permission. A user needs permission to authorise a webhook in the selected channel. Refresh destinations if the browser does not restore focus.
3. The backend needs its existing Telegram bot token, Discord application client ID/secret, exact registered callback `https://api.autopromote.org/api/discord/auth/callback`, and the existing token-encryption key. No new credentials were collected or changed here. Forum/media channels needing a thread are not qualified by this release; choose an ordinary text/announcement channel.
4. Qualify one owner-approved private channel per provider and exact sample media after deployment, with explicit permission to post. No live sample has been sent during this task.

Legacy scheduled Telegram/Discord work without a verified destination now fails closed and needs destination authorisation; it is not redirected to an arbitrary/private chat. Historical content, connection records, projects and receipts are retained. Ambiguous accepted requests require destination investigation before manually permitting another publication. The release must retain the repaired Firestore/Storage/auth authority. Prices, balances, subscriber benefits, payments, wallet activation, Cam Combiner and existing scheduled integrations are unchanged; see `evidence/source-preservation.json`.

## Reproduce locally

Use the existing Node/frontend dependencies, ffmpeg, cached official Firebase emulators and Java 21. These scripts own fresh demo emulators; they never seed an existing/cloud database. Browser QA is headless and muted. It builds into a private temporary directory and preserves the active frontend build. Set `NODE_PATH` to the existing dependency directories if this worktree has no installation.

```sh
SECURITY_JAVA_BIN=/path/to/java21/bin/java npm run test:community:publishing
SECURITY_JAVA_BIN=/path/to/java21/bin/java npm run test:community:browser
```

Official protocol references: [Telegram Bot API](https://core.telegram.org/bots/api), [Discord webhook consent](https://docs.discord.com/developers/topics/oauth2#webhooks), [Discord webhook execution and file uploads](https://docs.discord.com/developers/resources/webhook#execute-webhook). These support the implementation contract; they do not qualify this application's live deployment.
