from pathlib import Path
import hashlib, json, subprocess

r=Path('/dev/shm/autopromote-background-finish-20261030')
folder=r/'native/acoustic-clean'
prior=Path('/home/tibule12/Projects/AutoPromte/AutoPromote-model-runtime-v1/reports/studio-background-whole-shot-20261028/matched-wall/final.mp4')
def sha(file): return hashlib.sha256(Path(file).read_bytes()).hexdigest()
def probe(file):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames,sample_rate,channels','-of','json',str(file)]))
def pcm(file):
    data=subprocess.check_output(['ffmpeg','-nostdin','-v','error','-i',str(file),'-map','0:a:0','-vn','-f','s16le','-acodec','pcm_s16le','pipe:1'])
    return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
delivery=json.loads((folder/'complete-native-delivery.json').read_text())
receipt=json.loads((folder/'render-receipt.json').read_text())
assert delivery['canonicalHash']==receipt['projectHash']
assert delivery['movieSha256']==receipt['outputSha256']==sha(folder/'final.mp4')
assert delivery['timelineSha256']==sha(folder/'edited-in-studio.mp4')
assert len(delivery['rows'])==7 and delivery['completeNativePlayback']
master=probe(folder/'final.mp4');video=next(s for s in master['streams']if s['codec_type']=='video')
assert (video['width'],video['height'],video['r_frame_rate'],int(video['nb_frames']))==(1920,1080,'24/1',298)
for file in [folder/'final.mp4',folder/'edited-in-studio.mp4']:
    subprocess.run(['ffmpeg','-nostdin','-v','error','-xerror','-i',str(file),'-f','null','-'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
audio=pcm(folder/'final.mp4');assert audio==pcm(prior)
shots=[]
for jobid,camera in [('06e9e587-9d11-4390-b008-4612aaaa2aa4','a'),('c947c937-c43e-4832-978a-cb3d742800c8','b')]:
    job=r/'vfx-jobs'/jobid;state=json.loads((job/'state.json').read_text())
    assert state['status']=='completed' and state['receipt']['gpuCount']==0
    digest=sha(job/'render.mp4');assert digest==state['receipt']['output_sha256']
    assert digest==sha(r/'native'/f'acoustic-clean-{camera}.mp4')
    shots.append({'camera':camera,'frames':208 if camera=='a'else 90,'outputSha256':digest,'cpuOnly':True})
gate=json.loads((r/'native/acoustic-clean-visual-review.json').read_text())
assert gate['acceptedForPrivateExport'] and gate['canonicalHash']==delivery['canonicalHash']
assert gate['shots']==[s['outputSha256']for s in shots]
result={'master':master,'movieSha256':delivery['movieSha256'],'timelineSha256':delivery['timelineSha256'],
        'canonicalHash':delivery['canonicalHash'],'matchingNativeTimelineAndFullPlayback':True,
        'fullDecodeBothFiles':True,'allSevenTimelineRowsVisible':True,'decodedPcmUnchanged':audio,
        'nativeShots':shots,'gpuJobs':0,'ownerCreativeApproval':False,'universalVideoQualityEstablished':False}
(r/'delivery-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
