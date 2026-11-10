"""Record completed, independently verified owner-selected scheduling."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[1]
verified = json.loads((root / 'queue-verified.json').read_text())
assert verified['verifiedDestinationSchedules'] == 12
assert verified['finalMovies'] == 2
assert verified['mutations'] == 0
assert len({row['mediaSha256'] for row in verified['checked']}) == 2
assert all(row['status'] == 'pending' and row['isActive'] and row['frequency'] == 'once' for row in verified['checked'])
prior = verified['previousSchedulesPreserved']
(root / 'README.md').write_text(f'''# Two final dance edits — scheduled 9 November 2026

The owner explicitly selected **Neon Circle + Grounded Doubles (different dances)** after asking to schedule both final results for today only. These are the separate finished movies; no Studio recording, raw footage or rebuilt alternative was uploaded.

| Final movie | Supplied dance | Duration | Today, South African time |
| --- | --- | ---: | --- |
| Neon Circle | Number one | 8 seconds | **18:00 SAST** |
| Grounded Doubles — corrected | Number two | 6 seconds | **20:00 SAST** |

Both are scheduled on **YouTube, TikTok, Instagram, Facebook, LinkedIn and Reddit**. All twelve destinations are pending, active and **once only**, with timezone `Africa/Johannesburg`. Their stored instants are 16:00 UTC and 18:00 UTC on 9 November.

Normal signed-in production Publisher supplied two uploads, each for five destinations, followed by one ordinary owned-asset Reddit schedule per movie. An initial six-destination preflight was refused by the live five-platform plan limit. A fresh read-only Queue/content check confirmed that attempt created no movie or upcoming schedule before the supported submissions continued. Account plan, allowances and prices were not changed.

An independent signed-in Queue reload verified all twelve destination IDs, exact times, active/pending/once state, platform copy and downloaded scheduled-media SHA256 values. All **{prior:,} earlier Queue records** retained their content association, platform, status, active state, time, frequency and copy/settings. Original local movie hashes are unchanged. Scheduling is verified; provider publication is not yet confirmed.

Instagram uses Publisher's existing title-plus-description caption format. The first verifier incorrectly expected description alone there; its failure is retained, and the corrected comparison checks the exact native platform format. No post was edited or resubmitted to resolve that checker error.

[Exact Queue receipts](queue-verified.json) · [Selected movie hashes](selected-finals.json) · [Owner authorization](authorization.json) · [Neon release](neon-release.json) · [Grounded release](grounded-release.json). Separate Reddit acknowledgements are retained alongside those records. Authentication, raw API responses and account screenshots remain local/private.

This scheduling record does not change the existing Studio quality assessment. Source-dependent edges/cleanup, predictive picture/audio parity, live display throughput and shared S02/S04/S03 work remain open; formal readiness counts are unchanged. Earlier native edit projects, backups and review deliveries are preserved.
''')

entry = {
    'updatedAt': verified['verifiedAt'],
    'status': 'TWO_DISTINCT_FINAL_DANCES_TWELVE_NATIVE_SCHEDULES_VERIFIED',
    'ownerInstruction': 'schedule both for today only schedule the final results now',
    'ownerClarification': 'Neon Circle + Grounded Doubles (different dances)',
    'normalSignedInProductionPublisher': True,
    'finalMoviesOnly': True,
    'date': '2026-11-09',
    'timezone': 'Africa/Johannesburg',
    'localTimes': {'neon': '18:00', 'grounded': '20:00'},
    'newContentUploads': 2,
    'reusedOwnedAssetSchedules': 2,
    'verifiedDestinationSchedules': 12,
    'exactScheduledMediaHashes': 12,
    'earlierSchedulesPreserved': prior,
    'nativeFivePlatformSubmissionLimitPreserved': True,
    'providerPublicationVerified': False,
    'readinessPromotion': False,
    'remainingBlockers': 'S02 predictive picture/audio/edge parity and live throughput, S04 depth, S03 ownership; source-dependent matte/contact/cleanup quality and strict typography 13/16 failures remain.',
    'nextTask': 'Retain these twelve receipts and continue the existing shared Studio precision backlog without duplicating schedules.',
    'evidence': ['reports/circle-finals-publishing-20261109/README.md', 'reports/circle-finals-publishing-20261109/queue-verified.json'],
}
for filename in ['studio-capability-matrix.json', 'studio-combination-matrix.json', 'studio-preview-render-parity.json']:
    file = repo / 'test/e2e' / filename
    data = json.loads(file.read_text())
    data['updatedAt'] = verified['verifiedAt']
    data['studioDanceFinalScheduling20261109'] = entry
    file.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

marker = '<!-- dance-final-scheduling-20261109 -->'
note = f'''\n\n{marker}
9 November owner-selected scheduling: [Neon Circle and corrected Grounded Doubles](../reports/circle-finals-publishing-20261109/README.md) are two different supplied dances, scheduled today only at 18:00 and 20:00 SAST. Normal production Publisher supplies two exact final-movie uploads and two reused-owned-asset Reddit schedules; all 12 pending, active, once-only destinations across YouTube/TikTok/Instagram/Facebook/LinkedIn/Reddit pass independent Queue, native-copy and downloaded-media hash checks. The initial six-target preflight is retained as blocked, with no new movie/schedule; supported five-target plus one-target submissions preserve the live plan/allowances. All {prior:,} earlier Queue records and original movies/projects remain unchanged. Provider publication is separate. Scheduling approval applies to these selected finals; broader Studio quality, formal 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO / 0 PRODUCTION, typography 13/16 and shared S02/S04/S03 limits remain unchanged. Next: preserve the receipts and continue existing predictive/edge/live precision work. No new rendering, paid generation/GPU, deployment or main merge.
<!-- /dance-final-scheduling-20261109 -->
'''
for filename in ['STUDIO-COMPLETION-CONTRACT.md', 'STUDIO-PRODUCT-READINESS.md']:
    file = repo / 'docs' / filename
    body = file.read_text()
    assert marker not in body, 'Do not duplicate the scheduling record'
    file.write_text(body + note)
print(json.dumps({'recorded': True, 'schedules': 12, 'priorSchedulesPreserved': prior, 'authorityFilesUpdated': 5}))
