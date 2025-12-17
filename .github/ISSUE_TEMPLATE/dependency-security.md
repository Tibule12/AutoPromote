---
name: Dependency / Security Advisory
about: Create this issue to track a security advisory or dependency that needs attention
title: "[security] dependency advisory - <package>"
labels: ["security", "dependencies"]
---

## Summary

Describe the advisory or dependency issue (e.g., `webpack-dev-server` moderate severity dev advisory affecting dev tooling).

## Impact

- Which packages are affected and whether they are `devDependencies` or `dependencies`.
- Whether this affects production runtime or only developer tooling.

## Suggested mitigation

- If dev-only: mark as dev-only and schedule a follow-up; use Dependabot to create PRs and test them on a feature branch.
- If runtime: propose a patch version or backport; identify PR testing steps and staging deployment.

## Steps taken so far

- (list commands run and their effects)

## Next actions

- [ ] Open preview branch and run full test suite
- [ ] Run `npm audit fix` and evaluate remaining advisories
- [ ] If remaining advisories require breaking upgrades, create a feature branch and coordinate a staged rollout

## References

- Advisory links and audit output
