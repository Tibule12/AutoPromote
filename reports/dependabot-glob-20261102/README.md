# Dependabot glob resolver repair — 2 November 2026

Jobs [41500241441](https://github.com/Tibule12/AutoPromote/actions/runs/41500241441) (frontend) and [41500241500](https://github.com/Tibule12/AutoPromote/actions/runs/41500241500) (TodoApp) could not resolve the security update: both manifests forced `glob` to `^11.1.0`, while [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) requires 14.0.2 or newer.

Both overrides now permit `^14.0.2`; narrowly regenerated locks resolve 14.0.3 and its minimatch 11.0.4. No direct application dependency, subscription, price, credit, authority, Rules or product source changes. Other lock entries were checked: only glob and its changed dependency subtree move.

Validation: both lock-only resolutions pass with install scripts disabled; TodoApp clean installation (595 packages, scripts disabled) and offline Expo public configuration pass. Patched glob sync, globSync, async matching and pre-aborted cancellation pass. Frontend validation uses a fresh PR build against the new lock; shared local node_modules are not modified.

The separate frontend minimatch updater [41500242123](https://github.com/Tibule12/AutoPromote/actions/runs/41500242123) remains unresolved for legacy transitive versions. [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) lists a fix at 11.0.1. Older build/lint/test consumers expect a callable CommonJS export; the modern version exports a namespace. Glob's own minimatch is updated, but forcing all legacy callers to 11 would introduce an API break. A safe upstream-compatible backport or consumer-toolchain migration remains required. No alert, Dependabot setting or scan has been dismissed/disabled; this change does not claim all dependency advisories resolved.
