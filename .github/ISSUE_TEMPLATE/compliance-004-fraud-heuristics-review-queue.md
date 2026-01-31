---
name: "Compliance: Fraud Heuristics & Manual Review Queue"
about: "Implement basic fraud heuristics (velocity, IP/device checks) and a manual review queue for suspicious campaigns."
title: "[COMPLIANCE] Fraud Heuristics + Manual Review Queue"
labels: ["compliance","security","backend"]
assignees: ["sec-team","eng-team"]
---

## Summary

Implement server-side heuristics to detect suspicious activity for campaigns (rapid spikes, concentrated IPs, device clusters, abnormal engagement patterns). Flag and create `compliance_reviews` entries for manual investigation; automatically pause campaigns when severity exceeds thresholds.

## Heuristics (initial)

- Engagement velocity: > X units / minute normalized by historical baseline.
- IP diversity: > Y% of events from the same IP range.
- Device reuse: identical device fingerprints posting many actions across accounts.

## Acceptance Criteria

- [ ] Heuristics implemented in `engagementAggregator` job and tested with synthetic data.
- [ ] `compliance_reviews` queue created with API for manual actions (approve, reject, refund, escalate).
- [ ] Campaigns auto-paused and funds held when critical flags are raised.
- [ ] Alerts created in monitoring for frequency of reviews and high-severity findings.

---
