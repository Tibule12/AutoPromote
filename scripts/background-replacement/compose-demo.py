"""Loopback-only transport for the existing deterministic model compositor."""
import hashlib,json,os,socket,sys,urllib.request
from pathlib import Path
from urllib.parse import urlparse,parse_qs
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
if os.environ.get('STUDIO_BACKGROUND_DEMO')!='true' or os.environ.get('GCLOUD_PROJECT')!='demo-autopromote-credits':raise ValueError('Demo only')
if os.environ.get('STUDIO_BACKGROUND_MATTING_DEPS'):sys.path.insert(0,os.environ['STUDIO_BACKGROUND_MATTING_DEPS'])
record=json.loads(Path(sys.argv[1]).read_text());work=Path(sys.argv[1]).parent;spec=record['spec'];origin=record['origin']
def access(url):
    parsed=urlparse(url)
    if f'{parsed.scheme}://{parsed.netloc}'!=origin or not parsed.path.startswith('/api/credit-pilot/object/') or not parse_qs(parsed.query).get('cap'):raise ValueError('Owned demo access required')
connect=socket.socket.connect
def local(self,address):
    if address[0] not in ('127.0.0.1','localhost','::1'):raise ValueError('External network disabled')
    return connect(self,address)
socket.socket.connect=local
from python_media_worker.studio_model_subject_vfx_job import valid_model_input,valid_replacement_assets,compose_materialized
model=valid_model_input(spec['modelInput'],access);assets=valid_replacement_assets(spec,access)
inputs=[(spec['sourceUrl'],'original.mp4',model['sourceSha256'])]+[(model['files'][k]['url'],n,model['files'][k]['sha256']) for k,n in [('normalizedSource','source.mp4'),('maskBundle','masks.tar.gz')]]+[(v['url'],f'replacement-{i}.asset',v['sha256']) for i,v in enumerate(assets)]
for url,name,digest in inputs:
    access(url)
    with urllib.request.urlopen(url,timeout=30) as r:data=r.read(75*1024**2+1)
    if len(data)>75*1024**2 or hashlib.sha256(data).hexdigest()!=digest:raise ValueError('Owned input changed')
    (work/name).write_bytes(data)
compose_materialized(spec,work,access)
