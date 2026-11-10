from pathlib import Path
import json,hashlib,os
r=Path(__file__).resolve().parent;repo=r.parents[1];q=json.loads((r/'publishing/queue-verified.json').read_text());assert q['verifiedDestinationSchedules']==12
three=json.loads((r/'three-verification.json').read_text());four=json.loads((r/'four-verification.json').read_text());disk=json.loads((r/'disk-recovery.json').read_text());assert disk['netAvailableIncreaseGB']>=20
for word in ['three','four']:
 for suffix in ['', '-reddit']:
  f=r/'publishing'/(word+suffix+'-release.json');d=json.loads(f.read_text());d['verifiedDestinations']=[x for x in q['checked'] if x['movie']==word and x['platform'] in d['destinations']];assert len(d['verifiedDestinations'])==len(d['destinations']);f.write_text(json.dumps(d,indent=2)+'\n')
prior=q['previousSchedulesPreserved'];root_output=Path(json.loads((r/'delivery-manifest.json').read_text())['directory'])
(r/'README.md').write_text(f'''# Dances three and four — native finals and scheduling

Completed for the owner's request to work on the other two supplied dances, schedule the results and recover at least 20 GB of disk space.

| Final movie | Source interval | Native output | Scheduled 10 November, SAST |
| --- | --- | --- | --- |
| Prism Relay — dance three | 8.2–15.7 seconds | 7.5s / 180 frames / 24fps / 576×1024 | **18:00** |
| Mirror Pulse — dance four | 12–20 seconds | 8s / 192 frames / 24fps / 576×1024 | **20:00** |

Both use the actual Studio frontend, editable projects, native scene actions, the shared compiler and canonical CPU export. Final films, original sources, native backups, control recordings and complete live/finished Studio playback are saved under `{root_output}`. These are art-directed edits; no autonomous Director or automatic product subject-isolation claim is made.

Prism Relay starts with independently timed perspective panels, then the isolated crew moves into the foreground while the panels recede. Source cuts have authored opacity transitions. Mirror Pulse retains the original crew's colour against a native graphic stage, with delayed cyan/amber copies and fading reflected movement. Early clipped/overcrowded layouts remain excluded. All 180 and 192 decoded pictures, reveals, cut transitions and closing frames were inspected as numbered contact sheets. Prepared local RVM foreground/alpha are analysis inputs; the final effects remain native editable layers.

The first dance-three movie was too quiet and is retained. Native original-audio automation at 200% plus a neutral 6 dB master raises the existing song without changing speed, pitch, EQ or reverb. Its initial basic picture is byte-for-byte identical after audio mastering; the subsequent pop-out revision intentionally changes the picture. Final audio measures **−19.2 LUFS / −4.4 dBTP** for three and **−19.7 LUFS / −6.1 dBTP** for four, with zero measured source alignment offset, correlation above .9987 and no decoded full-scale samples. Three's decoded AAC is 576 samples / 12ms short at the tail, within one AAC frame; picture remains exactly 180 frames. Human listening is unqualified because QA playback is muted.

The 200% source-volume control exposed a browser crash. Source and split-audio preview gain now use the existing bounded WebAudio bus, and created split elements participate in existing editor teardown. The actual original-volume regression passes alongside 12 focused audio tests. The editor suite was filtered to that regression; its other 172 cases were not run. A final isolated build retains the loopback API, demo Firebase project, welcome and Director flags. Eight anonymous welcome comparisons, actual sign-in/help and all 58 served assets pass. Nothing was deployed to production.

Creative limits remain visible: compressed source detail, soft subject edges and small foot-adjacent matte residue; the reflection is a 2D mirror rather than physical relighting. Live/export diagnostics are recorded without claiming strict picture/audio parity or smooth display. Capture rates are in the four capture JSON records. This is a reviewed stylised delivery, not a claim of perfection or reference-photo realism. Existing S02/S04/S03, strict typography 13/16 failures and formal readiness counts remain unchanged.

## Live scheduling

The exact final movies have **12 active, pending, once-only schedules** on YouTube, TikTok, Instagram, Facebook, LinkedIn and Reddit. Normal signed-in production Publisher supplies two five-destination uploads and two single-destination schedules reusing those exact owned assets. The live five-platform submission limit and account allowances remain unchanged. Only final movies were uploaded. An independent Queue reload checks every destination, copy, time and downloaded media SHA256. All **{prior:,} prior Queue records** retain their content association, platform, state, active flag, time, frequency and copy/settings. Provider publication is separate.

[Queue verification](publishing/queue-verified.json) · [Exact final selection](publishing/selected-finals.json) · [Authorization](publishing/authorization.json) · [delivery manifest](delivery-manifest.json) · [creative findings](creative-review.json).

## Disk recovery

Measured available space increased by **{disk['netAvailableIncreaseGB']:.2f} decimal GB**, from **13.76 GB** to **{disk['afterAvailableGB']:.2f} GB**, after the new deliveries. SHA256-identical media and immutable Storage snapshots share disk blocks while retaining every pathname and byte. Unused browser/model/download/build caches were removed only after checking open/mapped files; the unused large ASR download can be fetched again. Required dance matte/cleanup runtimes and the four archived runtime restore packages remain.

All four original dances and all 62 files in the previous Neon Circle/Grounded Doubles handoffs match their protected hashes. Original source code, editable projects, login databases and existing final videos were not deleted. The first deduplication pass stopped on an older root-owned fixture after a recorded 15,300 files; its final per-file ledger was not written. The corrected user-owned pass and frozen-snapshot pass have ledgers. Final filesystem availability and protected hashes are measured directly. Browser/model caches can grow again during future use.

[Measured disk result](disk-recovery.json) · [protected file checks](preservation.json) · [wallet/history preservation](wallet-preservation.json). Four local symbolic render operations settle with zero active operations; unrelated demo wallets and prior operation states remain exact. Earlier quiet/observer/runtime failures are retained. No paid generation, GPU allocation, deployment, merge or unrelated production data operation was performed.
''')
entry={
 'updatedAt':q['verifiedAt'],'status':'TWO_OTHER_DANCES_NATIVE_FINALS_AND_TWELVE_SCHEDULES_VERIFIED',
 'ownerInstruction':'work on the other two and schedule them; recover over 20 GB',
 'nativeFrontendAuthoringHistoryIndependentRestoreAndCpuExport':True,
 'finals':{'three':{'sha256':three['movieSha256'],'frames':180,'seconds':7.5,'nativeJobId':three['nativeJobId'],'layers':5,'motionKeys':240},'four':{'sha256':four['movieSha256'],'frames':192,'seconds':8,'nativeJobId':four['nativeJobId'],'layers':8,'motionKeys':414}},
 'sourceMusicRetainedAtNormalSpeed':True,'humanListeningQualified':False,
 'sourceVolume200PercentCrashFixedUsingExistingGainBus':True,'focusedAudioTestsPassed':12,'targetedEditorRegressionPassed':1,'otherEditorCasesNotRun':172,
 'anonymousWelcomeChecks':8,'servedAssetsVerified':58,'normalSignInAndHelp':True,
 'nativeSchedulesVerified':12,'date':'2026-11-10','timezone':'Africa/Johannesburg','localTimes':{'three':'18:00','four':'20:00'},'priorQueueRecordsPreserved':prior,
 'diskAvailableIncreaseGB':disk['netAvailableIncreaseGB'],'freeDiskGB':disk['afterAvailableGB'],'originalsAndPriorDeliveryHashesPreserved':True,
 'providerPublicationVerified':False,'autonomousDirector':False,'automaticProductIsolation':False,'strictPredictivePictureAudioParity':False,'readinessPromotion':False,
 'remainingBlockers':'S02 predictive source-frame/colour/edge/audio parity and display throughput; S04 and S03; source-dependent matte/cleanup/contact quality; typography 13/16 failures.',
 'nextTask':'Preserve exact native projects and twelve publishing receipts; continue shared predictive gain/source/edge/live precision without duplicating schedules.',
 'evidence':['reports/dance-three-four-20261110/README.md','reports/dance-three-four-20261110/publishing/queue-verified.json','reports/dance-three-four-20261110/disk-recovery.json']}
for name in ['studio-capability-matrix.json','studio-combination-matrix.json','studio-preview-render-parity.json']:
 p=repo/'test/e2e'/name;d=json.loads(p.read_text());d['updatedAt']=q['verifiedAt'];d['studioOtherDanceFinals20261110']=entry;p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
marker='<!-- other-dance-finals-20261110 -->'
note=f'''\n\n{marker}
10 November [Prism Relay and Mirror Pulse](../reports/dance-three-four-20261110/README.md) complete the owner's other-two-dances request through normal native Studio authoring, exact history/reopen, canonical CPU export and complete live/finished timeline recordings. Three is 7.5s/180 frames with perspective panels and an isolated foreground reveal; four is 8s/192 frames with cyan/amber echoes and fading reflections. Both are 24fps/576×1024 and retain their own songs at normal speed. A real source-volume 200% crash is fixed through the existing bounded gain graph and split-element teardown; one targeted editor regression plus 12 audio tests pass, alongside eight welcome comparisons, actual signed-in help and 58 served-asset hashes. Human listening, compressed-source/matte detail, strict predictive parity and display smoothness remain unqualified. Exact final-only normal Publisher scheduling verifies 12 active once-only destinations for today at 18:00/20:00 SAST; all {prior:,} prior Queue records remain unchanged. Disk availability rises by {disk['netAvailableIncreaseGB']:.2f} GB after byte-preserving deduplication and unused-cache cleanup; four originals and 62 prior delivery files remain exact. Native inputs, projects, prior quiet/layout failures and full demo snapshots are retained; four symbolic native render operations settle with no wallet reset. Formal 17 FUNCTIONAL / 9 PARTIAL / 1 BROKEN / 2 UNIMPLEMENTED / 0 PRO / 0 PRODUCTION, typography 13/16 and shared S02/S04/S03 limits remain. Next: preserve receipts and continue shared predictive gain/source/edge/live precision. No deployment, merge, paid generation or GPU allocation.
<!-- /other-dance-finals-20261110 -->
'''
for name in ['STUDIO-COMPLETION-CONTRACT.md','STUDIO-PRODUCT-READINESS.md']:
 p=repo/'docs'/name;s=p.read_text();assert marker not in s;p.write_text(s+note)
(root_output/'README.md').write_text(f'''# Finished dance edits — 10 November 2026

- Prism Relay / dance three: scheduled today at 18:00 SAST.
- Mirror Pulse / dance four: scheduled today at 20:00 SAST.

Each subfolder contains the separate final movie, editable Studio backup, source, controls and full matching Studio playback. Final-only schedules are independently verified on YouTube, TikTok, Instagram, Facebook, LinkedIn and Reddit. Provider publication remains separate.

Studio source-volume boosting was repaired during this edit. The original music is retained; compressed footage and prepared-mask edges remain creative limits. Full findings and exact receipts: {r/'README.md'}.

Measured disk space returned after delivery: {disk['netAvailableIncreaseGB']:.2f} GB; available space: {disk['afterAvailableGB']:.2f} GB. Originals and previous final handoffs retain their hashes.
''')
print(json.dumps({'reportedFinals':2,'verifiedSchedules':12,'diskReturnedGB':disk['netAvailableIncreaseGB'],'authorityFilesUpdated':5}))
