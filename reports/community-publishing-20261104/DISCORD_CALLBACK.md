# Discord connection follow-up — 4 November 2026

The owner reported that fresh Discord server/channel consent still returns the generic callback error on release `1587aa2e`. **The production failure stage is not yet established.** Expired states found by a bounded, read-only metadata check do not establish the cause of the owner's failure. No captured authorisation code was replayed.

This follow-up replaces the generic error with a closed set of support categories for state validation, token exchange, webhook authorisation, identity verification and encrypted persistence. A random reference correlates the public message with a sanitised server warning. Only allowlisted OAuth error categories may accompany it; raw provider responses, credentials, state and authorisation codes are excluded. Callback responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

Owner/client binding, atomic single-use state consumption, the ten-minute expiry, connection limits, exact webhook application/channel checks and encrypted storage remain required. Invalid Discord identity IDs fail closed. No alternate posting fallback, new account permission, session revocation, balance change or Rules change is introduced.

Validation: **33 fresh Firestore-emulator integration tests**, **4 actual callback-route tests** and **21 existing payment/Queue/backend regressions** passed. Provider exchanges remain controlled test boundaries. The tests cover safe failure categories, secret redaction, replay/expiry rejection and the unchanged success redirect. They do not establish a successful live Discord connection.

After this patch is deployed, a fresh owner-initiated connection is needed. If it fails, the **message and Reference text only** identify the next investigation; do not share the callback URL, authorisation code, cookies or tokens. Render logs are not accessible with the available read-only tools. No live test post or production-data correction was performed.

Protocol review: [Discord OAuth2 and webhook consent](https://docs.discord.com/developers/topics/oauth2#webhooks) documents form-encoded token exchange and the channel webhook returned for `webhook.incoming`. The implementation retains that contract; there is no evidence supporting weaker validation or a token-endpoint change.
