"""Bind the six completed native demonstrations to their private handoff."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shutil
from urllib.parse import quote

root = Path(__file__).resolve().parents[2]
base = root / 'reports/studio-template-collection-20261104'
out = Path('/home/tibule12/Videos/Studio Template Collection - 2026-11-04')
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
cases = read(base / 'collection.json')
final = read(base / 'final-runtime.json')
assert final['activeOperations'] == 0 and final['originalSpendingWindowRestored']
selected = []
for case in cases:
    directory = base / case['id']
    binding = read(directory / 'exact-native-binding.json')
    picture = read(directory / 'picture-review.json')
    resource = read(directory / 'native-worker-resource.json')
    rates = {}
    for phase in ['live', 'finished']:
        playback = read(directory / f'{phase}-playback.json')
        recording = read(directory / f'{phase}-playback/editing-recording.json')
        assert playback['complete'] and playback['programmeSeconds'] == 8
        rates[phase] = {**playback, 'captureSeconds': recording['seconds'],
                        'captureFrames': recording['frames'],
                        'captureFps': recording['frames'] / recording['seconds']}
    (directory / 'capture-rates.json').write_text(json.dumps(rates, indent=2))
    selected.append({**case, **binding, 'picture': picture, 'playback': rates, 'resource': resource})
    dest = out / case['label'].split(' — ')[0] / 'Technical'
    shutil.copy2(directory / 'capture-rates.json', dest / 'capture-rates.json')

prior = {}
for name, expected_count in read(base / 'prior-deliveries-verified.json').items():
    folder = Path(name)
    manifest = read(folder / 'SHA256.json')
    assert len(manifest) == expected_count
    for name, expected in manifest.items():
        assert sha(folder / name) == expected, str(folder / name)
    prior[str(folder)] = len(manifest)
for item in read(base / 'sources.json') + read(root / 'reports/studio-whatsapp-director-20261103/sources.json'):
    assert sha(Path(item['path'])) == item['sha256'], item['path']
assert shutil.disk_usage(root).free >= 5 * 1024**3
evidence = {
    'verifiedAt': datetime.now(timezone.utc).isoformat(), 'result': 'SIX_LOCAL_SELECTABLE_NATIVE_STYLES_DELIVERED_REVIEW_PENDING',
    'evidence': 'reports/studio-template-collection-20261104/README.md', 'deliveryDirectory': str(out),
    'selectedStyles': selected, 'nativeSecondsPerFilm': 8, 'nativeFramesPerFilm': 192, 'nativeFps': 24,
    'selectedNativeFilms': 6, 'nativeExecutions': 9, 'selectedExecutions': 6,
    'retainedRejectedFashionExports': 1, 'retainedFailedTypeExecutions': 2,
    'local402BeforeAdmissionNotAnExecution': True, 'retainedUnicodeStudyNotExported': True,
    'templateRegressionTests': 81, 'localStorageReadAndOwnedSourceTests': 5, 'workerProofTests': 5, 'automatedTests': 91,
    'candidateBuilds': 3, 'welcomeChecksPerBuild': 8, 'normalSignInAndHelpPerBuild': True,
    'actualStudioFrontend': True, 'sharedManualAndDirectorTemplateGraph': True,
    'directorVisualInference': False, 'ordinaryNativeEditableProjects': True,
    'exactBackupRequestWorkerDownloadBinding': True, 'independentRestoreEditUndoRedo': True,
    'completeLiveAndFinishedTimelineRecordings': True, 'pausedPairs': 30, 'sampledExportFrames': 54,
    'minimumPsnrDb': min(s['picture']['minimumPsnrDb'] for s in selected),
    'originalStockSourcesPreserved': 7, 'selectedStockSources': 6, 'originalWhatsAppSourcesPreserved': 4,
    'priorDeliveryFilesUnchanged': sum(prior.values()), 'priorDirectories': prior,
    'originalDemoWindowRestored': True, 'activeOperationsAtHandoff': 0,
    'localStorageReadRepair': 'One extra read for connection-reset/pipe/refused failures only; denials/hash/generation errors and job execution are never retried by the helper.',
    'failedTypeCauses': ['Unexpired music source: Storage-emulator socket hang up surfaced as loopback HTTP5XX.', 'Second job reused the old saved music URL, expired before dispatch; canonical late audio read returned HTTP403.'],
    'ownedAudioRenewal': 'Admission includes owned music/external cue sources; immediately before verified local worker dispatch, refresh credentials only after exact owner/content hash/generation checks. Existing 30-minute TTL and expired-link HTTP403 remain unchanged.',
    'allFilmFramesFullyDecoded': True, 'fullParityQualified': False, 'creativeApproval': False,
    'humanListeningQualified': False, 'readinessPromotion': False, 'productionDeployment': False,
    'publicShowroomQualified': False, 'paidCalls': 0, 'productionWrites': 0,
    'remaining': [
        'S02 exact independent source clocks/first-seek decoding, whole colour/alpha/edge parity and real-time live throughput; pair metrics are diagnostic.',
        'Human listening and owner creative acceptance of these six short authored samples.',
        'S04 motion/glyph depth and autonomous Director visual inference remain incomplete; these are deterministic authored recipes.',
        'S03 safe deletion of bound matte sources remains an existing product gap.',
        'Local selectable drafts require normal review/release; they are not deployed or public/showroom-qualified.'
    ],
    'nextTask': 'Owner review of six reusable styles; continue S02 source clocks/first-seek, colour/alpha/edges and live throughput, then shared S04/S03.'
}
(base / 'collection-verification.json').write_text(json.dumps(evidence, indent=2))
shutil.copy2(base / 'collection-verification.json', out / 'Collection evidence/collection-verification.json')

rows = []
for case in cases:
    label = case['label'].split(' — ')[0]
    rows.append(f"| [{case['label']}]({quote(label)}/{quote(label)}.mp4) | {case['description']} | [{case['layers']} layers / {case['keys']} keys]({quote(label)}/Editable%20Project.autopromote.json) |")
handoff = '\n'.join([
    '# Six Studio motion templates', '', '[Watch all six — 48 seconds](Watch%20all%20six.mp4)', '',
    'Six eight-second examples, made through the actual AutoPromote Studio frontend and canonical CPU export. Each style is selectable in the local Studio under **Graphics → Template**, with the same definition available to the Director template adapter. Bind your own footage and optional music, then apply and edit the ordinary layers and motion keys. These local templates have not been deployed.', '',
    '| Movie | Treatment | Editable native project |', '| --- | --- | --- |', *rows, '',
    'Every style folder includes its separate movie, editable native backup, complete finished playback beside the Studio timeline, live Studio recording, stills and technical evidence. Backups reopen against the owned local demo media library; raw stock sources remain privately retained in the report source folder. Template definitions contain no private media URLs.', '',
    'The films add no captions or words. Living type uses one editable X glyph as a footage matte. [Footage credits and licence](Footage%20credits.md). Original stock sound is muted; the retained original instrumental score and native whoosh cues supply the sound.', '',
    'Creative/listening approval and full preview/export parity remain open. Coastal postcards intentionally fades back to its mint field; it does not end on a held landscape. Live preview is slower than real time for several styles. Exact timing, decoder-drop observations and capture rates are included under each Technical folder.', '',
    'The 48-second reel is comparison packaging of the six verified native films. All evaluated motion effects remain in the editable Studio projects.'
]) + '\n'
(out / 'README.md').write_text(handoff)

metrics = []
for style in selected:
    live, finished = style['playback']['live'], style['playback']['finished']
    metrics.append(f"| {style['label']} | {style['resource']['wallSeconds']:.2f} | {live['elapsedMs']/1000:.3f} / {finished['elapsedMs']/1000:.3f} | {live['captureFps']:.2f} / {finished['captureFps']:.2f} | {live['dropped']} / {finished['dropped']} | {style['picture']['minimumPsnrDb']:.3f} |")
report = '\n'.join([
    '# Six selectable Studio templates — 4 November 2026', '',
    f'[Watch all six](<{out}/Watch all six.mp4>) · [Movies, projects and complete Studio recordings](<{out}/README.md>)', '',
    'The owner requested more reusable styles and allowed new source content. Six distinct eight-second samples now use fresh stock footage and selectable versioned native templates: mechanical product aperture, fashion fan collage, time-split sports impact, perspective coastal postcards, music-disc artwork and cinematic footage-filled X. Their definitions bind one owned footage slot plus optional music through the same manual/Director adapter. Native text layers are supported by the bounded authored motion recipe, using the existing shared compiler and CPU renderer. No separate effects renderer or autonomous visual inference is claimed.', '',
    'All six normal Studio template selections/applications, saved native projects, independent backup restores, real edit/Undo/Redo, native quote/admission/export/download and exact document → compiled request → owned job → worker artifact → downloaded-movie bindings pass. Each selected film fully decodes to 192 frames, 8 seconds, 24fps, 1280×720 H.264/AAC. Each has complete live and finished-file playback beside its editable timeline in a normally signed-in, headless, muted browser. The finished file has zero live-overlay decoders; it is a separate check from live parity.', '',
    '81 template/recipe/history regressions and five local Storage-read/owned-source/audio-renewal checks and five worker-proof checks pass: **91 distinct automated tests**, zero skipped. Three isolated candidate builds each retain eight welcome comparisons and explicit real sign-in/Studio/help checks. The final r3 build is selected locally; previous builds are retained. Exact source/asset hashes and worker cwd are in [final runtime](final-runtime.json). No paid generation/GPU job, production data write, main merge, push, deployment or public/showroom promotion occurred.', '',
    '| Style | Worker wall seconds | Live / finished wall seconds | Live / finished capture fps | Selected-decoder drops live / finished | Minimum diagnostic PSNR dB |',
    '| --- | ---: | ---: | ---: | ---: | ---: |', *metrics, '',
    'Capture rates describe the recordings, not guaranteed display/render rates. Live decoder observations refer to the selected decoder, not all simultaneous layers. Thirty measured live/export pairs and 54 sampled export frames are retained. Numeric diagnostics do not qualify whole-picture colour/alpha/edges or creative quality. Live playback still stalls for the denser styles; strict source clocks/first-seek parity, real-time throughput, S04 motion depth and S03 ownership remain open. Normal muted QA cannot establish human listening acceptance.', '',
    'Corrections and failed attempts are preserved. The first fashion film had a transition gap and remains under Rejected fashion transition gap; v1.0.1 holds outgoing cards until the incoming portrait appears. The original Unicode infinity study had weak font metrics and was not exported; its pinned v1.0.0 definition remains. Living type v1.0.1 uses X. A local 402 refusal occurred before admission and is not an execution. The first accepted X job failed while reading unexpired music: the loopback Storage gateway surfaced a socket hang up as HTTP5XX. The initial expiry explanation was wrong and is corrected in [failure diagnosis](audio-input-failure.json). A bounded helper now retries that local read once on connection-reset/pipe/refused failures; denials, missing objects, generation/hash errors and job execution are not retried by it. The actual loopback-reset regression and existing foreign-source refusal pass. The next native job reused an already expired saved music reference and returned HTTP403. Admission now includes owned music/external cues in its source manifest; the local verified-dispatch adapter renews credentials after matching the exact owner/hash/generation. It preserves the 30-minute TTL and expired-link refusal. Regression checks prove stale-link renewal, unchanged request identity and foreign/changed/missing-source rejection. Only after signed terminal failures/refunds did explicit native recovery run; refunded local fixtures were reused without another grant.', '',
    'Nine accepted native executions cover six selected films, one rejected fashion film and two failed X executions. All selected executions terminate normally with no provider charges started. The original temporary local window/origin settings are restored after zero active operations. The new template build and shared worker/emulators remain available. All 240 earlier delivery files, four WhatsApp originals and seven downloaded stock originals retain their hashes. At least 5GiB disk headroom is verified; no user media/project cleanup is performed.', '',
    '[Footage/source licences](Footage%20credits.md) · [Complete assertions and exact per-film hashes](collection-verification.json) · [Utility reel verification](review-reel.json). Raw originals stay in the private local source library; no stock file is embedded in public template definitions. Music is the retained original sample-free Make your move score plus native airy-whoosh cues.', '',
    '**Verdict:** six reusable local styles and their native demonstrations are delivered for owner review. Product/fashion/music treatments are visually distinct; the short sports diagonal is restrained, the coastal ending fades to its backdrop, and the X treatment remains a glyph-matte study. These are not a claim of complete AE/Fusion depth, professional creative acceptance or full preview/export parity. Formal counts stay 2 UNIMPLEMENTED / 1 BROKEN / 9 PARTIAL / 17 FUNCTIONAL / 0 PRO-READY / 0 PRODUCTION-READY. Next: owner review and shared S02 source clocks/first-seek, colour/alpha/edges and live throughput, then S04/S03.'
]) + '\n'
(base / 'README.md').write_text(report)
paragraph = ('4 November owner-requested template collection: [six selectable styles, fresh stock sources, native films, exact editable projects and complete Studio playback](../reports/studio-template-collection-20261104/README.md). '
             'Product aperture, fashion collage, sports split, coastal postcards, music-disc artwork and cinematic footage-filled X share the ordinary manual/Director template graph. Six selected 8s/192-frame/24fps CPU films pass exact backup/request/worker/download binding, independent restore/edit/Undo/Redo and full live/finished timeline recording. '
             '81 template, five source-read/ownership/renewal and five worker-proof tests pass (91 distinct); three candidates each preserve eight welcome checks and real sign-in/help. Thirty paired frames retain diagnostic minimum PSNR '
             f"{evidence['minimumPsnrDb']:.3f}dB without whole-parity qualification. "
             'The first fashion transition gap, unexported Unicode study, local pre-admission 402 and two X failures (Storage socket reset and an expired saved music link) remain evidenced. One bounded local read retry and exact-manifest audio credential renewal repair local transport only, never job execution. Nine native executions include the retained rejected fashion and two failed X jobs. '
             'All 240 prior delivery files/four WhatsApp originals/seven stock originals remain unchanged. Original local window/origins restored after zero active operations; the new selectable local build remains. Live throughput, source clocks/first-seek, colour/alpha/edges, S04/S03, bound-matte-source deletion and owner creative/listening approval remain open. '
             'No autonomous visual inference, paid/provider/production action, deployment, public/showroom qualification or readiness promotion. Counts unchanged. Next S02, then shared S04/S03.')
for filename in ['docs/STUDIO-COMPLETION-CONTRACT.md', 'docs/STUDIO-PRODUCT-READINESS.md']:
    target = root / filename
    text = target.read_text()
    if paragraph not in text:
        title, rest = text.split('\n', 1)
        target.write_text(title + '\n\n' + paragraph + '\n' + rest)
for filename in ['studio-capability-matrix', 'studio-combination-matrix', 'studio-preview-render-parity']:
    target = root / 'test/e2e' / (filename + '.json')
    data = read(target)
    data['updatedAt'] = evidence['verifiedAt']
    data['studioTemplateCollection20261104'] = evidence
    target.write_text(json.dumps(data, indent=2) + '\n')
print('Six native styles documented; five Studio authorities updated with unchanged readiness and explicit remaining blockers.')
