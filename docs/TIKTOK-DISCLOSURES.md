# TikTok publishing disclosures

Updated 22 November 2026. This describes the publishing fix on its review branch; it is not evidence of deployment or a live TikTok post.

New posts start with commercial and AI disclosure switches off. Publisher displays **TikTok labels requested** above the advanced options and in the final review. These are the choices AutoPromote submits; TikTok can also apply its own labels.

| Selection                                                          | Requested TikTok label                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Neither disclosure selected                                        | No disclosure labels selected                              |
| Commercial content → Your Brand                                    | Promotional content                                        |
| Commercial content → Branded Content, including both brand choices | Paid partnership                                           |
| AI-generated content                                               | AI-generated content; independent of commercial disclosure |

Turning commercial disclosure off clears the brand choices. Explicit off selections take precedence over stale aliases in a saved draft. Existing explicit selections in older drafts are preserved. Empty commercial settings objects do not enable commercial disclosure, and string values such as `"false"` are rejected by the backend instead of becoming truthy flags. The selected posting privacy is preserved; an empty commercial settings object no longer changes it to public.

The queued publishing service and direct upload route use the same backend flag resolver. Both URL-pull and file-upload Direct Post requests carry the independent choices as `brand_organic_toggle`, `brand_content_toggle` and `is_aigc`. Small files with a selected disclosure use Direct Post because the legacy upload endpoint cannot carry these flags. The direct upload route also fixes its out-of-scope connection variable and unused import of a nonexistent URL validator, both exposed by the production-path tests.

Ordinary cuts, captions, colour correction and minor retouching alone do not require an AI-generated-content label. Realistic generated or significantly AI-altered media still needs the applicable disclosure. Promotion of the creator's business and paid partnerships still need the correct commercial disclosure. This fix does not remove required disclosures, strip provenance metadata, alter existing posts or change queued releases.

TikTok's automatically applied AI label cannot be removed by AutoPromote. TikTok also says an existing post's commercial disclosure cannot be changed; an incorrect selection requires a separate decision about deleting and reposting. No such action is part of this fix.

## Verification

Regression tests cover false defaults, stale aliases, saved drafts, independent label switches, final review text, boolean validation, commercial selection requirements and outbound request bodies through URL-pull, file upload and the direct HTTP route. Provider transport, account data and source media are mocked. No live video was published, and these checks do not establish TikTok's final labelling decision.

Validation: 38 backend checks, 24 frontend checks and 52 product-knowledge/assistance checks pass. Generated documentation matches all 43 checked outputs. The eight pre-existing deferred product-surface warnings remain unrelated to this fix.

Relevant tests:

- `src/services/__tests__/tiktokDisclosures.test.js`
- `src/routes/__tests__/tiktokRoutes.disclosures.test.js`
- `frontend/src/components/__tests__/TikTokForm.disclosures.test.js`
- `frontend/src/features/publishing/components/__tests__/PublisherReleaseWorkspace.disclosures.test.js`
- `frontend/src/features/publishing/utils/__tests__/publisherWorkflow.test.js`

Rules checked against [TikTok's Direct Post API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post), [commercial disclosure guidance](https://support.tiktok.com/en/business-and-creator/creator-and-business-accounts/promoting-a-brand-product-or-service) and [AI-generated content guidance](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content).
