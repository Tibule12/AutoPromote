"""Encode complete native source sequences; keep acceptance a separate step."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1])
selection=json.loads(Path(sys.argv[2]).read_text())
for item in selection:
    directory=root/item['directory']
    receipt_path=directory/item['receipt']
    receipt=json.loads(receipt_path.read_text())
    if not receipt['device']['gpu_verified'] or 'OPTIX'!=receipt['device']['backend']:
        raise RuntimeError('Raw source is not verified NVIDIA output')
    settings=receipt['settings']
    duration=float(receipt.get('duration',settings.get('duration')))
    count=round(duration*24)
    prefix=item['prefix']
    expected=[f'{prefix}{i:04d}.png' for i in range(count)]
    if sorted(p.name for p in directory.glob(prefix+'*.png'))!=expected:
        raise RuntimeError('Incomplete source sequence: '+item['assetId'])
    if settings.get('mode')=='preview':raise RuntimeError('Preview cannot become a complete asset')
    target=directory/'video.mp4'
    subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-framerate','24',
        '-i',str(directory/(prefix+'%04d.png')),'-an','-c:v','h264_nvenc',
        '-preset','p5','-rc','vbr','-cq','17','-b:v','0','-pix_fmt','yuv420p',
        '-movflags','+faststart',str(target)],check=True)
    subprocess.run(['ffmpeg','-v','error','-threads','2','-i',str(target),'-f','null','-'],check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(target)]))
    picture=next(s for s in probe['streams'] if s['codec_type']=='video')
    if picture['nb_frames']!=str(count) or abs(float(picture['duration'])-duration)>1/24:
        raise RuntimeError('Native source clock mismatch')
    receipt.update(status='GENERATED_PENDING_REVIEW',assetId=item['assetId'],duration=duration)
    native_name=receipt.get('nativeScene') or item.get('nativeScene')
    if not native_name:raise RuntimeError('Native source name must be explicit')
    receipt['nativeScene']=native_name
    native=directory/native_name
    if not native.is_file():raise RuntimeError('Missing editable native source')
    receipt['nativeSceneSha256']=hashlib.sha256(native.read_bytes()).hexdigest()
    receipt['reusableArtifacts']=[{'role':'native_scene','path':str(native.relative_to(root)),'sha256':receipt['nativeSceneSha256']},{'role':'rendered_source','path':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}]
    receipt['artifact']={'path':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'duration':duration,'fps':24,'encoder':'h264_nvenc','probe':probe,'fullDecode':True}
    (directory/'render-receipt.json').write_text(json.dumps(receipt,indent=2))
    print(json.dumps({'event':'raw_asset_encoded','id':item['assetId'],'frames':count,'duration':duration}),flush=True)
