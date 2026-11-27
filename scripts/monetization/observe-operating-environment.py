#!/usr/bin/env python3
"""Bounded metadata/Monitoring GET audit. Never enumerates customer documents,
executes workloads, queries BigQuery, enables APIs, or changes infrastructure.
Raw provider responses stay in a private directory outside the repository.
"""
import argparse, concurrent.futures, datetime, json, os, subprocess, urllib.parse, urllib.request, urllib.error
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--private-output',required=True,type=Path)
p.add_argument('--summary',required=True,type=Path)
a=p.parse_args();os.umask(0o077)
if a.private_output.exists() or a.summary.exists():p.error('Use new evidence paths')
a.private_output.mkdir(mode=0o700,parents=True)
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True,stderr=subprocess.DEVNULL).strip()
project='autopromote-cc6d3';base=f'projects/{project}';regional=base+'/locations/us-central1'
end=datetime.datetime.now(datetime.timezone.utc);start=end-datetime.timedelta(days=30)
urls={
 'runServices':f'https://run.googleapis.com/v2/{base}/locations/-/services?pageSize=100',
 'runJobs':f'https://run.googleapis.com/v2/{regional}/jobs?pageSize=100',
 'functions':f'https://cloudfunctions.googleapis.com/v2/{base}/locations/-/functions?pageSize=100',
 'firestoreDatabases':f'https://firestore.googleapis.com/v1/{base}/databases',
 'firestoreBackupSchedules':f'https://firestore.googleapis.com/v1/{base}/databases/(default)/backupSchedules',
 'firestoreBackups':f'https://firestore.googleapis.com/v1/{base}/locations/-/backups?pageSize=100',
 'scheduler':f'https://cloudscheduler.googleapis.com/v1/{regional}/jobs?pageSize=100',
 'taskQueues':f'https://cloudtasks.googleapis.com/v2/{regional}/queues?pageSize=100',
 'artifacts':f'https://artifactregistry.googleapis.com/v1/{regional}/repositories?pageSize=100',
 'artifactsUs':f'https://artifactregistry.googleapis.com/v1/{base}/locations/us/repositories?pageSize=100',
 'buildsGlobal':f'https://cloudbuild.googleapis.com/v1/{base}/builds?pageSize=100&filter='+urllib.parse.quote('create_time>="'+start.isoformat()+'"'),
 'buildsRegional':f'https://cloudbuild.googleapis.com/v1/{regional}/builds?pageSize=100&filter='+urllib.parse.quote('create_time>="'+start.isoformat()+'"'),
 'hostingSites':f'https://firebasehosting.googleapis.com/v1beta1/{base}/sites?pageSize=100',
 'authConfig':f'https://identitytoolkit.googleapis.com/admin/v2/{base}/config',
 'loggingBuckets':f'https://logging.googleapis.com/v2/{base}/locations/global/buckets?pageSize=100',
 'loggingSinks':f'https://logging.googleapis.com/v2/{base}/sinks?pageSize=100',
 'computeInstances':f'https://compute.googleapis.com/compute/v1/{base}/aggregated/instances?maxResults=100',
 'buckets':f'https://storage.googleapis.com/storage/v1/b?project={project}&maxResults=100',
 'enabledServices':f'https://serviceusage.googleapis.com/v1/{base}/services?filter=state:ENABLED&pageSize=200',
}
metrics={
 'firestoreReads':('firestore.googleapis.com/document/read_count','DELTA'),
 'firestoreWrites':('firestore.googleapis.com/document/write_count','DELTA'),
 'firestoreDeletes':('firestore.googleapis.com/document/delete_count','DELTA'),
 'firestoreStoredBytes':('firestore.googleapis.com/storage/data_and_index_storage_bytes','GAUGE'),
 'firestoreBackupBytes':('firestore.googleapis.com/storage/backups_storage_bytes','GAUGE'),
 'firestorePitrBytes':('firestore.googleapis.com/storage/pitr_storage_bytes','GAUGE'),
 'firestoreSnapshotListeners':('firestore.googleapis.com/network/snapshot_listeners','GAUGE'),
 'firestoreConnections':('firestore.googleapis.com/network/active_connections','GAUGE'),
 'runBillableSeconds':('run.googleapis.com/container/billable_instance_time','DELTA'),
 'runRequests':('run.googleapis.com/request_count','DELTA'),
 'functionExecutions':('cloudfunctions.googleapis.com/function/execution_count','DELTA'),
 'taskAttempts':('cloudtasks.googleapis.com/queue/task_attempt_count','DELTA'),
 'loggingIngestedBytes':('logging.googleapis.com/billing/bytes_ingested','DELTA'),
 'artifactStoredBytes':('artifactregistry.googleapis.com/repository/size','GAUGE'),
 'storageBytes':('storage.googleapis.com/storage/total_bytes','GAUGE'),
 'storageNetworkBytes':('storage.googleapis.com/network/sent_bytes_count','DELTA'),
 'storageRequests':('storage.googleapis.com/api/request_count','DELTA'),
 'hostingTransferBytes':('firebasehosting.googleapis.com/network/sent_bytes_count','DELTA'),
 'hostingStoredBytes':('firebasehosting.googleapis.com/storage/total_bytes','GAUGE'),
 'authNewMau':('identitytoolkit.googleapis.com/usage/monthly_new_signin_count','DELTA'),
 'authSmsSent':('identitytoolkit.googleapis.com/usage/sent_sms_count','DELTA'),
}
for label,(metric,kind) in metrics.items():
 params={'filter':f'metric.type="{metric}"','interval.startTime':start.isoformat(),'interval.endTime':end.isoformat(),
   'aggregation.alignmentPeriod':'86400s','aggregation.perSeriesAligner':'ALIGN_SUM' if kind=='DELTA' else 'ALIGN_MAX','pageSize':'1000'}
 if label.startswith(('auth','hosting')):
  params['interval.startTime']=end.replace(day=1,hour=0,minute=0,second=0,microsecond=0).isoformat()
 urls[label]='https://monitoring.googleapis.com/v3/'+base+'/timeSeries?'+urllib.parse.urlencode(params)
def get(item):
 label,url=item
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token}),timeout=20) as response:
   data=json.load(response);return label,{'httpStatus':response.status,'data':data}
 except urllib.error.HTTPError as error:return label,{'httpStatus':error.code,'unavailable':True}
 except Exception as error:return label,{'httpStatus':None,'unavailable':True,'errorType':type(error).__name__}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=dict(pool.map(get,urls.items()))
for label,r in results.items():(a.private_output/(label+'.json')).write_text(json.dumps(r,indent=2)+'\n')
summary={'project':project,'capturedAtUtc':end.isoformat(),'windowStartUtc':start.isoformat(),'windowEndUtc':end.isoformat(),
 'methods':['GET'],'workloadsStarted':False,'productionWrites':0,'invoiceAttributedUsd':None,
 'requestStatus':{k:{'httpStatus':v['httpStatus'],'truncated':bool(v.get('data',{}).get('nextPageToken'))} for k,v in results.items()},'metrics':{}}
for label,(_,kind) in metrics.items():
 r=results[label];data=r.get('data',{});series=data.get('timeSeries',[]);rows=[]
 for s in series:
  points=s.get('points',[]);values=[float(p['value'].get('int64Value',p['value'].get('doubleValue',0))) for p in points]
  labels=s.get('resource',{}).get('labels',{});safe={k:v for k,v in labels.items() if k in ['service_name','job_name','function_name','database_id','location','bucket_name','repository_id','queue_id','region']}
  rows.append({'resource':safe,'metricLabels':{k:v for k,v in s.get('metric',{}).get('labels',{}).items() if k in ['type','method','response_code','database_id']},
   'points':len(points),'observedSum' if kind=='DELTA' else 'observedMaximum':sum(values) if kind=='DELTA' else max(values,default=0),
   'latestValue':values[0] if values else None,'latestSampleAtUtc':points[0]['interval']['endTime'] if points else None})
 summary['metrics'][label]={'available':r['httpStatus']==200,'kind':kind,'series':len(series),'truncated':bool(data.get('nextPageToken')),'rows':rows}
def collection(label,key):return results[label].get('data',{}).get(key,[])
summary['runServices']=[{'name':s.get('name'),'scaling':s.get('scaling'),'templateScaling':s.get('template',{}).get('scaling'),
 'timeout':s.get('template',{}).get('timeout'),'concurrency':s.get('template',{}).get('maxInstanceRequestConcurrency'),
 'resources':[c.get('resources') for c in s.get('template',{}).get('containers',[])]} for s in collection('runServices','services')]
summary['runJobs']=[{'name':s.get('name'),'timeout':s.get('template',{}).get('template',{}).get('timeout'),
 'maxRetries':s.get('template',{}).get('template',{}).get('maxRetries'),
 'resources':[c.get('resources') for c in s.get('template',{}).get('template',{}).get('containers',[])]} for s in collection('runJobs','jobs')]
summary['functions']=[{'name':s.get('name'),'environment':s.get('environment'),'state':s.get('state'),
 'runtime':s.get('buildConfig',{}).get('runtime'),'serviceConfig':{k:v for k,v in s.get('serviceConfig',{}).items() if k in ['availableMemory','availableCpu','timeoutSeconds','minInstanceCount','maxInstanceCount','maxInstanceRequestConcurrency']},
 'eventTrigger':{k:v for k,v in s.get('eventTrigger',{}).items() if k in ['eventType','retryPolicy']}} for s in collection('functions','functions')]
summary['firestoreDatabases']=[{k:v for k,v in d.items() if k in ['name','locationId','type','databaseEdition','pointInTimeRecoveryEnablement','deleteProtectionState','backupConfig']} for d in collection('firestoreDatabases','databases')]
summary['backupSchedules']=[{k:v for k,v in d.items() if k in ['name','retention','dailyRecurrence','weeklyRecurrence']} for d in collection('firestoreBackupSchedules','backupSchedules')]
summary['backupCount']=len(collection('firestoreBackups','backups')) if results['firestoreBackups']['httpStatus']==200 else None
summary['schedulers']=[{k:v for k,v in s.items() if k in ['name','schedule','timeZone','state','retryConfig','attemptDeadline']} for s in collection('scheduler','jobs')]
summary['taskQueues']=[{k:v for k,v in s.items() if k in ['name','state','rateLimits','retryConfig']} for s in collection('taskQueues','queues')]
summary['repositories']=[{k:v for k,v in s.items() if k in ['name','format','sizeBytes','cleanupPolicies','cleanupPolicyDryRun']} for label in ['artifacts','artifactsUs'] for s in collection(label,'repositories')]
summary['builds']=[{k:v for k,v in s.items() if k in ['id','status','createTime','startTime','finishTime','timing']}|{'machineType':s.get('options',{}).get('machineType'),'diskSizeGb':s.get('options',{}).get('diskSizeGb')} for label in ['buildsGlobal','buildsRegional'] for s in collection(label,'builds')]
summary['hostingSites']=[{k:v for k,v in s.items() if k in ['name','defaultUrl','type']} for s in collection('hostingSites','sites')]
auth=results['authConfig'].get('data',{});summary['authConfig']={k:v for k,v in auth.items() if k in ['subtype','mfa','quota','monitoring','multiTenant']}
summary['authSignInMethods']={k:({'enabled':v.get('enabled')} if isinstance(v,dict) else v) for k,v in auth.get('signIn',{}).items() if k in ['email','phoneNumber','anonymous','allowDuplicateEmails']}
summary['loggingBuckets']=[{k:v for k,v in s.items() if k in ['name','retentionDays','locked','analyticsEnabled','lifecycleState']} for s in collection('loggingBuckets','buckets')]
summary['loggingSinks']=[{'name':s.get('name'),'disabled':s.get('disabled',False),'destinationType':str(s.get('destination','')).split('/')[0]} for s in collection('loggingSinks','sinks')]
summary['storageBuckets']=[{k:v for k,v in s.items() if k in ['name','location','storageClass','versioning','retentionPolicy','softDeletePolicy','lifecycle']} for s in collection('buckets','items')]
summary['computeInstanceCount']=sum(len(v.get('instances',[])) for v in results['computeInstances'].get('data',{}).get('items',{}).values()) if results['computeInstances']['httpStatus']==200 else None
summary['enabledServices']=[s.get('config',{}).get('name') for s in collection('enabledServices','services')]
summary['limitations']=['Metadata and Monitoring are not invoices or SKU-attributed expenditure.','30-day monitoring totals may be partial or absent; absence is not verified zero.',
 'Task queues and Scheduler inspected in us-central1 only; global lists bounded, nextPageToken recorded.','No authentication-user listing or customer-document collection scans.','Cloud Billing access and merchant invoices remain separate evidence.']
a.summary.parent.mkdir(parents=True,exist_ok=True);a.summary.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'summary':str(a.summary),'requests':len(results),'failed':[k for k,v in results.items() if v['httpStatus']!=200],'metricSeries':{k:v['series'] for k,v in summary['metrics'].items()}}))
