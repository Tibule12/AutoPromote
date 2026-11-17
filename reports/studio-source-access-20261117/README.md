# Studio upload/source access repair — 17 November 2026

The reported Storage link expired on6November. Separately, the uploader read `Range` after every response, including the initial zero-byte probe and successful completion, where browsers may refuse that non-exposed header. Active byte transfer could succeed despite those console entries.

The correction refreshes expired owned source access before metadata validation, retries a failed uploaded preview once without retransferring its bytes, rejects late refreshes belonging to an older selection, and renews mounted Studio source leases before expiry. Source, comparison, standby, filmstrip and camera previews defer expired owned source URLs. Concurrent refreshes share the same owner/project request. Unrelated generated-output recovery remains unchanged. Storage paths, clip decisions and ownership are preserved; the existing authenticated resolver authorizes every refreshed read.

The resumable uploader now reads only the browser-exposed header list on308 responses. Completed uploads do not request `Range`. Partial acknowledgements remain authoritative; the next slice starts at the exact committed byte without skipping bytes or guessing completion.

83 focused client tests and three actual Studio component regressions pass. Real Chromium XHR on two loopback origins reproduces the old unsafe-header warnings and then completes single/multipart uploads with exact bytes, partial-acknowledgement recovery and zero warnings using the corrected module. The strict immutable build and eight paired welcome checks pass. Actual signed-in Studio file chooser upload→metadata validation→open succeeds. Normal backup restore/open recovers an expired owned source lease without sending that expired Storage URL to a decoder. Those flows retain actual headless, muted browser recordings and screenshots privately.

This is local, bounded verification. No production bucket/CORS configuration, production deployment, paid provider/GPU execution, new render, credit grant or financial reconstruction occurred. Formal Studio readiness stays17 FUNCTIONAL/9 PARTIAL/1 BROKEN/2 UNIMPLEMENTED/0 PRO/0 PRODUCTION; typography13/16 and wider S02/S04/S03 remain separate. The first anonymous comparison referenced a temporary prior build removed since the preceding session; its failed setup is preserved, and the successful comparison uses the complete retained prior client snapshot.

See [verification.json](verification.json). Raw signed URL credentials are excluded.

The complete tested client is retained in `private/client-r2`, and `private/checkpoint-final` contains full Auth/Firestore/Storage metadata plus original worker requests/receipts. All seven prior operations remain succeeded, wallets remain0/1 with zero held/active credits, and owned local test services stopped cleanly after export. Actual signed-in help also passes.
