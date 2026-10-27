> Historical foundation snapshot — 26 October 2026. Current security, account status, implementation and test evidence are in the [27 October continuation report](../../MONETIZATION_CONTINUATION_20261027.md). This file does not describe the current deployed security state or an approved commercial credit policy.

# Google setup: manual actions and approval gates

Verified against official Google documentation on 26 October 2026. Account-specific
eligibility and available demand still require your Google account access. Nothing
on this checklist has been activated by this implementation.

1. Choose the legal publisher/payee and responsible adult account. Prepare original
   public site content, terms/privacy information and control of the domain. Review
   [AdSense eligibility](https://support.google.com/adsense/answer/9724?hl=en) and apply
   for a valid account. An authenticated productivity tool is not automatically approved.
2. Create the [Ad Manager account](https://support.google.com/admanager/answer/7084151?hl=en)
   with the intended AdSense account. Confirm network code, reporting currency/timezone,
   permissions and which ad demand products are actually available. Ask Google about
   Ad Exchange eligibility or a vetted publishing partner if needed. Do not buy advertiser
   campaigns expecting them to become AutoPromote's publisher inventory.
3. Add the real serving domain in [Inventory → Sites](https://support.google.com/admanager/answer/10130765?hl=en),
   follow ownership/site-review instructions and resolve Policy Center issues. Publish
   Google's account-specific [ads.txt record](https://support.google.com/admanager/answer/9422067?hl=en)
   at the root domain after reviewing the actual seller IDs. No fake publisher ID is
   supplied in this branch. Approval, ownership and ads.txt checks are separate.
4. Ask Google to confirm that AutoPromote's proposed account-bound processing credits
   satisfy the [reward policy](https://support.google.com/admanager/answer/7496282?hl=en),
   especially separation from transferable, monetary, referral or creator payout rewards.
   Credits must remain usable only for AutoPromote's processing services.
5. **Resolve completion verification before promising production rewards.** Request a
   supported web protocol with authenticated completion evidence, signed fields/key
   rotation, replay identifiers, user/session binding, test fixtures and failure semantics.
   The web help page's SSV anchor alone is not an integration specification. A mobile
   SDK protocol is not proof of web support. If unavailable, keep Google web credit
   awards disabled and review a different verified provider separately.
6. Configure a [Google-certified CMP](https://www.google.com/about/company/user-consent-policy-help/)
   where required and review age/regional rules. Add the required privacy disclosures,
   consent controls and ad vendor choices. Confirm personalised, nonpersonalised and
   no-consent behaviour. An affirmative "watch" click is not CMP consent.
7. In a **test environment**, create a dedicated rewarded ad unit and the appropriate
   demand/line item. Follow [web trafficking instructions](https://support.google.com/admanager/answer/9116812?hl=en):
   configure reward amount/type to match the disclosed offer, review the non-instream
   video protection, and use the documented reservation or Ad Exchange creative sizes.
   Only configure a real ad unit after approval; no unit is configured in this branch.
8. Exercise the [official GPT test sample](https://developers.google.com/publisher-tag/samples/display-rewarded-ad)
   separately from the wallet. Use its documented test inventory rather than testing on
   paid live ads. Cover unsupported slots, no fill, ad blockers, visibility, skip/close,
   multiple tabs and loss of connectivity. Never award wallet credits for test inventory
   outside the local demo. No test impression is advertising revenue.
9. Validate the actual serving origin's CSP, COEP, COOP, cookies, iframe behaviour and
   CMP/GPT network calls. Current Firebase Hosting has `require-corp`; use a reviewed,
   narrowly scoped credits-page strategy if compatibility requires it. Avoid placing
   messages on login, editor or save flows; never modify exported videos.
10. Configure reports using rewarded interaction type and dedicated ad-unit dimensions.
    Measure fill, impressions, rewarded events, estimated/final revenue and invalid-traffic
    adjustments. Reconcile these aggregate reports with wallet awards and cost ceilings;
    aggregate revenue reporting is not per-session reward verification.
11. Complete [payment setup](https://support.google.com/admanager/answer/2671026?hl=en):
    legal address, tax information where required, identity, address/PIN, payment method
    and holds. Check the [thresholds for your reporting currency](https://support.google.com/admanager/answer/2731681?hl=en).
    Do not assume a payout before these checks and the threshold are satisfied.
12. In Cloud Billing, inspect actual invoices and enable a suitably scoped billing export
    for cost attribution after approval. Use labelled nonproduction measurements to
    capture startup, elapsed billed resource seconds, retries, output bytes, storage,
    egress, service API usage and costs per operation. Set project/service limits and
    review [spend cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps).
    Eligible service caps still have reporting/enforcement delay; persistent resources
    and services outside the cap can continue to incur charges. Retain admission limits.

Your explicit approval is required before activating real ads, setting a commercial
reward rate, migrating/granting production credits, changing live prices or billing,
deploying to production or merging. A production rollout proposal should include the
exact Google account/inventory, verified callback protocol, migrated cohort, revised
rules, worker limits, pricing configuration, funding ceiling and rollback procedure.
