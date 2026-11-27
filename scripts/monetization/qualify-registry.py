#!/usr/bin/env python3
"""Bounded read-only metadata/OCI manifest review. Never fetches media layers.

No deletes, builds, job executions, settings or deployments. Provider responses
with environment configuration stay private. Supply a fresh private directory.
"""
import concurrent.futures, datetime, hashlib, json, os, subprocess, sys
import urllib.error, urllib.parse, urllib.request
from pathlib import Path

os.umask(0o077)
private = Path(sys.argv[1])
private.mkdir(mode=0o700, exist_ok=False)
out = Path('reports/free-first-release-20261127')
out.mkdir(parents=True, exist_ok=True)
token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True, stderr=subprocess.DEVNULL).strip()
project = 'autopromote-cc6d3'
parent = 'projects/' + project
requests = []

def get(url, label):
    req = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + token,
        'Accept': ', '.join(['application/vnd.oci.image.index.v1+json', 'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json', 'application/vnd.docker.distribution.manifest.list.v2+json', 'application/json'])})
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            data = json.load(response)
            status = response.status
    except urllib.error.HTTPError as error:
        data, status = {}, error.code
    except Exception as error:
        data, status = {}, type(error).__name__
    (private / (label + '.json')).write_text(json.dumps(data) + '\n')
    requests.append({'label': label, 'status': status, 'method': 'GET'})
    return data

def pages(url, key, label, max_pages=100):
    result, cursor = [], None
    for page in range(max_pages):
        address = url + ('&pageToken=' + urllib.parse.quote(cursor, safe='') if cursor else '')
        data = get(address, label + '-' + str(page))
        result.extend(data.get(key, []))
        cursor = data.get('nextPageToken')
        if not cursor:
            return result
    raise RuntimeError('Incomplete pagination: ' + label)

services = pages('https://run.googleapis.com/v2/' + parent + '/locations/-/services?pageSize=100', 'services', 'services')
jobs = pages('https://run.googleapis.com/v2/' + parent + '/locations/us-central1/jobs?pageSize=100', 'jobs', 'jobs')
functions = pages('https://cloudfunctions.googleapis.com/v1/' + parent + '/locations/-/functions?pageSize=100', 'functions', 'functions-v1')
references = []
for service in services:
    for container in service.get('template', {}).get('containers', []):
        if container.get('image'):
            references.append({'owner': service['name'], 'image': container['image'], 'role': 'current service template'})
    for rev in pages('https://run.googleapis.com/v2/' + service['name'] + '/revisions?pageSize=100', 'revisions', 'revisions-' + service['name'].split('/')[-1]):
        for container in rev.get('containers', []):
            if container.get('image'):
                references.append({'owner': rev['name'], 'image': container['image'], 'role': 'retained service revision / rollback'})
for job in jobs:
    for container in job.get('template', {}).get('template', {}).get('containers', []):
        if container.get('image'):
            references.append({'owner': job['name'], 'image': container['image'], 'role': 'current Job'})
    for execution in pages('https://run.googleapis.com/v2/' + job['name'] + '/executions?pageSize=100', 'executions', 'executions-' + job['name'].split('/')[-1]):
        for container in execution.get('template', {}).get('containers', []):
            if container.get('image'):
                references.append({'owner': execution['name'], 'image': container['image'], 'role': 'retained execution'})
function_owners = []
for index, function in enumerate(functions):
    build = function.get('buildName')
    if not build and function.get('buildId'):
        build = parent + '/locations/' + function['name'].split('/')[3] + '/builds/' + function['buildId']
    result = get('https://cloudbuild.googleapis.com/v1/' + build, 'function-build-' + str(index)) if build else {}
    images = result.get('results', {}).get('images', [])
    for image in images:
        if image.get('digest'):
            references.append({'owner': function['name'], 'image': image['name'].split('@')[0] + '@' + image['digest'], 'role': 'current Gen1 Function build'})
    # Gen1 managed builds often report buildStepOutputs rather than results.images.
    # Preserve declared output/cache repositories as well, without exporting args/env.
    import re
    build_refs = sorted(set(re.findall(r'(?:[a-z0-9-]+-docker\.pkg\.dev|[a-z.]*gcr\.io)/[A-Za-z0-9_./:@-]+', json.dumps(result.get('steps', [])))))
    own_refs = [ref for ref in build_refs if '/' + project + '/' in ref]
    references.extend({'owner':function['name'],'image':ref,'role':'Gen1 declared build output/cache; repository protected'} for ref in own_refs)
    function_owners.append({'name': function['name'], 'build': build, 'registry': function.get('dockerRegistry'), 'resolved': bool(images), 'declaredBuildImages': own_refs})
repos = []
for region in ['us', 'us-central1']:
    repos.extend(pages('https://artifactregistry.googleapis.com/v1/' + parent + '/locations/' + region + '/repositories?pageSize=100', 'repositories', 'repositories-' + region))
images, files = [], []
for index, repo in enumerate(repos):
    for image in pages('https://artifactregistry.googleapis.com/v1/' + repo['name'] + '/dockerImages?pageSize=1000', 'dockerImages', 'images-' + str(index)):
        images.append({key: image[key] for key in ['uri', 'tags', 'imageSizeBytes', 'uploadTime', 'updateTime', 'mediaType'] if key in image} | {'repository': repo['name']})
    for file in pages('https://artifactregistry.googleapis.com/v1/' + repo['name'] + '/files?pageSize=1000', 'files', 'files-' + str(index)):
        files.append({key: file[key] for key in ['name', 'sizeBytes', 'hashes', 'owner'] if key in file} | {'repository': repo['name']})

def manifest(item):
    index, image = item
    uri = image['uri']
    host, package = uri.split('/', 1)
    package, digest = package.split('@')
    data = get('https://' + host + '/v2/' + package + '/manifests/' + digest, 'manifest-' + str(index))
    return {'uri': uri, 'repository': image['repository'], 'manifest': data}

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    manifests = list(pool.map(manifest, enumerate(images)))
summary = {
    'capturedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'project': project, 'references': references, 'functions': function_owners,
    'repositories': [{k:r[k] for k in ['name','sizeBytes','cleanupPolicyDryRun','cleanupPolicies'] if k in r} for r in repos],
    'images': images, 'files': files, 'manifests': manifests, 'requests': requests,
    'productionDeletes': 0, 'imageLayersDownloaded': 0,
    'externalConsumerInventoryComplete': False,
    'scope': 'All available paginated GCP service revisions, Jobs/executions, Function build refs and OCI metadata. Render/external ownership requires separate evidence.'}
(out / 'registry-reachability-observations.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'images':len(images),'references':len(references),'files':len(files),'functions':len(functions),'resolvedFunctions':sum(f['resolved'] for f in function_owners),'failedGets':[r for r in requests if r['status']!=200],'deletes':0,'layersDownloaded':0}))
