# Mobile forms — 4 November 2026

Branch: `fix/mobile-forms-20261104`, based on production revision `4c76206e`. This report records the tested source candidate. Deployment status and live revision evidence are maintained on the release pull request.

## Changes

- Login, registration, verification, password recovery and contact forms use readable phone-sized fields and touch targets. The terms checkbox keeps a fixed width so its label can wrap normally.
- Telegram/Discord destination controls have proper primary/secondary buttons, clear disabled states and wrapping destination details. Manage/Disconnect actions fit side by side without forcing the card wider.
- Publisher uses readable fields, single-column option rows and full-width footer actions on phones. The active customization/delivery form precedes summary cards. All eight active destination forms retain their existing fields and validation.
- Security, Team and billing surfaces fit their available width. The Telegram dialog respects the viewport and safe-area inset. Changes are scoped to these forms; the Studio editing/rendering engine is unchanged.
- Correct the password form's light background beneath light labels and the session-details theme. Provider form text uses ordinary readable weights, and the mobile column rule wins over the old YouTube two-column selector.

## Verification

The owned loopback Auth/Firestore fixture builds and runs the actual App. Screens cover contact, login, recovery, registration, verification, password settings, Team setup, the expanded billing catalogue, Telegram/Discord management and every Publisher step/provider form. Widths: **320, 360, 390, 430, 768 and 1280 pixels**. Browser checks measure field/control geometry and font sizes, check label width and retain an in-memory digest to verify that resizing preserves entered values. Normal mobile-menu navigation is used at 390 pixels.

The initial layout pass found short controls, small Publisher text and unstyled destination buttons. Visual review then caught an additional cramped terms-label regression at 320 pixels, the password form's theme conflict and the YouTube row overriding mobile columns; these were corrected, with label-width and password-label contrast checks added. Initial harness attempts incorrectly navigated to a nonexistent login route, measured Team loading state and waited for a collapsed billing catalogue. Corrected runs use ordinary navigation, wait for the actual form and expand plans normally. Original private logs/captures remain available.

Final verification: **138 layout checks across 23 screens passed**, with zero measured control, label-width or password-label contrast failures. Entered values survived resizing. The actual mobile sign-up/verification, Telegram destination verification, Discord consent, two single-destination Publisher schedules and Queue history passed; normal free-plan rejection of a two-destination submission remained intact. The actual frontend production build passed. Existing regressions passed: **38 frontend tests** across five suites and **11 backend scheduling/callback tests** across two suites. Screenshot review confirmed the corrected terms row, password theme, destination buttons and stacked YouTube fields. [Validation](evidence/validation.json).

Provider consent and message delivery use controlled external responses. Billing exposes only the existing read-only plan catalogue in the fixture; checkout/status synchronisation and subscription mutation are blocked. No live post, email, cloud seed, payment, subscription change or balance migration is performed. Headless Chromium viewport checks do not qualify real-device Safari, an operating-system keyboard or every Studio tool.

[Source preservation](evidence/source-preservation.json) confirms the deployed Rules, authority, Discord scope repair, billing configuration, Queue and delivery sources are unchanged. Existing subscriptions, balances, saved projects and publishing records are preserved.

Reproduce with the existing dependencies, Java 21 and cached official Firebase emulator:

```sh
SECURITY_JAVA_BIN=/path/to/java21/bin/java npm run test:mobile:forms
```

Use the repository's existing `NODE_PATH` dependency directories when running from this shared-dependency worktree. Each run owns fresh demo emulators and a separate temporary frontend build. Screenshots, authentication state and raw logs remain in the printed private directory.
