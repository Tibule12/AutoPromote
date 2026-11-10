"""Encode/decode exact private motion outputs and retain every hand pair.

This is internal visual evidence. It never qualifies a native export, audio,
editable project recovery, trained estimator, or requested four-minute proof.
"""
import argparse
import json
from pathlib import Path
import subprocess
import time

import numpy as np
from PIL import Image,ImageDraw

from model_workers.common import sha,write_json
from recovered_motion_inputs import PRIVATE,RECOVERED


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('candidate',type=Path);args=parser.parse_args()
    root=args.candidate;deadline=time.monotonic()+900
    while True:
        try:receipt=json.loads((root/'receipt.json').read_text())
        except (OSError,json.JSONDecodeError):receipt={}
        if len(receipt.get('rows',[]))==48:break
        if time.monotonic()>deadline:raise RuntimeError('Candidate did not finish all48 frames')
        time.sleep(2)
    assert receipt['nativeAlphaPrior'] and receipt['allFrames'] and receipt['usesCurrentForegroundRecovery']
    assert receipt['posteriorSpatialStrength']==4 and not receipt['nativeAdmission']
    out=root/'actual-encoded-review';out.mkdir(mode=0o700,exist_ok=False)
    movie=out/'internal-spatial-movement.mp4'
    subprocess.run(['ffmpeg','-nostdin','-v','error','-framerate','24','-i',str(root/'actual-composite-%04d.png'),'-frames:v','48','-an','-c:v','libx264','-threads','1','-preset','fast','-crf','16','-pix_fmt','yuv420p','-movflags','+faststart',str(movie)],check=True,timeout=120)
    proc=subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(movie),'-map','0:v:0','-threads','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)
    rows=[]
    try:
        for i in range(48):
            raw=proc.stdout.read(1430*1000*3);assert len(raw)==1430*1000*3
            picture=Image.frombytes('RGB',(1430,1000),raw)
            source=Image.open(RECOVERED/f'rgb/rgb_{i:04d}.png').convert('RGB')
            if i%3==0:
                whole=Image.new('RGB',(2860,3072));hands=Image.new('RGB',(1620,1878))
            y=i%3*1024;whole.paste(source,(0,y+24));whole.paste(picture,(1430,y+24))
            draw=ImageDraw.Draw(whole);draw.text((4,y+4),f'Original | frame{i}',fill='white');draw.text((1434,y+4),f'Decoded spatial candidate | frame{i}',fill='white')
            # One page has both real hands on all three frames at source scale.
            # Adjacent source/result crops keep a viewer from overlooking an
            # isolated finger hole while shrinking the full frame to fit.
            hy=i%3*626
            for n,(name,box) in enumerate([('left',(280,240,700,720)),('right',(1040,170,1430,760))]):
                left=0 if n==0 else 840;w,h=box[2]-box[0],box[3]-box[1]
                hands.paste(source.crop(box),(left,hy+24));hands.paste(picture.crop(box),(left+w,hy+24))
                draw=ImageDraw.Draw(hands);draw.text((left+3,hy+4),f'Source {name} |{i}',fill='white');draw.text((left+w+3,hy+4),f'Decoded |{i}',fill='white')
            if i%3==2:
                whole.save(out/f'whole-{i//3:02d}.jpg',quality=97);hands.save(out/f'hands-{i//3:02d}.jpg',quality=98)
            if i in [6,10,15,17,23,35,39,47]:
                picture.save(out/f'decoded-{i:04d}.png')
            rows.append({'frame':i,'sourceSha256':sha(RECOVERED/f'rgb/rgb_{i:04d}.png'),
                'alphaSha256':sha(root/f'alpha-{i:04d}.png'),
                'foregroundSha256':sha(root/f'foreground-{i:04d}.png'),
                'rawCompositeSha256':sha(root/f'actual-composite-{i:04d}.png')})
        assert not proc.stdout.read(1) and proc.wait()==0
    finally:
        if proc.poll()is None:proc.kill();proc.wait()
        proc.stdout.close()
    write_json(out/'receipt.json',{'movieSha256':sha(movie),'rows':rows,'decodedFrames':48,
        'sourceResultHandPages':16,'sourceResultWholePages':16,'nativePreviewOrFinalExport':False,
        'audioIncluded':False,'visualReviewPending':True,'fourMinuteProof':False})
    print(json.dumps({'decodedFrames':48,'movieSha256':sha(movie),'pages':32}),flush=True)


if __name__=='__main__':main()
