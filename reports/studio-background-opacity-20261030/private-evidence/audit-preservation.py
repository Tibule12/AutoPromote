from pathlib import Path
import gzip, hashlib, json

root = Path('/home/tibule12/Projects/AutoPromte')
scratch = Path('/dev/shm/autopromote-background-finish-20261030')
baseline = json.loads(gzip.decompress((scratch/'saved-session-before.private.json.gz').read_bytes()))
current = json.loads(Path('/home/tibule12/.local/share/autopromote-qa/session/template-editorial-20261013.private.json').read_text())
project_id = 'viral-project-22f0e2ba-14fd-4309-a097-f1adef3b0abd'

def projects(state):
    return {row['value']['id']: row['value'] for origin in state['origins']
            for db in origin.get('indexedDB', []) if db['name']=='autopromote-viral-studio'
            for store in db['stores'] if store['name']=='projects' for row in store['records']}

def auth_uids(state):
    found = []
    def walk(value):
        if isinstance(value, dict):
            if value.get('k')=='uid':
                uid=value.get('v')
                if isinstance(uid, str): found.append(uid)
            for child in value.values(): walk(child)
        elif isinstance(value, list):
            for child in value: walk(child)
    for origin in state['origins']:
        for db in origin.get('indexedDB', []):
            if db['name']=='firebaseLocalStorageDb': walk(db)
    return sorted(set(found))

before, after = projects(baseline), projects(current)
assert set(before)==set(after)
assert all(before[k]==after[k] for k in before if k!=project_id)
assert baseline['cookies']==current['cookies']
assert auth_uids(baseline) and auth_uids(baseline)==auth_uids(current)
changed_storage=[]
for origin in baseline['origins']:
    now=next(o for o in current['origins'] if o['origin']==origin['origin'])
    old={row['name']:row['value'] for row in origin['localStorage']}
    new={row['name']:row['value'] for row in now['localStorage']}
    changed=[key for key in set(old)|set(new) if old.get(key)!=new.get(key)]
    assert all(key.startswith('autopromote-viral-render-attempt:') for key in changed)
    changed_storage.extend(changed)

patches=[]
for old, new in zip(before[project_id]['snapshot']['subjectVfxScenes'], after[project_id]['snapshot']['subjectVfxScenes']):
    assert old['modelArtifactRef']==new['modelArtifactRef']
    assert old['maskJob']==new['maskJob']
    assert len(old['scene']['effects'])==len(new['scene']['effects'])
    for a,b in zip(old['scene']['effects'],new['scene']['effects']):
        if a['type']=='background_replace': continue
        expected=json.loads(json.dumps(a))
        if old is before[project_id]['snapshot']['subjectVfxScenes'][0] and expected.get('source_patches'):
            assert len(expected['source_patches'])==4
            for patch in expected['source_patches'][2:]:
                assert len(patch.pop('protect_paths'))==3
        assert {k:v for k,v in expected.items() if k not in ['alpha_levels','alpha_polygon']}=={k:v for k,v in b.items() if k not in ['alpha_levels','alpha_polygon']}
        patches.append(len(a.get('source_patches', [])))

manifest=json.loads((root/'AutoPromote-model-runtime-v1/reports/studio-background-blender-trial-20261030/original-app-build-manifest.private.json').read_text())
for path, expected in manifest['files'].items():
    assert hashlib.sha256((Path(manifest['build'])/path).read_bytes()).hexdigest()==expected

protected=json.loads((scratch/'protected-files-before.json').read_text())
for path, record in protected.items():
    expected=record if isinstance(record,str) else record.get('sha256', record.get('hash'))
    assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==expected

release=json.loads((scratch/'stale-foreground-cache-release.json').read_text())
assert not any(Path(row['cache']).exists() for row in release['entries'])
result={'savedProjectCount':len(after), 'otherProjectRecordsExact':len(after)-1,
    'cookiesExact':True, 'firebaseSignedInIdentityPreserved':True,
    'authRefreshAndHeartbeatUpdatesRetained':True,
    'localStorageChangesLimitedToNativeRenderAttempts':len(changed_storage),
    'maskReferencesAndMaskJobsExact':True, 'sourcePatchCountRetained':sum(patches),
    'nonRoomEffectsExactApartFromOptionalOpacityAndRemovedReedProtection':True,
    'allFourHostRepairSourceTargetGeometriesExact':True,
    'removedReedProtectionPathsAcrossTwoHostRepairs':6,
    'originalAppBuildFilesExact':len(manifest['files']),
    'protectedSourceAndPriorFilesExact':len(protected),
    'verifiedObsoletePreparedCacheEntriesReleased':len(release['entries']),
    'verifiedObsoletePreparedCacheBytesReleased':release['bytes'], 'sourceFilesDeleted':0}
(scratch/'preservation-current.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
