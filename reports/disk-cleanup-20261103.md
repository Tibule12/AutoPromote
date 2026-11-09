# Local disk cleanup — 3 November 2026

Current available disk space: **10,400,595,968 bytes (10.40 GB / 9.69 GiB)**; root filesystem remains about 96% used.

This pass reclaimed **2,443,259,904 allocated bytes (2.44 GB / 2.28 GiB)** by consolidating **259 byte-identical, untracked archived media/test-build copies**. Their existing paths and content are retained as hard links to identical archived outputs. Historical artifacts must not be overwritten in place. The exact path, digest and former modification time for every replacement is recorded privately.

The initial inventory found approximately 74.8 GB under AutoPromote worktrees, 10.5 GB under `/tmp`, 12.5 GB under `.codex`, and 6.7 GB under `.cache`. These directory measurements overlap some shared files and are not additive disk-accounting totals. Retained test builds, rendering artifacts and temporary application demos have accumulated alongside installed model environments and development tools. No model environments or unrelated development worktrees were removed.

The filesystem initially reported 1.18 GB available, but space also increased independently before this pass began its changes. The immediate mutation baseline was 7.90 GB. Only the 2.44 GB of measured allocated duplicate blocks above is attributed to this pass; the whole filesystem increase is not claimed as this cleanup's work. Earlier cleanup records remain separate.

All 259 retained archived paths passed SHA-256 verification. All **154 delivered four-minute files** match their preceding manifest, and the original 34-minute podcast retains its original SHA-256. The delivered preview, native export, masks, alpha, Studio project and playback recording remain intact.

Tracked files were excluded from replacement. Seventy tentative consolidations were restored to independent copies to avoid coupling archived files to tracked or source-named snapshots; the net reclaimed count above excludes them. Active demo roots, saved projects, production systems, all branch histories and original/user media paths remain. The existing local Studio still responds HTTP 200. No process was stopped.

No administrative password was available for clearing the system package cache; it was left alone. No package uninstall, backup, deployment or paid cloud operation occurred.

Private exact inventory and verification: `background-replacement-20261101/private/disk-cleanup-20261103/`.
