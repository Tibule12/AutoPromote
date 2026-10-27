#!/usr/bin/env python3
"""Bounded GET-only evidence for the named project. Never starts jobs or changes billing.
Uses the existing gcloud credential in memory. Raw evidence is saved privately.
"""
import argparse, concurrent.futures, datetime, json, os, subprocess, urllib.error, urllib.parse, urllib.request
from pathlib import Path

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--project', default='autopromote-cc6d3', choices=['autopromote-cc6d3'])
    p.add_argument('--output', required=True, type=Path)
    a = p.parse_args()
    if a.output.exists():
        p.error('Use a new evidence directory')
    os.umask(63)
    a.output.mkdir(parents=True, mode=448)
    token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True, stderr=subprocess.DEVNULL).strip()
    end = datetime.datetime.now(datetime.timezone.utc)
    start = end - datetime.timedelta(days=7)
    project = a.project
    urls = {'billingProject': f'https://cloudbilling.googleapis.com/v1/projects/{project}/billingInfo', 'bigqueryDatasets': f'https://bigquery.googleapis.com/bigquery/v2/projects/{project}/datasets?maxResults=1000', 'mediaService': f'https://run.googleapis.com/v2/projects/{project}/locations/us-central1/services/media-worker-v1', 'jobs': f'https://run.googleapis.com/v2/projects/{project}/locations/us-central1/jobs?pageSize=100'}
    for label, metric in [('billableInstanceSeconds', 'container/billable_instance_time'), ('allocatedCpuTime', 'container/cpu/allocation_time'), ('allocatedMemoryTime', 'container/memory/allocation_time'), ('requests', 'request_count')]:
        metric = 'run.googleapis.com/' + metric
        urls[label + 'Descriptor'] = 'https://monitoring.googleapis.com/v3/projects/' + project + '/metricDescriptors?' + urllib.parse.urlencode({'filter': f'metric.type="{metric}"'})
        query = {'filter': f'metric.type="{metric}" AND resource.type="cloud_run_revision" AND resource.labels.service_name="media-worker-v1"', 'interval.startTime': start.isoformat(), 'interval.endTime': end.isoformat(), 'aggregation.alignmentPeriod': '86400s', 'aggregation.perSeriesAligner': 'ALIGN_SUM', 'pageSize': '1000', 'view': 'FULL'}
        urls[label] = 'https://monitoring.googleapis.com/v3/projects/' + project + '/timeSeries?' + urllib.parse.urlencode(query)
    for label, metric, resource, selector, aligner in [('gpuJobBillableSeconds', 'run.googleapis.com/container/billable_instance_time', 'cloud_run_job', 'resource.labels.job_name="autopromote-model-v1-video"', 'ALIGN_SUM'), ('retainedStorageBytes', 'storage.googleapis.com/storage/total_bytes', 'gcs_bucket', 'resource.labels.bucket_name="autopromote-cc6d3.firebasestorage.app"', 'ALIGN_MAX')]:
        urls[label + 'Descriptor'] = 'https://monitoring.googleapis.com/v3/projects/' + project + '/metricDescriptors?' + urllib.parse.urlencode({'filter': f'metric.type="{metric}"'})
        urls[label] = 'https://monitoring.googleapis.com/v3/projects/' + project + '/timeSeries?' + urllib.parse.urlencode({'filter': f'metric.type="{metric}" AND resource.type="{resource}" AND {selector}', 'interval.startTime': start.isoformat(), 'interval.endTime': end.isoformat(), 'aggregation.alignmentPeriod': '86400s', 'aggregation.perSeriesAligner': aligner, 'pageSize': '1000', 'view': 'FULL'})
    urls['storageBucket'] = f'https://storage.googleapis.com/storage/v1/b/autopromote-cc6d3.firebasestorage.app?fields=name,location,storageClass,lifecycle'

    def get(item):
        label, url = item
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'X-Goog-User-Project': project}, method='GET')
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                data = json.load(response)
                code = response.status
            (a.output / (label + '.json')).write_text(json.dumps(data, indent=2) + '\n')
            return (label, {'httpStatus': code, 'data': data})
        except urllib.error.HTTPError as e:
            return (label, {'httpStatus': e.code, 'unverified': True})
        except (OSError, ValueError):
            return (label, {'error': 'Read unavailable', 'unverified': True})
    results = dict(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(get, urls.items()))
    summary = {'capturedAtUtc': end.isoformat(), 'project': project, 'windowStartUtc': start.isoformat(), 'windowEndUtc': end.isoformat(), 'methods': ['GET'], 'operationsOrProviderChargesStarted': False, 'requests': {k: {n: v for n, v in r.items() if n != 'data'} for k, r in results.items()}, 'metrics': {}, 'limits': ['Infrastructure telemetry is not an invoice or per-operation attribution.', 'No BigQuery query, export enablement, cloud job, provider payment or production document write was performed.']}
    datasets = results['bigqueryDatasets'].get('data', {})
    summary['existingBigqueryDatasets'] = [d.get('datasetReference', {}).get('datasetId') for d in datasets.get('datasets', [])]
    summary['datasetsTruncated'] = bool(datasets.get('nextPageToken'))
    service = results['mediaService'].get('data', {})
    summary['mediaService'] = {k: service.get(k) for k in ['latestReadyRevision', 'uri']}
    template = service.get('template', {})
    summary['mediaService']['shape'] = {k: template.get(k) for k in ['scaling', 'timeout', 'maxInstanceRequestConcurrency']}
    summary['mediaService']['shape']['containers'] = [c.get('resources', {}) for c in template.get('containers', [])]
    summary['jobResourceShapes'] = [{'name': j.get('name'), 'timeout': j.get('template', {}).get('template', {}).get('timeout'), 'maxRetries': j.get('template', {}).get('template', {}).get('maxRetries'), 'nodeSelector': j.get('template', {}).get('template', {}).get('nodeSelector'), 'gpuZonalRedundancyDisabled': j.get('template', {}).get('template', {}).get('gpuZonalRedundancyDisabled'), 'containers': [c.get('resources', {}) for c in j.get('template', {}).get('template', {}).get('containers', [])]} for j in results['jobs'].get('data', {}).get('jobs', [])]
    summary['jobsTruncated'] = bool(results['jobs'].get('data', {}).get('nextPageToken'))
    for name in ['billableInstanceSeconds', 'allocatedCpuTime', 'allocatedMemoryTime', 'requests', 'gpuJobBillableSeconds', 'retainedStorageBytes']:
        data = results[name].get('data')
        descriptor = next(iter(results[name + 'Descriptor'].get('data', {}).get('metricDescriptors', [])), {})
        points = [p for s in (data or {}).get('timeSeries', []) for p in s.get('points', [])]
        values = [float(p['value'].get('doubleValue', p['value'].get('int64Value', 0))) for p in points if 'value' in p and ('doubleValue' in p['value'] or 'int64Value' in p['value'])]
        summary['metrics'][name] = {'available': data is not None, 'unit': descriptor.get('unit'), 'kind': descriptor.get('metricKind'), 'series': len((data or {}).get('timeSeries', [])), 'points': len(points), 'sumObserved': sum(values) if data is not None else None, 'truncated': bool((data or {}).get('nextPageToken'))}
    summary['storageBucket'] = results['storageBucket'].get('data')
    storage_series = results.get('retainedStorageBytes', {}).get('data', {}).get('timeSeries', [])
    summary['metrics']['retainedStorageBytes']['sumOfLatestClassBytes'] = sum((float(max(series.get('points', []), key=lambda p: p['interval']['endTime'])['value'].get('doubleValue', max(series.get('points', []), key=lambda p: p['interval']['endTime'])['value'].get('int64Value', 0))) for series in storage_series if series.get('points'))) if storage_series else None
    summary['metrics']['retainedStorageBytes'].pop('sumObserved', None)
    summary['billingEnabled'] = results['billingProject'].get('data', {}).get('billingEnabled')
    (a.output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps({'output': str(a.output), 'metrics': summary['metrics'], 'datasets': summary['existingBigqueryDatasets'], 'billingEnabled': summary['billingEnabled'], 'readFailures': [k for k, r in results.items() if r.get('httpStatus') != 200]}, indent=2))
if __name__ == '__main__':
    main()
