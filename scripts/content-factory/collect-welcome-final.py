"""Recover retained normal media; never rerender successful GPU stages."""
from pathlib import Path
import hashlib,json,subprocess
import urllib.request,urllib.parse

repo=Path(__file__).resolve().parents[2];root=repo/'reports/welcome-cinematic-20261009'
manifest=json.loads((root/'workload-inputs.json').read_text())
prefix='gs://autopromote-cc6d3-viral-studio-3d/'+manifest['prefix']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
def download(object_name,target):
    url='https://storage.googleapis.com/download/storage/v1/b/autopromote-cc6d3-viral-studio-3d/o/'+urllib.parse.quote(manifest['prefix']+'/'+object_name,safe='')+'?alt=media'
    request=urllib.request.Request(url,headers={'Authorization':'Bearer '+token})
    temporary=target.with_suffix(target.suffix+'.part')
    with urllib.request.urlopen(request,timeout=90) as response,temporary.open('wb') as f:
        while data:=response.read(1024*1024):f.write(data)
    temporary.replace(target)
    print(json.dumps({'downloaded':object_name,'bytes':target.stat().st_size}),flush=True)
download('gpu-receipt.json',root/'gpu-final-receipt.json')
receipt=json.loads((root/'gpu-final-receipt.json').read_text())
assert receipt['status']=='SUCCEEDED',receipt.get('error')
for item in receipt['outputs']:
    p=Path(item['path'])
    assert not p.is_absolute() and '..' not in p.parts
    target=root/p;target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists() or sha(target)!=item['sha256']:
        download('result/'+str(p),target)
    assert sha(target)==item['sha256'],str(p)+' delivery hash mismatch'
subprocess.run(['node',str(repo/'scripts/content-factory/compile-welcome-story.js'),str(root),'final'],check=True)
saved=json.loads((root/'outputs/final/studio-saved-project.json').read_text())
(root/'studio-fixture-project.json').write_text(json.dumps({'project':saved,'clip':saved['snapshot']['orderedClips'][0]},indent=2))
subprocess.run(['ffmpeg','-v','error','-i',str(root/'outputs/final/final.mp4'),'-f','null','-'],check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(root/'outputs/final/final.mp4')],text=True))
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'],v['r_frame_rate'],int(v['nb_frames']))==(1920,1080,'24/1',912)
assert float(v['duration'])==38 and a['channels']==2 and a['sample_rate']=='48000'
worker=json.loads((root/'outputs/final/render-receipt.json').read_text())
assert worker['encoder']=='h264_nvenc' and worker['audioMeasurements']['clippedSamples']==0
assert worker['requestSha256']==sha(root/'outputs/final/render-request.json'),'Prepared/final editorial payload drift'
validation={'status':'PASS','duration':38,'resolution':[1920,1080],'fps':24,'frames':912,'fullDecode':True,'sha256':sha(root/'outputs/final/final.mp4'),'persistedCloudCopiesVerified':len(receipt['outputs']),'canonicalDocumentHash':json.loads((root/'outputs/final/project.json').read_text())['documentHash'],'preparedFinalPayloadSame':True,'audio':worker['audioMeasurements'],'gpuBackend':receipt['nativeRender']['device']}
(root/'final-validation.json').write_text(json.dumps(validation,indent=2))
subprocess.run(['ffmpeg','-v','error','-y','-ss','19','-i',str(root/'outputs/final/final.mp4'),'-frames:v','1',str(root/'hero-poster.jpg')],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(root/'outputs/final/final.mp4'),'-vf','fps=1/2,scale=480:270,tile=4x5','-frames:v','1',str(root/'final-review-sheet.jpg')],check=True)
print(json.dumps(validation),flush=True)
