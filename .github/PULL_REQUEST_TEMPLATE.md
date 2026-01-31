<!-- Short PR template to ensure Legal sign-off for compliance-sensitive changes -->

## Summary

<!-- Describe the purpose of this PR -->

## Related Issue
- Links to compliance / policy matrix items: `docs/POLICY-MATRIX.md`

## What changed
- Brief bullet list of changes.

## Compliance Checklist (required for PR merge)
- [ ] Legal review: ping @legal-team and include `legal-signoff: yes/no` in PR description
- [ ] `docs/POLICY-MATRIX.md` updated if behavior changed
- [ ] `compliance_logs` are populated for all actions introduced
- [ ] Tests added for fraud heuristics / gating logic
- [ ] Feature flags for staged rollout where applicable

## Release notes
- Include any public-facing text for the change (disclosure language, billing changes, etc.)

## Rollout plan
- Feature flag name(s):
- Monitoring/alerting to add:

## Testing notes for QA
- How to verify the feature in staging


<!-- Legal / Product: add sign-off comment like `legal-signoff: yes -- <name> (<date>)` below -->
