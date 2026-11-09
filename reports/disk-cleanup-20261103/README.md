# Local disk recovery — 3 November 2026

The owner rejected the WhatsApp recipe montage and requested disk recovery. No new video render, provider/GPU operation, production action or unrelated process stop occurred. The film is marked rejected in Studio continuity; its exact movie/project and all four inputs remain intact.

The filesystem had 833.0 MiB available at the first cleanup mutation. Final observed free space is **10.02 GiB**. Known allocated reduction from this cleanup is **6.58 GiB**. The full observed free-space increase is 9.20 GiB; 2.62 GiB of difference is not attributed to this cleanup because other workstation activity was concurrent.

The initial inventory found about 70 GiB across AutoPromote worktrees, 9.7 GiB under /tmp and 6.3 GiB in user caches. These are broad categories with legitimate dependencies/models/media included, not deletion targets. The avoidable subset included repeated diagnostic project/history snapshots. The last delivered WhatsApp folder itself was about 32 MiB; it does not explain the whole disk pressure.

## Executed

Removed only the exact rebuildable Jest, npm download and this worktree's Babel caches listed in `cleanup.json` (about 260.1 MiB allocated). No package installations, worktrees, model files, native project backups, source clips, final/rejected movies, user sessions, browser authentication, emulator data or source code were deleted.

Losslessly archived **1133 old untracked `*-project.private.json` QA snapshots**. Original allocated size 7.86 GiB; compressed allocated size 1.54 GiB. Every snapshot was a regular single-link file, at least an hour old and at least 1 MiB, outside git's tracked files and not open by a process. Each gzip was fully decompressed and SHA-256 matched before its uncompressed copy was removed. File mode/time and exact original/archive paths are retained in the access-restricted manifest. Final `.autopromote.json` backups remain at their existing paths.

A real one-file restore was performed, SHA-256 checked, then that temporary restored duplicate was removed while its archive remained (`restore-check.json`). Historical scripts which directly read an archived diagnostic filename need it restored first. This is archival, not silent loss of old evidence.

## Restore one snapshot

Run from this worktree, supplying an original absolute path from `archived-diagnostic-snapshots.json`:

```sh
python3 scripts/studio-professional/archive-diagnostic-snapshots.py --restore --path '/absolute/original-project.private.json'
```

Restoration refuses to breach a 5 GiB filesystem reserve. Omitting `--path` requests all original snapshot paths, which may require additional free space; archives remain after restoration.

## Preventive change and verification

The shared local QA save helpers in `motion-flow-proof.cjs` and `studio-proof.js` now check the existing 5 GiB reserve before saving diagnostic snapshots. Renders/captures already had that check. This is a local QA safeguard, not an OS quota or production change; other applications can still consume disk space. Source caches are rebuildable.

JavaScript/Python syntax, the actual free-space guard, native delivery's 48 SHA-256 checks, one actual diagnostic restore, Studio continuity validation and `git diff --check` pass. No new Studio capability/readiness qualification is claimed. The sophisticated motion-design/Director objective remains unfinished.
