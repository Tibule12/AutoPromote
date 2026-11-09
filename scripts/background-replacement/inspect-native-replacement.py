"""Decode the actual Studio preview against its real source; never rerender."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image, ImageDraw

from model_workers.common import sha, write_json


def decoder(file):
    return subprocess.Popen(['ffmpeg','-nostdin','-v','error','-threads','1','-i',str(file),
        '-map','0:v:0','-threads','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('native',type=Path);p.add_argument('preview_work',type=Path);a=p.parse_args()
    out=a.native/'actual-native-frame-review';out.mkdir(exist_ok=False)
    preview=a.native/'preview.mp4';work=a.preview_work
    spec=json.loads((work/'spec.json').read_text())['spec']
    if sha(preview)!=sha(work/'render.mp4'):raise ValueError('Saved Studio preview differs from actual compositor result')
    data=spec['modelInput']
    if (data['frameCount'],data['width'],data['height'])!=(48,1430,1000):raise ValueError('Wrong native source geometry/clock')
    source=decoder(work/'source.mp4');movie=decoder(preview);rows=[];page=None
    selected={0,6,10,15,17,23,35,39,47}
    regions={'head':(660,45,1040,480),'leftHand':(280,240,700,720),'rightHand':(1040,170,1430,760),
        'rig':(100,690,950,925),'lowerClothes':(430,810,1250,1000)}
    recovered=Path('reports/background-replacement-20261101/private/recovered-gesture-r180-20261105/rgb')
    try:
        for index in range(48):
            raw=source.stdout.read(1430*1000*3);pixels=movie.stdout.read(1430*1000*3)
            if len(raw)!=4290000 or len(pixels)!=4290000:raise ValueError('Native source/preview ended early')
            before=Image.frombytes('RGB',(1430,1000),raw);after=Image.frombytes('RGB',(1430,1000),pixels)
            original=np.array(Image.open(recovered/f'rgb_{index:04d}.png'))
            difference=np.abs(np.frombuffer(raw,np.uint8).reshape(1000,1430,3).astype(np.int16)-original.astype(np.int16))
            rows.append({'frame':index,'sourceExactAgainstOriginalRecoveredRgb':not difference.any(),'maximumSourceRgbDifference':int(difference.max()),'meanSourceRgbDifference':float(difference.mean())})
            if index%3==0:page=Image.new('RGB',(2860,3072))
            y=(index%3)*1024
            page.paste(before,(0,y+24));page.paste(after,(1430,y+24));draw=ImageDraw.Draw(page)
            draw.text((4,y+4),f'Actual original normalized source | frame {index}',fill='white')
            draw.text((1434,y+4),f'Actual Studio preview decoded | frame {index}',fill='white')
            if index%3==2:page.save(out/f'whole-page-{index//3:02d}.jpg',quality=97)
            if index in selected:
                # The decoded source has just been checked pixel for pixel.
                # Reuse its immutable retained PNG instead of another copy.
                source_file=out/f'actual-source-{index:04d}.png'
                if not difference.any():
                    os.link(recovered/f'rgb_{index:04d}.png',source_file)
                else:
                    before.save(source_file)
                after.save(out/f'actual-preview-{index:04d}.png')
                for name,box in regions.items():
                    w,h=box[2]-box[0],box[3]-box[1];sheet=Image.new('RGB',(w*2,h+24))
                    sheet.paste(before.crop(box),(0,24));sheet.paste(after.crop(box),(w,24));draw=ImageDraw.Draw(sheet)
                    draw.text((4,4),f'Actual original {name} | {index}',fill='white');draw.text((w+4,4),'Actual native preview',fill='white')
                    sheet.save(out/f'{name}-{index:04d}.jpg',quality=98)
        if source.stdout.read(1)or movie.stdout.read(1)or source.wait()!=0 or movie.wait()!=0:raise ValueError('Native source/preview clock differs')
    finally:
        for process in [source,movie]:
            if process.poll()is None:process.kill();process.wait()
            process.stdout.close()
    write_json(out/'decode-receipt.json',{'actualDecodedFrames':48,'fps':24,'nativePreviewSha256':sha(preview),
        'normalizedSourceSha256':sha(work/'source.mp4'),'actualModelArtifactHash':data['artifactHash'],
        'allNormalizedSourcePixelsExactAgainstRetainedOriginal':all(row['sourceExactAgainstOriginalRecoveredRgb']for row in rows),
        'rows':rows,'actualHumanReviewPending':True,'nativeResultRerenderedForThisCheck':False,
        'finalExportOrCreativeQualification':False,'fourMinuteProof':False})
    print(json.dumps({'nativeDecodedFrames':48,'actualWholeContactPages':16,'allSourcePixelsExact':all(row['sourceExactAgainstOriginalRecoveredRgb']for row in rows),'actualReviewPending':True}))


if __name__=='__main__':main()
