---
name: "Compliance: Immutable Compliance Logs"
about: "Add an immutable `compliance_logs` collection and schema for auditing purchases, campaign operations, and enforcement actions."
title: "[COMPLIANCE] Add `compliance_logs` collection and audit schema"
labels: ["compliance","backend","observability"]
assignees: ["eng-team","sre-team"]
---

## Summary

Create an append-only `compliance_logs` collection for every action relevant to paid campaigns (purchases, enqueues, posts, blocks, reviews, refunds). Ensure retention, export/archival policy, and immutable timestamps.

## Schema (suggested)

```
compliance_logs/{id} {
  type: string, // e.g., purchase, enqueue, post, review, refund
  userId: string | null,
  campaignId: string | null,
  entityId: string | null,
  action: string,
  payload: object,
  createdAt: timestamp,
  immutable: true
}
```

## Acceptance Criteria

- [ ] `compliance_logs` write helper implemented and used by purchase/campaign flows.
- [ ] Retention / export plan documented; archive to object storage monthly.
- [ ] Retrieval API for Legal/Support with RBAC.
- [ ] Tests for logging and that log entries are immutable.

## Rollout

- Start logging for purchases and campaign state changes immediately; expand to all enforcement events in next sprint.

---
