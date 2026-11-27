#!/usr/bin/env python3
"""Read-only inventory. POST is used only for Logging entries:list, a read API.
No image pulls/deletes, builds, jobs, exports, settings or deployments.
"""
import concurrent.futures,datetime,hashlib,json,os,subprocess,sys,urllib.request,urllib.parse,urllib.error
from pathlib import Path
os.umask(0o077)
out=Path('reports/free-first-waste-20261126');out.mkdir(exist_ok=True,parents=True)
private=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/autopromote-waste-evidence-20261126');private.mkdir(mode=0o700,exist_ok=False)
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True,stderr=subprocess.DEVNULL).strip()
project='autopromote-cc6d3';parent='projects/'+project
now=datetime.datetime.now(datetime.timezone.utc);cutoff=now-datetime.timedelta(days=30)
status=[]
def request(label,url,body=None):
 try:
  req=urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(body).encode() if body is not None else None)
  with urllib.request.urlopen(req,timeout=25) as response:data=json.load(response);code=response.status
 except urllib.error.HTTPError as e:data={};code=e.code
 (private/(label+'.json')).write_text(json.dumps(data,indent=2)+'\n')
 status.append({'label':label,'httpStatus':code,'method':'POST (read entries:list)' if body is not None else 'GET','truncated':bool(data.get('nextPageToken'))})
 return data
services=request('services','https://run.googleapis.com/v2/'+parent+'/locations/-/services?pageSize=100').get('services',[])
jobs=request('jobs','https://run.googleapis.com/v2/'+parent+'/locations/us-central1/jobs?pageSize=100').get('jobs',[])
functions=request('functions','https://cloudfunctions.googleapis.com/v2/'+parent+'/locations/-/functions?pageSize=100').get('functions',[])
references=[]
for service in services:
 name=service['name'];revisions=request('revisions-'+name.split('/')[-1],'https://run.googleapis.com/v2/'+name+'/revisions?pageSize=100')
 for rev in revisions.get('revisions',[]):
  for container in rev.get('containers',[]):
   if container.get('image'):references.append({'owner':rev['name'],'image':container['image'],'reason':'retained Cloud Run revision, including rollback'})
 for container in service.get('template',{}).get('containers',[]):
  if container.get('image'):references.append({'owner':name,'image':container['image'],'reason':'current service template'})
for job in jobs:
 for container in job.get('template',{}).get('template',{}).get('containers',[]):
  if container.get('image'):references.append({'owner':job['name'],'image':container['image'],'reason':'current Job template'})
 recent=request('executions-'+job['name'].split('/')[-1],'https://run.googleapis.com/v2/'+job['name']+'/executions?pageSize=10')
 for execution in recent.get('executions',[]):
  for container in execution.get('template',{}).get('containers',[]):
   if container.get('image'):references.append({'owner':execution['name'],'image':container['image'],'reason':'retained recent Job execution'})
repos=[];images=[]
for region in ['us','us-central1']:
 repos+=request('repositories-'+region,'https://artifactregistry.googleapis.com/v1/'+parent+'/locations/'+region+'/repositories?pageSize=100').get('repositories',[])
for index,repo in enumerate(repos):
 cursor=''
 for page in range(10):
  q=urllib.parse.urlencode({'pageSize':1000,**({'pageToken':cursor} if cursor else {})})
  data=request(f'images-{index}-{page}','https://artifactregistry.googleapis.com/v1/'+repo['name']+'/dockerImages?'+q)
  for im in data.get('dockerImages',[]):images.append({k:im[k] for k in ['name','uri','tags','imageSizeBytes','uploadTime','updateTime','mediaType','buildTime'] if k in im}|{'repository':repo['name']})
  cursor=data.get('nextPageToken')
  if not cursor:break
functionRepositories=sorted(set(f.get('buildConfig',{}).get('dockerRepository','') for f in functions if f.get('buildConfig',{}).get('dockerRepository')))
inventory={'capturedAtUtc':now.isoformat(),'references':references,'images':images,'repositories':[{k:r[k] for k in ['name','sizeBytes','cleanupPolicies','cleanupPolicyDryRun'] if k in r} for r in repos],
 'functionRepositoriesProtectedInFull':functionRepositories,'unresolvedFunctions':[f['name'] for f in functions if not f.get('buildConfig',{}).get('dockerRepository')],
 'requests':status.copy(),'deletesPerformed':0,'imageBytesAreNotUniqueReclaimableLayerBytes':True}
(out/'artifact-inventory-raw-summary.json').write_text(json.dumps(inventory,indent=2)+'\n')
filters={'firestore':'protoPayload.serviceName="firestore.googleapis.com"','content-writes':'protoPayload.serviceName="firestore.googleapis.com" AND protoPayload.methodName="google.firestore.v1.Firestore.Commit" AND protoPayload.request.writes.update.name:"/documents/content/"','contentTriggers':'resource.type="cloud_function" AND (resource.labels.function_name="autoRewardCreators" OR resource.labels.function_name="createPromotionOnApproval" OR resource.labels.function_name="handleLandingPageIntent" OR resource.labels.function_name="handleSmartLinkIntent")'}
samples={}
for label,filter_text in filters.items():
 data=request('logs-'+label,'https://logging.googleapis.com/v2/entries:list',{'resourceNames':[parent],'filter':filter_text+' AND timestamp>="'+cutoff.isoformat()+'"','orderBy':'timestamp desc','pageSize':100})
 rows=[]
 for entry in data.get('entries',[]):
  payload=entry.get('protoPayload',{});principal=payload.get('authenticationInfo',{}).get('principalEmail','')
  text=entry.get('textPayload','');category='other'
  for needle in ['Status did not change to approved','intent not newly set','LandingPageIntent','SmartLinkIntent','triggered for contentId']:
   if needle in text:category=needle;break
  rows.append({'timestamp':entry.get('timestamp'),'resource':entry.get('resource',{}).get('type'),'function':entry.get('resource',{}).get('labels',{}).get('function_name'),
   'method':payload.get('methodName'),'principalHash':hashlib.sha256(principal.encode()).hexdigest()[:16] if principal else None,
   'agent':payload.get('requestMetadata',{}).get('callerSuppliedUserAgent','')[:160],'category':category})
 samples[label]={'entries':rows,'truncated':bool(data.get('nextPageToken'))}
(out/'historical-attribution-samples.json').write_text(json.dumps({'samples':samples,'requests':status,'productionWrites':0,'limitations':['Bounded log samples are not complete read/endpoint attribution.','Missing Data Access entries may reflect disabled logging/permissions; do not enable paid logging here.','Client/browser listeners and Render requests are not necessarily identifiable in Admin SDK audit logs.']},indent=2)+'\n')
print(json.dumps({'images':len(images),'references':len(references),'functionsUnresolved':len(inventory['unresolvedFunctions']),'logEntries':{k:len(v['entries']) for k,v in samples.items()},'failures':[s['label'] for s in status if s['httpStatus']!=200],'deletes':0}))
