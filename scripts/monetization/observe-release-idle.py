#!/usr/bin/env python3
"""Read-only minute metrics and bounded retention-write audit after release.

No document reads, telemetry activation, resource changes or workloads.
Logging POST is entries:list, a read-only search. Counts are not invoices.
"""
import argparse
import concurrent.futures
import datetime
import json
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
project = 'autopromote-cc6d3'
now = datetime.datetime.now(datetime.timezone.utc)
start = now-datetime.timedelta(hours=1)
token = subprocess.check_output(['gcloud','auth','print-access-token'],text=True,stderr=subprocess.DEVNULL).strip()

def read(url, body=None):
    request = urllib.request.Request(url, headers={'Authorization':'Bearer '+token,'X-Goog-User-Project':project,'Content-Type':'application/json'}, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(request,timeout=25) as response:
        return json.load(response)

def metric(item):
    name, kind = item
    rows=[]
    cursor=None
    for _ in range(20):
        query={'filter':'metric.type="'+kind+'"','interval.startTime':start.isoformat(),'interval.endTime':now.isoformat(),
               'aggregation.alignmentPeriod':'60s','aggregation.perSeriesAligner':'ALIGN_SUM','pageSize':10000}
        if cursor: query['pageToken']=cursor
        data=read('https://monitoring.googleapis.com/v3/projects/'+project+'/timeSeries?'+urllib.parse.urlencode(query))
        for series in data.get('timeSeries',[]):
            labels=series.get('resource',{}).get('labels',{})
            rows.append({'resource':{k:v for k,v in labels.items() if k in ['database_id','location','region','function_name']},
                         'metricLabels':{k:v for k,v in series.get('metric',{}).get('labels',{}).items() if k in ['type','status','execution_status']},
                         'points':[{'endTime':p['interval']['endTime'],'count':float(p['value'].get('int64Value',p['value'].get('doubleValue',0)))} for p in series.get('points',[])]})
        cursor=data.get('nextPageToken')
        if not cursor:break
    return name,{'rows':rows,'completePagination':not cursor}

items=[('reads','firestore.googleapis.com/document/read_count'),('writes','firestore.googleapis.com/document/write_count'),('functionExecutions','cloudfunctions.googleapis.com/function/execution_count')]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    metrics=dict(pool.map(metric,items))

logs=read('https://logging.googleapis.com/v2/entries:list',{
    'resourceNames':['projects/'+project], 'orderBy':'timestamp desc','pageSize':200,
    'filter':'protoPayload.serviceName="firestore.googleapis.com" AND protoPayload.methodName="google.firestore.v1.Firestore.Commit" AND protoPayload.request.writes.update.name:"/documents/content/" AND timestamp>="'+start.isoformat()+'"'})
samples=[]
for entry in logs.get('entries',[]):
    for write in entry.get('protoPayload',{}).get('request',{}).get('writes',[]):
        if '/documents/content/' in write.get('update',{}).get('name',''):
            samples.append({'timestamp':entry['timestamp'],'fields':write.get('updateMask',{}).get('fieldPaths') or list(write.get('update',{}).get('fields',{}))})
query_rows=[]
cursor=None
for _ in range(10):
    request={'resourceNames':['projects/'+project], 'orderBy':'timestamp desc','pageSize':1000,
        'filter':'protoPayload.serviceName="firestore.googleapis.com" AND protoPayload.methodName="google.firestore.v1.Firestore.RunQuery" AND protoPayload.request.structuredQuery.limit=200 AND timestamp>="'+(now-datetime.timedelta(minutes=35)).isoformat()+'"'}
    if cursor: request['pageToken']=cursor
    result=read('https://logging.googleapis.com/v2/entries:list',request)
    for entry in result.get('entries',[]):
        q=entry.get('protoPayload',{}).get('request',{}).get('structuredQuery',{})
        collection=[c.get('collectionId') for c in q.get('from',[])]
        field=q.get('where',{}).get('fieldFilter',{})
        if field.get('field',{}).get('fieldPath')=='contentId' and any(c in ['platform_posts','promotion_tasks','promotion_schedules','media_transform_tasks'] for c in collection):
            query_rows.append({'timestamp':entry['timestamp'],'collections':collection,'operator':field.get('op'),'limit':q.get('limit')})
    cursor=result.get('nextPageToken')
    if not cursor:break
result={'capturedAtUtc':now.isoformat(),'startUtc':start.isoformat(),'metrics':metrics,'contentCommitSamples':samples,
        'retentionQuerySamples':query_rows,'retentionQueryPaginationComplete':not cursor,
        'logSearchTruncated':bool(logs.get('nextPageToken')),'explicitDocumentOrBalanceWrites':0,'workloadsStarted':0,
        'limitations':['Monitoring ingestion is delayed; recent missing samples do not establish zero usage.',
                       'Project totals include other applications. Bounded audit samples do not establish all monthly endpoint costs.',
                       'A changed live revision is not proof of a reduced invoice; observe complete maintenance cycles and comparable idle intervals.']}
args.output.parent.mkdir(parents=True,exist_ok=True)
args.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'output':str(args.output),'metricSeries':{k:len(v['rows']) for k,v in metrics.items()},'contentCommitSamples':len(samples),'truncated':result['logSearchTruncated']}))
