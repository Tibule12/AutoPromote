"""Review fresh actual model masks with the existing final compositor.

No source still or historical component mask is substituted. This diagnostic
does not manufacture Studio admission, save/reopen or a four-minute export.
"""
from pathlib import Path
import copy
import hashlib
import json
import os
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor,as_completed
from types import SimpleNamespace

import numpy as np
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from python_media_worker.studio_source_background import load_evidence
from python_media_worker.studio_vfx_plan import VfxFrameRenderer
from recovered_motion_inputs import PRIVATE,RECOVERED

WORK=Path('/dev/shm/autopromote-fresh-bounded-pipeline-r360-20261107')
OUT=PRIVATE/'fresh-rendered-review-r361-20261107'


def render_one(index):
    import cv2
    cv2.setNumThreads(1)
    masks=WORK/'alpha/subject_masks';manifest=json.loads((masks/'manifest.json').read_text())
    for row in manifest['frames']:
        assert sha(masks/row['file'])==row['sha256']
    effects=json.loads((PRIVATE/'native-current-pipeline-r358-20261107/ready-for-inference.autopromote.json').read_text())['snapshot']['subjectVfxScenes'][0]['scene']['effects']
    assert not any(e['type']=='text_behind'for e in effects)
    assert next(e for e in effects if e['type']=='foreground_refine')['clear_box']==[0,0,0,0]
    cache=SimpleNamespace(manifest=manifest,artifact_sha256=sha(WORK/'alpha/subject_masks.tar.gz'),
        observed_background=load_evidence(masks,manifest),
        frame=lambda i:np.array(Image.open(masks/manifest['frames'][i]['file'])))
    renderer=VfxFrameRenderer({'version':1,'source_sha256':manifest['source_sha256'],
        'matte_sha256':cache.artifact_sha256,'effects':copy.deepcopy(effects)},cache,lambda _:PRIVATE/'replacement.png')
    renderer.foreground_cache.root=None
    file=WORK/f'alpha/rgb/rgb_{index:04d}.png';image=Image.open(file).convert('RGB')
    with Image.open(RECOVERED/f'rgb/rgb_{index:04d}.png')as source:
        assert np.array_equal(np.array(image),np.array(source)),'Source clock or RGB changed'
    result=renderer.render(image,index);target=OUT/f'actual-{index:04d}.png';result.save(target)
    return {'frame':index,'sourceSha256':sha(file),'originalSourceSha256':sha(RECOVERED/f'rgb/rgb_{index:04d}.png'),
            'sourceRgbExact':True,'alphaSha256':manifest['frames'][index]['sha256'],
            'compositeSha256':sha(target)}


def main():
    OUT.mkdir(mode=0o700,exist_ok=False);(OUT/'implementation.py').write_bytes(Path(__file__).read_bytes())
    deadline=time.monotonic()+2400
    receipt=PRIVATE/'fresh-bounded-pipeline-r360-20261107/receipt.json'
    pid=json.loads((PRIVATE/'fresh-bounded-pipeline-r360-20261107-process.json').read_text())['pid']
    while not receipt.exists():
        if time.monotonic()>deadline:raise RuntimeError('Fresh pipeline did not finish')
        try:command=Path(f'/proc/{pid}/cmdline').read_bytes()
        except FileNotFoundError:raise RuntimeError('Fresh pipeline stopped before completion')
        if b'fresh-bounded-pipeline-r360-20261107'not in command:raise RuntimeError('Source pipeline process identity changed')
        time.sleep(3)
    current=json.loads(receipt.read_text());assert current['complete']and current['actualSourceFrames']==48
    rows=[];started=time.monotonic()
    with ProcessPoolExecutor(max_workers=2)as pool:
        for future in as_completed([pool.submit(render_one,i)for i in range(48)]):
            rows.append(future.result());rows.sort(key=lambda r:r['frame'])
            write_json(OUT/'render-progress.json',{'rows':rows,'seconds':time.monotonic()-started,'complete':len(rows)==48})
            print(json.dumps({'renderedFrames':len(rows),'total':48,'seconds':time.monotonic()-started}),flush=True)
    movie=OUT/'Internal fresh source review.mp4'
    source=Path('/home/tibule12/Videos/AutoPromote Background Replacement - 2026-11-01/Moving shot repair - 2026-11-04 - revision 3/Original source - 224-226s.mp4')
    subprocess.run(['ffmpeg','-nostdin','-v','error','-framerate','24','-i',str(OUT/'actual-%04d.png'),
        '-i',str(source),'-map','0:v:0','-map','1:a:0?','-frames:v','48','-t','2','-c:v','libx264',
        '-threads','1','-preset','fast','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',
        '-movflags','+faststart',str(movie)],check=True,timeout=120)
    decoder=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(movie),
        '-map','0:v:0','-threads','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
    for index in range(48):
        raw=decoder.stdout.read(1430*1000*3);assert len(raw)==1430*1000*3
        frame=Image.frombytes('RGB',(1430,1000),raw);source=Image.open(RECOVERED/f'rgb/rgb_{index:04d}.png').convert('RGB')
        if index%3==0:whole=Image.new('RGB',(2860,3072));hands=Image.new('RGB',(1620,1878))
        y=index%3*1024;whole.paste(source,(0,y+24));whole.paste(frame,(1430,y+24));draw=ImageDraw.Draw(whole)
        draw.text((4,y+4),f'Actual source | {index}',fill='white');draw.text((1434,y+4),f'Fresh models / shared compositor | {index}',fill='white')
        hy=index%3*626
        for n,(label,box)in enumerate([('left',(280,240,700,720)),('right',(1040,170,1430,760))]):
            x=0 if n==0 else 840;w,h=box[2]-box[0],box[3]-box[1]
            hands.paste(source.crop(box),(x,hy+24));hands.paste(frame.crop(box),(x+w,hy+24))
            ImageDraw.Draw(hands).text((x+3,hy+4),f'Source / fresh {label} | {index}',fill='white')
        if index%3==2:whole.save(OUT/f'whole-{index//3:02d}.jpg',quality=97);hands.save(OUT/f'hands-{index//3:02d}.jpg',quality=98)
        if index in [6,10,15,17,23,24,35,36,39,47]:frame.save(OUT/f'decoded-{index:04d}.png')
    assert not decoder.stdout.read(1)and decoder.wait()==0;decoder.stdout.close()
    write_json(OUT/'receipt.json',{'rows':rows,'decodedFrames':48,'movieSha256':sha(movie),
        'sourceRangeSeconds':[224,226],'sourceRgbAlwaysCurrentAndVerified':True,'historicalComponentMasksUsed':False,
        'actualCurrentRegisteredAlphaAdapter':'2.5.15','noTextOrBottomExclusion':True,
        'nativeArtifactAdmission':False,'nativeBrowserSaveReopenExport':False,'fourMinuteProof':False,
        'visualReviewPending':True,'paidCloudInference':False,'providerUpload':False})
    print('ACTUAL_FRESH_MODEL_MOVEMENT_REVIEW_ENCODED',flush=True)


if __name__=='__main__':main()
