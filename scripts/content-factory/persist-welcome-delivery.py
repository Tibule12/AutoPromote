"""Retain the editable delivery next to the finished film in its private bucket."""
from pathlib import Path
import base64,hashlib,json,subprocess,urllib.request,urllib.parse

root=Path(__file__).resolve().parents[2]/'reports/welcome-cinematic-20261009'
prefix=json.loads((root/'workload-inputs.json').read_text())['prefix']+'/delivery/'
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
items=[]
for path in ['AutoPromote-editable-project.zip','outputs/final/project.json','outputs/final/studio-saved-project.json','README.md','gpu-zero-after.json','cloud-time-accounting.json']:
    p=root/path;data=p.read_bytes();name=prefix+path
    url='https://storage.googleapis.com/upload/storage/v1/b/autopromote-cc6d3-viral-studio-3d/o?uploadType=media&name='+urllib.parse.quote(name,safe='')
    mime='application/zip' if p.suffix=='.zip' else 'application/json' if p.suffix=='.json' else 'text/markdown'
    request=urllib.request.Request(url,data=data,method='POST',headers={'Authorization':'Bearer '+token,'Content-Type':mime})
    with urllib.request.urlopen(request,timeout=120) as response:result=json.load(response)
    assert int(result['size'])==len(data)
    assert result['md5Hash']==base64.b64encode(hashlib.md5(data).digest()).decode()
    items.append({'path':path,'object':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'generation':result['generation']})
    print(json.dumps({'persisted':path,'bytes':len(data)}),flush=True)
(root/'delivery-cloud-persistence.json').write_text(json.dumps({'bucket':'autopromote-cc6d3-viral-studio-3d','private':True,'outputs':items},indent=2))
