# Billing readability — 4 November 2026

Prepared locally; not pushed, merged or deployed. This change is separate from the Team implementation.

Dark dashboard cards inherited dark text from the older light checkout theme. White credit-pack and editing-summary surfaces also inherited light dashboard headings. A scoped stylesheet now gives plan features, prices, periods, editing access, credit packs, payment information, notices and legal links consistent readable colour pairs. Light public checkout styling remains scoped separately. Keyboard focus and button labels remain visible.

The actual App build passed. Signed-in emulator browser checks cover 130 visible Billing text samples at each of 320, 360, 390, 430, 768 and 1280 pixels: **780 checks**, minimum measured contrast **5.49:1**, zero below 4.5:1. Phone and desktop screenshots were inspected privately. Checks use computed text/surface colours; they do not qualify third-party PayPal iframe contents or every possible subscription/error state.

Only styling, its import and browser verification changed. No plan prices, credit quantities, subscription handlers, checkout actions or production records changed. No real purchase was attempted. See [validation](validation.json).
